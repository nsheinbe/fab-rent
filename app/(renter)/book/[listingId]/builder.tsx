"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Stepper } from "@/components/ui/stepper";
import { CheckDot, RadioDot } from "@/components/ui/controls";
import { DialogRoot, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { DateRangePicker } from "@/components/domain/search-bar";
import { PriceBreakdown } from "@/components/domain/price-breakdown";
import { BackLink } from "@/components/domain/renter-header";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatKm, formatMoney, formatRate } from "@/lib/format";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import { toLocalIso } from "@/lib/search/params";
import { saveDraft } from "@/app/(renter)/actions";
import { useBookingDraft, windowLabel, type ListingClientData } from "../../listings/booking-hooks";

export function StepBar({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className="flex gap-1.5 px-5 pt-3.5" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => <div key={i} className={cn("h-1 flex-1 rounded-[2px]", i < step ? "bg-cobalt" : "bg-border")} />)}
    </div>
  );
}

/** Booking · 1 of 3 (M06): dates, quantity, fulfillment, extras, running total → Continue writes a draft. */
export function BookingBuilder({ listing, config, initial, today, defaultArea, where, backHref }: { listing: ListingClientData; config: MarketplaceConfig; initial: { start: Date; end: Date; qty: number; fulfillment: "pickup" | "delivery" }; today: Date; defaultArea?: string; where?: string; backHref: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const d = useBookingDraft(listing, config, initial, defaultArea);
  const [breakdown, setBreakdown] = useState(false);
  const q = d.quote;
  const tz = d.tz;

  const cont = () =>
    start(async () => {
      const r = await saveDraft({ listingSlug: listing.slug, from: toLocalIso(d.state.start, tz), to: toLocalIso(d.state.end, tz), qty: d.state.qty, fulfillment: d.state.fulfillment, address: d.state.address || undefined, area: d.areaPoint?.name, drop: d.state.drop, collect: d.state.collect, extras: Object.entries(d.state.extras).filter(([, n]) => n > 0).map(([id, n]) => ({ id, qty: n })), where });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      router.push(r.data.nextUrl);
    });

  const outOfRange = d.deliveryKm != null && d.deliveryKm > listing.delivery.radius_km;

  return (
    <main className="flex min-h-screen flex-col bg-ivory lg:mx-auto lg:w-full lg:max-w-[560px]">
      <div className="flex items-center gap-3 px-5 pt-[max(14px,env(safe-area-inset-top))]">
        <BackLink href={backHref} />
        <div className="flex-1"><div className="text-[17px] font-extrabold tracking-[-0.01em]">Dates &amp; delivery</div><div className="text-[12px] text-text-3">{listing.short_title} · {listing.provider.short}</div></div>
      </div>
      <StepBar step={1} />
      <div className="flex flex-col gap-2 px-5 pt-[18px]">
        <DateRangePicker from={d.state.start} to={d.state.end} tz={tz} today={today} onChange={d.setDates} minDays={listing.pricing.min_days} maxDays={listing.pricing.max_days}>
          <button type="button" className="flex w-full overflow-hidden rounded-panel border border-border-strong bg-white text-left">
            <div className="flex-1 border-r border-border px-3.5 py-2.5"><div className="text-[10px] font-semibold tracking-[.04em] text-text-3">FROM</div><div className="text-[14px] font-semibold">{formatDateTime(d.state.start)}</div></div>
            <div className="flex-1 px-3.5 py-2.5"><div className="text-[10px] font-semibold tracking-[.04em] text-text-3">UNTIL</div><div className="text-[14px] font-semibold">{formatDateTime(d.state.end)}</div></div>
          </button>
        </DateRangePicker>
        <div className="text-[12px] text-text-3">{q ? <>Billed as <b className="text-charcoal">{q.billed_days} {q.billed_days === 1 ? "day" : "days"}</b> — any part of a day counts as a day.{listing.pricing.week_cents != null && " Weekly rate from 5 days."}</> : <span className="text-warn-text">{d.error}</span>}</div>
      </div>
      <div className="card-sm mx-5 mt-4 flex items-center justify-between rounded-panel px-3.5 py-2.5">
        <div><div className="text-[14px] font-semibold">Quantity</div><div className="text-[12px] text-text-3">{d.checking && d.available == null ? "Checking availability…" : d.available == null ? `${listing.units_total} units listed` : d.available === 0 ? "No units available for these dates" : `${d.available} unit${d.available === 1 ? "" : "s"} available for these dates`}</div></div>
        <Stepper value={d.state.qty} onChange={(v) => d.setState((s) => ({ ...s, qty: v }))} min={1} max={d.maxQty} aria-label="Quantity" />
      </div>
      <div className="flex flex-col gap-2 px-5 pt-5">
        <div className="t-label text-text-3">Fulfillment</div>
        {listing.pickup.enabled && (
          <button type="button" onClick={() => d.setState((s) => ({ ...s, fulfillment: "pickup" }))} className={cn("flex items-center justify-between rounded-panel bg-white px-3.5 py-3 text-left", d.state.fulfillment === "pickup" ? "border-2 border-cobalt bg-cobalt-wash px-[13px] py-[11px]" : "border border-border")} aria-pressed={d.state.fulfillment === "pickup"}>
            <div className="flex items-center gap-2.5"><RadioDot selected={d.state.fulfillment === "pickup"} /><div><div className="text-[14px] font-semibold">Pickup at {listing.provider.short}</div><div className="text-[12px] text-text-3">{listing.pickup.address?.split(",")[0]}{listing.provider.distance_km != null && ` · ${formatKm(listing.provider.distance_km)}`}{listing.pickup.hours_label && ` · ${listing.pickup.hours_label}`}</div></div></div>
            <div className="text-[13px] font-bold text-ok-text">Free</div>
          </button>
        )}
        {listing.delivery.enabled && (
          <div className={cn("flex flex-col gap-2.5 rounded-panel bg-white", d.state.fulfillment === "delivery" ? "border-2 border-cobalt bg-cobalt-wash px-[13px] py-[11px]" : "border border-border px-3.5 py-3")}>
            <button type="button" onClick={() => d.setState((s) => ({ ...s, fulfillment: "delivery" }))} className="flex w-full items-center justify-between text-left" aria-pressed={d.state.fulfillment === "delivery"}>
              <div className="flex items-center gap-2.5"><RadioDot selected={d.state.fulfillment === "delivery"} /><div><div className="text-[14px] font-semibold">Delivery &amp; collection</div><div className="text-[12px] text-text-3">{d.deliveryKm != null ? `${formatKm(d.deliveryKm)} · ` : ""}driver records condition with you</div></div></div>
              <div className="text-[13px] font-bold">{d.state.fulfillment === "delivery" && q ? formatMoney(q.delivery_cents, { whole: true }) : `from ${formatRate(listing.delivery.base_cents)}`}</div>
            </button>
            {d.state.fulfillment === "delivery" && (
              <>
                <Input value={d.state.address} onChange={(e) => d.setState((s) => ({ ...s, address: e.target.value }))} placeholder="Street address" leading={<Icon name="pin" size={16} className="text-text-3" />} aria-label="Delivery address" autoComplete="street-address" />
                <Select value={d.state.area} onChange={(e) => d.setState((s) => ({ ...s, area: e.target.value }))} aria-label="Neighbourhood" compact>
                  {config.market.neighbourhoods.map((n) => <option key={n.slug} value={n.slug}>{n.name}</option>)}
                </Select>
                {outOfRange && <div className="text-[12px] font-semibold text-error-text">Outside the {listing.delivery.radius_km} km delivery radius</div>}
                <div className="flex gap-2">
                  <label className="relative flex h-10 flex-1 items-center rounded-control border border-border-strong bg-white px-3 text-[13px]">
                    <span><span className="text-text-3">Drop</span> <b>{formatDateTime(d.state.start).split(" · ")[0]!.split(" ")[0]} {windowLabel(d.state.drop)}</b></span>
                    <Icon name="chevron-down" size={14} className="ml-auto text-text-3" />
                    <select value={d.state.drop} onChange={(e) => d.setState((s) => ({ ...s, drop: e.target.value }))} className="absolute inset-0 opacity-0" aria-label="Drop window">{d.windows.map((w) => <option key={w} value={w}>{windowLabel(w)}</option>)}</select>
                  </label>
                  <label className="relative flex h-10 flex-1 items-center rounded-control border border-border-strong bg-white px-3 text-[13px]">
                    <span><span className="text-text-3">Collect</span> <b>{formatDateTime(d.state.end).split(" · ")[0]!.split(" ")[0]} {windowLabel(d.state.collect)}</b></span>
                    <Icon name="chevron-down" size={14} className="ml-auto text-text-3" />
                    <select value={d.state.collect} onChange={(e) => d.setState((s) => ({ ...s, collect: e.target.value }))} className="absolute inset-0 opacity-0" aria-label="Collect window">{d.windows.map((w) => <option key={w} value={w}>{windowLabel(w)}</option>)}</select>
                  </label>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {listing.extras.length > 0 && (
        <div className="flex flex-col gap-2 px-5 pt-5">
          <div className="t-label text-text-3">Extras</div>
          <div className="card-sm overflow-hidden rounded-panel">
            {listing.extras.map((x, i) => {
              const on = (d.state.extras[x.id] ?? 0) > 0;
              const line = q?.lines.find((l) => l.ref === x.id);
              return (
                <label key={x.id} className={cn("flex cursor-pointer items-center justify-between px-3.5 py-3", i < listing.extras.length - 1 && "border-b border-border")}>
                  <div className="flex items-center gap-2.5">
                    <CheckDot checked={on} />
                    <input type="checkbox" className="sr-only" checked={on} onChange={(e) => d.toggleExtra(x.id, e.target.checked)} />
                    <div><div className="text-[14px] font-semibold">{x.name}</div>{x.is_damage_waiver && q && <div className="text-[12px] text-text-3">{formatRate(x.price_cents)} × {q.billed_days} days{listing.pricing.hold_with_waiver_cents != null && ` · hold drops to ${formatRate(listing.pricing.hold_with_waiver_cents)}`}</div>}</div>
                  </div>
                  <div className="text-[13px] font-bold">{on && line ? formatMoney(line.cents, { whole: true }) : <>{formatRate(x.price_cents)}{x.per === "day" && <span className="font-medium text-text-3">/day</span>}</>}</div>
                </label>
              );
            })}
          </div>
        </div>
      )}
      <div className="h-6" />
      <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-border bg-paper px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="min-w-0">
          <div className="text-[17px] font-extrabold tracking-[-0.01em]">{q ? formatMoney(q.charged_cents) : "—"} <span className="text-[12px] font-medium text-text-3">now</span></div>
          <div className="text-[12px] text-text-3">
            {q && <>+ {formatMoney(q.hold_cents, { whole: true })} hold at {d.state.fulfillment === "delivery" ? "delivery" : "pickup"} · </>}
            <DialogRoot open={breakdown} onOpenChange={setBreakdown}>
              <DialogTrigger asChild><button type="button" className="font-semibold text-cobalt">Breakdown</button></DialogTrigger>
              <SheetContent title="Price breakdown">
                {q && <PriceBreakdown size="sm" lines={q.lines.map((l) => ({ label: l.label, cents: l.cents, keepZero: l.kind === "delivery" }))} charged={{ label: "Charged now", cents: q.charged_cents }} held={{ label: d.state.fulfillment === "delivery" ? "Held at delivery" : "Held at handoff", cents: q.hold_cents, explanation: d.waiverBought && q.hold_without_waiver_cents !== q.hold_cents ? `Reduced from ${formatMoney(q.hold_without_waiver_cents, { whole: true })} by the damage waiver` : `Not charged · released ≤${config.holds.auto_release_business_days} business days after return` }} />}
              </SheetContent>
            </DialogRoot>
          </div>
        </div>
        <Button size="xl" className="!rounded-[12px] !px-6" onClick={cont} disabled={!d.canReserve} loading={pending}>Continue</Button>
      </div>
    </main>
  );
}
