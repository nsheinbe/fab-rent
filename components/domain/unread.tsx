"use client";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const UnreadContext = createContext(0);

/** Unread message count for the signed-in renter, provided once by the renter layout. */
export function UnreadProvider({ count, children }: { count: number; children: ReactNode }) {
  return <UnreadContext.Provider value={count}>{children}</UnreadContext.Provider>;
}

export function useUnread() {
  return useContext(UnreadContext);
}

/** Count pill next to "Inbox" (desktop nav and the mobile tab bar). Renders nothing when everything is read. */
export function InboxBadge({ className }: { className?: string }) {
  const n = useUnread();
  if (n <= 0) return null;
  return (
    <span className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-cobalt px-1.5 text-[10px] font-bold leading-none text-white", className)} aria-label={`${n} unread ${n === 1 ? "message" : "messages"}`}>
      {n > 9 ? "9+" : n}
    </span>
  );
}
