import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { PillTone } from "@/lib/booking-state/status";

export type { PillTone };

const toneBg: Record<PillTone, string> = {
  warn: "bg-warn-bg text-warn-text",
  cobalt: "bg-cobalt-tint text-cobalt-hover",
  ok: "bg-ok-bg text-ok-text",
  error: "bg-error-bg text-error-text",
  neutral: "bg-ivory-deep text-text-2",
};
const toneDot: Record<PillTone, string> = {
  warn: "bg-warn",
  cobalt: "bg-cobalt",
  ok: "bg-ok",
  error: "bg-error",
  neutral: "bg-neutral-dot",
};

export interface PillProps {
  tone?: PillTone | "outline" | "dark" | "white";
  dot?: boolean;
  strike?: boolean;
  size?: "md" | "sm" | "xs";
  className?: string;
  children: ReactNode;
  leading?: ReactNode;
  title?: string;
}

/** 26 px pill, 999 radius, 12/600 — the base for status, availability and fulfillment pills. */
export function Pill({ tone = "neutral", dot, strike, size = "md", className, children, leading, title }: PillProps) {
  const sizing = size === "md" ? "h-[26px] px-2.5 text-[12px] gap-1.5" : size === "sm" ? "h-[24px] px-[9px] text-[11px] gap-1.5" : "h-[22px] px-2 text-[11px] gap-[5px]";
  const dotSize = size === "md" ? "size-1.5" : "size-[5px]";
  const bg =
    tone === "outline" ? "bg-white border border-border text-charcoal" : tone === "dark" ? "bg-charcoal text-white" : tone === "white" ? "bg-white text-charcoal" : toneBg[tone];
  return (
    <span title={title} className={cn("inline-flex items-center rounded-pill font-semibold whitespace-nowrap max-w-full", sizing, bg, strike && "line-through", className)}>
      {leading}
      {dot && tone !== "outline" && tone !== "dark" && tone !== "white" && <span className={cn("rounded-full flex-none", dotSize, toneDot[tone])} aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Filter/tag chip — 34 px on mobile sheets, 30 px on desktop rails. Selected = cobalt tint. */
export function Chip({ selected, children, className, onClick, size = "md", href, type = "button", ...rest }: { selected?: boolean; children: ReactNode; className?: string; onClick?: () => void; size?: "md" | "sm"; href?: string; type?: "button" | "submit"; name?: string; value?: string; "aria-pressed"?: boolean }) {
  const classes = cn(
    "inline-flex items-center rounded-pill font-semibold whitespace-nowrap transition-colors",
    size === "md" ? "h-[34px] px-3 text-[12px] gap-1.5" : "h-[30px] px-2.5 text-[12px] gap-1.5",
    selected ? "bg-cobalt-tint border border-cobalt-tint-border text-cobalt-hover" : "bg-white border border-border text-charcoal hover:border-border-strong",
    className,
  );
  if (href) {
    return (
      <a href={href} className={classes} aria-current={selected ? "true" : undefined}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} className={classes} onClick={onClick} aria-pressed={selected} {...rest}>
      {children}
    </button>
  );
}

/** Dark selected / white unselected tab-chips ("All · Upcoming · 2 · Active · 1 · Past"). */
export function TabChip({ selected, children, href, onClick, count, className }: { selected?: boolean; children: ReactNode; href?: string; onClick?: () => void; count?: ReactNode; className?: string }) {
  const classes = cn(
    "inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-pill text-[13px] font-semibold whitespace-nowrap transition-colors",
    selected ? "bg-charcoal text-white" : "bg-white border border-border text-charcoal hover:border-border-strong",
    className,
  );
  const inner = (
    <>
      {children}
      {count !== undefined && count !== null && <span className={selected ? "text-on-dark-muted" : "text-text-3"}>{count}</span>}
    </>
  );
  if (href) {
    return (
      <a href={href} className={classes} aria-current={selected ? "page" : undefined}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes} aria-pressed={selected}>
      {inner}
    </button>
  );
}
