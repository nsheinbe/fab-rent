import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { getListingForEditor } from "@/lib/queries/provider";
import { listingQuality } from "@/lib/listing-checks";
import { now } from "@/lib/time";
import { ListingEditor } from "./editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await withActor((trx) => getListingForEditor(trx, id)).catch(() => null);
  return { title: data ? `Edit listing · ${data.listing.title}` : "Edit listing" };
}

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, actor, config] = await Promise.all([params, requireProvider(), getLiveConfig()]);
  const data = await withActor((trx) => getListingForEditor(trx, id));
  if (!data || data.listing.provider_id !== actor.provider.id) notFound();
  const provider = await withActor((trx) => trx.selectFrom("providers").select(["name", "rating", "rating_count", "address"]).where("id", "=", actor.provider.id).executeTakeFirstOrThrow());
  const l = data.listing;
  const quality = listingQuality({ photo_count: data.photos.length, has_serial_plate_photo: data.photos.some((p) => p.has_serial_plate), specs_count: ((l.specs as unknown[]) ?? []).length, accessories_count: l.included_accessories.length, rules_count: l.rules.length, prep_hours: l.prep_hours == null ? null : Number(l.prep_hours), description_length: l.description.length });
  return (
    <ListingEditor
      listing={{
        id: l.id, title: l.title, slug: l.slug, status: l.status, description: l.description, brand: l.brand, model: l.model, condition: l.condition, age_years: l.age_years == null ? null : Number(l.age_years), last_serviced_at: l.last_serviced_at ? l.last_serviced_at.toISOString().slice(0, 10) : null, category_id: l.category_id,
        specs: (l.specs as Array<{ label: string; value: string }>) ?? [], included_accessories: l.included_accessories, day_cents: l.day_cents, weekend_cents: l.weekend_cents, week_cents: l.week_cents, month_cents: l.month_cents, hold_cents: l.hold_cents, hold_with_waiver_cents: l.hold_with_waiver_cents,
        late_fee_cents_per_hour: l.late_fee_cents_per_hour, late_grace_minutes: l.late_grace_minutes, cleaning_fee_cents: l.cleaning_fee_cents, min_days: l.min_days, max_days: l.max_days, prep_hours: Number(l.prep_hours), same_day_cutoff_minutes: l.same_day_cutoff_minutes, instant_book: l.instant_book,
        pickup_enabled: l.pickup_enabled, pickup_address: l.pickup_address, pickup_hours_label: l.pickup_hours_label, pickup_instructions: l.pickup_instructions, delivery_enabled: l.delivery_enabled, delivery_radius_km: Number(l.delivery_radius_km), delivery_window_hours: Number(l.delivery_window_hours), delivery_base_cents: l.delivery_base_cents, delivery_base_km: Number(l.delivery_base_km), delivery_per_km_cents: l.delivery_per_km_cents, delivery_notes: l.delivery_notes,
        rules: l.rules, cancellation_policy_id: l.cancellation_policy_id, id_required: l.id_required, min_renter_age: l.min_renter_age,
      }}
      photos={data.photos.map((p) => ({ id: p.id, url: p.url, label: p.label, is_cover: p.is_cover, has_serial_plate: p.has_serial_plate }))}
      extras={data.extras.map((e) => ({ id: e.id, name: e.name, description: e.description, price_cents: e.price_cents, per: e.per, is_damage_waiver: e.is_damage_waiver, waiver_covers_cents: e.waiver_covers_cents }))}
      units={data.units.map((u) => ({ id: u.id, unit_number: u.unit_number, serial: u.serial, acquired_at: u.acquired_at ? u.acquired_at.toISOString().slice(0, 10) : null, hours: u.hours, next_service_at: u.next_service_at ? u.next_service_at.toISOString().slice(0, 10) : null, status: u.status }))}
      blocks={data.blocks.map((b) => ({ id: b.id, unit_id: b.unit_id, unit_number: b.unit_number, start_at: b.start_at.toISOString(), end_at: b.end_at.toISOString(), reason: b.reason, note: b.note }))}
      category={{ name: data.category.name, parent_name: data.category.parent_name, slug: data.category.slug }}
      categories={data.categories.map((c) => ({ id: c.id, name: c.name, parent_name: c.parent_name }))}
      policies={config.cancellation.policies.map((p) => ({ id: p.id, name: p.name, free_until_hours: p.free_until_hours }))}
      waiverCoversCents={config.waiver.covers_up_to_cents}
      quality={quality}
      upcomingCount={data.upcoming_count}
      review={data.review ? { kind: data.review.kind, reasons: data.review.reasons, decision: data.review.decision, message: data.review.message_to_provider, submitted_at: data.review.submitted_at.toISOString(), decided_at: data.review.decided_at?.toISOString() ?? null } : null}
      provider={{ name: provider.name, rating: provider.rating == null ? null : Number(provider.rating), rating_count: provider.rating_count }}
      tz={config.market.timezone}
      nowIso={now().toISOString()}
    />
  );
}
