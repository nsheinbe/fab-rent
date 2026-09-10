import "server-only";
import { asSystem, type Trx } from "@/lib/db";
import { now } from "@/lib/time";
import { getConfigForVersion, getLiveConfig } from "@/lib/settings/live";
import type { BookingEvent } from "@/lib/booking-state/machine";
import type { BookingStatus } from "@/lib/booking-state/status";
import { dedupeKey, planTransition, type TemplateKey } from "./catalogue";
import { enqueueNotification, sendAndRecord, type EnqueueResult } from "./outbox";
import { renderBooking, renderListingReviewed, renderOtp, renderPayoutAccountAction, renderPayoutAccountVerified, renderPayoutReminder, renderPayoutSent, type BookingContext } from "./templates";
import { createHash } from "node:crypto";
import { payoutScheduleLabel } from "@/lib/time";

/**
 * The hooks the product calls. Each loads what the copy needs as the system (RLS hides the other
 * party's email from renters and providers), renders one message per affected party and hands it to
 * the outbox. Nothing here writes booking state.
 */

export function appUrl(): string {
  return (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

interface Recipient {
  profile_id: string | null;
  email: string | null;
  name: string;
  prefs: unknown;
}

interface LoadedBooking {
  id: string;
  ctx: BookingContext;
  renter: Recipient;
  provider: Recipient;
}

type Window = { start: string; end: string } | null;

async function loadBooking(trx: Trx, bookingId: string): Promise<LoadedBooking | null> {
  return asSystem(trx, async (sys) => {
    const b = await sys
      .selectFrom("bookings as b")
      .innerJoin("listings as l", "l.id", "b.listing_id")
      .innerJoin("providers as pv", "pv.id", "b.provider_id")
      .innerJoin("profiles as r", "r.id", "b.renter_id")
      .innerJoin("profiles as o", "o.id", "pv.owner_profile_id")
      .select([
        "b.id", "b.ref", "b.start_at", "b.end_at", "b.fulfillment", "b.delivery_address", "b.drop_window", "b.collect_window", "b.charged_cents", "b.hold_cents", "b.payment_method_label", "b.free_cancel_until", "b.settings_version",
        "l.title", "l.pickup_address", "l.late_fee_cents_per_hour", "l.late_grace_minutes",
        "pv.name as provider_name", "pv.response_minutes",
        "r.id as renter_id", "r.name as renter_name", "r.email as renter_email", "r.notification_prefs as renter_prefs",
        "o.id as owner_id", "o.name as owner_name", "o.email as owner_email", "o.notification_prefs as owner_prefs",
      ])
      .where("b.id", "=", bookingId)
      .executeTakeFirst();
    if (!b) return null;
    const claims = await sys.selectFrom("claims").select(["type", "status", "amount_cents", "settled_cents"]).where("booking_id", "=", bookingId).execute();
    const config = await getConfigForVersion(b.settings_version);
    const late_fee_cents = claims.filter((c) => c.type === "late").reduce((s, c) => s + Number(c.settled_cents ?? c.amount_cents), 0);
    const claim_cents = claims.filter((c) => c.type !== "late" && (c.status === "open" || c.status === "disputed")).reduce((s, c) => s + Number(c.amount_cents), 0);
    const ctx: BookingContext = {
      ref: b.ref,
      title: b.title,
      provider_name: b.provider_name,
      renter_name: b.renter_name,
      start_at: b.start_at,
      end_at: b.end_at,
      tz: config.market.timezone,
      fulfillment: b.fulfillment,
      pickup_address: b.pickup_address,
      delivery_address: b.delivery_address,
      drop_window: (b.drop_window as Window) ?? null,
      collect_window: (b.collect_window as Window) ?? null,
      charged_cents: Number(b.charged_cents),
      hold_cents: Number(b.hold_cents),
      payment_method_label: b.payment_method_label,
      free_cancel_until: b.free_cancel_until,
      response_minutes: b.response_minutes,
      late_fee_cents_per_hour: Number(b.late_fee_cents_per_hour),
      late_grace_minutes: Number(b.late_grace_minutes),
      auto_release_business_days: config.holds.auto_release_business_days,
      renter_response_hours: config.holds.renter_response_hours,
      admin_decision_sla_hours: config.holds.admin_decision_sla_hours,
      appeal_days: config.holds.appeal_days,
      late_fee_cents,
      claim_cents,
      payload: {},
      app_url: appUrl(),
    };
    return {
      id: b.id,
      ctx,
      renter: { profile_id: b.renter_id, email: b.renter_email, name: b.renter_name, prefs: b.renter_prefs },
      provider: { profile_id: b.owner_id, email: b.owner_email, name: b.owner_name, prefs: b.owner_prefs },
    };
  });
}

type BookingTemplate = Parameters<typeof renderBooking>[0];

async function enqueueForParties(trx: Trx, loaded: LoadedBooking, template: BookingTemplate, parties: Array<"renter" | "provider">, payload: Record<string, unknown>, subjectId = loaded.id): Promise<EnqueueResult[]> {
  const ctx: BookingContext = { ...loaded.ctx, payload };
  const results: EnqueueResult[] = [];
  for (const party of parties) {
    const r = renderBooking(template, party, ctx);
    const recipient = party === "renter" ? loaded.renter : loaded.provider;
    results.push(await enqueueNotification(trx, { template, party, dedupe_key: dedupeKey(template, subjectId, party), recipient, booking_id: loaded.id, subject: r.subject, text: r.text, payload: { ref: loaded.ctx.ref, ...pick(payload, ["event", "decision", "extra_days"]) } }));
  }
  return results;
}

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** Called by transitionBooking after the status change and its event row, inside the same transaction. */
export async function notifyBookingTransition(trx: Trx, args: { bookingId: string; event: BookingEvent; from: BookingStatus; to: BookingStatus; payload: Record<string, unknown>; at?: Date }): Promise<EnqueueResult[]> {
  const plan = planTransition(args.event);
  if (plan.length === 0) return [];
  const loaded = await loadBooking(trx, args.bookingId);
  if (!loaded) return [];
  const template = plan[0]!.template as BookingTemplate;
  return enqueueForParties(trx, loaded, template, plan.map((p) => p.party), { ...args.payload, event: args.event, from: args.from, to: args.to });
}

/** Checkout of a non-instant booking: the renter's receipt and the provider's request to approve. */
export async function notifyBookingRequested(trx: Trx, bookingId: string): Promise<EnqueueResult[]> {
  const loaded = await loadBooking(trx, bookingId);
  if (!loaded) return [];
  return enqueueForParties(trx, loaded, "booking_requested", ["renter", "provider"], { event: "booking_created" });
}

/** Return check-in with damage / cleaning / missing claims: the renter has `renter_response_hours` to answer. */
export async function notifyClaimRaised(trx: Trx, bookingId: string): Promise<EnqueueResult[]> {
  const loaded = await loadBooking(trx, bookingId);
  if (!loaded) return [];
  return enqueueForParties(trx, loaded, "claim_raised", ["renter"], { event: "claim_raised" });
}

export async function notifyExtensionRequested(trx: Trx, bookingId: string, extension: { id: string; extra_days: number; new_end_at: Date; amount_cents: number }): Promise<EnqueueResult[]> {
  const loaded = await loadBooking(trx, bookingId);
  if (!loaded) return [];
  return enqueueForParties(trx, loaded, "extension_requested", ["provider"], { event: "extension_requested", extra_days: extension.extra_days, new_end_at: extension.new_end_at.toISOString(), amount_cents: extension.amount_cents }, extension.id);
}

export async function notifyExtensionDecided(trx: Trx, bookingId: string, extension: { id: string; decision: "approved" | "declined"; extra_days: number; new_end_at: Date; amount_cents: number }): Promise<EnqueueResult[]> {
  const loaded = await loadBooking(trx, bookingId);
  if (!loaded) return [];
  return enqueueForParties(trx, loaded, "extension_decided", ["renter"], { event: `extension_${extension.decision}`, decision: extension.decision, extra_days: extension.extra_days, new_end_at: extension.new_end_at.toISOString(), amount_cents: extension.amount_cents }, extension.id);
}

/** Scheduled the day before a pickup or delivery. One per booking per party, whatever the job cadence. */
export async function notifyHandoffReminder(trx: Trx, bookingId: string): Promise<EnqueueResult[]> {
  const loaded = await loadBooking(trx, bookingId);
  if (!loaded) return [];
  return enqueueForParties(trx, loaded, "handoff_reminder", ["renter", "provider"], { event: "handoff_reminder" });
}

async function loadPayout(trx: Trx, payoutId: string) {
  return asSystem(trx, async (sys) => {
    const p = await sys
      .selectFrom("payouts as po")
      .innerJoin("providers as pv", "pv.id", "po.provider_id")
      .innerJoin("profiles as o", "o.id", "pv.owner_profile_id")
      .select(["po.id", "po.amount_cents", "po.account_masked", "po.rental_count", "po.scheduled_for", "po.paid_at", "po.exception", "po.exception_detail", "pv.name as provider_name", "pv.payouts_paused_reason", "o.id as owner_id", "o.name as owner_name", "o.email as owner_email", "o.notification_prefs as owner_prefs"])
      .where("po.id", "=", payoutId)
      .executeTakeFirst();
    if (!p) return null;
    const config = await getLiveConfig();
    return {
      ctx: { provider_name: p.provider_name, amount_cents: Number(p.amount_cents), account_masked: p.account_masked, rental_count: Number(p.rental_count), scheduled_for: p.paid_at ?? p.scheduled_for, tz: config.market.timezone, exception: p.exception ?? p.payouts_paused_reason, exception_detail: p.exception_detail, app_url: appUrl() },
      recipient: { profile_id: p.owner_id, email: p.owner_email, name: p.owner_name, prefs: p.owner_prefs } as Recipient,
      provider_id: null,
    };
  });
}

/** A payout reached the provider's account (Phase 6: ops marks it; Phase 7: the transfer result). */
export async function notifyPayoutSent(trx: Trx, payoutId: string): Promise<EnqueueResult | null> {
  const p = await loadPayout(trx, payoutId);
  if (!p) return null;
  const r = renderPayoutSent(p.ctx);
  return enqueueNotification(trx, { template: "payout_sent", party: "provider", dedupe_key: dedupeKey("payout_sent", payoutId, "provider"), recipient: p.recipient, subject: r.subject, text: r.text, payload: { payout_id: payoutId, amount_cents: p.ctx.amount_cents } });
}

/** Ops "Remind" on a paused or failed payout: once per payout per day. */
export async function notifyPayoutReminder(trx: Trx, payoutId: string, at: Date = now()): Promise<EnqueueResult | null> {
  const p = await loadPayout(trx, payoutId);
  if (!p) return null;
  const r = renderPayoutReminder(p.ctx);
  return enqueueNotification(trx, { template: "payout_reminder", party: "provider", dedupe_key: dedupeKey("payout_reminder", `${payoutId}:${at.toISOString().slice(0, 10)}`, "provider"), recipient: p.recipient, subject: r.subject, text: r.text, payload: { payout_id: payoutId, amount_cents: p.ctx.amount_cents } });
}

async function loadProviderOwner(trx: Trx, providerId: string) {
  return asSystem(trx, (sys) =>
    sys
      .selectFrom("providers as pv")
      .innerJoin("profiles as o", "o.id", "pv.owner_profile_id")
      .select(["pv.id", "pv.name", "pv.payout_schedule", "pv.payout_account_masked", "o.id as owner_id", "o.name as owner_name", "o.email as owner_email", "o.notification_prefs as owner_prefs"])
      .where("pv.id", "=", providerId)
      .executeTakeFirst(),
  );
}

export interface PayoutAccountNotice {
  account_ref: string;
  account_masked: string | null;
  /** human labels of what is still outstanding */
  outstanding: string[];
  reason: string | null;
  detail: string | null;
  deadline: Date | null;
}

/** The connected payout account became verified (Phase 7): once per account. */
export async function notifyPayoutAccountVerified(trx: Trx, providerId: string, notice: PayoutAccountNotice): Promise<EnqueueResult | null> {
  const p = await loadProviderOwner(trx, providerId);
  if (!p) return null;
  const config = await getLiveConfig();
  const r = renderPayoutAccountVerified({ provider_name: p.name, account_masked: notice.account_masked ?? p.payout_account_masked, schedule_label: payoutScheduleLabel(p.payout_schedule), outstanding: [], reason: null, detail: null, deadline: null, tz: config.market.timezone, app_url: appUrl() });
  return enqueueNotification(trx, { template: "payout_account_verified", party: "provider", dedupe_key: dedupeKey("payout_account_verified", `${providerId}:${notice.account_ref}`, "provider"), recipient: { profile_id: p.owner_id, email: p.owner_email, name: p.owner_name, prefs: p.owner_prefs }, subject: r.subject, text: r.text, payload: { provider_id: providerId, account_ref: notice.account_ref } });
}

/** The payout provider needs something from the provider (Phase 7): once per distinct set of outstanding requirements. */
export async function notifyPayoutAccountAction(trx: Trx, providerId: string, notice: PayoutAccountNotice): Promise<EnqueueResult | null> {
  const p = await loadProviderOwner(trx, providerId);
  if (!p) return null;
  const config = await getLiveConfig();
  const r = renderPayoutAccountAction({ provider_name: p.name, account_masked: notice.account_masked ?? p.payout_account_masked, schedule_label: payoutScheduleLabel(p.payout_schedule), outstanding: notice.outstanding, reason: notice.reason, detail: notice.detail, deadline: notice.deadline, tz: config.market.timezone, app_url: appUrl() });
  const fingerprint = createHash("sha1").update([...notice.outstanding].sort().join("|") + "|" + (notice.reason ?? "")).digest("hex").slice(0, 12);
  return enqueueNotification(trx, { template: "payout_account_action", party: "provider", dedupe_key: dedupeKey("payout_account_action", `${providerId}:${notice.account_ref}:${fingerprint}`, "provider"), recipient: { profile_id: p.owner_id, email: p.owner_email, name: p.owner_name, prefs: p.owner_prefs }, subject: r.subject, text: r.text, payload: { provider_id: providerId, account_ref: notice.account_ref, outstanding: notice.outstanding, reason: notice.reason } });
}

/** Listing review decided (A03): "provider notified with reason". */
export async function notifyListingReviewed(trx: Trx, reviewId: string): Promise<EnqueueResult | null> {
  const row = await asSystem(trx, (sys) =>
    sys
      .selectFrom("listing_reviews as lr")
      .innerJoin("listings as l", "l.id", "lr.listing_id")
      .innerJoin("providers as pv", "pv.id", "l.provider_id")
      .innerJoin("profiles as o", "o.id", "pv.owner_profile_id")
      .select(["lr.id", "lr.decision", "lr.message_to_provider", "lr.change_request", "lr.reject_reason", "l.id as listing_id", "l.title", "o.id as owner_id", "o.name as owner_name", "o.email as owner_email", "o.notification_prefs as owner_prefs"])
      .where("lr.id", "=", reviewId)
      .executeTakeFirst(),
  );
  if (!row || !row.decision) return null;
  const checklist = Array.isArray(row.change_request) ? (row.change_request as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const r = renderListingReviewed({ title: row.title, listing_id: row.listing_id, decision: row.decision, message: row.message_to_provider, checklist, reject_reason: row.reject_reason, app_url: appUrl() });
  return enqueueNotification(trx, { template: "listing_reviewed", party: "provider", dedupe_key: dedupeKey("listing_reviewed", reviewId, "provider"), recipient: { profile_id: row.owner_id, email: row.owner_email, name: row.owner_name, prefs: row.owner_prefs }, subject: r.subject, text: r.text, payload: { listing_id: row.listing_id, decision: row.decision } });
}

/** Sign-in code by email. Sent immediately (the caller reports failure to the person); the code is never stored on the delivery record. */
export async function sendSignInCode(input: { otpId: string; email: string; code: string; ttlMinutes: number; profileId?: string | null; name?: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = renderOtp(input.code, input.ttlMinutes);
  const sent = await sendAndRecord({ template: "otp_code", party: "user", dedupe_key: dedupeKey("otp_code", input.otpId, "user"), recipient: { profile_id: input.profileId ?? null, email: input.email, name: input.name ?? null }, subject: r.subject, text: r.text, payload: { identifier: input.email }, store_body: false });
  return sent.ok ? { ok: true } : { ok: false, error: sent.error };
}

export type { TemplateKey };
