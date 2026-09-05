import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser, withActor, runAsSystem } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { getBookingByRef, type BookingDetail } from "@/lib/queries/bookings";
import { BLOCKING_STATUSES, CANCELLABLE_STATUSES } from "@/lib/booking-state";
import { renterCancellation } from "@/lib/pricing";
import type { CancellationPolicy, MarketplaceConfig } from "@/lib/settings/schema";
import { formatDate, formatDateTime, formatMoney, formatRate, itemNoun } from "@/lib/format";
import { RenterPage } from "@/components/domain/renter-page";
import { StatusPill } from "@/components/domain/pills";
import { Timeline, type TimelineStep } from "@/components/ui/timeline";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { MessageProviderButton } from "@/app/(renter)/listings/[slug]/message-button";
import { ActionRow, CancelAction, ClaimResponse, ReportProblemAction } from "./detail-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Booking ${ref}` };
}

export default async function BookingDetailPage({ params }: { params: Promise<{ ref: string }> }) {
  const [{ ref }, actor, config] = await Promise.all([params, requireUser(), getLiveConfig()]);
  const b = await withActor((trx) => getBookingByRef(trx, ref));
  if (!b || b.renter.id !== actor.userId) notFound();
  const nowAt = now();
  const user = actor.profile ? { name: actor.profile.name } : null;
  const delivery = b.fulfillment === "delivery";
  const providerShort = b.provider.name.split(" ")[0]!;
  const extendable = ["active", "return_due", "confirmed", "ready_for_pickup", "out_for_delivery"].includes(b.status);
  // how long the unit stays free after the current return (other renters' bookings are hidden by RLS → read as system, date only)
  const freeUntil = extendable
    ? await runAsSystem((trx) => trx.selectFrom("bookings").select("start_at").where("listing_id", "=", b.listing.id).where("id", "!=", b.id).where("status", "in", BLOCKING_STATUSES).where("start_at", ">", b.end_at).$if(!!b.unit?.id, (q) => q.where("unit_id", "=", b.unit!.id)).orderBy("start_at").executeTakeFirst())
    : null;
  const cancellable = CANCELLABLE_STATUSES.includes(b.status);
  const snap = b.price_snapshot;
  const preview = cancellable
    ? (() => {
        const policy = config.cancellation.policies.find((p) => p.id === b.cancellation_policy.id) ?? (b.cancellation_policy as CancellationPolicy);
        const r = renterCancellation({ policy, start: b.start_at, cancelledAt: nowAt, rental_cents: snap.rental_cents, delivery_cents: snap.delivery_cents, extras_cents: snap.extras_cents, service_fee_cents: snap.service_fee_cents, tax_cents: snap.tax_cents, charged_cents: b.charged_cents }, config);
        return { free: r.free, refunded_cents: r.refunded_cents, kept_rental_cents: r.kept_rental_cents, keep_pct: r.keep_pct, explanation: r.explanation };
      })()
    : null;
  const steps = buildTimeline(b, config);
  const openClaims = b.claims.filter((c) => c.status === "open");
  const canReview = b.status === "completed" && !b.has_review && ["released", "none", "captured", "partially_captured"].includes(b.hold_status);
  // delivery_notes are the provider's own logistics notes (van calendars etc.) — renters get composed instructions instead
  const returnText = delivery ? null : b.listing_extra.pickup_instructions;
  const noun = itemNoun(b.listing.title);
  const returnWhere = delivery ? `${b.delivery_address ?? ""}${b.delivery_area ? `, ${b.delivery_area}` : ""}` : b.listing_extra.pickup_address ?? b.provider.neighbourhood ?? "";
  const rentalLine = `${formatRate(b.listing_extra.day_cents)} × ${b.billed_days} ${b.billed_days === 1 ? "day" : "days"}${b.qty > 1 ? ` × ${b.qty}` : ""}${snap.delivery_cents ? " + delivery" : ""}${b.extras.length ? " + extras" : ""} + fees + tax`;

  return (
    <RenterPage user={user} title={b.listing.title} subtitle={`${b.ref} · ${b.provider.name}`} mono back="/rentals" right={<StatusPill status={b.status} />} width={760}>
      <div className="flex flex-col gap-3.5 px-5 pt-4 pb-10 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 lg:px-6 lg:pt-6">
        <div className="flex flex-col gap-3.5">
          {b.status === "requested" && (
            <div className="rounded-panel bg-warn-bg px-3.5 py-3 text-[13px] leading-[1.5] text-warn-text"><b>Awaiting {b.provider.name}.</b> They usually answer within {b.provider.response_minutes ? `${b.provider.response_minutes} minutes` : "an hour"}. You&apos;ve been charged {formatMoney(b.charged_cents)} and are refunded in full if they decline.</div>
          )}
          {b.status === "disputed" && b.dispute && (
            <div className="rounded-panel bg-error-bg px-3.5 py-3 text-[13px] leading-[1.5] text-error-text"><b>Dispute {b.dispute.code} is with fab.rent support.</b> A decision is due by {formatDateTime(b.dispute.decision_due_at).replace(" · ", ", ")}. Your hold stays in place until then; nothing extra is charged.</div>
          )}
          {openClaims.map((c) => <ClaimResponse key={c.id} bookingRef={b.ref} claim={c} holdCents={b.hold_cents} />)}
          {canReview && (
            <div className="card-sm flex items-center justify-between gap-3 px-4 py-3">
              <div><div className="text-[14px] font-bold">How was the {itemNoun(b.listing.title)}?</div><div className="text-[12px] text-text-3">Rate the item and {providerShort} separately · published double-blind</div></div>
              <Button size="md" href={`/rentals/${b.ref}/review`}>Review</Button>
            </div>
          )}

          <section className="card-sm p-4">
            <Timeline steps={steps} />
          </section>

          {b.status !== "cancelled" && (
            <section id="return" className="card-sm p-4">
              <div className="text-[14px] font-bold">{["completed", "inspecting", "disputed"].includes(b.status) ? "Return" : delivery ? "Return instructions" : "Return instructions"}</div>
              <p className="mt-1.5 text-[13px] leading-[1.55] text-text-2">
                {returnText ?? (delivery ? `Have the ${noun} ready at ${returnWhere} by ${formatDateTime(b.return_due_at ?? b.end_at).split(" · ")[1]}${b.collect_window ? ` — the driver collects ${b.collect_window.start}–${b.collect_window.end}` : ""}. Return it clean with everything listed below; the driver checks the serial and photographs it with you.` : `Return to ${returnWhere} by ${formatDateTime(b.return_due_at ?? b.end_at)}. You and the provider check the serial and photograph the ${noun} together.`)}
              </p>
              {b.listing_extra.included_accessories.length > 0 && (
                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                  {b.listing_extra.included_accessories.map((a) => <li key={a} className="flex items-center gap-2"><span className="flex size-4 items-center justify-center rounded-full bg-ok"><Icon name="check" size={9} strokeWidth={3.5} className="text-white" /></span>{a}</li>)}
                </ul>
              )}
              {b.listing_extra.late_fee_cents_per_hour > 0 && !["completed", "inspecting", "disputed"].includes(b.status) && <div className="mt-3 text-[12px] text-text-3">{b.listing_extra.late_grace_minutes}-minute grace, then {formatRate(b.listing_extra.late_fee_cents_per_hour)}/hour late fee.</div>}
            </section>
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <section className="card-sm flex flex-col gap-2 px-4 py-3.5 text-[13px]">
            <div className="flex items-start justify-between gap-3"><span className="text-text-2">{rentalLine}</span><span className="t-mono font-medium">{formatMoney(b.charged_cents)}</span></div>
            {b.status === "cancelled" && b.cancellation_snapshot ? (
              <div className="flex items-start justify-between gap-3"><span className="text-text-2">Refunded</span><span className="t-mono font-medium text-ok-text">{formatMoney(Number(b.cancellation_snapshot.refunded_cents ?? 0))}</span></div>
            ) : b.hold_cents > 0 ? (
              <div className="flex items-start justify-between gap-3">
                <span className="text-text-2">{holdLabel(b)}</span>
                <span className="t-mono text-text-2">{b.hold_status === "captured" || b.hold_status === "partially_captured" ? `${formatMoney(b.hold_captured_cents)} of ${formatMoney(b.hold_cents, { whole: true })}` : formatMoney(b.hold_cents)}</span>
              </div>
            ) : null}
            {b.extension && b.extension.status === "requested" && <div className="flex items-start justify-between gap-3 border-t border-border pt-2"><span className="text-text-2">Extension requested · +{b.extension.extra_days} {b.extension.extra_days === 1 ? "day" : "days"} to {formatDateTime(b.extension.new_end_at).replace(" · ", ", ")}</span><span className="t-mono text-text-2">{formatMoney(b.extension.amount_cents)}</span></div>}
          </section>

          <section className="card-sm overflow-hidden">
            <ActionRow title="Receipt (PDF)" meta={`Paid ${formatDate(b.created_at)}${b.payment_method_label ? ` · ${b.payment_method_label}` : ""}`} href={`/api/bookings/${b.ref}/receipt.pdf`} external icon="file" />
            {extendable && (
              <ActionRow
                title="Extend rental"
                meta={b.extension?.status === "requested" ? `Requested +${b.extension.extra_days} ${b.extension.extra_days === 1 ? "day" : "days"} · awaiting ${providerShort}` : freeUntil ? `Unit free until ${formatDate(freeUntil.start_at)}` : "Unit is free after your return"}
                href={`/rentals/${b.ref}/extend`}
                icon="calendar"
                testId="extend-rental"
              />
            )}
            <div className="border-b border-border">
              <MessageProviderButton bookingRef={b.ref} variant="text" className="!h-auto !w-full !justify-start !gap-3 !rounded-none !px-3.5 !py-3 !text-charcoal hover:!bg-ivory/60 hover:!text-charcoal">
                <Icon name="message" size={18} className="text-text-2" />
                <span className="min-w-0 flex-1 text-left"><span className="block text-[14px] font-semibold">Message {providerShort}</span><span className="block text-[12px] font-normal text-text-3">{b.provider.response_minutes ? `Replies in ~${b.provider.response_minutes} min` : "Usually replies within the hour"}</span></span>
                <Icon name="chevron-right" size={16} className="text-text-3" />
              </MessageProviderButton>
            </div>
            <ReportProblemAction bookingRef={b.ref} />
            <CancelAction bookingRef={b.ref} preview={preview} last />
          </section>
        </div>
      </div>
    </RenterPage>
  );
}

function holdLabel(b: BookingDetail) {
  const card = b.payment_method_label ?? "your card";
  switch (b.hold_status) {
    case "placed":
      return `Hold on ${card} · placed ${b.hold_placed_at ? formatDateTime(b.hold_placed_at).replace(/^(\w+) \d+ \w+ · /, "$1 ") : ""}`;
    case "released":
      return `Hold released ${b.hold_released_at ? formatDate(b.hold_released_at) : ""}`;
    case "captured":
    case "partially_captured":
      return "Captured from the hold for the agreed claim";
    case "expired":
      return "Hold expired";
    default:
      return `Hold at ${b.fulfillment === "delivery" ? "delivery" : "handoff"} (not charged)`;
  }
}

/** M11 timeline: booked → handed over → in use → return check-in → hold released, with cancel/dispute branches. */
function buildTimeline(b: BookingDetail, config: MarketplaceConfig): TimelineStep[] {
  const delivery = b.fulfillment === "delivery";
  const handoff = b.condition.handoff;
  const ret = b.condition.return;
  const st = b.status;
  const s: TimelineStep[] = [];
  const paidAt = b.events.find((e) => e.type === "payment_charged")?.occurred_at ?? b.created_at;
  s.push({ title: st === "requested" ? `Requested · charged ${formatMoney(b.charged_cents)}` : `Booked & paid ${formatMoney(b.charged_cents)}`, meta: `${formatDate(paidAt)}${b.payment_method_label ? ` · ${b.payment_method_label}` : ""}`, state: "done" });
  if (st === "requested") s.push({ title: `${b.provider.name} confirms`, meta: `Usually within ${b.provider.response_minutes ? `${b.provider.response_minutes} minutes` : "an hour"} · refunded in full if declined`, state: "current" });
  if (st === "cancelled") {
    const refunded = Number(b.cancellation_snapshot?.refunded_cents ?? 0);
    s.push({ title: `Cancelled by ${b.cancelled_by === "provider" ? "the provider" : "you"}`, meta: `${b.cancelled_at ? formatDateTime(b.cancelled_at) : ""} · ${refunded > 0 ? `${formatMoney(refunded)} refunded` : "no refund"}`, state: "error" });
    return s;
  }
  const handedOver = ["active", "return_due", "overdue", "inspecting", "completed", "disputed"].includes(st);
  const when = b.handoff_at ?? handoff?.completed_at ?? null;
  const dropWin = delivery && b.drop_window ? `${b.drop_window.start}–${b.drop_window.end}` : null;
  s.push(
    handedOver
      ? { title: delivery ? "Delivered · condition recorded" : "Picked up · condition recorded", meta: [when ? formatDateTime(when).replace(" · ", " ") : null, handoff ? `${handoff.photos.length} photos` : null, handoff?.fuel_level ? `fuel ${handoff.fuel_level}` : null, b.hold_cents > 0 ? `${formatMoney(b.hold_cents, { whole: true })} hold placed` : null].filter(Boolean).join(" · "), state: "done" }
      : { title: delivery ? `Delivery ${formatDate(b.start_at)}${dropWin ? `, ${dropWin}` : ""}` : `Pickup ${formatDateTime(b.start_at).replace(" · ", ", ")}`, meta: st === "out_for_delivery" ? "Out for delivery — the driver records condition with you" : st === "ready_for_pickup" ? `Ready at ${b.listing_extra.pickup_address ?? b.provider.name}` : `${delivery ? "Driver" : "You and the provider"} photograph the item together${b.hold_cents > 0 ? ` · ${formatMoney(b.hold_cents, { whole: true })} hold placed then` : ""}`, state: st === "requested" ? "upcoming" : "current" },
  );
  const due = b.return_due_at ?? b.end_at;
  const collect = delivery && b.collect_window ? `Provider collects ${b.collect_window.start}–${b.collect_window.end}` : `Return to ${b.listing_extra.pickup_address ?? b.provider.name}`;
  const late = b.listing_extra.late_fee_cents_per_hour > 0 ? ` · ${Math.round(b.listing_extra.late_grace_minutes / 60) || 1}-hour grace, then ${formatRate(b.listing_extra.late_fee_cents_per_hour)}/h` : "";
  const inUseDone = ["inspecting", "completed", "disputed"].includes(st);
  s.push({
    title: st === "overdue" ? `Overdue — was due ${formatDateTime(due).replace(" · ", ", ")}` : inUseDone ? "In use" : `In use — return due ${formatDateTime(due).replace(" · ", ", ")}`,
    meta: inUseDone ? `${formatDate(b.start_at)} → ${formatDate(due)}` : `${collect}${late}`,
    state: st === "overdue" ? "error" : inUseDone ? "done" : handedOver ? "current" : "upcoming",
  });
  s.push({
    title: "Return check-in & inspection",
    meta: ret?.completed_at ? `${formatDateTime(ret.completed_at).replace(" · ", " ")} · ${ret.photos.length} photos${ret.checklist.some((c) => !c.ok) ? " · issue noted" : " · no issues"}` : b.returned_at ? formatDateTime(b.returned_at) : delivery ? "The driver checks the serial and photographs it with you" : "Serial and condition checked together at the counter",
    state: st === "inspecting" ? "current" : inUseDone ? "done" : "upcoming",
  });
  if (st === "disputed") {
    s.push({ title: `In dispute${b.dispute ? ` · ${b.dispute.code}` : ""}`, meta: b.dispute ? `Decision due ${formatDateTime(b.dispute.decision_due_at).replace(" · ", ", ")} · hold stays until then` : undefined, state: "error" });
    return s;
  }
  const released = b.hold_status === "released" || b.hold_status === "captured" || b.hold_status === "partially_captured" || (st === "completed" && b.hold_cents === 0);
  s.push({
    title: b.hold_status === "captured" || b.hold_status === "partially_captured" ? `Claim settled · ${formatMoney(b.hold_captured_cents)} captured, rest released` : "Hold released · rental complete",
    meta: released && b.hold_released_at ? formatDateTime(b.hold_released_at) : `Within ${config.holds.auto_release_business_days} business days of check-in`,
    state: released ? "done" : st === "completed" ? "current" : "upcoming",
  });
  return s;
}
