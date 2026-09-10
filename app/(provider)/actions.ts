"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProvider, withActor, AuthError } from "@/lib/auth";
import { asSystem, sql, type Trx } from "@/lib/db";
import { now } from "@/lib/time";
import { getLiveConfig, getLiveSettings } from "@/lib/settings/live";
import { getPaymentProvider, PaymentError } from "@/lib/payments";
import { transitionBooking, recordBookingEvent, type TransitionActor } from "@/lib/booking-state/transition";
import { pctOf } from "@/lib/pricing/money";
import { lateFee, quoteExtension } from "@/lib/pricing";
import { runListingChecks, routeForReview, listingQuality, type ListingForChecks } from "@/lib/listing-checks";
import { formatDateTime, formatMoney } from "@/lib/format";
import { appUrl, notifyClaimRaised, notifyExtensionDecided } from "@/lib/notifications/events";
import { isPayoutError, payoutProviderName } from "@/lib/payouts";
import { completeMockOnboarding as completeMockOnboardingFor, startPayoutOnboarding as startOnboardingFor, syncConnectAccount } from "@/lib/payouts/connect";
import type { ActionResult } from "@/app/(renter)/actions";

const providerActor = (a: { userId: string | null; profile: { name: string } | null }): TransitionActor => ({ role: "provider", id: a.userId, name: a.profile?.name ?? "Provider" });

async function loadBooking(trx: Trx, providerId: string, ref: string) {
  const b = await trx.selectFrom("bookings").selectAll().where("ref", "=", ref).executeTakeFirst();
  if (!b) return null;
  if (b.provider_id !== providerId) throw new AuthError("forbidden");
  return b;
}

async function systemMessage(trx: Trx, bookingId: string, body: string) {
  const c = await trx.selectFrom("conversations").select("id").where("booking_id", "=", bookingId).executeTakeFirst();
  if (!c) return;
  await trx.insertInto("messages").values({ conversation_id: c.id, sender_side: "system", kind: "system", body }).execute();
}

function bump(ref?: string) {
  revalidatePath("/provider");
  revalidatePath("/provider/bookings");
  revalidatePath("/provider/calendar");
  if (ref) {
    revalidatePath(`/provider/bookings/${ref}`);
    revalidatePath(`/rentals/${ref}`);
  }
  revalidatePath("/rentals");
}

/* ------------------------------------------------------------ provider settings */

export async function setAcceptingBookings(providerId: string, accepting: boolean): Promise<ActionResult> {
  await requireProvider(providerId);
  await withActor((trx) => trx.updateTable("providers").set({ accepting_bookings: accepting }).where("id", "=", providerId).execute());
  revalidatePath("/provider");
  return { ok: true, data: undefined };
}

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  about: z.string().trim().max(1200).optional(),
  address: z.string().trim().max(160).optional(),
  neighbourhood: z.string().trim().max(60).optional(),
  response_minutes: z.coerce.number().int().min(1).max(1440).optional(),
  hours_label: z.string().trim().max(80).optional(),
  delivery_vans: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
});
export async function updateProviderSettings(providerId: string, input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  const actor = await requireProvider(providerId);
  if (actor.provider.role !== "owner") return { ok: false, error: "Only the owner can change these settings" };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the settings" };
  const d = parsed.data;
  await withActor(async (trx) => {
    const current = await trx.selectFrom("providers").select("opening_hours").where("id", "=", providerId).executeTakeFirstOrThrow();
    const hours = { ...((current.opening_hours as Record<string, unknown>) ?? {}), ...(d.hours_label ? { label: d.hours_label } : {}) };
    await trx.updateTable("providers").set({
      ...(d.name ? { name: d.name } : {}), ...(d.about != null ? { about: d.about } : {}), ...(d.address != null ? { address: d.address } : {}), ...(d.neighbourhood != null ? { neighbourhood: d.neighbourhood } : {}),
      ...(d.response_minutes ? { response_minutes: d.response_minutes } : {}), ...(d.hours_label ? { opening_hours: JSON.stringify(hours) } : {}), ...(d.delivery_vans ? { delivery_vans: JSON.stringify(d.delivery_vans) } : {}),
    }).where("id", "=", providerId).execute();
  });
  revalidatePath("/provider/settings");
  revalidatePath("/provider/earnings");
  return { ok: true, data: undefined };
}

/* ------------------------------------------------------------ payout account (Phase 7) */

function payoutPaths() {
  revalidatePath("/provider/earnings");
  revalidatePath("/provider/settings");
  revalidatePath("/admin/payouts");
}

/**
 * Starts (or resumes) hosted onboarding for the provider's payout account: the connected account is
 * created on first use, and the caller navigates to the URL. With Stripe that is Stripe's own
 * onboarding (bank details and identity never touch fab.rent); with the mock it is the demo page.
 */
export async function startPayoutOnboarding(providerId: string): Promise<ActionResult<{ url: string }>> {
  const actor = await requireProvider(providerId);
  if (actor.provider.role !== "owner") return { ok: false, error: "Only the owner can set up payouts" };
  const base = appUrl();
  try {
    const link = await withActor((trx) => startOnboardingFor(trx, providerId, { return_url: `${base}/provider/earnings?onboarding=return`, refresh_url: `${base}/provider/earnings?onboarding=refresh` }));
    payoutPaths();
    return { ok: true, data: { url: link.url } };
  } catch (e) {
    return { ok: false, error: isPayoutError(e) ? e.message : "Couldn't start payout onboarding" };
  }
}

/** Re-reads the account's real state from the payout provider (the "Refresh" button, and the return from onboarding). */
export async function refreshPayoutAccount(providerId: string): Promise<ActionResult<{ status: string; reason: string | null }>> {
  await requireProvider(providerId);
  try {
    const r = await withActor((trx) => syncConnectAccount(trx, providerId));
    payoutPaths();
    if (!r) return { ok: false, error: "No payout account yet — set up payouts first" };
    return { ok: true, data: { status: r.derived.status, reason: r.derived.reason } };
  } catch (e) {
    return { ok: false, error: isPayoutError(e) ? e.message : "Couldn't refresh the payout account" };
  }
}

const mockOnboardingSchema = z.object({
  scenario: z.enum(["verified", "tax_id_missing", "bank_failed", "pending"]),
  last4: z.string().regex(/^\d{4}$/).optional(),
  bank_name: z.string().trim().min(1).max(40).optional(),
});

/** Demo only: the simulated hosted onboarding reports its outcome; the account is then synced exactly as a Stripe return would be. */
export async function completeMockOnboarding(providerId: string, input: z.input<typeof mockOnboardingSchema>): Promise<ActionResult<{ status: string; reason: string | null }>> {
  const actor = await requireProvider(providerId);
  if (actor.provider.role !== "owner") return { ok: false, error: "Only the owner can set up payouts" };
  if (payoutProviderName() !== "mock") return { ok: false, error: "Onboarding is hosted by Stripe when PAYOUTS_PROVIDER=stripe" };
  const parsed = mockOnboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose an outcome and a four-digit account ending" };
  try {
    const derived = await withActor((trx) => completeMockOnboardingFor(trx, providerId, parsed.data.scenario, { last4: parsed.data.last4, bank_name: parsed.data.bank_name }));
    payoutPaths();
    return { ok: true, data: { status: derived.status, reason: derived.reason } };
  } catch (e) {
    return { ok: false, error: isPayoutError(e) ? e.message : "Couldn't complete onboarding" };
  }
}

export async function updatePayoutSchedule(providerId: string, schedule: string): Promise<ActionResult> {
  const actor = await requireProvider(providerId);
  if (actor.provider.role !== "owner") return { ok: false, error: "Only the owner can change the payout schedule" };
  const config = await getLiveConfig();
  if (!config.payouts.schedules.includes(schedule)) return { ok: false, error: "Choose one of the marketplace's payout schedules" };
  await withActor((trx) => trx.updateTable("providers").set({ payout_schedule: schedule }).where("id", "=", providerId).execute());
  payoutPaths();
  return { ok: true, data: undefined };
}

/* ------------------------------------------------------------ booking decisions */

export async function approveBooking(ref: string): Promise<ActionResult> {
  const actor = await requireProvider();
  const r = await withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    try {
      await transitionBooking(trx, b.id, "provider_approve", providerActor(actor));
      if (!b.unit_id && b.qty === 1) await autoAssign(trx, b.id, b.listing_id, b.start_at, b.end_at, providerActor(actor));
      await systemMessage(trx, b.id, `Booking confirmed by ${actor.provider.name} · ${formatDateTime(b.start_at)}`);
      return { ok: true as const, data: undefined };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
  bump(ref);
  return r;
}

export async function declineBooking(ref: string, reason?: string): Promise<ActionResult> {
  const actor = await requireProvider();
  const r = await withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    try {
      await transitionBooking(trx, b.id, "provider_decline", providerActor(actor), { payload: { reason: reason?.slice(0, 200) } });
      await systemMessage(trx, b.id, `${actor.provider.name} couldn't take this booking · refunded in full`);
      return { ok: true as const, data: undefined };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
  bump(ref);
  return r;
}

export async function cancelByProvider(ref: string): Promise<ActionResult> {
  const actor = await requireProvider();
  const r = await withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    try {
      await transitionBooking(trx, b.id, "provider_cancel", providerActor(actor));
      await systemMessage(trx, b.id, `${actor.provider.name} cancelled this booking · refunded in full plus a credit`);
      return { ok: true as const, data: undefined };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
  bump(ref);
  return r;
}

export async function markPrepared(ref: string): Promise<ActionResult> {
  return simpleTransition(ref, "mark_prepared", "Your order is ready for pickup");
}
export async function dispatchBooking(ref: string): Promise<ActionResult> {
  return simpleTransition(ref, "dispatch", "Out for delivery — the driver records condition with you");
}
async function simpleTransition(ref: string, event: "mark_prepared" | "dispatch", note: string): Promise<ActionResult> {
  const actor = await requireProvider();
  const r = await withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    try {
      await transitionBooking(trx, b.id, event, providerActor(actor));
      await systemMessage(trx, b.id, note);
      return { ok: true as const, data: undefined };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
  bump(ref);
  return r;
}

async function autoAssign(trx: Trx, bookingId: string, listingId: string, start: Date, end: Date, who: TransitionActor) {
  const free = await sql<{ id: string }>`select f as id from public.free_units(${listingId}::uuid, ${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, ${bookingId}::uuid) f`.execute(trx);
  const first = free.rows[0]?.id;
  if (!first) return null;
  await trx.updateTable("bookings").set({ unit_id: first }).where("id", "=", bookingId).execute();
  await recordBookingEvent(trx, bookingId, "unit_assigned", who, { unit_id: first, auto: true });
  return first;
}

/** Assign / reassign the unit (click-to-reassign on the calendar, "Change unit" in the panel). */
export async function assignUnit(ref: string, unitId: string | null): Promise<ActionResult<{ unit_number: number | null }>> {
  const actor = await requireProvider();
  const r = await withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    if (["completed", "cancelled", "disputed", "inspecting"].includes(b.status)) return { ok: false as const, error: "This booking is finished — the unit can't change" };
    if (!unitId) {
      await trx.updateTable("bookings").set({ unit_id: null }).where("id", "=", b.id).execute();
      await recordBookingEvent(trx, b.id, "unit_assigned", providerActor(actor), { unit_id: null });
      return { ok: true as const, data: { unit_number: null } };
    }
    const unit = await trx.selectFrom("units").select(["id", "unit_number", "listing_id", "status"]).where("id", "=", unitId).executeTakeFirst();
    if (!unit || unit.listing_id !== b.listing_id) return { ok: false as const, error: "That unit belongs to another listing" };
    if (unit.status === "retired" || unit.status === "in_maintenance") return { ok: false as const, error: `Unit ${unit.unit_number} is ${unit.status.replace("_", " ")}` };
    const free = await sql<{ id: string }>`select f as id from public.free_units(${b.listing_id}::uuid, ${b.start_at.toISOString()}::timestamptz, ${b.end_at.toISOString()}::timestamptz, ${b.id}::uuid) f`.execute(trx);
    if (!free.rows.some((x) => x.id === unitId) && unit.id !== b.unit_id) return { ok: false as const, error: `Unit ${unit.unit_number} is booked or blocked for these dates` };
    await trx.updateTable("bookings").set({ unit_id: unitId }).where("id", "=", b.id).execute();
    await recordBookingEvent(trx, b.id, "unit_assigned", providerActor(actor), { unit_id: unitId, unit_number: unit.unit_number });
    return { ok: true as const, data: { unit_number: unit.unit_number } };
  });
  bump(ref);
  return r;
}

/* ------------------------------------------------------------ extensions */

export async function approveExtension(ref: string): Promise<ActionResult<{ charged_cents: number }>> {
  const actor = await requireProvider();
  const settings = await getLiveSettings();
  const config = settings.config;
  const payments = await getPaymentProvider();
  const r = await withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    const x = await trx.selectFrom("extension_requests").selectAll().where("booking_id", "=", b.id).where("status", "=", "requested").orderBy("created_at", "desc").executeTakeFirst();
    if (!x) return { ok: false as const, error: "No pending extension" };
    // the unit must still be free until the new return
    const free = await sql<{ n: number }>`select count(*)::int as n from public.free_units(${b.listing_id}::uuid, ${b.end_at.toISOString()}::timestamptz, ${x.new_end_at.toISOString()}::timestamptz, ${b.id}::uuid) f ${b.unit_id ? sql`where f = ${b.unit_id}::uuid` : sql``}`.execute(trx);
    if (Number(free.rows[0]?.n ?? 0) < (b.unit_id ? 1 : b.qty)) return { ok: false as const, error: "That unit is booked after the current return — reassign a unit first" };
    const listing = await trx.selectFrom("listings").select("day_cents").where("id", "=", b.listing_id).executeTakeFirstOrThrow();
    const q = quoteExtension(x.extra_days, listing.day_cents, b.qty, config);
    const method = b.payment_method_id ? await trx.selectFrom("payment_methods").select(["id", "provider_ref"]).where("id", "=", b.payment_method_id).executeTakeFirst() : null;
    let chargeRef: string;
    try {
      const c = await payments.charge({ amount_cents: q.charged_cents, method: { id: method?.id ?? "apple-pay", provider_ref: method?.provider_ref ?? null, label: b.payment_method_label ?? "card" }, description: `fab.rent extension · ${b.ref}`, idempotency_key: `ext:${x.id}`, metadata: { booking: b.ref, kind: "extension" } });
      chargeRef = c.ref;
    } catch (e) {
      if (e instanceof PaymentError) return { ok: false as const, error: `Renter's card declined: ${e.message}` };
      throw e;
    }
    const refs = { ...((b.payment_refs as Record<string, unknown>) ?? {}), [`extension:${x.id}`]: chargeRef };
    const snap = b.price_snapshot as unknown as { billed_days: number; rental_cents: number; charged_cents: number; provider: { gross_cents: number; commission_cents: number; payout_cents: number } };
    const collect = b.collect_window as { start: string; end: string } | null;
    await trx.updateTable("bookings").set({ end_at: x.new_end_at, return_due_at: x.new_end_at, charged_cents: b.charged_cents + q.charged_cents, billed_days: b.billed_days + x.extra_days, payment_refs: JSON.stringify(refs), price_snapshot: JSON.stringify({ ...snap, billed_days: snap.billed_days + x.extra_days, rental_cents: snap.rental_cents + q.rental_cents, charged_cents: snap.charged_cents + q.charged_cents, extension_cents: q.charged_cents }) }).where("id", "=", b.id).execute();
    await trx.updateTable("extension_requests").set({ status: "approved", decided_at: now(), decided_by: actor.userId }).where("id", "=", x.id).execute();
    const commission = pctOf(q.rental_cents, config.fees.provider_commission_pct);
    await asSystem(trx, (sys) => sys.insertInto("ledger_entries").values({ provider_id: b.provider_id, booking_id: b.id, entry_date: sql`(${x.new_end_at.toISOString()}::timestamptz at time zone ${config.market.timezone})::date`, type: "rental", description: `Extension +${x.extra_days} ${x.extra_days === 1 ? "day" : "days"} · ${b.ref}`, gross_cents: q.rental_cents, commission_cents: -commission, net_cents: q.rental_cents - commission, status: "pending" }).execute());
    await recordBookingEvent(trx, b.id, "extension_approved", providerActor(actor), { extra_days: x.extra_days, new_end_at: x.new_end_at.toISOString(), cents: q.charged_cents });
    await recordBookingEvent(trx, b.id, "payment_charged", { role: "system", id: null, name: "fab.rent" }, { cents: q.charged_cents, method: b.payment_method_label, kind: "extension" });
    await systemMessage(trx, b.id, `Extension approved · new return ${formatDateTime(x.new_end_at)}${collect ? ` · collection ${collect.start}–${collect.end}` : ""} · ${formatMoney(q.charged_cents)} charged`);
    await notifyExtensionDecided(trx, b.id, { id: x.id, decision: "approved", extra_days: x.extra_days, new_end_at: x.new_end_at, amount_cents: q.charged_cents });
    return { ok: true as const, data: { charged_cents: q.charged_cents } };
  });
  bump(ref);
  return r;
}

export async function declineExtension(ref: string): Promise<ActionResult> {
  const actor = await requireProvider();
  const r = await withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    const x = await trx.selectFrom("extension_requests").select(["id", "extra_days", "new_end_at", "amount_cents"]).where("booking_id", "=", b.id).where("status", "=", "requested").executeTakeFirst();
    if (!x) return { ok: false as const, error: "No pending extension" };
    await trx.updateTable("extension_requests").set({ status: "declined", decided_at: now(), decided_by: actor.userId }).where("id", "=", x.id).execute();
    await recordBookingEvent(trx, b.id, "extension_declined", providerActor(actor), { extra_days: x.extra_days });
    await systemMessage(trx, b.id, `Extension declined · original return time stands (${formatDateTime(b.end_at)})`);
    await notifyExtensionDecided(trx, b.id, { id: x.id, decision: "declined", extra_days: x.extra_days, new_end_at: x.new_end_at, amount_cents: x.amount_cents });
    return { ok: true as const, data: undefined };
  });
  bump(ref);
  return r;
}

/* ------------------------------------------------------------ condition records */

const photoSchema = z.object({ label: z.string().max(60), path: z.string().max(300).nullable(), taken_at: z.string(), lat: z.number().optional(), lng: z.number().optional(), issue: z.boolean().optional() });
const checklistSchema = z.object({ item: z.string().max(120), ok: z.boolean(), description: z.string().max(600).optional(), repair_estimate_cents: z.number().int().min(0).optional(), out_of_service_days: z.number().int().min(0).optional() });
const recordSchema = z.object({
  unit_id: z.string().uuid().nullable().optional(),
  serial_scanned: z.string().max(80).nullable().optional(),
  serial_matches: z.boolean().nullable().optional(),
  id_matched: z.boolean().nullable().optional(),
  photos: z.array(photoSchema).max(12).default([]),
  checklist: z.array(checklistSchema).max(40).default([]),
  notes: z.string().max(1200).nullable().optional(),
  fuel_level: z.string().max(20).nullable().optional(),
  location_label: z.string().max(120).nullable().optional(),
  geotag: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  renter_signature_path: z.string().max(300).nullable().optional(),
});
export type ConditionInput = z.input<typeof recordSchema>;

async function upsertRecord(trx: Trx, bookingId: string, kind: "handoff" | "return", data: z.output<typeof recordSchema>, memberId: string | null, complete: boolean) {
  const existing = await trx.selectFrom("condition_records").select("id").where("booking_id", "=", bookingId).where("kind", "=", kind).executeTakeFirst();
  const values = {
    unit_id: data.unit_id ?? null, serial_scanned: data.serial_scanned ?? null, serial_matches: data.serial_matches ?? null, id_matched: data.id_matched ?? null, id_checked_at: data.id_matched ? now() : null,
    photos: JSON.stringify(data.photos), checklist: JSON.stringify(data.checklist), notes: data.notes ?? null, fuel_level: data.fuel_level ?? null, location_label: data.location_label ?? null, geotag: data.geotag ? JSON.stringify(data.geotag) : null,
    renter_signature_path: data.renter_signature_path ?? null, provider_member_id: memberId, ...(complete ? { completed_at: now() } : {}),
  };
  if (existing) {
    await trx.updateTable("condition_records").set(values).where("id", "=", existing.id).execute();
    return existing.id;
  }
  const row = await trx.insertInto("condition_records").values({ booking_id: bookingId, kind, ...values }).returning("id").executeTakeFirstOrThrow();
  return row.id;
}

/** Save handoff progress (any step) without changing the booking. */
export async function saveHandoff(ref: string, input: ConditionInput): Promise<ActionResult<{ id: string }>> {
  const actor = await requireProvider();
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the record" };
  const r = await withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    const id = await upsertRecord(trx, b.id, "handoff", parsed.data, actor.userId, false);
    return { ok: true as const, data: { id } };
  });
  return r;
}

/** Complete the handoff: record + status → active + hold placed (never before this moment). */
export async function completeHandoff(ref: string, input: ConditionInput): Promise<ActionResult<{ hold_cents: number }>> {
  const actor = await requireProvider();
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the record" };
  const r = await withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    if (parsed.data.photos.filter((p) => p.path).length < 1) return { ok: false as const, error: "Take at least one condition photo" };
    if (!parsed.data.renter_signature_path) return { ok: false as const, error: "The renter needs to sign" };
    if (parsed.data.unit_id && parsed.data.unit_id !== b.unit_id) {
      const a = await assignUnitInside(trx, b.id, b.listing_id, parsed.data.unit_id, b.start_at, b.end_at, providerActor(actor));
      if (!a.ok) return a;
    }
    const id = await upsertRecord(trx, b.id, "handoff", parsed.data, actor.userId, true);
    try {
      await transitionBooking(trx, b.id, "handoff_complete", providerActor(actor), { conditionRecordId: id, payload: { photos: parsed.data.photos.filter((p) => p.path).length, serial_matches: parsed.data.serial_matches } });
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
    await systemMessage(trx, b.id, `${b.fulfillment === "delivery" ? "Delivered" : "Handed over"} · condition recorded (${parsed.data.photos.filter((p) => p.path).length} photos)${b.hold_cents ? ` · ${formatMoney(b.hold_cents, { whole: true })} hold placed` : ""} · return by ${formatDateTime(b.end_at)}`);
    return { ok: true as const, data: { hold_cents: b.hold_cents } };
  });
  bump(ref);
  return r;
}

async function assignUnitInside(trx: Trx, bookingId: string, listingId: string, unitId: string, start: Date, end: Date, who: TransitionActor): Promise<{ ok: true } | { ok: false; error: string }> {
  const free = await sql<{ id: string }>`select f as id from public.free_units(${listingId}::uuid, ${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, ${bookingId}::uuid) f`.execute(trx);
  if (!free.rows.some((x) => x.id === unitId)) return { ok: false, error: "That unit isn't free for these dates" };
  await trx.updateTable("bookings").set({ unit_id: unitId }).where("id", "=", bookingId).execute();
  await recordBookingEvent(trx, bookingId, "unit_assigned", who, { unit_id: unitId });
  return { ok: true };
}

const claimInputSchema = z.object({ type: z.enum(["damage", "cleaning", "missing"]), area: z.string().max(80).optional(), description: z.string().max(600), amount_cents: z.number().int().min(0), repair_estimate_cents: z.number().int().min(0).optional(), out_of_service_days: z.number().int().min(0).optional() });
const returnSchema = z.object({ record: recordSchema, late_fee_cents: z.number().int().min(0), claims: z.array(claimInputSchema).max(10), returned_at: z.string().optional() });

/**
 * Return check-in. Late fee (undisputed) is charged to the card now; damage/cleaning/missing claims go
 * to the renter (48 h) with the hold kept in place; with no claims the hold is released immediately.
 */
export async function completeReturn(ref: string, input: z.input<typeof returnSchema>): Promise<ActionResult<{ status: string; claim_cents: number }>> {
  const actor = await requireProvider();
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the return record" };
  const config = await getLiveConfig();
  const payments = await getPaymentProvider();
  const r = await withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    const who = providerActor(actor);
    const at = parsed.data.returned_at ? new Date(parsed.data.returned_at) : now();
    const recordId = await upsertRecord(trx, b.id, "return", parsed.data.record, actor.userId, true);
    try {
      if (["active", "return_due", "overdue"].includes(b.status)) await transitionBooking(trx, b.id, "return_checkin_start", who, { at, payload: { condition_record_id: recordId } });
      else if (b.status !== "inspecting") return { ok: false as const, error: `Can't check in a booking that is ${b.status.replace(/_/g, " ")}` };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
    // late fee settles now, separately from the hold
    if (parsed.data.late_fee_cents > 0) {
      const method = b.payment_method_id ? await trx.selectFrom("payment_methods").select(["id", "provider_ref"]).where("id", "=", b.payment_method_id).executeTakeFirst() : null;
      let chargeRef: string | null = null;
      try {
        const c = await payments.charge({ amount_cents: parsed.data.late_fee_cents, method: { id: method?.id ?? "apple-pay", provider_ref: method?.provider_ref ?? null, label: b.payment_method_label ?? "card" }, description: `fab.rent late return · ${b.ref}`, idempotency_key: `late:${b.id}`, metadata: { booking: b.ref, kind: "late_fee" } });
        chargeRef = c.ref;
      } catch (e) {
        if (!(e instanceof PaymentError)) throw e;
      }
      await trx.insertInto("claims").values({ booking_id: b.id, condition_record_id: recordId, type: "late", description: `Late return · ${formatDateTime(at)}`, amount_cents: parsed.data.late_fee_cents, status: chargeRef ? "settled" : "open", settled_cents: chargeRef ? parsed.data.late_fee_cents : null, settled_at: chargeRef ? at : null, renter_respond_by: chargeRef ? null : new Date(at.getTime() + config.holds.renter_response_hours * 3_600_000) }).execute();
      if (chargeRef) {
        await asSystem(trx, (sys) => sys.insertInto("ledger_entries").values({ provider_id: b.provider_id, booking_id: b.id, entry_date: sql`(${at.toISOString()}::timestamptz at time zone ${config.market.timezone})::date`, type: "claim", description: `Late fee · ${b.ref}`, gross_cents: parsed.data.late_fee_cents, commission_cents: 0, net_cents: parsed.data.late_fee_cents, status: "available" }).execute());
        await recordBookingEvent(trx, b.id, "late_fee_charged", { role: "system", id: null, name: "fab.rent" }, { cents: parsed.data.late_fee_cents }, at);
      }
    }
    const claimTotal = parsed.data.claims.reduce((s, c) => s + c.amount_cents, 0);
    if (claimTotal > 0) {
      const respondBy = new Date(at.getTime() + config.holds.renter_response_hours * 3_600_000);
      for (const c of parsed.data.claims) {
        if (c.amount_cents <= 0) continue;
        await trx.insertInto("claims").values({ booking_id: b.id, condition_record_id: recordId, type: c.type, area: c.area ?? null, description: c.description, amount_cents: c.amount_cents, repair_estimate_cents: c.repair_estimate_cents ?? null, out_of_service_days: c.out_of_service_days ?? null, status: "open", renter_respond_by: respondBy }).execute();
      }
      await recordBookingEvent(trx, b.id, "claim_raised", who, { cents: claimTotal, items: parsed.data.claims.length, respond_by: respondBy.toISOString() }, at);
      await asSystem(trx, (sys) => sys.updateTable("ledger_entries").set({ status: "inspecting" }).where("booking_id", "=", b.id).where("type", "=", "rental").execute());
      await systemMessage(trx, b.id, `Return checked in · ${formatMoney(claimTotal)} claim against your ${formatMoney(b.hold_cents, { whole: true })} hold — accept or dispute within ${config.holds.renter_response_hours} h`);
      await notifyClaimRaised(trx, b.id);
      return { ok: true as const, data: { status: "inspecting", claim_cents: claimTotal } };
    }
    try {
      const t = await transitionBooking(trx, b.id, "return_no_claim", who, { at, payload: { condition_record_id: recordId } });
      await systemMessage(trx, b.id, `Return checked in · no issues · ${b.hold_cents ? "hold released" : "all done"}. Thanks!`);
      return { ok: true as const, data: { status: t.to, claim_cents: 0 } };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
  bump(ref);
  return r;
}

/* ------------------------------------------------------------ listings */

const listingPatch = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().max(4000).optional(),
  brand: z.string().max(60).nullable().optional(),
  model: z.string().max(60).nullable().optional(),
  condition: z.string().max(40).nullable().optional(),
  age_years: z.number().min(0).max(60).nullable().optional(),
  last_serviced_at: z.string().nullable().optional(),
  category_id: z.string().uuid().optional(),
  specs: z.array(z.object({ label: z.string().max(60), value: z.string().max(120) })).max(24).optional(),
  included_accessories: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  day_cents: z.number().int().min(100).optional(),
  weekend_cents: z.number().int().min(0).nullable().optional(),
  week_cents: z.number().int().min(0).nullable().optional(),
  month_cents: z.number().int().min(0).nullable().optional(),
  hold_cents: z.number().int().min(0).optional(),
  hold_with_waiver_cents: z.number().int().min(0).nullable().optional(),
  late_fee_cents_per_hour: z.number().int().min(0).optional(),
  late_grace_minutes: z.number().int().min(0).max(24 * 60).optional(),
  cleaning_fee_cents: z.number().int().min(0).optional(),
  min_days: z.number().int().min(1).max(60).optional(),
  max_days: z.number().int().min(1).max(365).optional(),
  prep_hours: z.number().min(0).max(72).optional(),
  same_day_cutoff_minutes: z.number().int().min(0).max(24 * 60).optional(),
  instant_book: z.boolean().optional(),
  pickup_enabled: z.boolean().optional(),
  pickup_address: z.string().max(200).nullable().optional(),
  pickup_hours_label: z.string().max(80).nullable().optional(),
  pickup_instructions: z.string().max(1000).nullable().optional(),
  delivery_enabled: z.boolean().optional(),
  delivery_radius_km: z.number().min(0).max(200).optional(),
  delivery_window_hours: z.number().min(0.5).max(12).optional(),
  delivery_base_cents: z.number().int().min(0).optional(),
  delivery_base_km: z.number().min(0).max(100).optional(),
  delivery_per_km_cents: z.number().int().min(0).optional(),
  delivery_notes: z.string().max(1000).nullable().optional(),
  rules: z.array(z.string().trim().max(200)).max(20).optional(),
  cancellation_policy_id: z.string().optional(),
  id_required: z.boolean().optional(),
  min_renter_age: z.number().int().min(16).max(99).optional(),
});
export type ListingPatch = z.input<typeof listingPatch>;

async function ownListing(trx: Trx, providerId: string, listingId: string) {
  const l = await trx.selectFrom("listings").selectAll().where("id", "=", listingId).executeTakeFirst();
  if (!l) return null;
  if (l.provider_id !== providerId) throw new AuthError("forbidden");
  return l;
}

export async function createListing(): Promise<ActionResult<{ id: string }>> {
  const actor = await requireProvider();
  const config = await getLiveConfig();
  const r = await withActor(async (trx) => {
    const cat = await trx.selectFrom("categories").select("id").where("parent_id", "is not", null).orderBy("sort").executeTakeFirstOrThrow();
    const p = await trx.selectFrom("providers").select(["address", "neighbourhood", "opening_hours", "lat", "lng"]).where("id", "=", actor.provider.id).executeTakeFirstOrThrow();
    const policy = config.cancellation.policies.find((x) => x.is_default) ?? config.cancellation.policies[0]!;
    const slug = `new-listing-${Date.now().toString(36)}`;
    const row = await trx.insertInto("listings").values({ provider_id: actor.provider.id, category_id: cat.id, title: "Untitled listing", slug, day_cents: 2500, hold_cents: 10000, cancellation_policy_id: policy.id, status: "draft", pickup_address: p.address, pickup_hours: JSON.stringify(p.opening_hours ?? {}), pickup_hours_label: (p.opening_hours as { label?: string } | null)?.label ?? null, pickup_lat: p.lat, pickup_lng: p.lng }).returning("id").executeTakeFirstOrThrow();
    return { ok: true as const, data: { id: row.id } };
  });
  revalidatePath("/provider/listings");
  return r;
}

export async function updateListing(listingId: string, patch: ListingPatch): Promise<ActionResult<{ status: string }>> {
  const actor = await requireProvider();
  const parsed = listingPatch.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields" };
  const r = await withActor(async (trx) => {
    const l = await ownListing(trx, actor.provider.id, listingId);
    if (!l) return { ok: false as const, error: "Listing not found" };
    const d = parsed.data;
    const set: Record<string, unknown> = { ...d };
    if (d.specs) set.specs = JSON.stringify(d.specs);
    if (d.last_serviced_at !== undefined) set.last_serviced_at = d.last_serviced_at ? new Date(d.last_serviced_at) : null;
    if (d.title && d.title !== l.title) set.slug = await uniqueSlug(trx, `${d.title}-${actor.provider.slug.split("-")[0]}`, l.id);
    // published listings with a material edit go back through review routing on save (§7); price/policy changes never touch existing bookings
    const material = ["title", "description", "category_id", "day_cents", "hold_cents"].some((k) => k in d && (d as Record<string, unknown>)[k] !== (l as Record<string, unknown>)[k]);
    let status = l.status;
    if (l.status === "published" && material) {
      const route = await routeListing(trx, { ...l, ...set } as typeof l, "edited", l.day_cents, actor.provider.id);
      if (route.mode === "manual") {
        status = "pending_review";
        set.status = status;
        await trx.insertInto("listing_reviews").values({ listing_id: l.id, kind: "edited", reasons: route.reasons, checks: JSON.stringify(route.checks), previous_day_cents: l.day_cents, submitted_snapshot: JSON.stringify(d) }).execute();
      }
    }
    await trx.updateTable("listings").set(set).where("id", "=", l.id).execute();
    await refreshQuality(trx, l.id);
    return { ok: true as const, data: { status } };
  });
  revalidatePath(`/provider/listings/${listingId}`);
  revalidatePath("/provider/listings");
  return r;
}

async function uniqueSlug(trx: Trx, base: string, selfId: string) {
  const s = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  const taken = await trx.selectFrom("listings").select("id").where("slug", "=", s).where("id", "!=", selfId).executeTakeFirst();
  return taken ? `${s}-${Date.now().toString(36).slice(-4)}` : s;
}

async function refreshQuality(trx: Trx, listingId: string) {
  const [l, photos, rules] = await Promise.all([
    trx.selectFrom("listings").select(["specs", "included_accessories", "rules", "prep_hours", "description"]).where("id", "=", listingId).executeTakeFirstOrThrow(),
    trx.selectFrom("listing_photos").select(["has_serial_plate"]).where("listing_id", "=", listingId).execute(),
    Promise.resolve(null),
  ]);
  void rules;
  const q = listingQuality({ photo_count: photos.length, has_serial_plate_photo: photos.some((p) => p.has_serial_plate), specs_count: ((l.specs as unknown[]) ?? []).length, accessories_count: l.included_accessories.length, rules_count: l.rules.length, prep_hours: l.prep_hours == null ? null : Number(l.prep_hours), description_length: l.description.length });
  await trx.updateTable("listings").set({ quality_score: q.score }).where("id", "=", listingId).execute();
}

async function routeListing(trx: Trx, l: { id: string; title: string; description: string; day_cents: number; hold_cents: number; category_id: string; provider_id: string }, kind: "new" | "edited", previousDay: number | null, providerId: string) {
  const config = await getLiveConfig();
  const [photos, docs, units, cat, provider, median, knownSerials, knownHashes] = await Promise.all([
    trx.selectFrom("listing_photos").select(["has_serial_plate", "is_stock", "photo_hash"]).where("listing_id", "=", l.id).execute(),
    trx.selectFrom("listing_documents").select(["key", "issued_at"]).where("listing_id", "=", l.id).execute(),
    trx.selectFrom("units").select("serial").where("listing_id", "=", l.id).execute(),
    trx.selectFrom("categories as c").leftJoin("categories as p", "p.id", "c.parent_id").select(["c.slug", "p.slug as parent_slug"]).where("c.id", "=", l.category_id).executeTakeFirstOrThrow(),
    trx.selectFrom("providers").select(["completed_count", "verified", "insurance_valid_until", "kind"]).where("id", "=", providerId).executeTakeFirstOrThrow(),
    sql<{ m: number | null }>`select percentile_cont(0.5) within group (order by day_cents)::int as m from public.listings where category_id = ${l.category_id}::uuid and status = 'published' and id <> ${l.id}::uuid`.execute(trx),
    // system reads: other providers' serials/photo hashes are hidden by RLS, and the duplicate check needs the whole marketplace
    asSystem(trx, (sys) => sys.selectFrom("units as u").innerJoin("listings as x", "x.id", "u.listing_id").select("u.serial").where("x.id", "!=", l.id).execute()),
    asSystem(trx, (sys) => sys.selectFrom("listing_photos").select("photo_hash").where("listing_id", "!=", l.id).where("photo_hash", "is not", null).execute()),
  ]);
  const forChecks: ListingForChecks = { title: l.title, description: l.description, day_cents: l.day_cents, hold_cents: l.hold_cents, photos: photos.map((p) => ({ has_serial_plate: p.has_serial_plate, is_stock: p.is_stock, hash: p.photo_hash })), documents: docs, unit_serials: units.map((u) => u.serial), category_slug: cat.slug, parent_category_slug: cat.parent_slug };
  const ctx = { category_median_day_cents: median.rows[0]?.m ?? null, known_serials: new Set(knownSerials.map((s) => s.serial)), known_photo_hashes: new Set(knownHashes.map((h) => h.photo_hash!)), provider: { completed_count: provider.completed_count, verified: provider.verified, insurance_valid_until: provider.insurance_valid_until, kind: provider.kind }, now: now() };
  const checks = runListingChecks(forChecks, ctx, config);
  const route = routeForReview(forChecks, { kind, checks, previous_day_cents: previousDay, day_cents: l.day_cents }, ctx, config);
  return { ...route, checks };
}

/** Publish (or resubmit) a listing: automated checks + routing decide published vs pending review. */
export async function submitListing(listingId: string): Promise<ActionResult<{ status: string; reasons: string[] }>> {
  const actor = await requireProvider();
  const r = await withActor(async (trx) => {
    const l = await ownListing(trx, actor.provider.id, listingId);
    if (!l) return { ok: false as const, error: "Listing not found" };
    const units = await trx.selectFrom("units").select("id").where("listing_id", "=", l.id).execute();
    if (units.length === 0) return { ok: false as const, error: "Add at least one unit with a serial first" };
    if (l.title === "Untitled listing" || l.day_cents <= 0) return { ok: false as const, error: "Give the listing a title and a day rate" };
    const route = await routeListing(trx, l, l.published_at ? "edited" : "new", l.published_at ? l.day_cents : null, actor.provider.id);
    if (route.mode === "auto_publish") {
      await trx.updateTable("listings").set({ status: "published", published_at: l.published_at ?? now() }).where("id", "=", l.id).execute();
      return { ok: true as const, data: { status: "published", reasons: [] } };
    }
    await trx.updateTable("listings").set({ status: "pending_review" }).where("id", "=", l.id).execute();
    await trx.insertInto("listing_reviews").values({ listing_id: l.id, kind: route.kind, reasons: route.reasons, checks: JSON.stringify(route.checks), previous_day_cents: l.published_at ? l.day_cents : null }).execute();
    return { ok: true as const, data: { status: "pending_review", reasons: route.reasons } };
  });
  revalidatePath(`/provider/listings/${listingId}`);
  revalidatePath("/provider/listings");
  revalidatePath("/admin/listing-review");
  return r;
}

export async function setListingHidden(listingId: string, hidden: boolean): Promise<ActionResult> {
  const actor = await requireProvider();
  const r = await withActor(async (trx) => {
    const l = await ownListing(trx, actor.provider.id, listingId);
    if (!l) return { ok: false as const, error: "Listing not found" };
    if (!["published", "hidden"].includes(l.status)) return { ok: false as const, error: "Only published listings can be hidden" };
    await trx.updateTable("listings").set({ status: hidden ? "hidden" : "published" }).where("id", "=", l.id).execute();
    return { ok: true as const, data: undefined };
  });
  revalidatePath(`/provider/listings/${listingId}`);
  revalidatePath("/provider/listings");
  return r;
}

const extraSchema = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(80), description: z.string().max(200).nullable().optional(), price_cents: z.number().int().min(0), per: z.enum(["day", "rental"]), is_damage_waiver: z.boolean().optional(), waiver_covers_cents: z.number().int().min(0).nullable().optional() });
export async function upsertExtra(listingId: string, input: z.input<typeof extraSchema>): Promise<ActionResult<{ id: string }>> {
  const actor = await requireProvider();
  const parsed = extraSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the extra" };
  const r = await withActor(async (trx) => {
    const l = await ownListing(trx, actor.provider.id, listingId);
    if (!l) return { ok: false as const, error: "Listing not found" };
    const d = parsed.data;
    if (d.id) {
      await trx.updateTable("listing_extras").set({ name: d.name, description: d.description ?? null, price_cents: d.price_cents, per: d.per, is_damage_waiver: d.is_damage_waiver ?? false, waiver_covers_cents: d.waiver_covers_cents ?? null }).where("id", "=", d.id).where("listing_id", "=", l.id).execute();
      return { ok: true as const, data: { id: d.id } };
    }
    const n = await trx.selectFrom("listing_extras").select((eb) => eb.fn.countAll<number>().as("n")).where("listing_id", "=", l.id).executeTakeFirst();
    const row = await trx.insertInto("listing_extras").values({ listing_id: l.id, name: d.name, description: d.description ?? null, price_cents: d.price_cents, per: d.per, is_damage_waiver: d.is_damage_waiver ?? false, waiver_covers_cents: d.waiver_covers_cents ?? null, sort: Number(n?.n ?? 0) }).returning("id").executeTakeFirstOrThrow();
    return { ok: true as const, data: { id: row.id } };
  });
  revalidatePath(`/provider/listings/${listingId}`);
  return r;
}
export async function deleteExtra(listingId: string, extraId: string): Promise<ActionResult> {
  const actor = await requireProvider();
  await withActor(async (trx) => {
    const l = await ownListing(trx, actor.provider.id, listingId);
    if (l) await trx.deleteFrom("listing_extras").where("id", "=", extraId).where("listing_id", "=", l.id).execute();
  });
  revalidatePath(`/provider/listings/${listingId}`);
  return { ok: true, data: undefined };
}

const unitSchema = z.object({ id: z.string().uuid().optional(), serial: z.string().trim().min(2).max(80), acquired_at: z.string().nullable().optional(), hours: z.number().int().min(0).nullable().optional(), next_service_at: z.string().nullable().optional(), status: z.enum(["rentable", "service_due", "in_maintenance", "retired"]).optional() });
export async function upsertUnit(listingId: string, input: z.input<typeof unitSchema>): Promise<ActionResult<{ id: string; unit_number: number }>> {
  const actor = await requireProvider();
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the unit" };
  const r = await withActor(async (trx) => {
    const l = await ownListing(trx, actor.provider.id, listingId);
    if (!l) return { ok: false as const, error: "Listing not found" };
    const d = parsed.data;
    const values = { serial: d.serial, acquired_at: d.acquired_at ? new Date(d.acquired_at) : null, hours: d.hours ?? null, next_service_at: d.next_service_at ? new Date(d.next_service_at) : null, ...(d.status ? { status: d.status } : {}) };
    if (d.id) {
      const u = await trx.updateTable("units").set(values).where("id", "=", d.id).where("listing_id", "=", l.id).returning(["id", "unit_number"]).executeTakeFirst();
      return u ? { ok: true as const, data: u } : { ok: false as const, error: "Unit not found" };
    }
    const max = await trx.selectFrom("units").select((eb) => eb.fn.max("unit_number").as("m")).where("listing_id", "=", l.id).executeTakeFirst();
    const u = await trx.insertInto("units").values({ listing_id: l.id, unit_number: Number(max?.m ?? 0) + 1, ...values }).returning(["id", "unit_number"]).executeTakeFirstOrThrow();
    return { ok: true as const, data: u };
  });
  revalidatePath(`/provider/listings/${listingId}`);
  revalidatePath("/provider/inventory");
  return r;
}

const blockSchema = z.object({ unit_id: z.string().uuid().nullable(), start: z.string(), end: z.string(), reason: z.enum(["service", "inspection", "off_platform", "other"]), note: z.string().max(200).nullable().optional() });
/** Block dates for one unit or all units. Refuses when a confirmed booking on that unit overlaps (reassign first). */
export async function addBlock(listingId: string, input: z.input<typeof blockSchema>): Promise<ActionResult<{ id: string }>> {
  const actor = await requireProvider();
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the dates" };
  const start = new Date(parsed.data.start);
  const end = new Date(parsed.data.end);
  if (!(end > start)) return { ok: false, error: "End must be after start" };
  const r = await withActor(async (trx) => {
    const l = await ownListing(trx, actor.provider.id, listingId);
    if (!l) return { ok: false as const, error: "Listing not found" };
    let q = trx.selectFrom("bookings").select(["ref"]).where("listing_id", "=", l.id).where("status", "in", ["confirmed", "ready_for_pickup", "out_for_delivery", "active", "return_due", "overdue"]).where("start_at", "<", end).where("end_at", ">", start);
    if (parsed.data.unit_id) q = q.where("unit_id", "=", parsed.data.unit_id);
    const clash = await q.executeTakeFirst();
    if (clash) return { ok: false as const, error: `${clash.ref} is booked on ${parsed.data.unit_id ? "this unit" : "this listing"} in that window — reassign it first` };
    const row = await trx.insertInto("availability_blocks").values({ listing_id: l.id, unit_id: parsed.data.unit_id, start_at: start, end_at: end, reason: parsed.data.reason, note: parsed.data.note ?? null }).returning("id").executeTakeFirstOrThrow();
    return { ok: true as const, data: { id: row.id } };
  });
  revalidatePath(`/provider/listings/${listingId}`);
  revalidatePath("/provider/calendar");
  return r;
}
export async function deleteBlock(listingId: string, blockId: string): Promise<ActionResult> {
  const actor = await requireProvider();
  await withActor(async (trx) => {
    const l = await ownListing(trx, actor.provider.id, listingId);
    if (l) await trx.deleteFrom("availability_blocks").where("id", "=", blockId).where("listing_id", "=", l.id).execute();
  });
  revalidatePath(`/provider/listings/${listingId}`);
  revalidatePath("/provider/calendar");
  return { ok: true, data: undefined };
}

const photoInput = z.object({ path: z.string().max(300), label: z.string().max(60).nullable().optional(), has_serial_plate: z.boolean().optional(), is_cover: z.boolean().optional() });
export async function addListingPhoto(listingId: string, input: z.input<typeof photoInput>): Promise<ActionResult<{ id: string }>> {
  const actor = await requireProvider();
  const parsed = photoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad photo" };
  const r = await withActor(async (trx) => {
    const l = await ownListing(trx, actor.provider.id, listingId);
    if (!l) return { ok: false as const, error: "Listing not found" };
    const n = await trx.selectFrom("listing_photos").select((eb) => eb.fn.countAll<number>().as("n")).where("listing_id", "=", l.id).executeTakeFirst();
    const count = Number(n?.n ?? 0);
    if (count >= 10) return { ok: false as const, error: "Up to 10 photos per listing" };
    const row = await trx.insertInto("listing_photos").values({ listing_id: l.id, storage_path: parsed.data.path, label: parsed.data.label ?? null, has_serial_plate: parsed.data.has_serial_plate ?? false, is_cover: parsed.data.is_cover ?? count === 0, sort: count, photo_hash: parsed.data.path.slice(-16) }).returning("id").executeTakeFirstOrThrow();
    await refreshQuality(trx, l.id);
    return { ok: true as const, data: { id: row.id } };
  });
  revalidatePath(`/provider/listings/${listingId}`);
  return r;
}
export async function updateListingPhoto(listingId: string, photoId: string, patch: { label?: string | null; has_serial_plate?: boolean; is_cover?: boolean; remove?: boolean }): Promise<ActionResult> {
  const actor = await requireProvider();
  await withActor(async (trx) => {
    const l = await ownListing(trx, actor.provider.id, listingId);
    if (!l) return;
    if (patch.remove) {
      await trx.deleteFrom("listing_photos").where("id", "=", photoId).where("listing_id", "=", l.id).execute();
    } else {
      if (patch.is_cover) await trx.updateTable("listing_photos").set({ is_cover: false }).where("listing_id", "=", l.id).execute();
      await trx.updateTable("listing_photos").set({ ...(patch.label !== undefined ? { label: patch.label } : {}), ...(patch.has_serial_plate !== undefined ? { has_serial_plate: patch.has_serial_plate } : {}), ...(patch.is_cover ? { is_cover: true } : {}) }).where("id", "=", photoId).where("listing_id", "=", l.id).execute();
    }
    await refreshQuality(trx, l.id);
  });
  revalidatePath(`/provider/listings/${listingId}`);
  return { ok: true, data: undefined };
}

/** Late fee preview for the return screen (pure, but the rate lives on the listing). */
export async function previewLateFee(ref: string, returnedAtIso: string): Promise<ActionResult<{ fee_cents: number; late_minutes: number; billable_hours: number }>> {
  const actor = await requireProvider();
  return withActor(async (trx) => {
    const b = await loadBooking(trx, actor.provider.id, ref);
    if (!b) return { ok: false as const, error: "Booking not found" };
    const l = await trx.selectFrom("listings").select(["late_fee_cents_per_hour", "late_grace_minutes"]).where("id", "=", b.listing_id).executeTakeFirstOrThrow();
    const r = lateFee(b.return_due_at ?? b.end_at, new Date(returnedAtIso), l.late_fee_cents_per_hour, l.late_grace_minutes);
    return { ok: true as const, data: { fee_cents: r.fee_cents, late_minutes: r.late_minutes, billable_hours: r.billable_hours } };
  });
}
