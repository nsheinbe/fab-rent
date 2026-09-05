import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

export interface BreakdownLine {
  label: ReactNode;
  cents: number;
  /** show even when 0 (e.g. "Pickup $0.00") */
  keepZero?: boolean;
  muted?: boolean;
  /** for text values like "Not purchased" */
  text?: ReactNode;
}

export interface PriceBreakdownProps {
  lines: BreakdownLine[];
  /** the charcoal bar */
  charged: { label: ReactNode; cents: number; sub?: ReactNode };
  /** the outlined, dashed block underneath — held money is always separated */
  held?: { label: ReactNode; cents: number | null; explanation?: ReactNode; text?: ReactNode } | null;
  /** extra dashed footer lines (e.g. "Your $250 hold stays as is…") */
  footer?: ReactNode;
  className?: string;
  size?: "md" | "sm";
  /** render without the outer border (inside another card) */
  bare?: boolean;
}

/**
 * Line items → **Charged now** as a charcoal bar with a white DM Mono total (card on the left)
 * → **Held, not charged** as a separate outlined block underneath with its explanation line.
 */
export function PriceBreakdown({ lines, charged, held, footer, className, size = "md", bare }: PriceBreakdownProps) {
  const text = size === "md" ? "text-[14px]" : "text-[13px]";
  return (
    <div className={cn(!bare && "overflow-hidden rounded-card-sm border border-border bg-white", className)}>
      <div className={cn("flex flex-col", size === "md" ? "gap-[9px] px-4 py-3.5" : "gap-2 px-3.5 py-3", text)}>
        {lines
          .filter((l) => l.keepZero || l.cents !== 0 || l.text)
          .map((l, i) => (
            <div key={i} className="flex justify-between gap-4">
              <span className={cn("text-text-2", l.muted && "text-text-3")}>{l.label}</span>
              <span className={cn("t-mono flex-none", l.muted && "text-text-3")}>{l.text ?? formatMoney(l.cents)}</span>
            </div>
          ))}
      </div>
      <div className={cn("flex items-center justify-between gap-4 bg-charcoal text-white", size === "md" ? "px-4 py-3.5" : "px-3.5 py-3")}>
        <div>
          <div className="t-label text-on-dark-muted">{charged.label}</div>
          {charged.sub && <div className="text-[12px] text-on-dark-muted">{charged.sub}</div>}
        </div>
        <div className={cn("t-mono font-bold", size === "md" ? "text-[22px]" : "text-[18px]")}>{formatMoney(charged.cents)}</div>
      </div>
      {held && (
        <div className={cn("flex items-center justify-between gap-4 border-t border-dashed border-border-strong bg-ivory", size === "md" ? "px-4 py-3" : "px-3.5 py-2.5")}>
          <div className="min-w-0">
            {typeof held.label === "string" && held.label.length < 40 ? <div className="t-label text-text-3">{held.label}</div> : <div className="text-[12px] text-text-3">{held.label}</div>}
            {held.explanation && <div className="text-[12px] text-text-3 leading-[1.45]">{held.explanation}</div>}
          </div>
          <div className={cn("t-mono flex-none font-bold text-text-2", size === "md" ? "text-[16px]" : "text-[14px]")}>{held.text ?? (held.cents != null ? formatMoney(held.cents) : "—")}</div>
        </div>
      )}
      {footer && <div className={cn("border-t border-dashed border-border-strong bg-ivory text-[12px] text-text-3 leading-[1.5]", size === "md" ? "px-4 py-2.5" : "px-3.5 py-2.5")}>{footer}</div>}
    </div>
  );
}
