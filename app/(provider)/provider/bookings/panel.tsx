import Link from "next/link";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import type { getProviderBooking } from "@/lib/queries/provider";
import { nextPayoutDate } from "@/lib/time";
import { formatDate, formatDateTime, formatMoney, formatRate, formatKm } from "@/lib/format";
import { StatusPill } from "@/components/domain/pills";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icons";
import { Pill } from "@/components/ui/pill";
import { PanelSection, KeyValueList, SidePanel } from "@/components/ui/side-panel";
import { PanelActions, UnitSelect } from "./panel-actions";

type Detail = NonNullable<Awaited<ReturnType<typeof getProviderBooking>>>;

/** P02 right-hand panel: unit & fulfillment, money, condition docs, actions. */
export function BookingPanel({ b, config, payoutSchedule, van, standalone }: { b: Detail; config: MarketplaceConfig; payoutSchedule: string; van: string; standalone?: boolean }) {
  const tz = config.market.timezone;
  const snap = b.price_snapshot;
  const delivery = b.fulfillment === "delivery";
  const prepStart = new Date(b.start_at.getTime() - b.listing.prep_hours * 3_600_000);
  const prepNotes = b.extras.filter((e) => !e.is_damage_waiver).map((e) => e.name.toLowerCase());
  const payoutAt = nextPayoutDate(b.end_at, payoutSchedule, tz);
  const waiver = snap.waiver_bought;
  const trust = b.renter.is_business ? `business${b.renter.id_verified ? " · verified" : ""}${b.renter.rentals ? ` · ${b.renter.rentals} rentals` : ""}` : `${b.renter.rating ? `★ ${b.renter.rating.toFixed(1)} · ` : ""}${b.renter.rentals ? `${b.renter.rentals} rentals` : "new renter"}${b.renter.id_verified ? " · ID verified" : ""}`;
  const header = (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="t-mono text-[13px] font-medium">{b.ref}</span>
        <div className="flex items-center gap-1.5">{b.instant && b.status !== "requested" && <Pill tone="neutral" size="xs">instant</Pill>}<StatusPill status={b.status} size="sm" /></div>
      </div>
      <div className="text-[15px] font-bold leading-tight">{b.listing.title}</div>
      <div className="text-[12px] text-text-3">Booked {formatDateTime(b.created_at, tz).replace(" · ", " ")} · {formatDateTime(b.start_at, tz).replace(" · ", " ")} → {formatDateTime(b.end_at, tz).replace(" · ", " ")} · {b.billed_days} {b.billed_days === 1 ? "day" : "days"} · qty {b.qty}</div>
      {standalone && <Link href="/provider/bookings" className="text-[12px] font-semibold text-cobalt no-underline">← All bookings</Link>}
    </div>
  );
  const body = (
    <>
      <div className="flex items-center gap-3 rounded-panel border border-border bg-white px-3 py-2.5">
        <Avatar name={b.renter.name} size={36} tone="cobalt" />
        <div className="min-w-0 flex-1">
          <div className="truncate-1 text-[13px] font-bold">{b.renter.name}</div>
          <div className="truncate-1 text-[11px] text-text-3">{trust}{b.renter.phone ? ` · ${b.renter.phone}` : ""}</div>
        </div>
      </div>

      <PanelSection label="Unit & fulfillment">
        <div className="card-sm !rounded-panel flex flex-col gap-2 px-3 py-2.5 text-[13px]">
          <div className="flex items-center justify-between gap-3"><span className="text-text-2">Assigned unit</span><div className="w-[190px]"><UnitSelect bookingRef={b.ref} units={b.units} current={b.unit?.id ?? null} /></div></div>
          {b.qty > 1 && <div className="text-[11px] text-text-3">Multi-unit booking ({b.qty} units): assign the lead unit here; the calendar shows the rest.</div>}
          <Row k="Prep window" v={`${formatDate(prepStart, tz)}, ${b.listing.prep_hours} h${prepNotes.length ? ` · ${prepNotes.join(", ")}` : ""}`} />
          {delivery ? (
            <>
              <Row k="Delivery" v={`${formatDate(b.start_at, tz).split(" ")[0]} ${b.drop_window ? `${b.drop_window.start}–${b.drop_window.end}` : formatDateTime(b.start_at, tz).split(" · ")[1]} · ${van}`} />
              <Row k="Address" v={`${[b.delivery_address, b.delivery_area].filter(Boolean).join(", ")}${b.delivery_km != null ? ` · ${formatKm(b.delivery_km)}` : ""}`} />
              <Row k="Collection" v={`${formatDate(b.end_at, tz).split(" ")[0]} ${b.collect_window ? `${b.collect_window.start}–${b.collect_window.end}` : formatDateTime(b.end_at, tz).split(" · ")[1]} · ${van}`} />
            </>
          ) : (
            <>
              <Row k="Pickup" v={`${formatDateTime(b.start_at, tz).replace(" · ", " ")} · counter`} />
              <Row k="Return" v={`${formatDateTime(b.return_due_at ?? b.end_at, tz).replace(" · ", " ")}${b.listing_full.late_fee_cents_per_hour ? ` · ${formatRate(b.listing_full.late_fee_cents_per_hour)}/h after ${b.listing_full.late_grace_minutes} min` : ""}`} />
            </>
          )}
        </div>
      </PanelSection>

      <PanelSection label="Money">
        <KeyValueList
          size="sm"
          rows={[
            { k: `Rental ${formatRate(b.listing.day_cents)} × ${b.billed_days}${b.qty > 1 ? ` × ${b.qty}` : ""}${snap.extras_cents ? ` + extras ${formatMoney(snap.extras_cents, { whole: snap.extras_cents % 100 === 0 })}` : ""}${snap.delivery_cents ? ` + delivery ${formatMoney(snap.delivery_cents, { whole: snap.delivery_cents % 100 === 0 })}` : ""}`, v: formatMoney(snap.provider.gross_cents) },
            { k: `fab.rent commission ${snap.commission_pct}% (rental + extras)`, v: `−${formatMoney(snap.provider.commission_cents)}` },
            { k: b.status === "cancelled" ? "Payout" : `Your payout · ${formatDate(payoutAt, tz)}`, v: b.status === "cancelled" ? "—" : formatMoney(snap.provider.payout_cents), tone: b.status === "cancelled" ? "default" : "ok" },
            { k: `Renter hold at ${delivery ? "delivery" : "handoff"}${waiver ? " (waiver bought)" : ""}`, v: b.hold_status === "released" ? `${formatMoney(b.hold_cents)} · released` : b.hold_status === "placed" ? `${formatMoney(b.hold_cents)} · placed` : formatMoney(b.hold_cents) },
            ...(b.open_claim_cents ? [{ k: "Open claim", v: formatMoney(b.open_claim_cents), tone: "warn" as const }] : []),
            ...(b.extension?.status === "requested" ? [{ k: `Extension +${b.extension.extra_days} d requested`, v: `+${formatMoney(b.extension.amount_cents)}`, tone: "warn" as const }] : []),
          ]}
        />
      </PanelSection>

      <PanelSection label="Condition docs">
        <div className="grid grid-cols-2 gap-2">
          <Doc label="Handoff photos" record={b.condition.handoff} pending={delivery ? "at delivery" : "at pickup"} href={`/provider/bookings/${b.ref}/handoff`} />
          <Doc label="Return photos" record={b.condition.return} pending={delivery ? "at collection" : "at return"} href={`/provider/bookings/${b.ref}/return`} />
        </div>
        {b.claims.length > 0 && (
          <ul className="flex flex-col gap-1 text-[12px]">
            {b.claims.map((c) => <li key={c.id} className="flex justify-between gap-3 rounded-panel bg-ivory px-3 py-1.5"><span className="capitalize">{c.type} claim · {c.status}</span><span className="t-mono">{formatMoney(c.amount_cents)}</span></li>)}
          </ul>
        )}
      </PanelSection>
    </>
  );
  const footer = <PanelActions bookingRef={b.ref} status={b.status} fulfillment={b.fulfillment} hasExtension={b.extension?.status === "requested"} handoffStarted={!!b.condition.handoff} returnStarted={!!b.condition.return} refundNote={`refunded in full${config.cancellation.policies.find((p) => p.provider_cancel_credit_cents || p.provider_cancel_credit_pct) ? " plus a credit" : ""}`} />;
  if (standalone) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3.5 px-4 py-5">
        {header}
        {body}
        <div className="pt-2">{footer}</div>
      </div>
    );
  }
  return <SidePanel header={header} footer={footer} width={400} className="sticky top-16 h-[calc(100vh-64px)]">{body}</SidePanel>;
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-text-2">{k}</span><span className="text-right font-semibold">{v}</span></div>;
}

function Doc({ label, record, pending, href }: { label: string; record: { photos: unknown[]; completed_at: Date | null } | null; pending: string; href: string }) {
  const done = !!record?.completed_at;
  return (
    <Link href={href} className={`flex flex-col gap-1 rounded-panel border px-3 py-2.5 text-charcoal no-underline ${done ? "border-border bg-white" : "border-dashed border-border-strong bg-ivory/60"}`}>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold"><Icon name={done ? "check" : "camera"} size={12} className={done ? "text-ok-text" : "text-text-3"} />{label}</div>
      <div className="text-[11px] text-text-3">{done ? `${record!.photos.length} photos` : record ? "in progress" : pending}</div>
    </Link>
  );
}
