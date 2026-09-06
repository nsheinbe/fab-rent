import "server-only";
import { addDays, differenceInMinutes, startOfWeek } from "date-fns";
import { sql, type Trx } from "@/lib/db";
import type { BookingStatus } from "@/lib/booking-state/status";
import { ACTIVE_STATUSES, BLOCKING_STATUSES, UPCOMING_STATUSES } from "@/lib/booking-state/status";
import type { Quote } from "@/lib/pricing";
import { photoUrl } from "@/lib/storage";
import { marketStartOfDay, toMarket } from "@/lib/time";

/* ------------------------------------------------------------------ bookings */

export interface ProviderBookingRow {
  id: string;
  ref: string;
  status: BookingStatus;
  start_at: Date;
  end_at: Date;
  return_due_at: Date | null;
  billed_days: number;
  qty: number;
  fulfillment: "pickup" | "delivery";
  charged_cents: number;
  hold_cents: number;
  hold_status: string;
  instant: boolean;
  created_at: Date;
  hold_placed_at: Date | null;
  returned_at: Date | null;
  delivery_address: string | null;
  delivery_area: string | null;
  delivery_km: number | null;
  drop_window: { start: string; end: string } | null;
  collect_window: { start: string; end: string } | null;
  payment_method_label: string | null;
  price_snapshot: Quote;
  listing: { id: string; title: string; slug: string; prep_hours: number; pickup_address: string | null; day_cents: number };
  unit: { id: string; unit_number: number; serial: string } | null;
  renter: { id: string; name: string; rating: number | null; rentals: number; id_verified: boolean; is_business: boolean; phone: string | null };
  extension: { id: string; extra_days: number; new_end_at: Date; amount_cents: number; status: string } | null;
  open_claim_cents: number;
  has_handoff_record: boolean;
  has_return_record: boolean;
}

const rowSelect = (trx: Trx, providerId: string) =>
  trx
    .selectFrom("bookings as b")
    .innerJoin("listings as l", "l.id", "b.listing_id")
    .innerJoin("profiles as r", "r.id", "b.renter_id")
    .leftJoin("units as u", "u.id", "b.unit_id")
    .select((eb) => [
      "b.id", "b.ref", "b.status", "b.start_at", "b.end_at", "b.return_due_at", "b.billed_days", "b.qty", "b.fulfillment", "b.charged_cents", "b.hold_cents", "b.hold_status", "b.instant", "b.created_at", "b.hold_placed_at", "b.returned_at",
      "b.delivery_address", "b.delivery_area", "b.delivery_km", "b.drop_window", "b.collect_window", "b.payment_method_label", "b.price_snapshot",
      "l.id as listing_id", "l.title as listing_title", "l.slug as listing_slug", "l.prep_hours", "l.pickup_address", "l.day_cents",
      "u.id as unit_id", "u.unit_number", "u.serial",
      "r.id as renter_id", "r.name as renter_name", "r.rating_from_providers", "r.completed_count", "r.id_verified", "r.is_business", "r.phone",
      eb.selectFrom("extension_requests as x").select(sql<string>`json_build_object('id', x.id, 'extra_days', x.extra_days, 'new_end_at', x.new_end_at, 'amount_cents', x.amount_cents, 'status', x.status)::text`.as("j")).whereRef("x.booking_id", "=", "b.id").orderBy("x.created_at", "desc").limit(1).as("extension_json"),
      eb.selectFrom("claims as c").select((sb) => sb.fn.coalesce(sb.fn.sum<number>("c.amount_cents"), sql<number>`0`).as("n")).whereRef("c.booking_id", "=", "b.id").where("c.status", "in", ["open", "disputed"]).as("open_claim_cents"),
      eb.selectFrom("condition_records as h").select(eb.fn.countAll<number>().as("n")).whereRef("h.booking_id", "=", "b.id").where("h.kind", "=", "handoff").as("handoff_records"),
      eb.selectFrom("condition_records as h").select(eb.fn.countAll<number>().as("n")).whereRef("h.booking_id", "=", "b.id").where("h.kind", "=", "return").as("return_records"),
    ])
    .where("b.provider_id", "=", providerId);

type RawRow = Awaited<ReturnType<ReturnType<typeof rowSelect>["execute"]>>[number];

function toRow(r: RawRow): ProviderBookingRow {
  const ext = r.extension_json ? (JSON.parse(r.extension_json) as { id: string; extra_days: number; new_end_at: string; amount_cents: number; status: string }) : null;
  return {
    id: r.id, ref: r.ref, status: r.status as BookingStatus, start_at: r.start_at, end_at: r.end_at, return_due_at: r.return_due_at, billed_days: r.billed_days, qty: r.qty, fulfillment: r.fulfillment, charged_cents: r.charged_cents, hold_cents: r.hold_cents, hold_status: r.hold_status, instant: r.instant, created_at: r.created_at, hold_placed_at: r.hold_placed_at, returned_at: r.returned_at,
    delivery_address: r.delivery_address, delivery_area: r.delivery_area, delivery_km: r.delivery_km == null ? null : Number(r.delivery_km), drop_window: r.drop_window as ProviderBookingRow["drop_window"], collect_window: r.collect_window as ProviderBookingRow["collect_window"], payment_method_label: r.payment_method_label,
    price_snapshot: r.price_snapshot as unknown as Quote,
    listing: { id: r.listing_id, title: r.listing_title, slug: r.listing_slug, prep_hours: Number(r.prep_hours ?? 0), pickup_address: r.pickup_address, day_cents: r.day_cents },
    unit: r.unit_id ? { id: r.unit_id, unit_number: r.unit_number!, serial: r.serial! } : null,
    renter: { id: r.renter_id, name: r.renter_name, rating: r.rating_from_providers == null ? null : Number(r.rating_from_providers), rentals: r.completed_count, id_verified: r.id_verified, is_business: r.is_business, phone: r.phone },
    extension: ext ? { ...ext, new_end_at: new Date(ext.new_end_at) } : null,
    open_claim_cents: Number(r.open_claim_cents ?? 0),
    has_handoff_record: Number(r.handoff_records ?? 0) > 0,
    has_return_record: Number(r.return_records ?? 0) > 0,
  };
}

export type BookingsTab = "all" | "requests" | "upcoming" | "active" | "returns" | "completed" | "cancelled";

export async function listProviderBookings(trx: Trx, providerId: string, opts: { tab?: BookingsTab; q?: string; now: Date; limit?: number } ): Promise<{ rows: ProviderBookingRow[]; counts: Record<BookingsTab, number> }> {
  const all = (await rowSelect(trx, providerId).orderBy("b.start_at", "desc").limit(opts.limit ?? 400).execute()).map(toRow);
  const dayEnd = addDays(marketStartOfDay(opts.now), 1);
  const bucket = (b: ProviderBookingRow): BookingsTab[] => {
    const t: BookingsTab[] = ["all"];
    if (b.status === "requested") t.push("requests");
    if (["confirmed", "ready_for_pickup", "out_for_delivery"].includes(b.status)) t.push("upcoming");
    if (ACTIVE_STATUSES.includes(b.status)) t.push("active");
    if (b.status === "return_due" || b.status === "overdue" || (ACTIVE_STATUSES.includes(b.status) && (b.return_due_at ?? b.end_at) < dayEnd)) t.push("returns");
    if (b.status === "completed" || b.status === "inspecting" || b.status === "disputed") t.push("completed");
    if (b.status === "cancelled") t.push("cancelled");
    return t;
  };
  const counts: Record<BookingsTab, number> = { all: 0, requests: 0, upcoming: 0, active: 0, returns: 0, completed: 0, cancelled: 0 };
  for (const b of all) for (const k of bucket(b)) counts[k] += 1;
  const q = opts.q?.trim().toLowerCase();
  const rows = all
    .filter((b) => !opts.tab || opts.tab === "all" || bucket(b).includes(opts.tab))
    .filter((b) => !q || [b.ref, b.renter.name, b.listing.title, b.unit?.serial ?? ""].some((s) => s.toLowerCase().includes(q)));
  // upcoming first for the working tabs, newest-first elsewhere
  if (opts.tab && ["requests", "upcoming", "active", "returns"].includes(opts.tab)) rows.sort((a, b) => a.start_at.getTime() - b.start_at.getTime());
  return { rows, counts };
}

export async function getProviderBooking(trx: Trx, providerId: string, ref: string): Promise<(ProviderBookingRow & { units: Array<{ id: string; unit_number: number; serial: string; status: string; free: boolean }>; extras: Array<{ name: string; amount_cents: number; is_damage_waiver: boolean }>; conversation_id: string | null; condition: { handoff: ConditionRecordRow | null; return: ConditionRecordRow | null }; claims: ClaimRow[]; listing_full: { included_accessories: string[]; late_fee_cents_per_hour: number; late_grace_minutes: number; hold_with_waiver_cents: number | null; pickup_instructions: string | null } }) | null> {
  const raw = await rowSelect(trx, providerId).where("b.ref", "=", ref).executeTakeFirst();
  if (!raw) return null;
  const b = toRow(raw);
  const [units, extras, conv, records, claims, listing] = await Promise.all([
    trx.selectFrom("units").select(["id", "unit_number", "serial", "status"]).where("listing_id", "=", b.listing.id).orderBy("unit_number").execute(),
    trx.selectFrom("booking_extras").select(["name", "amount_cents", "is_damage_waiver"]).where("booking_id", "=", b.id).execute(),
    trx.selectFrom("conversations").select("id").where("booking_id", "=", b.id).executeTakeFirst(),
    trx.selectFrom("condition_records").selectAll().where("booking_id", "=", b.id).execute(),
    trx.selectFrom("claims").selectAll().where("booking_id", "=", b.id).orderBy("created_at").execute(),
    trx.selectFrom("listings").select(["included_accessories", "late_fee_cents_per_hour", "late_grace_minutes", "hold_with_waiver_cents", "pickup_instructions"]).where("id", "=", b.listing.id).executeTakeFirstOrThrow(),
  ]);
  const free = await sql<{ id: string }>`select f as id from public.free_units(${b.listing.id}::uuid, ${b.start_at.toISOString()}::timestamptz, ${b.end_at.toISOString()}::timestamptz, ${b.id}::uuid) f`.execute(trx);
  const freeIds = new Set(free.rows.map((r) => r.id));
  const rec = (k: "handoff" | "return") => records.filter((r) => r.kind === k).map(conditionRow)[0] ?? null;
  return {
    ...b,
    units: units.map((u) => ({ ...u, free: freeIds.has(u.id) || u.id === b.unit?.id })),
    extras,
    conversation_id: conv?.id ?? null,
    condition: { handoff: rec("handoff"), return: rec("return") },
    claims: claims.map((c) => ({ id: c.id, type: c.type, status: c.status, area: c.area, description: c.description, amount_cents: c.amount_cents, repair_estimate_cents: c.repair_estimate_cents, out_of_service_days: c.out_of_service_days, renter_respond_by: c.renter_respond_by })),
    listing_full: listing,
  };
}

export interface ConditionPhoto { label: string; path: string | null; taken_at: string; lat?: number; lng?: number; issue?: boolean; url?: string | null }
export interface ChecklistItem { item: string; ok: boolean; description?: string; repair_estimate_cents?: number; out_of_service_days?: number }
export interface ConditionRecordRow {
  id: string;
  kind: "handoff" | "return";
  started_at: Date;
  completed_at: Date | null;
  photos: ConditionPhoto[];
  checklist: ChecklistItem[];
  notes: string | null;
  fuel_level: string | null;
  serial_scanned: string | null;
  serial_matches: boolean | null;
  id_matched: boolean | null;
  id_checked_at: Date | null;
  location_label: string | null;
  geotag: { lat: number; lng: number } | null;
  renter_signature_path: string | null;
  unit_id: string | null;
}
export interface ClaimRow { id: string; type: string; status: string; area: string | null; description: string | null; amount_cents: number; repair_estimate_cents: number | null; out_of_service_days: number | null; renter_respond_by: Date | null }

function conditionRow(c: { id: string; kind: "handoff" | "return"; started_at: Date; completed_at: Date | null; photos: unknown; checklist: unknown; notes: string | null; fuel_level: string | null; serial_scanned: string | null; serial_matches: boolean | null; id_matched: boolean | null; id_checked_at: Date | null; location_label: string | null; geotag: unknown; renter_signature_path: string | null; unit_id: string | null }): ConditionRecordRow {
  return { id: c.id, kind: c.kind, started_at: c.started_at, completed_at: c.completed_at, photos: (c.photos as ConditionPhoto[]) ?? [], checklist: (c.checklist as ChecklistItem[]) ?? [], notes: c.notes, fuel_level: c.fuel_level, serial_scanned: c.serial_scanned, serial_matches: c.serial_matches, id_matched: c.id_matched, id_checked_at: c.id_checked_at, location_label: c.location_label, geotag: c.geotag as { lat: number; lng: number } | null, renter_signature_path: c.renter_signature_path, unit_id: c.unit_id };
}

/** Resolve signed URLs for condition photos (private bucket). */
export async function withPhotoUrls(rec: ConditionRecordRow | null): Promise<ConditionRecordRow | null> {
  if (!rec) return null;
  return { ...rec, photos: await Promise.all(rec.photos.map(async (p) => ({ ...p, url: await photoUrl("condition-photos", p.path) }))) };
}

/* ------------------------------------------------------------------ dashboard */

export interface TodayItem {
  booking: ProviderBookingRow;
  kind: "delivery" | "pickup" | "return" | "collection";
  at: Date;
  channel: string; // "Van 1" | "Counter"
  state: { label: string; tone: "ok" | "cobalt" | "warn" | "error" | "neutral" };
}

export async function providerDashboard(trx: Trx, providerId: string, now: Date, vans: string[]) {
  const { rows } = await listProviderBookings(trx, providerId, { now, limit: 600 });
  const dayStart = marketStartOfDay(now);
  const dayEnd = addDays(dayStart, 1);
  const van = vans[0] ?? "Van";
  const needs = {
    requests: rows.filter((b) => b.status === "requested").sort((a, b) => a.created_at.getTime() - b.created_at.getTime()),
    extensions: rows.filter((b) => b.extension?.status === "requested" && ["active", "return_due", "confirmed", "ready_for_pickup", "out_for_delivery"].includes(b.status)),
    overdue: rows.filter((b) => b.status === "overdue"),
  };
  const today: TodayItem[] = [];
  for (const b of rows) {
    const handoffToday = b.start_at >= dayStart && b.start_at < dayEnd && !["cancelled", "completed", "inspecting", "disputed"].includes(b.status);
    const due = b.return_due_at ?? b.end_at;
    const returnToday = (due >= dayStart && due < dayEnd && ACTIVE_STATUSES.includes(b.status)) || b.status === "overdue";
    if (handoffToday) {
      const done = ACTIVE_STATUSES.includes(b.status) || b.hold_placed_at != null;
      const prepBy = new Date(b.start_at.getTime() - Math.max(0.5, b.listing.prep_hours) * 3_600_000);
      today.push({
        booking: b, kind: b.fulfillment === "delivery" ? "delivery" : "pickup", at: b.start_at, channel: b.fulfillment === "delivery" ? van : "Counter",
        state: done ? { label: `Done ${fmtTime(b.hold_placed_at ?? b.start_at)}`, tone: "ok" } : b.status === "ready_for_pickup" ? { label: "Ready", tone: "cobalt" } : b.status === "out_for_delivery" ? { label: "Out for delivery", tone: "cobalt" } : b.status === "requested" ? { label: "Awaiting approval", tone: "warn" } : { label: `Prep by ${fmtTime(prepBy)}`, tone: "warn" },
      });
    }
    if (returnToday) {
      const late = differenceInMinutes(now, due);
      today.push({
        booking: b, kind: b.fulfillment === "delivery" ? "collection" : "return", at: due, channel: b.fulfillment === "delivery" ? van : "Counter",
        state: b.status === "overdue" || late > 0 ? { label: `Overdue ${late >= 60 ? `${Math.floor(late / 60)} h` : `${late} min`}`, tone: "error" } : { label: "Scheduled", tone: "neutral" },
      });
    }
  }
  today.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { rows, needs, today };
}

function fmtTime(d: Date) {
  const m = toMarket(d);
  return `${String(m.getHours()).padStart(2, "0")}:${String(m.getMinutes()).padStart(2, "0")}`;
}

export async function providerStats(trx: Trx, providerId: string, now: Date) {
  const monthStart = marketLocalStart(now, "month");
  const sameDayLastMonth = new Date(now); sameDayLastMonth.setMonth(sameDayLastMonth.getMonth() - 1);
  const lastMonthStart = marketLocalStart(sameDayLastMonth, "month");
  const [units, out, maint, month, lastMonth, weeks, payout, pending, noPhotos, serviceDue, fullyBooked, rating] = await Promise.all([
    trx.selectFrom("units as u").innerJoin("listings as l", "l.id", "u.listing_id").select((eb) => eb.fn.countAll<number>().as("n")).where("l.provider_id", "=", providerId).where("u.status", "!=", "retired").executeTakeFirst(),
    trx.selectFrom("bookings").select((eb) => eb.fn.coalesce(eb.fn.sum<number>("qty"), sql<number>`0`).as("n")).where("provider_id", "=", providerId).where("status", "in", ACTIVE_STATUSES).executeTakeFirst(),
    trx.selectFrom("units as u").innerJoin("listings as l", "l.id", "u.listing_id").select((eb) => eb.fn.countAll<number>().as("n")).where("l.provider_id", "=", providerId).where("u.status", "in", ["in_maintenance", "service_due"]).executeTakeFirst(),
    trx.selectFrom("ledger_entries").select((eb) => eb.fn.coalesce(eb.fn.sum<number>("net_cents"), sql<number>`0`).as("n")).where("provider_id", "=", providerId).where("type", "!=", "payout").where("entry_date", ">=", monthStart).where("entry_date", "<=", now).executeTakeFirst(),
    trx.selectFrom("ledger_entries").select((eb) => eb.fn.coalesce(eb.fn.sum<number>("net_cents"), sql<number>`0`).as("n")).where("provider_id", "=", providerId).where("type", "!=", "payout").where("entry_date", ">=", lastMonthStart).where("entry_date", "<=", sameDayLastMonth).executeTakeFirst(),
    sql<{ week: Date; net: number }>`select date_trunc('week', entry_date) as week, coalesce(sum(net_cents),0)::int as net from public.ledger_entries where provider_id = ${providerId}::uuid and type <> 'payout' and entry_date >= ${addDays(now, -56).toISOString()}::timestamptz group by 1 order by 1`.execute(trx),
    trx.selectFrom("payouts").selectAll().where("provider_id", "=", providerId).where("status", "in", ["scheduled", "paused"]).orderBy("scheduled_for").executeTakeFirst(),
    trx.selectFrom("ledger_entries").select((eb) => [eb.fn.coalesce(eb.fn.sum<number>("net_cents"), sql<number>`0`).as("n"), eb.fn.countAll<number>().as("c")]).where("provider_id", "=", providerId).where("status", "in", ["pending", "inspecting"]).executeTakeFirst(),
    trx.selectFrom("listings as l").select((eb) => eb.fn.countAll<number>().as("n")).where("l.provider_id", "=", providerId).where("l.status", "=", "published").where((eb) => eb.not(eb.exists(eb.selectFrom("listing_photos as p").select("p.id").whereRef("p.listing_id", "=", "l.id")))).executeTakeFirst(),
    trx.selectFrom("units as u").innerJoin("listings as l", "l.id", "u.listing_id").select(["u.unit_number", "l.title"]).where("l.provider_id", "=", providerId).where((eb) => eb.or([eb("u.status", "=", "service_due"), eb.and([eb("u.next_service_at", "is not", null), eb("u.next_service_at", "<=", addDays(now, 7))])])).limit(3).execute(),
    sql<{ title: string }>`select l.title from public.listings l where l.provider_id = ${providerId}::uuid and l.status = 'published' and public.units_available(l.id, ${now.toISOString()}::timestamptz, ${addDays(now, 7).toISOString()}::timestamptz) <= 0 limit 3`.execute(trx),
    trx.selectFrom("reviews").select((eb) => [eb.fn.avg<number>("item_stars").as("avg"), eb.fn.countAll<number>().as("n")]).where("provider_id", "=", providerId).where("published_at", "is not", null).where("submitted_at", ">=", addDays(now, -30)).executeTakeFirst(),
  ]);
  const monthNet = Number(month?.n ?? 0);
  const lastNet = Number(lastMonth?.n ?? 0);
  return {
    units_total: Number(units?.n ?? 0),
    units_out: Number(out?.n ?? 0),
    units_maintenance: Number(maint?.n ?? 0),
    month_net_cents: monthNet,
    month_delta_pct: lastNet > 0 ? Math.round(((monthNet - lastNet) / lastNet) * 100) : null,
    weeks: weeks.rows.map((w) => ({ week: new Date(w.week), net: Number(w.net) })),
    next_payout: payout ? { amount_cents: payout.amount_cents, scheduled_for: payout.scheduled_for, account: payout.account_masked, status: payout.status } : null,
    pending_cents: Number(pending?.n ?? 0),
    pending_count: Number(pending?.c ?? 0),
    listings_no_photos: Number(noPhotos?.n ?? 0),
    service_due: serviceDue.map((s) => `${shortTitle(s.title)} · unit ${s.unit_number}`),
    fully_booked: fullyBooked.rows.map((r) => shortTitle(r.title)),
    rating_30d: rating?.avg == null ? null : Number(rating.avg),
    rating_30d_count: Number(rating?.n ?? 0),
  };
}

function marketLocalStart(d: Date, unit: "month") {
  const m = toMarket(d);
  void unit;
  return new Date(Date.UTC(m.getFullYear(), m.getMonth(), 1, 4, 0, 0)); // 00:00 UTC−4 market time
}

export function shortTitle(title: string) {
  return title.split(/\s+(?:with|for)\s+|,|·|–|\(/)[0]!.trim().split(" ").slice(0, 3).join(" ");
}

/* ------------------------------------------------------------------ listings */

export interface ProviderListingRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  day_cents: number;
  units_total: number;
  units_rentable: number;
  photo_count: number;
  quality_score: number | null;
  rating: number | null;
  rating_count: number;
  upcoming: number;
  category: string;
  cover_url: string | null;
  updated_at: Date;
}

export async function listProviderListings(trx: Trx, providerId: string): Promise<ProviderListingRow[]> {
  const rows = await trx
    .selectFrom("listings as l")
    .innerJoin("categories as c", "c.id", "l.category_id")
    .select((eb) => [
      "l.id", "l.title", "l.slug", "l.status", "l.day_cents", "l.quality_score", "l.rating", "l.rating_count", "l.updated_at", "c.name as category",
      eb.selectFrom("units as u").select(eb.fn.countAll<number>().as("n")).whereRef("u.listing_id", "=", "l.id").where("u.status", "!=", "retired").as("units_total"),
      eb.selectFrom("units as u").select(eb.fn.countAll<number>().as("n")).whereRef("u.listing_id", "=", "l.id").where("u.status", "=", "rentable").as("units_rentable"),
      eb.selectFrom("listing_photos as p").select(eb.fn.countAll<number>().as("n")).whereRef("p.listing_id", "=", "l.id").as("photo_count"),
      eb.selectFrom("listing_photos as p").select("p.storage_path").whereRef("p.listing_id", "=", "l.id").orderBy("p.is_cover", "desc").orderBy("p.sort").limit(1).as("cover_path"),
      eb.selectFrom("bookings as b").select(eb.fn.countAll<number>().as("n")).whereRef("b.listing_id", "=", "l.id").where("b.status", "in", UPCOMING_STATUSES).as("upcoming"),
    ])
    .where("l.provider_id", "=", providerId)
    .orderBy("l.title")
    .execute();
  return Promise.all(rows.map(async (r) => ({ id: r.id, title: r.title, slug: r.slug, status: r.status, day_cents: r.day_cents, units_total: Number(r.units_total ?? 0), units_rentable: Number(r.units_rentable ?? 0), photo_count: Number(r.photo_count ?? 0), quality_score: r.quality_score, rating: r.rating == null ? null : Number(r.rating), rating_count: r.rating_count, upcoming: Number(r.upcoming ?? 0), category: r.category, cover_url: await photoUrl("listing-photos", r.cover_path), updated_at: r.updated_at })));
}

export async function getListingForEditor(trx: Trx, id: string) {
  const l = await trx.selectFrom("listings").selectAll().where("id", "=", id).executeTakeFirst();
  if (!l) return null;
  const [photos, extras, units, blocks, documents, category, categories, upcoming, review] = await Promise.all([
    trx.selectFrom("listing_photos").selectAll().where("listing_id", "=", id).orderBy("is_cover", "desc").orderBy("sort").execute(),
    trx.selectFrom("listing_extras").selectAll().where("listing_id", "=", id).orderBy("sort").execute(),
    trx.selectFrom("units").selectAll().where("listing_id", "=", id).orderBy("unit_number").execute(),
    trx.selectFrom("availability_blocks").selectAll().where("listing_id", "=", id).orderBy("start_at").execute(),
    trx.selectFrom("listing_documents").selectAll().where("listing_id", "=", id).execute(),
    trx.selectFrom("categories as c").leftJoin("categories as p", "p.id", "c.parent_id").select(["c.id", "c.name", "c.slug", "c.required_documents", "c.renter_requirements", "p.name as parent_name", "p.slug as parent_slug"]).where("c.id", "=", l.category_id).executeTakeFirstOrThrow(),
    trx.selectFrom("categories as c").leftJoin("categories as p", "p.id", "c.parent_id").select(["c.id", "c.name", "c.slug", "p.name as parent_name"]).where("c.parent_id", "is not", null).orderBy("p.sort").orderBy("c.sort").execute(),
    trx.selectFrom("bookings").select((eb) => eb.fn.countAll<number>().as("n")).where("listing_id", "=", id).where("status", "in", BLOCKING_STATUSES).executeTakeFirst(),
    trx.selectFrom("listing_reviews").select(["id", "kind", "reasons", "decision", "message_to_provider", "submitted_at", "decided_at"]).where("listing_id", "=", id).orderBy("submitted_at", "desc").executeTakeFirst(),
  ]);
  return {
    listing: l,
    photos: await Promise.all(photos.map(async (p) => ({ ...p, url: await photoUrl("listing-photos", p.storage_path) }))),
    extras,
    units: units.map((u) => ({ ...u, hours: u.hours })),
    blocks: blocks.map((b) => ({ ...b, unit_number: units.find((u) => u.id === b.unit_id)?.unit_number ?? null })),
    documents,
    category,
    categories,
    upcoming_count: Number(upcoming?.n ?? 0),
    review: review ?? null,
  };
}

/* ------------------------------------------------------------------ calendar */

export interface CalendarUnitRow {
  listing: { id: string; title: string; category_slug: string; parent_slug: string | null; prep_hours: number };
  unit: { id: string; unit_number: number; serial: string; status: string } | null;
  bookings: Array<{ id: string; ref: string; status: BookingStatus; start_at: Date; end_at: Date; renter: string; fulfillment: "pickup" | "delivery"; area: string | null; qty: number }>;
  blocks: Array<{ id: string; reason: string; note: string | null; start_at: Date; end_at: Date }>;
}

export async function providerCalendar(trx: Trx, providerId: string, from: Date, to: Date, category?: string | null): Promise<{ rows: CalendarUnitRow[]; categories: Array<{ slug: string; name: string; count: number }> }> {
  const listings = await trx
    .selectFrom("listings as l")
    .innerJoin("categories as c", "c.id", "l.category_id")
    .leftJoin("categories as pc", "pc.id", "c.parent_id")
    .select(["l.id", "l.title", "l.prep_hours", "c.slug as category_slug", "pc.slug as parent_slug", "pc.name as parent_name"])
    .where("l.provider_id", "=", providerId)
    .where("l.status", "in", ["published", "hidden", "pending_review", "changes_requested"])
    .orderBy("l.title")
    .execute();
  const catMap = new Map<string, { slug: string; name: string; count: number }>();
  for (const l of listings) {
    const key = l.parent_slug ?? l.category_slug;
    const e = catMap.get(key) ?? { slug: key, name: l.parent_name ?? key, count: 0 };
    e.count += 1;
    catMap.set(key, e);
  }
  const shown = category ? listings.filter((l) => (l.parent_slug ?? l.category_slug) === category) : listings;
  const ids = shown.map((l) => l.id);
  if (ids.length === 0) return { rows: [], categories: [...catMap.values()] };
  const [units, bookings, blocks] = await Promise.all([
    trx.selectFrom("units").select(["id", "listing_id", "unit_number", "serial", "status"]).where("listing_id", "in", ids).where("status", "!=", "retired").orderBy("unit_number").execute(),
    trx.selectFrom("bookings as b").innerJoin("profiles as r", "r.id", "b.renter_id").select(["b.id", "b.ref", "b.status", "b.start_at", "b.end_at", "b.listing_id", "b.unit_id", "b.fulfillment", "b.delivery_area", "b.qty", "r.name as renter"]).where("b.listing_id", "in", ids).where("b.status", "in", BLOCKING_STATUSES).where("b.start_at", "<", to).where("b.end_at", ">", addDays(from, -1)).execute(),
    trx.selectFrom("availability_blocks").selectAll().where("listing_id", "in", ids).where("start_at", "<", to).where("end_at", ">", from).execute(),
  ]);
  const rows: CalendarUnitRow[] = [];
  for (const l of shown) {
    const lu = units.filter((u) => u.listing_id === l.id);
    const lb = bookings.filter((b) => b.listing_id === l.id);
    const lk = blocks.filter((b) => b.listing_id === l.id);
    const mk = (b: (typeof lb)[number]) => ({ id: b.id, ref: b.ref, status: b.status as BookingStatus, start_at: b.start_at, end_at: b.end_at, renter: b.renter, fulfillment: b.fulfillment, area: b.delivery_area, qty: b.qty });
    const mkBlock = (k: (typeof lk)[number]) => ({ id: k.id, reason: k.reason, note: k.note, start_at: k.start_at, end_at: k.end_at });
    const listing = { id: l.id, title: l.title, category_slug: l.category_slug, parent_slug: l.parent_slug, prep_hours: Number(l.prep_hours ?? 0) };
    if (lu.length === 0) rows.push({ listing, unit: null, bookings: lb.map(mk), blocks: lk.map(mkBlock) });
    for (const u of lu) {
      rows.push({ listing, unit: { id: u.id, unit_number: u.unit_number, serial: u.serial, status: u.status }, bookings: lb.filter((b) => b.unit_id === u.id).map(mk), blocks: lk.filter((k) => k.unit_id === u.id || k.unit_id == null).map(mkBlock) });
    }
    // unassigned bookings (requests, or multi-unit) hang under the first unit row so they stay visible
    const unassigned = lb.filter((b) => !b.unit_id);
    if (unassigned.length && lu.length) rows[rows.length - lu.length]!.bookings.push(...unassigned.map(mk));
  }
  return { rows, categories: [...catMap.values()] };
}

export function weekStart(d: Date) {
  return startOfWeek(toMarket(d), { weekStartsOn: 1 });
}

/* ------------------------------------------------------------------ earnings */

export async function providerEarnings(trx: Trx, providerId: string, now: Date) {
  const monthStart = marketLocalStart(now, "month");
  const [available, pending, held, paidMonth, weeks, entries, payouts, provider, activeCount] = await Promise.all([
    trx.selectFrom("ledger_entries").select((eb) => [eb.fn.coalesce(eb.fn.sum<number>("net_cents"), sql<number>`0`).as("n"), eb.fn.countAll<number>().as("c")]).where("provider_id", "=", providerId).where("status", "=", "available").executeTakeFirst(),
    trx.selectFrom("ledger_entries").select((eb) => [eb.fn.coalesce(eb.fn.sum<number>("net_cents"), sql<number>`0`).as("n"), eb.fn.countAll<number>().as("c")]).where("provider_id", "=", providerId).where("status", "in", ["pending", "inspecting"]).executeTakeFirst(),
    trx.selectFrom("ledger_entries as e").leftJoin("bookings as b", "b.id", "e.booking_id").select((eb) => [eb.fn.coalesce(eb.fn.sum<number>("e.adjustment_cents"), sql<number>`0`).as("n"), eb.fn.countAll<number>().as("c"), eb.fn.min("b.ref").as("ref")]).where("e.provider_id", "=", providerId).where("e.status", "=", "held_claim").executeTakeFirst(),
    trx.selectFrom("payouts").select((eb) => [eb.fn.coalesce(eb.fn.sum<number>("amount_cents"), sql<number>`0`).as("n"), eb.fn.countAll<number>().as("c")]).where("provider_id", "=", providerId).where("status", "=", "paid").where("paid_at", ">=", monthStart).executeTakeFirst(),
    sql<{ week: Date; rental: number; extras: number }>`
      select date_trunc('week', e.entry_date) as week,
             coalesce(sum(e.net_cents),0)::int as rental,
             coalesce(sum(case when b.price_snapshot is not null then ((b.price_snapshot->>'delivery_cents')::int + (b.price_snapshot->>'extras_cents')::int) else 0 end),0)::int as extras
      from public.ledger_entries e left join public.bookings b on b.id = e.booking_id
      where e.provider_id = ${providerId}::uuid and e.type <> 'payout' and e.entry_date >= ${addDays(now, -84).toISOString()}::timestamptz
      group by 1 order by 1`.execute(trx),
    trx.selectFrom("ledger_entries as e").leftJoin("bookings as b", "b.id", "e.booking_id").leftJoin("payouts as p", "p.id", "e.payout_id").select(["e.id", "e.entry_date", "e.type", "e.description", "e.gross_cents", "e.commission_cents", "e.adjustment_cents", "e.adjustment_label", "e.net_cents", "e.status", "b.ref", "p.rental_count", "p.account_masked"]).where("e.provider_id", "=", providerId).orderBy("e.entry_date", "desc").limit(60).execute(),
    trx.selectFrom("payouts").selectAll().where("provider_id", "=", providerId).orderBy("scheduled_for", "desc").limit(20).execute(),
    trx.selectFrom("providers").select(["payout_schedule", "payout_account_masked", "payout_account_verified", "tax_id", "tax_id_verified", "payouts_paused", "payouts_paused_reason"]).where("id", "=", providerId).executeTakeFirstOrThrow(),
    trx.selectFrom("bookings").select((eb) => eb.fn.countAll<number>().as("n")).where("provider_id", "=", providerId).where("status", "in", ACTIVE_STATUSES).executeTakeFirst(),
  ]);
  const next = payouts.find((p) => p.status === "scheduled" || p.status === "paused") ?? null;
  return {
    available_cents: Number(available?.n ?? 0), available_count: Number(available?.c ?? 0),
    pending_cents: Number(pending?.n ?? 0), pending_count: Number(pending?.c ?? 0), active_count: Number(activeCount?.n ?? 0),
    held_cents: Number(held?.n ?? 0), held_count: Number(held?.c ?? 0), held_ref: held?.ref ?? null,
    paid_month_cents: Number(paidMonth?.n ?? 0), paid_month_count: Number(paidMonth?.c ?? 0),
    weeks: weeks.rows.map((w) => ({ week: new Date(w.week), rental: Number(w.rental) - Number(w.extras), extras: Number(w.extras) })),
    entries: entries.map((e) => ({ ...e, ref: e.ref ?? null })),
    next_payout: next,
    provider,
  };
}

/* ------------------------------------------------------------------ inventory / reviews */

export async function providerInventory(trx: Trx, providerId: string, now: Date) {
  const units = await trx
    .selectFrom("units as u")
    .innerJoin("listings as l", "l.id", "u.listing_id")
    .select((eb) => ["u.id", "u.unit_number", "u.serial", "u.status", "u.hours", "u.acquired_at", "u.next_service_at", "l.id as listing_id", "l.title", eb.selectFrom("bookings as b").innerJoin("profiles as r", "r.id", "b.renter_id").select(sql<string>`r.name || ' · ' || b.ref`.as("s")).whereRef("b.unit_id", "=", "u.id").where("b.status", "in", ACTIVE_STATUSES).limit(1).as("current")])
    .where("l.provider_id", "=", providerId)
    .orderBy("l.title").orderBy("u.unit_number")
    .execute();
  void now;
  return units;
}

export async function providerReviews(trx: Trx, providerId: string) {
  return trx
    .selectFrom("reviews as r")
    .innerJoin("public_profiles as a", "a.id", "r.author_id")
    .innerJoin("bookings as b", "b.id", "r.booking_id")
    .leftJoin("listings as l", "l.id", "r.listing_id")
    .select(["r.id", "r.item_stars", "r.provider_stars", "r.body", "r.tags", "r.submitted_at", "r.published_at", "a.name as author", "b.ref", "l.title as listing_title"])
    .where("r.provider_id", "=", providerId)
    .where("r.author_side", "=", "renter")
    .orderBy("r.submitted_at", "desc")
    .limit(50)
    .execute();
}

export async function providerNavCounts(trx: Trx, providerId: string) {
  const [bookings, unread] = await Promise.all([
    trx.selectFrom("bookings").select((eb) => eb.fn.countAll<number>().as("n")).where("provider_id", "=", providerId).where((eb) => eb.or([eb("status", "in", ["requested", "overdue"]), eb.exists(eb.selectFrom("extension_requests as x").select("x.id").whereRef("x.booking_id", "=", "bookings.id").where("x.status", "=", "requested"))])).executeTakeFirst(),
    trx.selectFrom("conversations").select((eb) => eb.fn.coalesce(eb.fn.sum<number>("provider_unread"), sql<number>`0`).as("n")).where("provider_id", "=", providerId).executeTakeFirst(),
  ]);
  return { needs_action: Number(bookings?.n ?? 0), unread: Number(unread?.n ?? 0) };
}
