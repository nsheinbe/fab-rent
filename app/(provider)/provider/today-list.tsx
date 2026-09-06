"use client";
import Link from "next/link";
import { useState } from "react";
import { Pill } from "@/components/ui/pill";
import { TabChip } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icons";
import { formatTime } from "@/lib/format";

export interface TodayRow {
  ref: string;
  kind: "delivery" | "pickup" | "return" | "collection";
  at: string;
  channel: string;
  state: { label: string; tone: "ok" | "cobalt" | "warn" | "error" | "neutral" };
  title: string;
  qty: number;
  renter: string;
  where: string | null;
}

/** P01 "Today's handoffs & returns": All · Van 1 · Counter filter, time-ordered rows. */
export function TodayList({ items, channels, tz }: { items: TodayRow[]; channels: string[]; tz: string }) {
  const [filter, setFilter] = useState<string>("all");
  const shown = items.filter((i) => filter === "all" || i.channel === filter);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-[15px] font-bold">Today&apos;s handoffs &amp; returns</h2>
        <div className="flex gap-1.5">
          <TabChip selected={filter === "all"} onClick={() => setFilter("all")} count={items.length}>All</TabChip>
          {channels.map((c) => <TabChip key={c} selected={filter === c} onClick={() => setFilter(c)}>{c}</TabChip>)}
        </div>
      </div>
      {shown.length === 0 && <div className="px-5 py-8 text-center text-[13px] text-text-3">Nothing on the board{filter !== "all" ? ` for ${filter}` : " today"}.</div>}
      {shown.map((i) => {
        const outbound = i.kind === "delivery" || i.kind === "pickup";
        const label = i.kind === "delivery" ? "Delivery" : i.kind === "pickup" ? "Pickup" : i.kind === "collection" ? "Collection" : "Return";
        return (
          <Link key={`${i.ref}-${i.kind}`} href={`/provider/bookings?ref=${i.ref}`} className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-5 py-3 text-charcoal no-underline last:border-b-0 hover:bg-ivory/60 md:grid-cols-[52px_minmax(0,1fr)_88px_auto]">
            <div className="t-mono text-[13px] font-medium">{formatTime(new Date(i.at), tz)}</div>
            <div className="min-w-0">
              <div className="truncate-1 text-[13px]"><b>{label}</b> · {i.title}{i.qty > 1 ? ` ×${i.qty}` : ""} {outbound ? "→" : "←"} {i.renter}{i.where ? `, ${i.where}` : ""}</div>
              <div className="truncate-1 text-[11px] text-text-3 md:hidden">{i.channel}</div>
            </div>
            <div className="hidden items-center gap-1.5 text-[12px] font-semibold text-text-2 md:flex"><Icon name={i.channel.toLowerCase().startsWith("van") ? "van" : "box"} size={14} />{i.channel}</div>
            <Pill tone={i.state.tone} size="sm" dot={i.state.tone !== "neutral"}>{i.state.label}</Pill>
          </Link>
        );
      })}
    </>
  );
}
