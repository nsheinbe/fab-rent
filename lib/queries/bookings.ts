import "server-only";
import type { Trx } from "@/lib/db";
import type { BookingStatus } from "@/lib/booking-state/status";
import type { Quote } from "@/lib/pricing";
import { photoUrl } from "@/lib/storage";

export interface BookingSummary {
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
  listing: { id: string; slug: string; title: string; cover_url: string | null; unit_label?: string | null };
  provider: { id: string; name: string; slug: string; neighbourhood: string | null; response_minutes: number | null };
  renter: { id: string; name: string };
  drop_window: { start: string; end: string } | null;
  collect_window: { start: string; end: string } | null;
  delivery_area: string | null;
  handoff_at: Date | null;
  has_review: boolean;
  hold_released_at: Date | null;
}

const baseSelect = (trx: Trx) =>
  trx
    .selectFrom("bookings as b")
    .innerJoin("listings as l", "l.id", "b.listing_id")
    .innerJoin("providers as p", "p.id", "b.provider_id")
    .innerJoin("profiles as r", "r.id", "b.renter_id")
    .select((eb) => [
      "b.id", "b.ref", "b.status", "b.start_at", "b.end_at", "b.return_due_at", "b.billed_days", "b.qty", "b.fulfillment", "b.charged_cents", "b.hold_cents", "b.hold_status", "b.instant", "b.created_at", "b.drop_window", "b.collect_window", "b.delivery_area", "b.hold_placed_at", "b.hold_released_at",
      "l.id as listing_id", "l.slug as listing_slug", "l.title as listing_title",
      "p.id as provider_id", "p.name as provider_name", "p.slug as provider_slug", "p.neighbourhood as provider_neighbourhood", "p.response_minutes",
      "r.id as renter_id", "r.name as renter_name",
      eb.selectFrom("listing_photos as ph").select("ph.storage_path").whereRef("ph.listing_id", "=", "l.id").orderBy("ph.is_cover", "desc").orderBy("ph.sort").limit(1).as("cover_path"),
      eb.selectFrom("reviews as rv").select(eb.fn.countAll<number>().as("n")).whereRef("rv.booking_id", "=", "b.id").whereRef("rv.author_id", "=", "b.renter_id").as("review_count"),
    ]);

type Row = Awaited<ReturnType<ReturnType<typeof baseSelect>["execute"]>>[number];

async function toSummary(r: Row): Promise<BookingSummary> {
  return {
    id: r.id, ref: r.ref, status: r.status as BookingStatus, start_at: r.start_at, end_at: r.end_at, return_due_at: r.return_due_at, billed_days: r.billed_days, qty: r.qty, fulfillment: r.fulfillment, charged_cents: r.charged_cents, hold_cents: r.hold_cents, hold_status: r.hold_status, instant: r.instant, created_at: r.created_at,
    listing: { id: r.listing_id, slug: r.listing_slug, title: r.listing_title, cover_url: await photoUrl("listing-photos", r.cover_path) },
    provider: { id: r.provider_id, name: r.provider_name, slug: r.provider_slug, neighbourhood: r.provider_neighbourhood, response_minutes: r.response_minutes },
    renter: { id: r.renter_id, name: r.renter_name },
    drop_window: r.drop_window as { start: string; end: string } | null, collect_window: r.collect_window as { start: string; end: string } | null, delivery_area: r.delivery_area,
    handoff_at: r.hold_placed_at, has_review: Number(r.review_count ?? 0) > 0, hold_released_at: r.hold_released_at,
  };
}

export async function listRenterBookings(trx: Trx, renterId: string): Promise<BookingSummary[]> {
  const rows = await baseSelect(trx).where("b.renter_id", "=", renterId).orderBy("b.start_at", "desc").execute();
  return Promise.all(rows.map(toSummary));
}

export interface BookingDetail extends BookingSummary {
  price_snapshot: Quote;
  payment_method_label: string | null;
  delivery_address: string | null;
  delivery_km: number | null;
  free_cancel_until: Date | null;
  cancellation_policy: { id: string; name: string; free_until_hours: number };
  cancelled_at: Date | null;
  cancelled_by: string | null;
  cancellation_snapshot: Record<string, unknown> | null;
  returned_at: Date | null;
  completed_at: Date | null;
  hold_placed_at: Date | null;
  hold_expires_at: Date | null;
  hold_captured_cents: number;
  unit: { id: string; unit_number: number; serial: string } | null;
  events: Array<{ id: string; type: string; actor_role: string; actor_name: string | null; payload: Record<string, unknown>; occurred_at: Date; to_status: string | null }>;
  extras: Array<{ name: string; amount_cents: number; is_damage_waiver: boolean; per: string; qty: number; days: number }>;
  condition: { handoff: ConditionRecordLite | null; return: ConditionRecordLite | null };
  claims: Array<{ id: string; type: string; area: string | null; description: string | null; amount_cents: number; status: string; renter_respond_by: Date | null; repair_estimate_cents: number | null; out_of_service_days: number | null }>;
  dispute: { code: string; status: string; decision_due_at: Date } | null;
  extension: { id: string; extra_days: number; new_end_at: Date; amount_cents: number; status: string } | null;
  listing_extra: { included_accessories: string[]; late_fee_cents_per_hour: number; late_grace_minutes: number; day_cents: number; pickup_address: string | null; pickup_instructions: string | null; delivery_notes: string | null; rules: string[] };
  conversation_id: string | null;
  provider_owner_name: string | null;
  settings_version: number;
}

export interface ConditionRecordLite {
  id: string;
  kind: "handoff" | "return";
  completed_at: Date | null;
  photos: Array<{ label: string; path: string | null; taken_at: string; lat?: number; lng?: number; issue?: boolean }>;
  checklist: Array<{ item: string; ok: boolean; description?: string; repair_estimate_cents?: number; out_of_service_days?: number }>;
  notes: string | null;
  fuel_level: string | null;
  serial_scanned: string | null;
  serial_matches: boolean | null;
  id_matched: boolean | null;
  location_label: string | null;
  geotag: { lat: number; lng: number } | null;
}

export async function getBookingByRef(trx: Trx, ref: string): Promise<BookingDetail | null> {
  const r = await baseSelect(trx).select(["b.price_snapshot", "b.payment_method_label", "b.delivery_address", "b.delivery_km", "b.free_cancel_until", "b.cancellation_policy_snapshot", "b.cancelled_at", "b.cancelled_by", "b.cancellation_snapshot", "b.returned_at", "b.completed_at", "b.hold_expires_at", "b.hold_captured_cents", "b.unit_id", "b.settings_version"]).where("b.ref", "=", ref).executeTakeFirst();
  if (!r) return null;
  const summary = await toSummary(r);
  const [events, extras, conditions, claims, dispute, extension, listing, unit, conv, owner] = await Promise.all([
    trx.selectFrom("booking_events").select(["id", "type", "actor_role", "actor_name", "payload", "occurred_at", "to_status"]).where("booking_id", "=", r.id).orderBy("occurred_at").execute(),
    trx.selectFrom("booking_extras").select(["name", "amount_cents", "is_damage_waiver", "per", "qty", "days"]).where("booking_id", "=", r.id).execute(),
    trx.selectFrom("condition_records").selectAll().where("booking_id", "=", r.id).execute(),
    trx.selectFrom("claims").select(["id", "type", "area", "description", "amount_cents", "status", "renter_respond_by", "repair_estimate_cents", "out_of_service_days"]).where("booking_id", "=", r.id).orderBy("created_at").execute(),
    trx.selectFrom("disputes").select(["code", "status", "decision_due_at"]).where("booking_id", "=", r.id).orderBy("created_at", "desc").executeTakeFirst(),
    trx.selectFrom("extension_requests").select(["id", "extra_days", "new_end_at", "amount_cents", "status"]).where("booking_id", "=", r.id).orderBy("created_at", "desc").executeTakeFirst(),
    trx.selectFrom("listings").select(["included_accessories", "late_fee_cents_per_hour", "late_grace_minutes", "day_cents", "pickup_address", "pickup_instructions", "delivery_notes", "rules"]).where("id", "=", r.listing_id).executeTakeFirstOrThrow(),
    r.unit_id ? trx.selectFrom("units").select(["id", "unit_number", "serial"]).where("id", "=", r.unit_id).executeTakeFirst() : Promise.resolve(null),
    trx.selectFrom("conversations").select("id").where("booking_id", "=", r.id).executeTakeFirst(),
    trx.selectFrom("providers as p").innerJoin("profiles as o", "o.id", "p.owner_profile_id").select("o.name").where("p.id", "=", r.provider_id).executeTakeFirst(),
  ]);
  const lite = (c: (typeof conditions)[number]): ConditionRecordLite => ({ id: c.id, kind: c.kind, completed_at: c.completed_at, photos: (c.photos as ConditionRecordLite["photos"]) ?? [], checklist: (c.checklist as ConditionRecordLite["checklist"]) ?? [], notes: c.notes, fuel_level: c.fuel_level, serial_scanned: c.serial_scanned, serial_matches: c.serial_matches, id_matched: c.id_matched, location_label: c.location_label, geotag: c.geotag as { lat: number; lng: number } | null });
  const policy = r.cancellation_policy_snapshot as { id: string; name: string; free_until_hours: number };
  return {
    ...summary,
    price_snapshot: r.price_snapshot as unknown as Quote,
    payment_method_label: r.payment_method_label,
    delivery_address: r.delivery_address,
    delivery_km: r.delivery_km == null ? null : Number(r.delivery_km),
    free_cancel_until: r.free_cancel_until,
    cancellation_policy: policy,
    cancelled_at: r.cancelled_at, cancelled_by: r.cancelled_by, cancellation_snapshot: r.cancellation_snapshot as Record<string, unknown> | null,
    returned_at: r.returned_at, completed_at: r.completed_at, hold_placed_at: r.hold_placed_at, hold_expires_at: r.hold_expires_at, hold_captured_cents: r.hold_captured_cents,
    unit: unit ?? null,
    events: events.map((e) => ({ ...e, payload: (e.payload as Record<string, unknown>) ?? {} })),
    extras,
    condition: { handoff: conditions.filter((c) => c.kind === "handoff").map(lite)[0] ?? null, return: conditions.filter((c) => c.kind === "return").map(lite)[0] ?? null },
    claims,
    dispute: dispute ?? null,
    extension: extension ?? null,
    listing_extra: listing,
    conversation_id: conv?.id ?? null,
    provider_owner_name: owner?.name ?? null,
    settings_version: r.settings_version,
  };
}

export async function getBookingIdByRef(trx: Trx, ref: string) {
  return trx.selectFrom("bookings").select(["id", "renter_id", "provider_id", "status"]).where("ref", "=", ref).executeTakeFirst();
}
