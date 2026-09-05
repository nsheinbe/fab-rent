import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Right-hand detail panel: paper background, header/body/footer, sticky within the page grid. */
export function SidePanel({ header, children, footer, className, width = 400 }: { header: ReactNode; children: ReactNode; footer?: ReactNode; className?: string; width?: number }) {
  return (
    <aside className={cn("flex min-h-0 flex-col border-l border-border bg-paper", className)} style={{ width }} aria-label="Details">
      <div className="border-b border-border px-5 py-4">{header}</div>
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5">{children}</div>
      {footer && <div className="flex-none border-t border-border px-5 pt-3.5 pb-[18px]">{footer}</div>}
    </aside>
  );
}

/** Label + white box list used inside panels (Unit & fulfillment, Money, Verification). */
export function PanelSection({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      <div className="t-label text-text-3">{label}</div>
      {children}
    </section>
  );
}

export function KeyValueList({ rows, className, size = "md" }: { rows: Array<{ k: ReactNode; v: ReactNode; tone?: "ok" | "error" | "warn" | "default" }>; className?: string; size?: "md" | "sm" }) {
  return (
    <div className={cn("card-sm !rounded-panel flex flex-col gap-1.5 px-3 py-2.5", size === "sm" ? "text-[12px]" : "text-[13px]", className)}>
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span className="text-text-2">{r.k}</span>
          <span className={cn("text-right font-semibold", r.tone === "ok" && "text-ok-text", r.tone === "error" && "text-error-text", r.tone === "warn" && "text-warn-text")}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}
