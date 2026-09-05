import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { RenterHeader, MobileHeader } from "./renter-header";

/**
 * Frame for the signed-in renter screens (rentals, detail, inbox, review, saved, profile).
 * Mobile: the M10–M14 page header. Desktop: the W01 top nav plus a centred column — the web
 * designs stop at checkout (W04), so this is the documented interpretation (CLAUDE.md #15).
 */
export function RenterPage({ user, title, subtitle, back, right, mono, children, width = 720, className, desktopTitle = true }: { user: { name: string } | null; title: ReactNode; subtitle?: ReactNode; back?: string | true; right?: ReactNode; mono?: boolean; children: ReactNode; width?: number; className?: string; desktopTitle?: boolean }) {
  return (
    <>
      <RenterHeader user={user} variant="home" />
      <main className={cn("mx-auto flex w-full flex-1 flex-col lg:pt-8 lg:pb-16", className)} style={{ maxWidth: width }}>
        <MobileHeader title={title} subtitle={subtitle} back={back} right={right} mono={mono} className="lg:hidden" />
        {desktopTitle && (
          <div className="hidden lg:flex items-end justify-between gap-4 px-6">
            <div className="min-w-0">
              <h1 className="text-[26px] font-extrabold tracking-[-0.02em] leading-tight">{title}</h1>
              {subtitle && <div className={cn("mt-1 text-[13px] text-text-3", mono && "t-mono")}>{subtitle}</div>}
            </div>
            {right}
          </div>
        )}
        {children}
      </main>
    </>
  );
}
