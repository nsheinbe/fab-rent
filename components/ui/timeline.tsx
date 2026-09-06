import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface TimelineStep {
  title: ReactNode;
  meta?: ReactNode;
  state: "done" | "current" | "upcoming" | "error";
}

/** Vertical timeline: green check nodes for done, cobalt ring for current, hollow for upcoming (M11 / A04). */
export function Timeline({ steps, className, compact }: { steps: TimelineStep[]; className?: string; compact?: boolean }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const node =
          s.state === "done" ? (
            <span className={cn("flex items-center justify-center rounded-full bg-ok", compact ? "size-2.5 mt-[3px]" : "size-[22px]")}>{!compact && <Icon name="check" size={12} strokeWidth={3} className="text-white" />}</span>
          ) : s.state === "error" ? (
            <span className={cn("rounded-full bg-error", compact ? "size-2.5 mt-[3px]" : "size-[22px] flex items-center justify-center")}>{!compact && <Icon name="alert" size={12} strokeWidth={3} className="text-white" />}</span>
          ) : s.state === "current" ? (
            <span className={cn("flex items-center justify-center rounded-full border-cobalt bg-white", compact ? "size-2.5 mt-[3px] border-2" : "size-[22px] border-[2.5px]")}>{!compact && <span className="size-2 rounded-full bg-cobalt" />}</span>
          ) : (
            <span className={cn("rounded-full border-2 border-border bg-white", compact ? "size-2.5 mt-[3px]" : "size-[22px]")} />
          );
        return (
          <li key={i} className={cn("flex", compact ? "gap-2.5" : "gap-3")}>
            <div className="flex flex-col items-center">
              {node}
              {!last && <div className={cn("w-0.5 flex-1", compact ? "min-h-[10px]" : "min-h-[18px]", s.state === "done" ? "bg-ok" : "bg-border")} />}
            </div>
            <div className={cn(!last && (compact ? "pb-2.5" : "pb-3.5"), "min-w-0")}>
              <div className={cn(compact ? "text-[12px] font-semibold" : "text-[14px] font-semibold", s.state === "upcoming" && "text-text-3", s.state === "current" && compact && "text-cobalt")}>{s.title}</div>
              {s.meta && <div className="text-[12px] text-text-3">{s.meta}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
