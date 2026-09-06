import type { Metadata } from "next";
import { addDays } from "date-fns";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now, marketLocal } from "@/lib/time";
import { providerCalendar, weekStart } from "@/lib/queries/provider";
import { CalendarGrid, type CalRow } from "./grid";

export const metadata: Metadata = { title: "Calendar" };

type View = "day" | "week" | "month";

export default async function ProviderCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; start?: string; category?: string; prep?: string }> }) {
  const [sp, actor, config] = await Promise.all([searchParams, requireProvider(), getLiveConfig()]);
  const tz = config.market.timezone;
  const view: View = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const nowAt = now();
  const anchor = sp.start ? marketLocal(`${sp.start}T00:00:00`, tz) : nowAt;
  const ws = weekStart(anchor); // market-local Monday 00:00 as a wall-clock Date
  const startLocal = view === "day" ? new Date(anchor) : ws;
  if (view === "day") startLocal.setHours(0, 0, 0, 0);
  const days = view === "day" ? 1 : view === "week" ? 7 : 28;
  const startIso = `${startLocal.getFullYear()}-${String(startLocal.getMonth() + 1).padStart(2, "0")}-${String(startLocal.getDate()).padStart(2, "0")}`;
  const from = marketLocal(`${startIso}T00:00:00`, tz);
  const to = addDays(from, days);
  const { rows, categories } = await withActor((trx) => providerCalendar(trx, actor.provider.id, from, to, sp.category || null));
  const serial: CalRow[] = rows.map((r) => ({ listing: r.listing, unit: r.unit, bookings: r.bookings.map((b) => ({ ...b, start_at: b.start_at.toISOString(), end_at: b.end_at.toISOString() })), blocks: r.blocks.map((k) => ({ ...k, start_at: k.start_at.toISOString(), end_at: k.end_at.toISOString() })) }));
  return <CalendarGrid rows={serial} categories={categories} view={view} startIso={startIso} days={days} tz={tz} category={sp.category ?? ""} showPrep={sp.prep === "1"} nowIso={nowAt.toISOString()} />;
}
