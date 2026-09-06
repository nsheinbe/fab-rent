"use client";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { BottomTabBar } from "./bottom-tab-bar";
import { UnreadProvider } from "./unread";

/** Routes that show the bottom tab bar on mobile (M01 home, M02 results, M10 rentals + the other tab roots). Flow screens hide it. */
function showsTabBar(pathname: string, view: string | null) {
  if (pathname === "/") return true;
  if (pathname === "/search") return view !== "map";
  return ["/saved", "/rentals", "/inbox", "/profile"].includes(pathname);
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const params = useSearchParams();
  const tabs = showsTabBar(pathname, params.get("view"));
  return (
    <div id="main" tabIndex={-1} className={cn("flex min-h-screen flex-col outline-none", tabs && "pb-[76px] lg:pb-0")}>
      {children}
      {tabs && <BottomTabBar />}
    </div>
  );
}

export function RenterShell({ children, unread = 0 }: { children: React.ReactNode; unread?: number }) {
  return (
    <UnreadProvider count={unread}>
      <Suspense fallback={<div id="main" className="flex min-h-screen flex-col">{children}</div>}>
        <Shell>{children}</Shell>
      </Suspense>
    </UnreadProvider>
  );
}
