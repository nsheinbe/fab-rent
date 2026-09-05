import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

/** FROM / UNTIL / DURATION strip. */
export function DateStrip({ start, end, days, className, onClickFrom, onClickUntil, showDuration = true, strong }: { start: Date; end: Date; days?: number; className?: string; onClickFrom?: () => void; onClickUntil?: () => void; showDuration?: boolean; strong?: boolean }) {
  const cell = "flex-1 min-w-0 px-3.5 py-2.5 text-left";
  const From = onClickFrom ? "button" : "div";
  const Until = onClickUntil ? "button" : "div";
  return (
    <div className={cn("flex overflow-hidden rounded-panel border bg-white", strong ? "border-border-strong" : "border-border", className)}>
      <From type={onClickFrom ? "button" : undefined} onClick={onClickFrom} className={cn(cell, "border-r border-border", onClickFrom && "hover:bg-ivory")}>
        <div className="text-[10px] font-semibold tracking-[.04em] text-text-3">FROM</div>
        <div className="text-[14px] font-semibold leading-tight">{formatDateTime(start)}</div>
      </From>
      <Until type={onClickUntil ? "button" : undefined} onClick={onClickUntil} className={cn(cell, showDuration && "border-r border-border", onClickUntil && "hover:bg-ivory")}>
        <div className="text-[10px] font-semibold tracking-[.04em] text-text-3">UNTIL</div>
        <div className="text-[14px] font-semibold leading-tight">{formatDateTime(end)}</div>
      </Until>
      {showDuration && days != null && (
        <div className="flex-none bg-ivory px-3.5 py-2.5">
          <div className="text-[10px] font-semibold tracking-[.04em] text-text-3">DURATION</div>
          <div className="text-[14px] font-semibold">
            {days} {days === 1 ? "day" : "days"}
          </div>
        </div>
      )}
    </div>
  );
}

/** Pickup / Delivery option cards — selected has a 2 px cobalt border and cobalt-wash fill. */
export function FulfillmentCard({ title, price, meta, selected, onSelect, className, disabled }: { title: ReactNode; price: ReactNode; meta: ReactNode; selected?: boolean; onSelect?: () => void; className?: string; disabled?: boolean }) {
  const Tag = onSelect ? "button" : "div";
  return (
    <Tag
      type={onSelect ? "button" : undefined}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={onSelect ? selected : undefined}
      className={cn(
        "flex flex-col gap-0.5 rounded-card-sm text-left transition-colors disabled:opacity-50",
        selected ? "border-2 border-cobalt bg-cobalt-wash px-[13px] py-3" : "border border-border bg-white px-3.5 py-[13px]",
        onSelect && !selected && "hover:border-border-strong",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[14px] font-bold">
        <span>{title}</span>
        <span className={cn(price === "Free" && "text-ok-text")}>{price}</span>
      </div>
      <div className="text-[12px] text-text-3 leading-[1.4]">{meta}</div>
    </Tag>
  );
}

export function DateLocationSummary({ start, end, days, pickup, delivery, className }: { start: Date; end: Date; days: number; pickup: { meta: ReactNode; selected?: boolean }; delivery: { price: ReactNode; meta: ReactNode; selected?: boolean } | null; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <DateStrip start={start} end={end} days={days} />
      <div className="grid grid-cols-2 gap-2.5">
        <FulfillmentCard title="Pickup" price="Free" meta={pickup.meta} selected={pickup.selected} />
        {delivery && <FulfillmentCard title="Delivery" price={delivery.price} meta={delivery.meta} selected={delivery.selected} />}
      </div>
    </div>
  );
}
