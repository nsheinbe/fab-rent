import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icons";
import { InboxBadge } from "./unread";

export interface RenterHeaderProps {
  user: { name: string } | null;
  /** the desktop search bar (client component) */
  search?: ReactNode;
  variant?: "home" | "search" | "checkout" | "plain";
  className?: string;
  checkoutLabel?: string;
  signInNext?: string;
}

/** Desktop top nav (W01–W04). Hidden below lg; mobile screens use their own headers and the bottom tab bar. */
export function RenterHeader({ user, search, variant = "home", className, checkoutLabel, signInNext }: RenterHeaderProps) {
  return (
    <header className={cn("hidden lg:flex h-16 flex-none items-center justify-between gap-6 border-b border-border bg-paper px-10", className)}>
      <div className="flex items-center gap-9">
        <div className="flex items-center gap-4">
          <Logo size={22} />
          {variant === "checkout" && (
            <>
              <span className="h-5 w-px bg-border" />
              <span className="text-[14px] font-semibold text-text-2">{checkoutLabel ?? "Checkout"}</span>
            </>
          )}
        </div>
        {variant === "home" && (
          <nav className="flex gap-6 text-[14px] font-semibold text-text-2" aria-label="Sections">
            <Link href="/" className="text-charcoal no-underline hover:text-charcoal">Explore</Link>
            <Link href="/search" className="text-text-2 no-underline hover:text-charcoal">Categories</Link>
            <Link href="/#how" className="text-text-2 no-underline hover:text-charcoal">How it works</Link>
            <Link href="/provider" className="text-text-2 no-underline hover:text-charcoal">For providers</Link>
          </nav>
        )}
      </div>
      {search && <div className="flex flex-1 justify-center">{search}</div>}
      <div className="flex items-center gap-2.5">
        {variant === "checkout" && user ? (
          <span className="flex items-center gap-2 text-[12px] font-semibold text-text-2"><Icon name="lock" size={14} className="text-ok-text" />Secure · signed in as {user.name}</span>
        ) : user ? (
          <>
            <Link href="/rentals" className="text-[13px] font-semibold text-text-2 no-underline hover:text-charcoal">Rentals</Link>
            <Link href="/inbox" className="flex items-center gap-1.5 text-[13px] font-semibold text-text-2 no-underline hover:text-charcoal">Inbox<InboxBadge /></Link>
            <Link href="/profile" className="no-underline" aria-label="Profile"><Avatar name={user.name} size={36} tone="cobalt" /></Link>
          </>
        ) : (
          <Link href={`/auth${signInNext ? `?next=${encodeURIComponent(signInNext)}` : ""}`} className="flex h-[38px] items-center rounded-pill border border-border-strong bg-white px-4 text-[13px] font-semibold text-charcoal no-underline hover:bg-ivory">Sign in</Link>
        )}
      </div>
    </header>
  );
}

/** Mobile page header: back arrow, title, subtitle, optional right slot. */
export function MobileHeader({ title, subtitle, back, right, className, mono }: { title: ReactNode; subtitle?: ReactNode; back?: string | true; right?: ReactNode; className?: string; mono?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 px-5 pt-[max(14px,env(safe-area-inset-top))] pb-0", className)}>
      {back && (
        <BackLink href={typeof back === "string" ? back : undefined} />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-extrabold tracking-[-0.01em] leading-tight truncate-1">{title}</div>
        {subtitle && <div className={cn("text-[12px] text-text-3 truncate-1", mono && "t-mono")}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function BackLink({ href, className, round }: { href?: string; className?: string; round?: boolean }) {
  const inner = <Icon name="back" size={round ? 18 : 22} />;
  const cls = cn(round ? "flex size-10 items-center justify-center rounded-full border border-border bg-white" : "flex size-8 items-center justify-center -ml-1", "text-charcoal no-underline hover:text-charcoal", className);
  if (href) return <Link href={href} aria-label="Back" className={cls}>{inner}</Link>;
  return <BackButton className={cls}>{inner}</BackButton>;
}

import { BackButton } from "./back-button";
