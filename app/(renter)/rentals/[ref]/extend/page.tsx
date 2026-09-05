import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser, withActor, runAsSystem } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { getBookingByRef } from "@/lib/queries/bookings";
import { BLOCKING_STATUSES } from "@/lib/booking-state";
import { formatDateTime } from "@/lib/format";
import { RenterPage } from "@/components/domain/renter-page";
import { ExtendForm } from "./extend-form";

export const metadata: Metadata = { title: "Extend your rental" };
export const dynamic = "force-dynamic";

export default async function ExtendPage({ params }: { params: Promise<{ ref: string }> }) {
  const [{ ref }, actor, config] = await Promise.all([params, requireUser(), getLiveConfig()]);
  const b = await withActor((trx) => getBookingByRef(trx, ref));
  if (!b || b.renter.id !== actor.userId) notFound();
  if (!["active", "return_due", "confirmed", "ready_for_pickup", "out_for_delivery"].includes(b.status)) redirect(`/rentals/${ref}`);
  // next booking on this unit/listing after the current return — other renters' rows are hidden by RLS, so read the date as system
  const next = await runAsSystem((trx) => trx.selectFrom("bookings").select("start_at").where("listing_id", "=", b.listing.id).where("id", "!=", b.id).where("status", "in", BLOCKING_STATUSES).where("start_at", ">", b.end_at).$if(!!b.unit?.id, (q) => q.where("unit_id", "=", b.unit!.id)).orderBy("start_at").executeTakeFirst());
  const user = actor.profile ? { name: actor.profile.name } : null;
  const shortTitle = b.listing.title.split(" ").slice(0, 2).join(" ");
  return (
    <RenterPage user={user} title="Extend your rental" subtitle={`${shortTitle} · currently due ${formatDateTime(b.end_at).replace(" · ", ", ")}`} back={`/rentals/${ref}`} width={560}>
      <ExtendForm
        bookingRef={b.ref}
        endAt={b.end_at.toISOString()}
        dayCents={b.listing_extra.day_cents}
        qty={b.qty}
        holdCents={b.hold_cents}
        fulfillment={b.fulfillment}
        collectWindow={b.collect_window}
        providerName={b.provider.name}
        responseMinutes={b.provider.response_minutes}
        freeUntil={next?.start_at.toISOString() ?? null}
        fees={{ renter_fee_pct: config.fees.renter_fee_pct, sales_tax_pct: config.tax.sales_tax_pct }}
        pending={b.extension?.status === "requested" ? { extra_days: b.extension.extra_days, amount_cents: b.extension.amount_cents } : null}
        maxDays={30}
      />
    </RenterPage>
  );
}
