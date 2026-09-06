"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { CheckDot } from "@/components/ui/controls";
import { DateRangePicker } from "@/components/domain/search-bar";
import { PriceBreakdown } from "@/components/domain/price-breakdown";
import { DialogRoot, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Field } from "@/components/ui/field";
import { formatDateTime, formatMoney, formatRate } from "@/lib/format";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import { toLocalIso, bookingContextQuery } from "@/lib/search/params";
import { describePolicy, freeCancelUntil } from "@/lib/pricing";
import { saveDraft } from "@/app/(renter)/actions";
import { useToast } from "@/components/ui/toast";
import { useBookingDraft, windowLabel, type ListingClientData } from "../booking-hooks";

export interface BookingCardProps {
  listing: ListingClientData;
  config: MarketplaceConfig;
  initial: { start: Date; end: Date; qty: number; fulfillment: "pickup" | "delivery"; where?: string };
  today: Date;
  bookedDays: string[];
  eligibleForInstant: boolean;
  signedIn: boolean;
}

/** Desktop sticky booking card (W03): rate, FROM/UNTIL, quantity, fulfillment, extras, breakdown, Reserve. */
export function DesktopBookingCard({ listing, config, initial, today, bookedDays, eligibleForInstant, signedIn }: BookingCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const d = useBookingDraft(listing, config, { start: initial.start, end: initial.end, qty: initial.qty, fulfillment: initial.fulfillment }, initial.where);
  const policy = config.cancellation.policies.find((p) => p.id === listing.policy_id) ?? config.cancellation.policies[0]!;
  const tz = d.tz;
  const [delivOpen, setDelivOpen] = useState(false);

  const reserve = () =>
    start(async () => {
      const r = await saveDraft({ listingSlug: listing.slug, from: toLocalIso(d.state.start, tz), to: toLocalIso(d.state.end, tz), qty: d.state.qty, fulfillment: d.state.fulfillment, address: d.state.address || undefined, area: d.areaPoint?.name, drop: d.state.drop, collect: d.state.collect, extras: Object.entries(d.state.extras).filter(([, q]) => q > 0).map(([id, q]) => ({ id, qty: q })), where: initial.where });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      router.push(r.data.nextUrl);
    });

  const q = d.quote;
  return (
    <div className="sticky top-5 flex flex-col gap-3.5 rounded-[18px] border border-border bg-white p-5 shadow-sticky">
      <div className="flex items-baseline justify-between">
        <div><span className="text-[28px] font-extrabold tracking-[-0.02em]">{formatRate(listing.pricing.day_cents)}</span><span className="text-[14px] text-text-3">/day</span></div>
        <div className="text-[12px] text-text-2">{[listing.pricing.weekend_cents != null && `${formatRate(listing.pricing.weekend_cents)} weekend`, listing.pricing.week_cents != null && `${formatRate(listing.pricing.week_cents)}/week`].filter(Boolean).join(" · ")}</div>
      </div>
      <DateRangePicker from={d.state.start} to={d.state.end} tz={tz} today={today} onChange={d.setDates} minDays={listing.pricing.min_days} maxDays={listing.pricing.max_days} isBooked={(day) => bookedDays.includes(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`)}>
        <button type="button" className="flex w-full overflow-hidden rounded-panel border border-border-strong text-left hover:bg-ivory/60">
          <div className="flex-1 border-r border-border px-3.5 py-2.5"><div className="text-[10px] font-semibold tracking-[.04em] text-text-3">FROM</div><div className="text-[14px] font-semibold">{formatDateTime(d.state.start)}</div></div>
          <div className="flex-1 px-3.5 py-2.5"><div className="text-[10px] font-semibold tracking-[.04em] text-text-3">UNTIL</div><div className="text-[14px] font-semibold">{formatDateTime(d.state.end)}</div></div>
        </button>
      </DateRangePicker>
      <div className="flex gap-2.5">
        <div className="flex h-12 flex-1 items-center justify-between rounded-panel border border-border-strong px-3.5">
          <div><div className="text-[10px] font-semibold tracking-[.04em] text-text-3">QUANTITY</div><div className="text-[14px] font-semibold">{d.state.qty} of {d.available ?? listing.units_total}</div></div>
          <div className="flex gap-2.5 text-[16px]">
            <button type="button" aria-label="Fewer" disabled={d.state.qty <= 1} onClick={() => d.setState((s) => ({ ...s, qty: s.qty - 1 }))} className={cn(d.state.qty <= 1 ? "text-placeholder" : "text-text-2 hover:text-charcoal")}>−</button>
            <button type="button" aria-label="More" disabled={d.state.qty >= d.maxQty} onClick={() => d.setState((s) => ({ ...s, qty: s.qty + 1 }))} className={cn(d.state.qty >= d.maxQty ? "text-placeholder" : "text-charcoal")}>+</button>
          </div>
        </div>
        <div className="relative flex h-12 flex-[1.2] items-center rounded-panel border border-border-strong">
          <select value={d.state.fulfillment} onChange={(e) => { const v = e.target.value as "pickup" | "delivery"; d.setState((s) => ({ ...s, fulfillment: v })); if (v === "delivery") setDelivOpen(true); }} aria-label="Fulfillment" className="absolute inset-0 w-full appearance-none bg-transparent pl-3.5 pr-8 pt-[18px] text-[14px] font-semibold outline-none">
            {listing.pickup.enabled && <option value="pickup">Pickup · free</option>}
            {listing.delivery.enabled && <option value="delivery">Delivery · from {formatRate(listing.delivery.base_cents)}</option>}
          </select>
          <div className="pointer-events-none absolute left-3.5 top-2 text-[10px] font-semibold tracking-[.04em] text-text-3">FULFILLMENT</div>
          <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-3.5 text-text-3" />
        </div>
      </div>
      {d.state.fulfillment === "delivery" && (
        <DialogRoot open={delivOpen} onOpenChange={setDelivOpen}>
          <DialogTrigger asChild>
            <button type="button" className="flex items-center justify-between rounded-panel border border-border bg-ivory px-3.5 py-2.5 text-left text-[13px]">
              <span className="min-w-0 truncate">{d.state.address ? `${d.state.address} · ${d.areaPoint?.name}` : "Add the delivery address"}</span>
              <span className="text-cobalt font-semibold">Edit</span>
            </button>
          </DialogTrigger>
          <DialogContent title="Delivery & collection" description={`Within ${listing.delivery.radius_km} km · ${listing.delivery.window_hours}-hour windows · driver records condition with you`} size="sm" footer={<Button size="md" onClick={() => setDelivOpen(false)} disabled={d.state.address.trim().length < 4}>Done</Button>}>
            <DeliveryFields d={d} config={config} listing={listing} />
          </DialogContent>
        </DialogRoot>
      )}
      {listing.extras.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="t-label text-text-3">Extras</div>
          {listing.extras.map((x) => {
            const on = (d.state.extras[x.id] ?? 0) > 0;
            return (
              <label key={x.id} className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2.5"><CheckDot checked={on} size="sm" /><input type="checkbox" className="sr-only" checked={on} onChange={(e) => d.toggleExtra(x.id, e.target.checked)} />{x.name}{x.is_damage_waiver && listing.pricing.hold_with_waiver_cents != null && <span className="text-text-3"> · hold drops to {formatRate(listing.pricing.hold_with_waiver_cents)}</span>}</span>
                <span className="font-semibold">{formatRate(x.price_cents)}{x.per === "day" ? "/day" : ""}</span>
              </label>
            );
          })}
        </div>
      )}
      {q ? (
        <>
          <div className="flex flex-col gap-2 border-t border-border pt-3 text-[13px]">
            {q.lines.filter((l) => l.kind !== "delivery" || l.cents > 0).map((l, i) => (
              <div key={i} className="flex justify-between gap-3"><span className="text-text-2">{l.label}</span><span className="t-mono">{formatMoney(l.cents)}</span></div>
            ))}
          </div>
          <div className="overflow-hidden rounded-panel">
            <div className="flex items-center justify-between bg-charcoal px-3.5 py-3 text-white"><div className="t-label text-on-dark-muted">Charged at booking</div><div className="t-mono text-[20px] font-bold">{formatMoney(q.charged_cents)}</div></div>
            <div className="flex items-center justify-between border border-t-0 border-dashed border-border-strong bg-ivory px-3.5 py-[9px]"><div className="text-[12px] text-text-3">Held at handoff, not charged</div><div className="t-mono text-[14px] font-bold text-text-2">{formatMoney(q.hold_cents, { whole: true })}</div></div>
          </div>
        </>
      ) : (
        <div className="rounded-panel bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-text">{d.error}</div>
      )}
      {d.available != null && d.available < d.state.qty && <div className="rounded-panel bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-text">{d.available === 0 ? "No units free for these dates — try different dates." : `Only ${d.available} unit${d.available === 1 ? "" : "s"} free for these dates.`}</div>}
      <Button size="xl" block className="!rounded-[12px]" onClick={reserve} disabled={!d.canReserve} loading={pending}>Reserve</Button>
      <div className="text-center text-[12px] leading-[1.5] text-text-3">
        {listing.instant_book && eligibleForInstant ? "Instant book" : listing.instant_book ? "Instant book for verified renters" : "Provider approves within a few hours"} · free cancellation until {formatDateTime(freeCancelUntil(policy, d.state.start))}.{!signedIn && " You'll sign in at payment; your selections are kept."}
      </div>
      <div className="sr-only">{describePolicy(policy)}</div>
    </div>
  );
}

export function DeliveryFields({ d, config, listing }: { d: ReturnType<typeof useBookingDraft>; config: MarketplaceConfig; listing: ListingClientData }) {
  const outOfRange = d.deliveryKm != null && d.deliveryKm > listing.delivery.radius_km;
  return (
    <div className="flex flex-col gap-3">
      <Field label="Delivery address" id="delivery-address">
        <Input id="delivery-address" value={d.state.address} onChange={(e) => d.setState((s) => ({ ...s, address: e.target.value }))} placeholder="18 Corrin St" leading={<Icon name="pin" size={16} />} autoComplete="street-address" />
      </Field>
      <Field label="Neighbourhood" id="delivery-area" hint={d.deliveryKm != null ? `${d.deliveryKm} km${outOfRange ? " · outside the delivery radius" : ""}` : undefined} error={outOfRange ? `Outside the ${listing.delivery.radius_km} km delivery radius` : null}>
        <Select id="delivery-area" value={d.state.area} onChange={(e) => d.setState((s) => ({ ...s, area: e.target.value }))}>
          {config.market.neighbourhoods.map((n) => <option key={n.slug} value={n.slug}>{n.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Drop" id="drop-window">
          <Select id="drop-window" value={d.state.drop} onChange={(e) => d.setState((s) => ({ ...s, drop: e.target.value }))} compact>
            {d.windows.map((w) => <option key={w} value={w}>{windowLabel(w)}</option>)}
          </Select>
        </Field>
        <Field label="Collect" id="collect-window">
          <Select id="collect-window" value={d.state.collect} onChange={(e) => d.setState((s) => ({ ...s, collect: e.target.value }))} compact>
            {d.windows.map((w) => <option key={w} value={w}>{windowLabel(w)}</option>)}
          </Select>
        </Field>
      </div>
    </div>
  );
}

/** Availability strip's "Change" → date picker, updating the URL so the whole page re-prices. */
export function ChangeDates({ start, end, tz, today, minDays, maxDays, bookedDays, carry }: { start: Date; end: Date; tz: string; today: Date; minDays: number; maxDays: number; bookedDays: string[]; carry: { qty: number; fulfillment?: "any" | "pickup" | "delivery"; where?: string } }) {
  const router = useRouter();
  return (
    <DateRangePicker from={start} to={end} tz={tz} today={today} minDays={minDays} maxDays={maxDays} isBooked={(day) => bookedDays.includes(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`)} onChange={(f, t) => router.replace(`?${bookingContextQuery({ from: f, to: t, qty: carry.qty, fulfillment: carry.fulfillment, where: carry.where }, tz)}`, { scroll: false })}>
      <button type="button" className="text-[13px] font-semibold text-cobalt">Change</button>
    </DateRangePicker>
  );
}

export { PriceBreakdown };
