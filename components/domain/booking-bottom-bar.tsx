import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Sticky mobile bar: total · meta · primary CTA (paper surface, top border, safe-area padding). */
export function BookingBottomBar({ total, totalSuffix, meta, cta, className, secondary, stacked, note }: { total: ReactNode; totalSuffix?: ReactNode; meta?: ReactNode; cta: ReactNode; className?: string; secondary?: ReactNode; stacked?: boolean; note?: ReactNode }) {
  if (stacked) {
    return (
      <div className={cn("sticky bottom-0 z-30 mt-auto flex flex-col gap-2 border-t border-border bg-paper px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]", className)}>
        {cta}
        {secondary}
        {note && <div className="text-center text-[11px] text-text-3">{note}</div>}
      </div>
    );
  }
  return (
    <div className={cn("sticky bottom-0 z-30 mt-auto flex items-center justify-between gap-3 border-t border-border bg-paper px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]", className)}>
      <div className="min-w-0">
        <div className="text-[17px] font-extrabold tracking-[-0.01em]">
          {total} {totalSuffix && <span className="text-[12px] font-medium text-text-3">{totalSuffix}</span>}
        </div>
        {meta && <div className="text-[12px] text-text-3 truncate-1">{meta}</div>}
      </div>
      <div className="flex flex-none gap-2">
        {secondary}
        {cta}
      </div>
    </div>
  );
}
