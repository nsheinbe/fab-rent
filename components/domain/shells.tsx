"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/avatar";
import { Logo, AppIcon } from "./logo";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  count?: number | null;
  countTone?: "cobalt" | "neutral" | "error";
  exact?: boolean;
}

function NavLink({ item, dark, collapsed }: { item: NavItem; dark?: boolean; collapsed?: boolean }) {
  const pathname = usePathname() ?? "";
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
  const badge =
    item.count != null && item.count > 0 ? (
      <span className={cn("ml-auto flex h-5 min-w-5 items-center justify-center rounded-pill px-1.5 text-[11px] font-bold", item.countTone === "error" ? "bg-error text-white" : item.countTone === "cobalt" ? "bg-cobalt text-white" : dark ? "bg-white/15 text-white" : "bg-ivory-deep text-charcoal")}>
        {item.count}
      </span>
    ) : null;
  if (collapsed) {
    return (
      <Link href={item.href} title={item.label} aria-label={item.label} aria-current={active ? "page" : undefined} className={cn("relative flex h-[38px] w-10 items-center justify-center rounded-control no-underline", dark ? (active ? "bg-white/12 text-white" : "text-on-dark-muted hover:text-white") : active ? "bg-ivory-deep text-charcoal" : "text-text-2 hover:text-charcoal")}>
        <Icon name={item.icon} />
        {item.count ? <span className={cn("absolute right-1 top-1 size-2 rounded-full", item.countTone === "error" ? "bg-error" : "bg-cobalt")} /> : null}
      </Link>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-[38px] items-center gap-2.5 rounded-control px-2.5 text-[14px] font-semibold no-underline", dark ? (active ? "bg-white/10 text-white" : "text-on-dark-muted hover:text-white") : active ? "bg-ivory-deep text-charcoal" : "text-text-2 hover:text-charcoal")}>
      <Icon name={item.icon} />
      {item.label}
      {badge}
    </Link>
  );
}

export interface ShellProps {
  nav: NavItem[];
  header: ReactNode;
  children: ReactNode;
  /** org/user block at the bottom of the nav */
  footer: ReactNode;
  variant: "provider" | "admin";
  /** collapse to the 64 px icon rail (used on dense pages like bookings/calendar) */
  collapsed?: boolean;
  /** route prefixes that collapse the rail automatically (P02/P03/P04/P07 show the "f." rail) */
  collapseOn?: string[];
  contentClassName?: string;
}

/**
 * ProviderShell (paper left nav, 228 px) and AdminShell (charcoal left nav, 220 px) share one layout:
 * left nav with count badges → 64 px header → content. Both collapse to a 64 px icon rail.
 */
export function Shell({ nav, header, children, footer, variant, collapsed: forced, collapseOn, contentClassName }: ShellProps) {
  const dark = variant === "admin";
  const pathname = usePathname() ?? "";
  const collapsed = forced ?? (collapseOn?.some((p) => pathname.startsWith(p)) ?? false);
  return (
    <div className={cn("flex min-h-screen bg-ivory")}>
      <aside className={cn("sticky top-0 hidden h-screen flex-none flex-col md:flex", dark ? "bg-charcoal text-white" : "border-r border-border bg-paper", collapsed ? "w-16 items-center py-5" : dark ? "w-[220px] px-3 pt-5 pb-4" : "w-[228px] px-3 pt-5 pb-4")} aria-label={`${variant} navigation`}>
        {collapsed ? (
          <>
            <Link href={variant === "admin" ? "/admin" : "/provider"} className="mb-3 no-underline" aria-label="Home">
              <AppIcon size={36} variant={dark ? "light" : "cobalt"} />
            </Link>
            <nav className="flex flex-col items-center gap-1.5">
              {nav.map((n) => (
                <NavLink key={n.href} item={n} dark={dark} collapsed />
              ))}
            </nav>
          </>
        ) : (
          <>
            <div className="px-2.5 pb-5">
              <Logo size={22} href={variant === "admin" ? "/admin" : "/provider"} onDark={dark} />
              <div className={cn("t-label", dark ? "text-[#9B978E]" : "text-text-3")}>{variant === "admin" ? "Admin" : "Provider"}</div>
            </div>
            <nav className="flex flex-col gap-0.5">
              {nav.map((n) => (
                <NavLink key={n.href} item={n} dark={dark} />
              ))}
            </nav>
            <div className="mt-auto">{footer}</div>
          </>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 flex-none items-center justify-between gap-4 border-b border-border bg-paper px-4 md:px-6 lg:px-7">{header}</header>
        {/* below md the side nav is hidden: sections become a scrollable chip row */}
        <MobileSectionNav nav={nav} dark={dark} />
        <main className={cn("flex-1 min-w-0", contentClassName)}>{children}</main>
      </div>
    </div>
  );
}

/** Org / user block in the provider nav (avatar, name, role, accepting-bookings switch). */
export function OrgBlock({ name, sub, avatarTone = "charcoal", children }: { name: string; sub: string; avatarTone?: "charcoal" | "cobalt" | "light" | "ivory"; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-panel border border-border bg-ivory p-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar name={name} size={34} tone={avatarTone} />
        <div className="min-w-0">
          <div className="text-[13px] font-bold truncate-1">{name}</div>
          <div className="text-[11px] text-text-3 truncate-1">{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function StaffBlock({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-panel bg-white/6 p-2.5">
      <Avatar name={name} size={34} tone="light" />
      <div className="min-w-0">
        <div className="text-[13px] font-bold truncate-1 text-white">{name}</div>
        <div className="text-[11px] text-[#9B978E] truncate-1">{sub}</div>
      </div>
    </div>
  );
}

/** 38 px header search box. */
export function HeaderSearch({ placeholder, width = 260, name = "q", defaultValue, action }: { placeholder: string; width?: number; name?: string; defaultValue?: string; action?: string }) {
  return (
    <form action={action} className="relative hidden md:block" style={{ width }}>
      <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} className="h-[38px] w-full rounded-control border border-border bg-white pl-9 pr-3 text-[13px] placeholder:text-placeholder outline-none focus:border-cobalt" aria-label={placeholder} />
    </form>
  );
}

/** Stat card: label · big number · sub line. `dark` variant for the primary metric. */
export function StatCard({ label, value, sub, dark, subTone, mono, className, children }: { label: ReactNode; value: ReactNode; sub?: ReactNode; dark?: boolean; subTone?: "ok" | "error" | "warn" | "default"; mono?: boolean; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-card-sm px-4 py-3.5", dark ? "bg-charcoal text-white" : "border border-border bg-white", className)}>
      <div className={cn("t-label", dark ? "text-on-dark-muted" : "text-text-3")}>{label}</div>
      <div className={cn("text-[30px] font-extrabold leading-none tracking-[-0.02em]", mono && "t-mono")}>{value}</div>
      {sub && <div className={cn("text-[12px]", dark ? (subTone === "error" ? "text-[#FFB4AB] font-semibold" : "text-on-dark-muted") : subTone === "ok" ? "font-semibold text-ok-text" : subTone === "error" ? "font-semibold text-error-text" : subTone === "warn" ? "font-semibold text-warn-text" : "text-text-3")}>{sub}</div>}
      {children}
    </div>
  );
}

function MobileSectionNav({ nav, dark }: { nav: NavItem[]; dark: boolean }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className={cn("flex gap-1.5 overflow-x-auto scrollbar-none border-b px-3 py-2 md:hidden", dark ? "border-white/10 bg-charcoal" : "border-border bg-paper")} aria-label="Sections">
      {nav.map((n) => {
        const active = n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("inline-flex h-8 flex-none items-center gap-1.5 rounded-pill px-3 text-[12px] font-semibold no-underline", active ? (dark ? "bg-white text-charcoal" : "bg-charcoal text-white") : dark ? "bg-white/10 text-white" : "border border-border bg-white text-charcoal")}>
            <Icon name={n.icon} size={13} />
            {n.label}
            {n.count ? <span className={cn("rounded-pill px-1.5 text-[10px] font-bold", active ? "bg-white/20" : n.countTone === "error" ? "bg-error text-white" : "bg-cobalt text-white")}>{n.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
