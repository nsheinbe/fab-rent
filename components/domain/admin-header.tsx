"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { HeaderSearch } from "./shells";

interface Props {
  dateLine: string;
  peakLine: string;
  userCounts: { renters: number; providers: number; staff: number };
  reviewCount: number;
}

export function AdminHeader(props: Props) {
  return (
    <Suspense fallback={<div className="text-[16px] font-extrabold">Admin</div>}>
      <Inner {...props} />
    </Suspense>
  );
}

function Inner({ dateLine, peakLine, userCounts, reviewCount }: Props) {
  const pathname = usePathname() ?? "/admin";
  const params = useSearchParams();
  let left: ReactNode;
  let right: ReactNode = null;
  if (pathname === "/admin") {
    left = <div className="min-w-0"><div className="truncate-1 text-[17px] font-extrabold tracking-[-0.01em]">{dateLine}</div><div className="truncate-1 text-[12px] text-text-3">{peakLine}</div></div>;
    right = <><HeaderSearch placeholder="Booking ref, user, listing, payout ID" action="/admin/bookings" width={300} /><span className="hidden rounded-control border border-border bg-white px-3 py-2 text-[13px] font-semibold md:inline-flex">Last 30 days</span></>;
  } else if (pathname.startsWith("/admin/users")) {
    left = <div className="text-[17px] font-extrabold tracking-[-0.01em]">Users <span className="font-semibold text-text-3">· {userCounts.renters} renters · {userCounts.providers} providers · {userCounts.staff} staff</span></div>;
    right = <><HeaderSearch placeholder="Name, email, phone, ID" action="/admin/users" defaultValue={params.get("q") ?? undefined} /><Button size="md" variant="secondary" href="mailto:ops@fab.rent?subject=Invite%20staff" leading={<Icon name="plus" size={14} />}>Invite staff</Button></>;
  } else if (pathname.startsWith("/admin/listing-review")) {
    left = <div className="text-[17px] font-extrabold tracking-[-0.01em]">Review queue <span className="font-semibold text-text-3">· {reviewCount}</span></div>;
    right = <span className="hidden rounded-control border border-border bg-white px-3 py-2 text-[13px] font-semibold md:inline-flex">Oldest first</span>;
  } else if (pathname.startsWith("/admin/disputes/")) {
    left = <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-text-3"><Link href="/admin/disputes" className="text-text-3 no-underline hover:text-charcoal">Disputes</Link><span>›</span><span className="t-mono text-charcoal">{pathname.split("/").pop()}</span></div>;
  } else if (pathname.startsWith("/admin/disputes")) {
    left = <div className="text-[17px] font-extrabold tracking-[-0.01em]">Disputes</div>;
  } else if (pathname.startsWith("/admin/settings")) {
    left = <div className="text-[17px] font-extrabold tracking-[-0.01em]">Marketplace settings</div>;
  } else {
    const title = pathname.startsWith("/admin/bookings") ? "Bookings" : pathname.startsWith("/admin/payouts") ? "Payouts" : pathname.startsWith("/admin/reports") ? "Reports" : "Admin";
    left = <div className="text-[17px] font-extrabold tracking-[-0.01em]">{title}</div>;
    if (title === "Bookings") right = <HeaderSearch placeholder="Ref, renter, provider, item" action="/admin/bookings" defaultValue={params.get("q") ?? undefined} />;
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
