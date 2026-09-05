import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, withActor } from "@/lib/auth";
import { now } from "@/lib/time";
import { listRenterBookings, type BookingSummary } from "@/lib/queries/bookings";
import { derivedBadge, ACTIVE_STATUSES, PAST_STATUSES, UPCOMING_STATUSES } from "@/lib/booking-state";
import { formatDate, formatDateRangeCompact, formatDateTime, formatHoursLeft, formatMoney } from "@/lib/format";
import { RenterPage } from "@/components/domain/renter-page";
import { StatusPill } from "@/components/domain/pills";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { Pill, TabChip } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Icon } from "@/components/ui/icons";
import { MessageProviderButton } from "@/app/(renter)/listings/[slug]/message-button";

export const metadata: Metadata = { title: "My rentals" };
export const dynamic = "force-dynamic";

type Tab = "all" | "upcoming" | "active" | "past";
/** "Prep due" shows this many hours before a confirmed start (design P01). */
const PREP_HOURS = 2;

export default async function RentalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [sp, actor] = await Promise.all([searchParams, requireUser()]);
  const tab: Tab = (["all", "upcoming", "active", "past"] as Tab[]).includes(sp.tab as Tab) ? (sp.tab as Tab) : "all";
  const bookings = await withActor((trx) => listRenterBookings(trx, actor.userId!));
  const nowAt = now();
  const active = bookings.filter((b) => ACTIVE_STATUSES.includes(b.status));
  const upcoming = bookings.filter((b) => UPCOMING_STATUSES.includes(b.status)).sort((a, b) => a.start_at.getTime() - b.start_at.getTime());
  const past = bookings.filter((b) => PAST_STATUSES.includes(b.status));
  const user = actor.profile ? { name: actor.profile.name } : null;
  const show = (k: Exclude<Tab, "all">) => tab === "all" || tab === k;

  return (
    <RenterPage user={user} title="Rentals" width={760}>
      <div className="flex gap-2 overflow-x-auto scrollbar-none px-5 pt-3.5 lg:px-6 lg:pt-5">
        <TabChip href="/rentals" selected={tab === "all"}>All</TabChip>
        <TabChip href="/rentals?tab=upcoming" selected={tab === "upcoming"} count={upcoming.length || undefined}>Upcoming</TabChip>
        <TabChip href="/rentals?tab=active" selected={tab === "active"} count={active.length || undefined}>Active</TabChip>
        <TabChip href="/rentals?tab=past" selected={tab === "past"}>Past</TabChip>
      </div>

      {bookings.length === 0 && (
        <div className="px-5 pt-10 lg:px-6"><EmptyState icon="box" title="No rentals yet" body="Everything you book shows up here — with return countdowns, receipts and messages." action={<Button size="md" href="/search">Find something to rent</Button>} /></div>
      )}

      {show("active") && active.length > 0 && (
        <section className="flex flex-col gap-2.5 px-5 pt-5 lg:px-6">
          <div className="t-label text-text-3">Active</div>
          {active.map((b) => <ActiveCard key={b.id} b={b} nowAt={nowAt} />)}
        </section>
      )}

      {show("upcoming") && upcoming.length > 0 && (
        <section className="flex flex-col gap-2 px-5 pt-5 lg:px-6">
          <div className="t-label text-text-3">Upcoming</div>
          <div className="card-sm overflow-hidden rounded-panel">
            {upcoming.map((b, i) => <UpcomingRow key={b.id} b={b} nowAt={nowAt} last={i === upcoming.length - 1} />)}
          </div>
        </section>
      )}

      {show("past") && past.length > 0 && (
        <section className="flex flex-col gap-2 px-5 pt-5 pb-8 lg:px-6">
          <div className="t-label text-text-3">Past</div>
          <div className="card-sm overflow-hidden rounded-panel">
            {past.map((b, i) => <PastRow key={b.id} b={b} last={i === past.length - 1} />)}
          </div>
        </section>
      )}

      {bookings.length > 0 && tab !== "all" && ((tab === "active" && active.length === 0) || (tab === "upcoming" && upcoming.length === 0) || (tab === "past" && past.length === 0)) && (
        <div className="px-5 pt-8 lg:px-6"><EmptyState compact icon="box" title={`Nothing ${tab}`} body={tab === "active" ? "Rentals appear here from handoff until the hold is released." : tab === "upcoming" ? "Booked rentals that haven't started yet." : "Completed and cancelled rentals."} /></div>
      )}
    </RenterPage>
  );
}

/** M10 pinned active card: return countdown + Extend / Return details / Message. */
function ActiveCard({ b, nowAt }: { b: BookingSummary; nowAt: Date }) {
  const due = b.return_due_at ?? b.end_at;
  const left = due.getTime() - nowAt.getTime();
  const dueLabel = formatDateTime(due);
  const dayWord = isSameMarketDay(due, nowAt) ? "today" : isSameMarketDay(due, new Date(nowAt.getTime() + 86_400_000)) ? "tomorrow" : "";
  const handoff = b.handoff_at ? `${b.fulfillment === "delivery" ? "delivered" : "picked up"} ${formatDateTime(b.handoff_at).replace(/^(\w+) \d+ \w+ · /, "$1 ")}` : b.fulfillment === "delivery" ? "delivered" : "picked up";
  return (
    <div className="card overflow-hidden rounded-card-sm">
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <StatusPill status={b.status} />
          <span className="t-mono text-[12px] text-text-3">{b.ref}</span>
        </div>
        <Link href={`/rentals/${b.ref}`} className="text-[17px] font-extrabold tracking-[-0.01em] leading-tight text-charcoal no-underline hover:text-charcoal">{b.listing.title}</Link>
        <div className="text-[12px] text-text-2">{b.provider.name} · {handoff}</div>
        <div className="flex items-center justify-between gap-3 rounded-panel bg-ivory px-3 py-2.5">
          <div className="text-[13px] font-semibold">{left < 0 ? `Return was due ${dueLabel}` : `Return due ${dayWord ? `${dayWord}, ` : ""}${dueLabel}`}</div>
          <Pill tone={left < 0 ? "error" : left < 6 * 3_600_000 ? "warn" : "ok"} size="sm">{left < 0 ? `Late ${formatHoursLeft(-left)}` : `${formatHoursLeft(left)} left`}</Pill>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-border bg-paper px-4 py-3">
        <Button size="md" href={`/rentals/${b.ref}/extend`} className="!rounded-[8px]">Extend</Button>
        <Button size="md" variant="secondary" href={`/rentals/${b.ref}#return`} className="!rounded-[8px]">Return details</Button>
        <MessageProviderButton bookingRef={b.ref} size="md" variant="secondary" className="!rounded-[8px]">Message</MessageProviderButton>
      </div>
    </div>
  );
}

function UpcomingRow({ b, nowAt, last }: { b: BookingSummary; nowAt: Date; last: boolean }) {
  const badge = derivedBadge({ status: b.status, start_at: b.start_at, end_at: b.end_at, fulfillment: b.fulfillment, prep_hours: PREP_HOURS, late_grace_minutes: 60, now: nowAt, instant: b.instant, provider_response_minutes: b.provider.response_minutes });
  const when = `${formatDate(b.start_at)} · ${b.fulfillment === "delivery" ? `delivery${b.drop_window ? ` ${b.drop_window.start}–${b.drop_window.end}` : ""}` : `pickup${b.provider.neighbourhood ? ` ${b.provider.neighbourhood}` : ""}`} · ${b.billed_days} ${b.billed_days === 1 ? "day" : "days"}`;
  return (
    <Link href={`/rentals/${b.ref}`} className={`flex items-center gap-3 px-3.5 py-3 text-charcoal no-underline hover:bg-ivory/60 ${last ? "" : "border-b border-border"}`}>
      <div className="relative size-12 flex-none overflow-hidden rounded-[10px]"><PhotoSlot src={b.listing.cover_url} placeholder="" className="absolute inset-0" /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate-1 text-[14px] font-bold">{b.listing.title}{b.qty > 1 ? ` · ${b.qty} units` : ""}</div>
        <div className="truncate-1 text-[12px] text-text-2">{when}</div>
      </div>
      {badge ? <Pill tone={badge.tone} dot={badge.dot} size="sm">{badge.label}</Pill> : <StatusPill status={b.status} size="sm" />}
    </Link>
  );
}

function PastRow({ b, last }: { b: BookingSummary; last: boolean }) {
  const meta = b.status === "cancelled" ? `${formatDateRangeCompact(b.start_at, b.end_at)} · Cancelled` : `${formatDateRangeCompact(b.start_at, b.end_at)} · ${b.provider.name.split(" ").slice(0, 2).join(" ")} · ${formatMoney(b.charged_cents, { whole: b.charged_cents % 100 === 0 })}${b.hold_released_at ? " · hold released" : b.status === "disputed" ? " · in dispute" : ""}`;
  const canReview = b.status === "completed" && !b.has_review && (b.hold_status === "released" || b.hold_status === "none" || b.hold_status === "captured" || b.hold_status === "partially_captured");
  return (
    <div className={`flex items-center gap-3 px-3.5 py-3 ${last ? "" : "border-b border-border"}`}>
      <div className="relative size-12 flex-none overflow-hidden rounded-[10px]"><PhotoSlot src={b.listing.cover_url} placeholder="" className="absolute inset-0" /></div>
      <Link href={`/rentals/${b.ref}`} className="min-w-0 flex-1 text-charcoal no-underline hover:text-charcoal">
        <div className={`truncate-1 text-[14px] font-bold ${b.status === "cancelled" ? "line-through text-text-2" : ""}`}>{b.listing.title}</div>
        <div className="truncate-1 text-[12px] text-text-2">{meta}</div>
      </Link>
      {canReview ? (
        <Button size="sm" href={`/rentals/${b.ref}/review`} className="!rounded-[8px]">Review</Button>
      ) : b.status === "completed" ? (
        <a href={`/api/bookings/${b.ref}/receipt.pdf`} className="flex items-center gap-1 text-[13px] font-semibold text-cobalt no-underline"><Icon name="download" size={14} />Receipt</a>
      ) : (
        <StatusPill status={b.status} size="sm" compact />
      )}
    </div>
  );
}

function isSameMarketDay(a: Date, b: Date) {
  return formatDate(a) === formatDate(b);
}
