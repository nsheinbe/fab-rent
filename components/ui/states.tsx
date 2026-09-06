import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function SkeletonCard({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("card p-4 flex gap-3", className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="size-[92px] flex-none rounded-control" />
      <div className="flex-1 flex flex-col gap-2 pt-1">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-3/4" : i === 1 ? "w-1/2" : "w-1/3")} />
        ))}
      </div>
    </div>
  );
}

/** Route-level loading skeleton (loading.tsx): a title bar and a few cards in the page column. */
export function PageSkeleton({ width = 760, cards = 3, className }: { width?: number; cards?: number; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-3 px-5 pt-[max(14px,env(safe-area-inset-top))] lg:px-6 lg:pt-8", className)} style={{ maxWidth: width }} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-3 w-64" />
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i} rows={i === cards - 1 ? 2 : 3} className="mt-1" />
      ))}
    </div>
  );
}

/** Empty state in the design language: ivory-deep well, icon, one line, optional action. */
export function EmptyState({ icon = "box", title, body, action, className, compact }: { icon?: IconName; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-card-sm border border-dashed border-border-strong bg-ivory text-center", compact ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-10", className)}>
      <span className="flex size-10 items-center justify-center rounded-control bg-ivory-deep text-text-3">
        <Icon name={icon} size={18} />
      </span>
      <div className="text-[14px] font-bold">{title}</div>
      {body && <div className="max-w-[360px] text-[12px] leading-[1.5] text-text-3">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body, action, className }: { title?: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-2 rounded-card-sm border border-error/30 bg-error-wash px-6 py-8 text-center", className)}>
      <span className="flex size-10 items-center justify-center rounded-control bg-error-bg text-error-text">
        <Icon name="alert" size={18} />
      </span>
      <div className="text-[14px] font-bold text-error-text">{title}</div>
      {body && <div className="max-w-[360px] text-[12px] leading-[1.5] text-text-2">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, className, size = "md" }: { children: ReactNode; action?: ReactNode; className?: string; size?: "md" | "lg" }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <h2 className={size === "lg" ? "text-[18px] font-bold tracking-[-0.01em]" : "text-[16px] font-bold"}>{children}</h2>
      {action}
    </div>
  );
}
