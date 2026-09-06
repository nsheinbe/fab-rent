import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** P07 "Download CSV": the full ledger for this provider. */
export async function GET() {
  const actor = await requireProvider();
  const config = await getLiveConfig();
  const rows = await withActor((trx) => trx.selectFrom("ledger_entries as e").leftJoin("bookings as b", "b.id", "e.booking_id").select(["e.entry_date", "e.type", "e.description", "e.gross_cents", "e.commission_cents", "e.adjustment_cents", "e.adjustment_label", "e.net_cents", "e.status", "b.ref"]).where("e.provider_id", "=", actor.provider.id).orderBy("e.entry_date", "desc").execute());
  const head = ["date", "type", "ref", "description", "gross", "commission", "adjustment", "adjustment_label", "net", "status"];
  const lines = rows.map((r) => [formatDate(r.entry_date, config.market.timezone), r.type, r.ref ?? "", r.description ?? "", (r.gross_cents / 100).toFixed(2), (r.commission_cents / 100).toFixed(2), (r.adjustment_cents / 100).toFixed(2), r.adjustment_label ?? "", (r.net_cents / 100).toFixed(2), r.status].map(cell).join(","));
  return new Response([head.join(","), ...lines].join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fabrent-ledger.csv"`, "Cache-Control": "private, no-store" } });
}
