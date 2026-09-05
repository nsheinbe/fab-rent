"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActor, requireUser, withActor, runAsSystem, AuthError } from "@/lib/auth";
import { ANON_COOKIE } from "@/lib/auth/session";
import { getLiveConfig, getLiveSettings } from "@/lib/settings/live";
import { getListingBySlug, getAvailability, originFor } from "@/lib/queries/listings";
import { quoteBooking, QuoteError, distanceKm, instantBookEligible, quoteExtension, freeCancelUntil, sameDayAllowed } from "@/lib/pricing";
import { transitionBooking, recordBookingEvent } from "@/lib/booking-state/transition";
import { getPaymentProvider, PaymentError } from "@/lib/payments";
import { getIdVerificationProvider } from "@/lib/id-verification";
import { marketLocal, now } from "@/lib/time";
import { asSystem, sql } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code?: string };

const draftSchema = z.object({
  listingSlug: z.string().min(1),
  from: z.string().min(10),
  to: z.string().min(10),
  qty: z.coerce.number().int().min(1).max(50).default(1),
  fulfillment: z.enum(["pickup", "delivery"]),
  address: z.string().trim().max(200).optional(),
  area: z.string().trim().max(60).optional(),
  drop: z.string().optional(),
  collect: z.string().optional(),
  extras: z.array(z.object({ id: z.string().uuid(), qty: z.number().int().min(1).max(20).default(1) })).default([]),
  where: z.string().optional(),
});
export type DraftInput = z.infer<typeof draftSchema>;

export interface DraftPayload {
  listing_id: string;
  listing_slug: string;
  from: string; // market-local ISO
  to: string;
  qty: number;
  fulfillment: "pickup" | "delivery";
  address: string | null;
  area: string | null;
  drop: { start: string; end: string } | null;
  collect: { start: string; end: string } | null;
  extras: Array<{ id: string; qty: number }>;
  delivery_km: number | null;
  where: string | null;
}

function parseWindow(v?: string): { start: string; end: string } | null {
  if (!v) return null;
  const [start, end] = v.split("-");
  return start && end ? { start, end } : null;
}

/** Builds (or updates) a booking draft. Works signed-out: the draft is keyed by the anonymous cookie until sign-in. */
export async function saveDraft(input: DraftInput): Promise<ActionResult<{ draftId: string; nextUrl: string }>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your dates and options" };
  const d = parsed.data;
  const config = await getLiveConfig();
  const tz = config.market.timezone;
  const start = marketLocal(d.from, tz);
  const end = marketLocal(d.to, tz);
  if (!(end > start)) return { ok: false, error: "Return must be after the start" };
  const actor = await getActor();
  const jar = await cookies();
  const anonymousKey = jar.get(ANON_COOKIE)?.value ?? null;

  return withActor(async (trx) => {
    const listing = await getListingBySlug(trx, d.listingSlug);
    if (!listing || listing.status !== "published") return { ok: false, error: "This listing is no longer available" };
    if (d.fulfillment === "delivery" && !listing.delivery.enabled) return { ok: false, error: "This listing is pickup only" };
    let delivery_km: number | null = null;
    if (d.fulfillment === "delivery") {
      const n = config.market.neighbourhoods.find((x) => x.name === d.area || x.slug === d.area);
      if (!n) return { ok: false, error: "Pick a delivery neighbourhood" };
      if (!d.address) return { ok: false, error: "Enter the delivery address" };
      delivery_km = +distanceKm({ lat: listing.lat ?? config.market.center.lat, lng: listing.lng ?? config.market.center.lng }, n).toFixed(1);
    }
    const extras = d.extras.map((e) => ({ extra: listing.extras.find((x) => x.id === e.id)!, qty: e.qty })).filter((e) => e.extra);
    try {
      quoteBooking({ pricing: listing.pricing, delivery: listing.delivery }, { start, end, qty: d.qty, fulfillment: d.fulfillment, delivery_km: delivery_km ?? undefined, extras, tz }, config);
    } catch (e) {
      if (e instanceof QuoteError) return { ok: false, error: e.message, code: e.code };
      throw e;
    }
    const free = await getAvailability(trx, listing.id, start, end);
    if (free < d.qty) return { ok: false, error: free === 0 ? "No units are free for these dates" : `Only ${free} unit${free === 1 ? "" : "s"} free for these dates` };
    const payload: DraftPayload = { listing_id: listing.id, listing_slug: listing.slug, from: d.from, to: d.to, qty: d.qty, fulfillment: d.fulfillment, address: d.address ?? null, area: d.area ?? null, drop: parseWindow(d.drop), collect: parseWindow(d.collect), extras: d.extras, delivery_km, where: d.where ?? null };
    const row = await trx
      .insertInto("booking_drafts")
      .values({ anonymous_key: anonymousKey, profile_id: actor.userId, listing_id: listing.id, payload: JSON.stringify(payload) })
      .returning("id")
      .executeTakeFirstOrThrow();
    const checkout = `/checkout/${row.id}`;
    return { ok: true, data: { draftId: row.id, nextUrl: actor.userId ? checkout : `/auth?next=${encodeURIComponent(checkout)}` } };
  });
}

export async function updateDraft(draftId: string, patch: Partial<Pick<DraftPayload, "address" | "area" | "drop" | "collect" | "extras" | "fulfillment" | "delivery_km">>): Promise<ActionResult> {
  return withActor(async (trx) => {
    const draft = await trx.selectFrom("booking_drafts").select(["id", "payload"]).where("id", "=", draftId).executeTakeFirst();
    if (!draft) return { ok: false, error: "Draft not found" };
    const payload = { ...(draft.payload as unknown as DraftPayload), ...patch };
    await trx.updateTable("booking_drafts").set({ payload: JSON.stringify(payload) }).where("id", "=", draftId).execute();
    revalidatePath(`/checkout/${draftId}`);
    return { ok: true, data: undefined };
  });
}

const checkoutSchema = z.object({
  draftId: z.string().uuid(),
  paymentMethodId: z.string().uuid().optional(),
  applePay: z.boolean().optional(),
  agree: z.literal(true),
});

/**
 * Pay: charges the renter now (rental + fees + tax + extras), never the hold. Instant-book eligible renters are
 * confirmed immediately; otherwise the booking is created as `requested` for the provider to approve.
 */
export async function checkout(input: z.input<typeof checkoutSchema>): Promise<ActionResult<{ ref: string }>> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please agree to the rental rules to continue" };
  const actor = await requireUser();
  const settings = await getLiveSettings();
  const config = settings.config;
  const tz = config.market.timezone;
  const payments = await getPaymentProvider();

  const result = await withActor(async (trx): Promise<ActionResult<{ ref: string }>> => {
    const draft = await trx.selectFrom("booking_drafts").selectAll().where("id", "=", parsed.data.draftId).executeTakeFirst();
    if (!draft) return { ok: false, error: "Your booking draft has expired — start again from the listing" };
    const p = draft.payload as unknown as DraftPayload;
    const listing = await getListingBySlug(trx, p.listing_slug);
    if (!listing || listing.status !== "published") return { ok: false, error: "This listing is no longer available" };
    const start = marketLocal(p.from, tz);
    const end = marketLocal(p.to, tz);
    if (start < now()) return { ok: false, error: "The start time has passed — pick new dates" };
    const openingHour = Number(((listing.pickup.hours[["sun", "mon", "tue", "wed", "thu", "fri", "sat"][start.getDay()]!] ?? ["07:00", "18:00"])[1] ?? "18:00").split(":")[0]);
    if (!sameDayAllowed(start, now(), listing.same_day_cutoff_minutes, openingHour, tz)) return { ok: false, error: "Same-day bookings are closed for today — pick a later start" };
    const extras = p.extras.map((e) => ({ extra: listing.extras.find((x) => x.id === e.id)!, qty: e.qty })).filter((e) => e.extra);
    let quote;
    try {
      quote = quoteBooking({ pricing: listing.pricing, delivery: listing.delivery }, { start, end, qty: p.qty, fulfillment: p.fulfillment, delivery_km: p.delivery_km ?? undefined, extras, tz, delivery_area: p.area ?? undefined }, config);
    } catch (e) {
      if (e instanceof QuoteError) return { ok: false, error: e.message };
      throw e;
    }
    const free = await getAvailability(trx, listing.id, start, end);
    if (free < p.qty) return { ok: false, error: "Those dates were just taken — pick new dates" };

    const method = parsed.data.paymentMethodId ? await trx.selectFrom("payment_methods").selectAll().where("id", "=", parsed.data.paymentMethodId).where("profile_id", "=", actor.userId!).executeTakeFirst() : null;
    if (!method && !parsed.data.applePay) return { ok: false, error: "Choose a payment method" };
    const methodLabel = method ? `${method.brand} •••• ${method.last4}` : "Apple Pay";
    const policy = config.cancellation.policies.find((x) => x.id === listing.policy_id) ?? config.cancellation.policies.find((x) => x.is_default)!;
    const eligible = instantBookEligible(actor.profile ? { id_verified: actor.profile.id_verified, rating: actor.profile.rating_from_providers, completed_count: actor.profile.completed_count } : null, listing.instant_book, config);

    // charge now — never the hold
    let chargeRef: string;
    try {
      const charge = await payments.charge({ amount_cents: quote.charged_cents, method: { id: method?.id ?? "apple-pay", provider_ref: method?.provider_ref ?? null, label: methodLabel }, description: `fab.rent · ${listing.title}`, idempotency_key: `charge:${draft.id}`, metadata: { draft: draft.id } });
      chargeRef = charge.ref;
    } catch (e) {
      if (e instanceof PaymentError) return { ok: false, error: e.message, code: e.code };
      throw e;
    }

    const booking = await trx
      .insertInto("bookings")
      .values({
        renter_id: actor.userId!, provider_id: listing.provider.id, listing_id: listing.id, unit_id: null, qty: p.qty, start_at: start, end_at: end, billed_days: quote.billed_days,
        fulfillment: p.fulfillment, delivery_address: p.address, delivery_area: p.area, delivery_km: p.delivery_km, drop_window: p.drop ? JSON.stringify(p.drop) : null, collect_window: p.collect ? JSON.stringify(p.collect) : null,
        status: "requested", instant: eligible, price_snapshot: JSON.stringify(quote), charged_cents: quote.charged_cents, hold_cents: quote.hold_cents, hold_status: "none",
        payment_method_id: method?.id ?? null, payment_method_label: methodLabel, payment_refs: JSON.stringify({ charge: chargeRef }),
        cancellation_policy_snapshot: JSON.stringify(policy), free_cancel_until: freeCancelUntil(policy, start), return_due_at: end, settings_version: settings.version,
      })
      .returning(["id", "ref"])
      .executeTakeFirstOrThrow();
    for (const line of quote.lines.filter((l) => l.kind === "extra" || l.kind === "waiver")) {
      const x = listing.extras.find((e) => e.id === line.ref)!;
      const exQty = p.extras.find((e) => e.id === x.id)?.qty ?? 1;
      await trx.insertInto("booking_extras").values({ booking_id: booking.id, extra_id: x.id, name: x.name, per: x.per, qty: x.is_damage_waiver ? p.qty : exQty, days: quote.billed_days, unit_cents: x.price_cents, amount_cents: line.cents, is_damage_waiver: x.is_damage_waiver }).execute();
    }
    const who = { role: "renter" as const, id: actor.userId, name: actor.profile?.name ?? "Renter" };
    await recordBookingEvent(trx, booking.id, "booking_created", who, { instant: eligible });
    await recordBookingEvent(trx, booking.id, "payment_charged", { role: "system", id: null, name: "fab.rent" }, { cents: quote.charged_cents, method: methodLabel });
    if (eligible) await transitionBooking(trx, booking.id, "instant_confirm", { role: "system", id: null, name: "fab.rent" });
    // provider ledger entry (pending until return check-in) — system-owned, renters can't write the ledger
    await asSystem(trx, (sys) => sys.insertInto("ledger_entries").values({ provider_id: listing.provider.id, booking_id: booking.id, entry_date: sql`(${start.toISOString()}::timestamptz at time zone ${tz})::date`, type: "rental", description: `${listing.title} · ${who.name}${p.fulfillment === "delivery" ? " · delivery" : ""}`, gross_cents: quote.provider.gross_cents, commission_cents: -quote.provider.commission_cents, net_cents: quote.provider.payout_cents, status: "pending" }).execute());
    // conversation with the provider, seeded with the delivery/pickup confirmation
    const conv = await trx.insertInto("conversations").values({ booking_id: booking.id, listing_id: listing.id, provider_id: listing.provider.id, renter_id: actor.userId! }).returning("id").executeTakeFirstOrThrow();
    await trx.insertInto("messages").values({ conversation_id: conv.id, sender_side: "system", kind: "system", body: p.fulfillment === "delivery" && p.drop ? `Delivery window confirmed · ${formatDateTime(start).split(" · ")[0]} ${p.drop.start}–${p.drop.end}` : `Pickup ${formatDateTime(start)} · ${listing.pickup.address ?? ""}` }).execute();
    await trx.deleteFrom("booking_drafts").where("id", "=", draft.id).execute();
    return { ok: true, data: { ref: booking.ref } };
  });
  if (result.ok) {
    revalidatePath("/rentals");
    console.info(`[email] receipt for ${result.data.ref} → ${actor.profile?.email ?? "renter"}`);
  }
  return result;
}

const cardSchema = z.object({ brand: z.enum(["Visa", "Mastercard", "Amex"]), last4: z.string().regex(/^\d{4}$/), exp_month: z.coerce.number().int().min(1).max(12), exp_year: z.coerce.number().int().min(2026).max(2040), makeDefault: z.boolean().optional() });

/** Adds a card. Only masked data ever reaches the server: brand, last4 and expiry. */
export async function addPaymentMethod(input: z.input<typeof cardSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the card details" };
  const actor = await requireUser();
  return withActor(async (trx) => {
    if (parsed.data.makeDefault) await trx.updateTable("payment_methods").set({ is_default: false }).where("profile_id", "=", actor.userId!).execute();
    const row = await trx.insertInto("payment_methods").values({ profile_id: actor.userId!, kind: "card", brand: parsed.data.brand, last4: parsed.data.last4, exp_month: parsed.data.exp_month, exp_year: parsed.data.exp_year, is_default: parsed.data.makeDefault ?? false, provider_ref: `mock_pm_${crypto.randomUUID().slice(0, 8)}` }).returning("id").executeTakeFirstOrThrow();
    return { ok: true, data: { id: row.id } };
  });
}

/** Mocked photo-ID check: takes ~2 s then flips id_verified. Only ever triggered from checkout. */
export async function verifyIdentity(): Promise<ActionResult<{ verified: boolean }>> {
  const actor = await requireUser();
  const provider = getIdVerificationProvider();
  const result = await provider.verify({ userId: actor.userId!, fullName: actor.profile?.name ?? "" });
  await withActor((trx) => trx.updateTable("profiles").set({ id_verified: result.verified, id_verified_method: result.verified ? result.method : null, id_verified_at: result.verified ? result.checked_at : null }).where("id", "=", actor.userId!).execute());
  return { ok: true, data: { verified: result.verified } };
}

export async function updateContact(input: { name: string; phone: string }): Promise<ActionResult> {
  const schema = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().min(6).max(30) });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your name and phone" };
  const actor = await requireUser();
  await withActor((trx) => trx.updateTable("profiles").set({ name: parsed.data.name, phone: parsed.data.phone }).where("id", "=", actor.userId!).execute());
  return { ok: true, data: undefined };
}

export async function toggleSaved(listingId: string): Promise<ActionResult<{ saved: boolean }>> {
  const actor = await getActor();
  if (!actor.userId) return { ok: false, error: "Sign in to save listings", code: "unauthenticated" };
  return withActor(async (trx) => {
    const existing = await trx.selectFrom("saved_listings").select("id").where("profile_id", "=", actor.userId!).where("listing_id", "=", listingId).executeTakeFirst();
    if (existing) {
      await trx.deleteFrom("saved_listings").where("id", "=", existing.id).execute();
      revalidatePath("/saved");
      return { ok: true, data: { saved: false } };
    }
    await trx.insertInto("saved_listings").values({ profile_id: actor.userId!, listing_id: listingId }).execute();
    revalidatePath("/saved");
    return { ok: true, data: { saved: true } };
  });
}

export async function cancelBooking(ref: string): Promise<ActionResult<{ refunded_cents: number }>> {
  const actor = await requireUser();
  const r = await withActor(async (trx) => {
    const b = await trx.selectFrom("bookings").select(["id", "status", "renter_id"]).where("ref", "=", ref).executeTakeFirst();
    if (!b) return { ok: false as const, error: "Booking not found" };
    if (b.renter_id !== actor.userId) throw new AuthError("forbidden");
    try {
      const t = await transitionBooking(trx, b.id, "renter_cancel", { role: "renter", id: actor.userId, name: actor.profile?.name ?? "Renter" });
      const ev = await trx.selectFrom("booking_events").select("payload").where("id", "=", t.eventId).executeTakeFirstOrThrow();
      return { ok: true as const, data: { refunded_cents: Number((ev.payload as { refunded_cents?: number })?.refunded_cents ?? 0) } };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
  revalidatePath(`/rentals/${ref}`);
  revalidatePath("/rentals");
  return r;
}

/** Extension: priced before asking, checked against the unit's next booking, charged only when the provider approves. */
export async function requestExtension(ref: string, extraDays: number): Promise<ActionResult<{ amount_cents: number }>> {
  const actor = await requireUser();
  const config = await getLiveConfig();
  const days = Math.max(1, Math.min(30, Math.floor(extraDays)));
  const r = await withActor(async (trx) => {
    const b = await trx.selectFrom("bookings as b").innerJoin("listings as l", "l.id", "b.listing_id").select(["b.id", "b.status", "b.end_at", "b.qty", "b.unit_id", "b.listing_id", "l.day_cents"]).where("b.ref", "=", ref).executeTakeFirst();
    if (!b) return { ok: false as const, error: "Booking not found" };
    if (!["active", "return_due", "confirmed", "ready_for_pickup", "out_for_delivery"].includes(b.status)) return { ok: false as const, error: "This rental can't be extended any more" };
    const newEnd = new Date(b.end_at.getTime() + days * 86_400_000);
    const free = await sql<{ n: number }>`select count(*)::int as n from public.free_units(${b.listing_id}::uuid, ${b.end_at.toISOString()}::timestamptz, ${newEnd.toISOString()}::timestamptz, ${b.id}::uuid) f ${b.unit_id ? sql`where f.free_units = ${b.unit_id}::uuid` : sql``}`.execute(trx);
    if (Number(free.rows[0]?.n ?? 0) < (b.unit_id ? 1 : b.qty)) return { ok: false as const, error: "Your unit is booked by someone else after your return time — the provider may still be able to swap units, message them." };
    const q = quoteExtension(days, b.day_cents, b.qty, config);
    const existing = await trx.selectFrom("extension_requests").select("id").where("booking_id", "=", b.id).where("status", "=", "requested").executeTakeFirst();
    if (existing) await trx.updateTable("extension_requests").set({ status: "cancelled" }).where("id", "=", existing.id).execute();
    await trx.insertInto("extension_requests").values({ booking_id: b.id, new_end_at: newEnd, extra_days: days, amount_cents: q.charged_cents, quote: JSON.stringify(q), status: "requested" }).execute();
    await recordBookingEvent(trx, b.id, "extension_requested", { role: "renter", id: actor.userId, name: actor.profile?.name ?? "Renter" }, { extra_days: days, new_end_at: newEnd.toISOString(), cents: q.charged_cents });
    return { ok: true as const, data: { amount_cents: q.charged_cents } };
  });
  revalidatePath(`/rentals/${ref}`);
  return r;
}

export async function sendMessage(conversationId: string, body: string, photoPath?: string | null): Promise<ActionResult> {
  const actor = await requireUser();
  const text = body.trim();
  if (!text && !photoPath) return { ok: false, error: "Write a message" };
  await withActor(async (trx) => {
    const c = await trx.selectFrom("conversations").select(["id", "renter_id", "provider_id"]).where("id", "=", conversationId).executeTakeFirstOrThrow();
    const side = c.renter_id === actor.userId ? "renter" : actor.providers.some((p) => p.id === c.provider_id) ? "provider" : null;
    if (!side) throw new AuthError("forbidden");
    await trx.insertInto("messages").values({ conversation_id: c.id, sender_id: actor.userId, sender_side: side, kind: photoPath ? "photo" : "text", body: text || null, photo_path: photoPath ?? null }).execute();
  });
  revalidatePath(`/inbox/${conversationId}`);
  return { ok: true, data: undefined };
}

export async function markConversationRead(conversationId: string, side: "renter" | "provider") {
  await withActor((trx) => trx.updateTable("conversations").set(side === "renter" ? { renter_unread: 0 } : { provider_unread: 0 }).where("id", "=", conversationId).execute());
}

/** Message the provider about a booking (creates the thread if it doesn't exist yet). */
export async function openConversation(bookingRef: string): Promise<ActionResult<{ id: string }>> {
  const actor = await requireUser();
  return withActor(async (trx) => {
    const b = await trx.selectFrom("bookings").select(["id", "renter_id", "provider_id", "listing_id"]).where("ref", "=", bookingRef).executeTakeFirst();
    if (!b) return { ok: false, error: "Booking not found" };
    const existing = await trx.selectFrom("conversations").select("id").where("booking_id", "=", b.id).executeTakeFirst();
    if (existing) return { ok: true, data: { id: existing.id } };
    const row = await trx.insertInto("conversations").values({ booking_id: b.id, listing_id: b.listing_id, provider_id: b.provider_id, renter_id: b.renter_id }).returning("id").executeTakeFirstOrThrow();
    void actor;
    return { ok: true, data: { id: row.id } };
  });
}

/** Pre-booking message to a provider about a listing. */
export async function messageProvider(listingSlug: string): Promise<ActionResult<{ id: string }>> {
  const actor = await getActor();
  if (!actor.userId) return { ok: false, error: "Sign in to message providers", code: "unauthenticated" };
  return withActor(async (trx) => {
    const l = await trx.selectFrom("listings").select(["id", "provider_id"]).where("slug", "=", listingSlug).executeTakeFirst();
    if (!l) return { ok: false, error: "Listing not found" };
    const existing = await trx.selectFrom("conversations").select("id").where("listing_id", "=", l.id).where("renter_id", "=", actor.userId!).where("booking_id", "is", null).executeTakeFirst();
    if (existing) return { ok: true, data: { id: existing.id } };
    const row = await trx.insertInto("conversations").values({ listing_id: l.id, provider_id: l.provider_id, renter_id: actor.userId! }).returning("id").executeTakeFirstOrThrow();
    return { ok: true, data: { id: row.id } };
  });
}

const reviewSchema = z.object({ ref: z.string(), item_stars: z.number().int().min(1).max(5), provider_stars: z.number().int().min(1).max(5), tags: z.array(z.string().max(40)).max(8), body: z.string().trim().max(2000), photos: z.array(z.string()).max(6).default([]) });

/** Reviews are double-blind: published when both sides have reviewed, or 14 days after the first (job). */
export async function submitReview(input: z.input<typeof reviewSchema>): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Rate the item and the provider" };
  const actor = await requireUser();
  const config = await getLiveConfig();
  const r = await withActor(async (trx) => {
    const b = await trx.selectFrom("bookings").select(["id", "renter_id", "provider_id", "listing_id", "status", "hold_status"]).where("ref", "=", parsed.data.ref).executeTakeFirst();
    if (!b || b.renter_id !== actor.userId) return { ok: false as const, error: "Booking not found" };
    if (b.status !== "completed" || (b.hold_status !== "released" && b.hold_status !== "none" && b.hold_status !== "partially_captured" && b.hold_status !== "captured")) return { ok: false as const, error: "You can review once the hold has been released" };
    const dup = await trx.selectFrom("reviews").select("id").where("booking_id", "=", b.id).where("author_id", "=", actor.userId!).executeTakeFirst();
    if (dup) return { ok: false as const, error: "You've already reviewed this rental" };
    const other = await trx.selectFrom("reviews").select("id").where("booking_id", "=", b.id).where("author_side", "=", "provider").executeTakeFirst();
    const publishNow = !!other;
    const at = now();
    await trx.insertInto("reviews").values({ booking_id: b.id, author_id: actor.userId!, author_side: "renter", target: "listing", listing_id: b.listing_id, provider_id: b.provider_id, item_stars: parsed.data.item_stars, provider_stars: parsed.data.provider_stars, tags: parsed.data.tags, body: parsed.data.body || null, photos: JSON.stringify(parsed.data.photos.map((p) => ({ path: p }))), submitted_at: at, published_at: publishNow ? at : null }).execute();
    if (publishNow) await trx.updateTable("reviews").set({ published_at: at }).where("id", "=", other!.id).execute();
    return { ok: true as const, data: undefined };
  });
  void config;
  revalidatePath("/rentals");
  return r;
}

export async function reportProblem(ref: string, kind: string, body: string): Promise<ActionResult> {
  const actor = await requireUser();
  await withActor(async (trx) => {
    const b = await trx.selectFrom("bookings").select(["id", "listing_id"]).where("ref", "=", ref).executeTakeFirstOrThrow();
    await trx.insertInto("reports").values({ booking_id: b.id, listing_id: b.listing_id, reporter_id: actor.userId!, kind: kind.slice(0, 40), body: body.slice(0, 2000) }).execute();
    await recordBookingEvent(trx, b.id, "problem_reported", { role: "renter", id: actor.userId, name: actor.profile?.name ?? "Renter" }, { kind });
  });
  revalidatePath(`/rentals/${ref}`);
  return { ok: true, data: undefined };
}

/** Sign-in interstitial helper: after auth, where should a draft go? */
export async function draftCheckoutUrl(draftId: string) {
  const actor = await getActor();
  return actor.userId ? `/checkout/${draftId}` : `/auth?next=${encodeURIComponent(`/checkout/${draftId}`)}`;
}

export async function redirectTo(url: string) {
  redirect(url);
}

export async function attachDraftsNow() {
  const actor = await getActor();
  if (!actor.userId || !actor.anonymousKey) return;
  await runAsSystem((trx) => trx.updateTable("booking_drafts").set({ profile_id: actor.userId }).where("anonymous_key", "=", actor.anonymousKey!).where("profile_id", "is", null).execute());
}

export { originFor };

/** Renter answers a return claim: accept (the hold is captured for the claim amount) or dispute (goes to staff). */
export async function respondToClaim(ref: string, claimId: string, accept: boolean): Promise<ActionResult<{ status: string }>> {
  const actor = await requireUser();
  const r = await withActor(async (trx) => {
    const b = await trx.selectFrom("bookings").select(["id", "renter_id", "status", "hold_cents"]).where("ref", "=", ref).executeTakeFirst();
    if (!b || b.renter_id !== actor.userId) return { ok: false as const, error: "Booking not found" };
    const claim = await trx.selectFrom("claims").select(["id", "amount_cents", "status"]).where("id", "=", claimId).where("booking_id", "=", b.id).executeTakeFirst();
    if (!claim || claim.status !== "open") return { ok: false as const, error: "This claim has already been answered" };
    const who = { role: "renter" as const, id: actor.userId, name: actor.profile?.name ?? "Renter" };
    try {
      if (accept) {
        await trx.updateTable("claims").set({ status: "accepted", settled_at: now(), settled_cents: Math.min(claim.amount_cents, b.hold_cents) }).where("id", "=", claim.id).execute();
        const t = await transitionBooking(trx, b.id, "claim_accepted", who, { captureCents: claim.amount_cents, payload: { claim_id: claim.id } });
        return { ok: true as const, data: { status: t.to } };
      }
      await trx.updateTable("claims").set({ status: "disputed" }).where("id", "=", claim.id).execute();
      const t = await transitionBooking(trx, b.id, "claim_disputed", who, { payload: { claim_id: claim.id } });
      // the dispute record itself is created by the ops queue (Phase 3) from this event; renters can't open dispute rows directly
      return { ok: true as const, data: { status: t.to } };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
  revalidatePath(`/rentals/${ref}`);
  revalidatePath("/rentals");
  return r;
}
