import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { getProviderBooking, withPhotoUrls } from "@/lib/queries/provider";
import { lateFee } from "@/lib/pricing";
import { ReturnFlow } from "./flow";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Return check-in · ${ref}` };
}

/** P06: compare against handoff photos, late fee computed, claim goes to the renter then admin. */
export default async function ReturnPage({ params }: { params: Promise<{ ref: string }> }) {
  const [{ ref }, actor, config] = await Promise.all([params, requireProvider(), getLiveConfig()]);
  const b = await withActor((trx) => getProviderBooking(trx, actor.provider.id, ref));
  if (!b) notFound();
  if (!["active", "return_due", "overdue", "inspecting"].includes(b.status)) redirect(`/provider/bookings/${ref}`);
  const [handoff, ret] = await Promise.all([withPhotoUrls(b.condition.handoff), withPhotoUrls(b.condition.return)]);
  const nowAt = now();
  const returnedAt = b.returned_at ?? nowAt;
  const fee = lateFee(b.return_due_at ?? b.end_at, returnedAt, b.listing_full.late_fee_cents_per_hour, b.listing_full.late_grace_minutes);
  const existingClaims = b.claims;
  return (
    <ReturnFlow
      booking={{ ref: b.ref, title: b.listing.title, renter: b.renter.name, status: b.status, due_at: (b.return_due_at ?? b.end_at).toISOString(), returned_at: returnedAt.toISOString(), hold_cents: b.hold_cents, hold_status: b.hold_status, waiver_bought: b.price_snapshot.waiver_bought, waiver_covers_cents: config.waiver.covers_up_to_cents, late_fee_per_hour: b.listing_full.late_fee_cents_per_hour, late_grace_minutes: b.listing_full.late_grace_minutes, accessories: b.listing_full.included_accessories, unit: b.unit, response_hours: config.holds.renter_response_hours, wear_allowance_pct: config.holds.wear_allowance_pct }}
      lateFee={{ fee_cents: fee.fee_cents, late_minutes: fee.late_minutes, billable_hours: fee.billable_hours }}
      handoff={handoff ? { photos: handoff.photos.map((p) => ({ label: p.label, url: p.url ?? null })), completed_at: handoff.completed_at?.toISOString() ?? null, notes: handoff.notes } : null}
      existing={ret ? { photos: ret.photos.map((p) => ({ label: p.label, path: p.path, url: p.url ?? null, issue: p.issue })), checklist: ret.checklist, notes: ret.notes, completed_at: ret.completed_at?.toISOString() ?? null } : null}
      claims={existingClaims.map((c) => ({ type: c.type, status: c.status, amount_cents: c.amount_cents, description: c.description }))}
      tz={config.market.timezone}
    />
  );
}
