import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { getProviderBooking, withPhotoUrls } from "@/lib/queries/provider";
import { HandoffFlow } from "./flow";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Handoff · ${ref}` };
}

/** P05: verify renter → confirm serial → photos → checklist → sign → hold placed. Phone-first, works one-handed. */
export default async function HandoffPage({ params }: { params: Promise<{ ref: string }> }) {
  const [{ ref }, actor, config] = await Promise.all([params, requireProvider(), getLiveConfig()]);
  const b = await withActor((trx) => getProviderBooking(trx, actor.provider.id, ref));
  if (!b) notFound();
  if (!["confirmed", "ready_for_pickup", "out_for_delivery"].includes(b.status)) redirect(`/provider/bookings/${ref}`);
  const existing = await withPhotoUrls(b.condition.handoff);
  const sigUrl = existing?.renter_signature_path ? await (await import("@/lib/storage")).photoUrl("condition-photos", existing.renter_signature_path) : null;
  const accessories = [...b.listing_full.included_accessories, ...b.extras.filter((e) => !e.is_damage_waiver).map((e) => `Extra: ${e.name}`)];
  return (
    <HandoffFlow
      booking={{ ref: b.ref, title: b.listing.title, fulfillment: b.fulfillment, start_at: b.start_at.toISOString(), end_at: b.end_at.toISOString(), hold_cents: b.hold_cents, waiver: b.price_snapshot.waiver_bought, renter: { name: b.renter.name, id_verified: b.renter.id_verified }, address: b.fulfillment === "delivery" ? [b.delivery_address, b.delivery_area].filter(Boolean).join(", ") : b.listing.pickup_address ?? "", unit: b.unit, units: b.units, accessories, id_required: true }}
      existing={existing ? { ...existing, started_at: existing.started_at.toISOString(), completed_at: existing.completed_at?.toISOString() ?? null, id_checked_at: existing.id_checked_at?.toISOString() ?? null, signature_url: sigUrl } : null}
      tz={config.market.timezone}
      providerName={actor.provider.name}
    />
  );
}
