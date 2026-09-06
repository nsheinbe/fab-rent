import type { Metadata } from "next";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { derivedBadge } from "@/lib/booking-state";
import { getProviderBooking, listProviderBookings, type BookingsTab } from "@/lib/queries/provider";
import { formatDateTime } from "@/lib/format";
import { TabChip } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/states";
import { BookingsTable, type TableRow } from "./table";
import { BookingPanel } from "./panel";

export const metadata: Metadata = { title: "Bookings" };

const TABS: Array<{ key: BookingsTab; label: string }> = [
  { key: "all", label: "All" }, { key: "requests", label: "Requests" }, { key: "upcoming", label: "Upcoming" }, { key: "active", label: "Active" }, { key: "returns", label: "Returns due" }, { key: "completed", label: "Completed" }, { key: "cancelled", label: "Cancelled" },
];

export default async function ProviderBookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; ref?: string }> }) {
  const [sp, actor, config] = await Promise.all([searchParams, requireProvider(), getLiveConfig()]);
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : "all") as BookingsTab;
  const nowAt = now();
  const tz = config.market.timezone;
  const { rows, counts, detail, provider } = await withActor(async (trx) => {
    const [{ rows, counts }, detail, provider] = await Promise.all([
      listProviderBookings(trx, actor.provider.id, { tab, q: sp.q, now: nowAt }),
      sp.ref ? getProviderBooking(trx, actor.provider.id, sp.ref) : Promise.resolve(null),
      trx.selectFrom("providers").select(["payout_schedule", "delivery_vans"]).where("id", "=", actor.provider.id).executeTakeFirstOrThrow(),
    ]);
    return { rows, counts, detail, provider };
  });
  const selected = detail?.ref ?? null;
  const table: TableRow[] = rows.map((b) => {
    const badge = derivedBadge({ status: b.status, start_at: b.start_at, end_at: b.end_at, fulfillment: b.fulfillment, prep_hours: b.listing.prep_hours || 2, late_grace_minutes: 60, now: nowAt, instant: b.instant, provider_response_minutes: null });
    const shownBadge = badge && b.status !== "requested" ? badge : b.status === "ready_for_pickup" ? { label: "Ready", tone: "cobalt" as const } : null;
    return {
      ref: b.ref, renter: b.renter.name,
      trust: b.renter.is_business ? `business · ${b.renter.id_verified ? "verified" : "unverified"}${b.renter.rentals ? ` · ${b.renter.rentals} rentals` : ""}` : b.renter.rentals ? `${b.renter.rating ? `★ ${b.renter.rating.toFixed(1)} · ` : ""}${b.renter.rentals} rentals` : `new${b.renter.id_verified ? " · ID verified" : ""}`,
      item: `${b.listing.title}${b.qty > 1 ? ` ×${b.qty}` : ""}`, unit: b.unit ? `Unit ${b.unit.unit_number} · ${b.unit.serial}` : "Unassigned",
      start: formatDateTime(b.start_at, tz).replace(" · ", " "), end: formatDateTime(b.end_at, tz).replace(" · ", " "), days: b.billed_days, fulfillment: b.fulfillment, status: b.status, badge: shownBadge, total_cents: b.charged_cents, start_ts: b.start_at.getTime(),
    };
  });
  const van = ((provider.delivery_vans as string[]) ?? [])[0] ?? "Van";
  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <div className="min-w-0 flex-1 px-4 py-4 md:px-6 lg:px-7">
        <div className="mb-3.5 flex gap-1.5 overflow-x-auto scrollbar-none">
          {TABS.map((t) => <TabChip key={t.key} href={`/provider/bookings?tab=${t.key}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${selected ? `&ref=${selected}` : ""}`} selected={tab === t.key} count={t.key === "all" || t.key === "completed" || t.key === "cancelled" ? undefined : counts[t.key] || undefined}>{t.label}</TabChip>)}
          {sp.q && <TabChip href={`/provider/bookings?tab=${tab}`} selected={false}>“{sp.q}” ×</TabChip>}
        </div>
        <BookingsTable rows={table} selected={selected} />
      </div>
      {detail ? (
        <div className="hidden xl:block"><BookingPanel b={detail} config={config} payoutSchedule={provider.payout_schedule} van={van} /></div>
      ) : (
        <aside className="hidden xl:flex w-[400px] flex-none items-center justify-center border-l border-border bg-paper p-6"><EmptyState compact icon="box" title="Select a booking" body="Unit assignment, payout, condition docs and actions show here." /></aside>
      )}
      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end bg-charcoal/30 xl:hidden">
          <div className="h-full w-full max-w-[440px] overflow-y-auto bg-paper"><BookingPanel b={detail} config={config} payoutSchedule={provider.payout_schedule} van={van} standalone /></div>
        </div>
      )}
    </div>
  );
}
