"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/icons";
import { InboxBadge } from "./unread";

const TABS: Array<{ href: string; label: string; icon: IconName; match: (p: string) => boolean }> = [
  { href: "/", label: "Explore", icon: "compass", match: (p) => p === "/" || p.startsWith("/search") || p.startsWith("/listings") || p.startsWith("/categories") },
  { href: "/saved", label: "Saved", icon: "heart", match: (p) => p.startsWith("/saved") },
  { href: "/rentals", label: "Rentals", icon: "box", match: (p) => p.startsWith("/rentals") || p.startsWith("/bookings") },
  { href: "/inbox", label: "Inbox", icon: "message", match: (p) => p.startsWith("/inbox") },
  { href: "/profile", label: "Profile", icon: "user", match: (p) => p.startsWith("/profile") },
];

/** Explore · Saved · Rentals · Inbox · Profile — mobile only, hidden on lg+. */
export function BottomTabBar({ badges }: { badges?: Partial<Record<string, boolean>> }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-border bg-paper px-2 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden" aria-label="Primary">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link key={t.href} href={t.href} className={cn("relative flex w-16 flex-col items-center gap-[3px] text-[10px] font-semibold no-underline", active ? "text-cobalt hover:text-cobalt" : "text-text-3 hover:text-charcoal")} aria-current={active ? "page" : undefined}>
            <Icon name={t.icon} size={24} />
            {t.label}
            {t.label === "Inbox" && <InboxBadge className="absolute -top-1 right-2.5 border-2 border-paper" />}
            {badges?.[t.label] && <span className="absolute right-3.5 -top-0.5 size-2 rounded-full border-2 border-paper bg-error" aria-label="Attention" />}
          </Link>
        );
      })}
    </nav>
  );
}
