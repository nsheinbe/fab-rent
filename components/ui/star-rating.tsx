"use client";
import { cn } from "@/lib/cn";

/** Read-only or interactive 5-star row. Filled stars charcoal, empty stars border-strong. */
export function StarRating({ value, onChange, size = 22, className, "aria-label": ariaLabel }: { value: number; onChange?: (v: number) => void; size?: number; className?: string; "aria-label"?: string }) {
  const interactive = !!onChange;
  return (
    <div className={cn("inline-flex gap-1", className)} role={interactive ? "radiogroup" : "img"} aria-label={ariaLabel ?? `${value} out of 5 stars`} style={{ fontSize: size, letterSpacing: 2, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const star = <span className={filled ? "text-charcoal" : "text-border-strong"}>★</span>;
        return interactive ? (
          <button key={n} type="button" role="radio" aria-checked={n === Math.round(value)} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => onChange(n)} className="leading-none hover:scale-110 transition-transform">
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}

/** `★ 4.9 (87)` inline. */
export function StarInline({ rating, count, className, bold }: { rating: number | null | undefined; count?: number | null; className?: string; bold?: boolean }) {
  if (rating == null) return <span className={cn("text-text-3", className)}>New</span>;
  return (
    <span className={className}>
      <span className={bold ? "font-bold text-charcoal" : undefined}>★ {Number(rating).toFixed(1)}</span>
      {count != null && count > 0 && <span> ({count})</span>}
    </span>
  );
}
