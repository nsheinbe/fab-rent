"use client";
import { cn } from "@/lib/cn";

/** − 1 + stepper. 32 px round buttons on mobile rows, 36 px in sheets. */
export function Stepper({ value, onChange, min = 1, max = 99, size = "md", format, "aria-label": ariaLabel }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: "md" | "lg"; format?: (v: number) => string; "aria-label"?: string }) {
  const btn = size === "lg" ? "size-9 text-[18px]" : "size-8 text-[18px]";
  const canDec = value > min;
  const canInc = value < max;
  return (
    <div className="flex items-center gap-3.5" role="group" aria-label={ariaLabel}>
      <button type="button" aria-label="Decrease" disabled={!canDec} onClick={() => canDec && onChange(value - 1)} className={cn("flex items-center justify-center rounded-full border bg-white transition-colors", btn, canDec ? "border-charcoal text-charcoal hover:bg-ivory" : "border-border-strong text-placeholder")}>
        −
      </button>
      <div className={cn("text-center font-bold tabular-nums", size === "lg" ? "min-w-[52px] text-[15px]" : "min-w-[14px] text-[16px]")} aria-live="polite">
        {format ? format(value) : value}
      </div>
      <button type="button" aria-label="Increase" disabled={!canInc} onClick={() => canInc && onChange(value + 1)} className={cn("flex items-center justify-center rounded-full border bg-white transition-colors", btn, canInc ? "border-charcoal text-charcoal hover:bg-ivory" : "border-border-strong text-placeholder")}>
        +
      </button>
    </div>
  );
}
