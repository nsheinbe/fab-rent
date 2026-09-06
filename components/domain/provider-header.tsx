"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { HeaderSearch } from "./shells";

interface Props {
  greeting: string;
  sub: string;
  bookingsThisQuarter: number;
  monthLabel: string;
}

/** 64 px header for /provider/*: title per section, search where the design has one, primary action on the right. */
export function ProviderHeader(props: Props) {
  return (
    <Suspense fallback={<div className="text-[16px] font-extrabold">Provider</div>}>
      <Inner {...props} />
    </Suspense>
  );
}

function Inner({ greeting, sub, bookingsThisQuarter, monthLabel }: Props) {
  const pathname = usePathname() ?? "/provider";
  const params = useSearchParams();
  let left: ReactNode;
  let right: ReactNode = null;
  if (pathname === "/provider") {
    left = <div className="min-w-0"><div className="truncate-1 text-[17px] font-extrabold tracking-[-0.01em]">{greeting}</div><div className="truncate-1 text-[12px] text-text-3">{sub}</div></div>;
    right = (
      <>
        <HeaderSearch placeholder="Search bookings, renters, serials" action="/provider/bookings" defaultValue={params.get("q") ?? undefined} />
        <Button size="md" href="/provider/listings/new" leading={<Icon name="plus" size={14} strokeWidth={2.5} />}>New listing</Button>
      </>
    );
  } else if (pathname.startsWith("/provider/bookings")) {
    left = <div className="text-[17px] font-extrabold tracking-[-0.01em]">Bookings <span className="font-semibold text-text-3">· {bookingsThisQuarter} this quarter</span></div>;
    right = (
      <>
        <HeaderSearch placeholder="Ref, renter, item, serial" action="/provider/bookings" defaultValue={params.get("q") ?? undefined} />
        <span className="hidden rounded-control border border-border bg-white px-3 py-2 text-[13px] font-semibold md:inline-flex">{monthLabel}</span>
        <Button size="md" variant="secondary" href={`/api/provider/bookings.csv${params.get("tab") ? `?tab=${params.get("tab")}` : ""}`} leading={<Icon name="download" size={14} />}>Export</Button>
      </>
    );
  } else if (pathname.startsWith("/provider/listings/")) {
    left = <div className="text-[13px] font-semibold text-text-3"><Link href="/provider/listings" className="text-text-3 no-underline hover:text-charcoal">Listings</Link> <span className="mx-1">›</span> <span className="text-charcoal">{pathname.endsWith("/new") ? "New listing" : "Edit listing"}</span></div>;
  } else if (pathname.startsWith("/provider/listings")) {
    left = <div className="text-[17px] font-extrabold tracking-[-0.01em]">Listings</div>;
    right = (
      <>
        <HeaderSearch placeholder="Search listings" action="/provider/listings" defaultValue={params.get("q") ?? undefined} />
        <Button size="md" href="/provider/listings/new" leading={<Icon name="plus" size={14} strokeWidth={2.5} />}>New listing</Button>
      </>
    );
  } else if (pathname.startsWith("/provider/calendar")) {
    left = <div className="text-[17px] font-extrabold tracking-[-0.01em]">Calendar</div>;
  } else if (pathname.startsWith("/provider/earnings")) {
    left = <div className="text-[17px] font-extrabold tracking-[-0.01em]">Earnings &amp; payouts</div>;
    right = (
      <>
        <span className="hidden rounded-control border border-border bg-white px-3 py-2 text-[13px] font-semibold md:inline-flex">Last 12 weeks</span>
        <Button size="md" variant="secondary" href="/api/provider/ledger.csv" leading={<Icon name="download" size={14} />}>Download CSV</Button>
        <Button size="md" variant="secondary" href="/api/provider/tax-summary.csv">Tax summary</Button>
      </>
    );
  } else {
    const title = pathname.startsWith("/provider/inventory") ? "Inventory" : pathname.startsWith("/provider/inbox") ? "Messages" : pathname.startsWith("/provider/reviews") ? "Reviews" : pathname.startsWith("/provider/settings") ? "Settings" : "Provider";
    left = <div className="text-[17px] font-extrabold tracking-[-0.01em]">{title}</div>;
  }
  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className="md:hidden text-charcoal" aria-label="fab.rent home"><Icon name="back" size={20} /></Link>
        {left}
      </div>
      <div className="flex items-center gap-2.5">{right}</div>
    </>
  );
}
