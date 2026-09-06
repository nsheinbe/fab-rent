import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { listProviderBookings, type BookingsTab } from "@/lib/queries/provider";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** P02 "Export": the current tab as CSV. */
export async function GET(req: Request) {
  const actor = await requireProvider();
  const config = await getLiveConfig();
  const url = new URL(req.url);
  const tab = (url.searchParams.get("tab") ?? "all") as BookingsTab;
  const { rows } = await withActor((trx) => listProviderBookings(trx, actor.provider.id, { tab, now: now(), limit: 2000 }));
  const tz = config.market.timezone;
  const head = ["ref", "status", "renter", "item", "unit", "serial", "start", "end", "billed_days", "qty", "fulfillment", "charged", "provider_gross", "commission", "payout", "hold", "hold_status"];
  const lines = rows.map((b) => [b.ref, b.status, b.renter.name, b.listing.title, b.unit?.unit_number ?? "", b.unit?.serial ?? "", formatDateTime(b.start_at, tz), formatDateTime(b.end_at, tz), b.billed_days, b.qty, b.fulfillment, (b.charged_cents / 100).toFixed(2), (b.price_snapshot.provider.gross_cents / 100).toFixed(2), (b.price_snapshot.provider.commission_cents / 100).toFixed(2), (b.price_snapshot.provider.payout_cents / 100).toFixed(2), (b.hold_cents / 100).toFixed(2), b.hold_status].map(cell).join(","));
  return new Response([head.join(","), ...lines].join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fabrent-bookings-${tab}.csv"`, "Cache-Control": "private, no-store" } });
}
