import { requireProvider, withActor } from "@/lib/auth";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/** P07 "Tax summary": gross, commission and net by month, plus sales tax collected by fab.rent on the provider's rentals. */
export async function GET() {
  const actor = await requireProvider();
  const rows = await withActor((trx) =>
    sql<{ month: string; gross: number; commission: number; net: number; tax: number; rentals: number }>`
      select to_char(date_trunc('month', e.entry_date), 'YYYY-MM') as month,
             coalesce(sum(e.gross_cents),0)::int as gross, coalesce(sum(e.commission_cents),0)::int as commission, coalesce(sum(e.net_cents),0)::int as net,
             coalesce(sum(case when b.price_snapshot is not null then (b.price_snapshot->>'tax_cents')::int else 0 end),0)::int as tax,
             count(*)::int as rentals
      from public.ledger_entries e left join public.bookings b on b.id = e.booking_id
      where e.provider_id = ${actor.provider.id}::uuid and e.type <> 'payout'
      group by 1 order by 1 desc`.execute(trx),
  );
  const head = ["month", "rentals", "gross", "commission", "net", "sales_tax_collected_by_fabrent"];
  const lines = rows.rows.map((r) => [r.month, r.rentals, (r.gross / 100).toFixed(2), (r.commission / 100).toFixed(2), (r.net / 100).toFixed(2), (r.tax / 100).toFixed(2)].join(","));
  return new Response([head.join(","), ...lines].join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fabrent-tax-summary.csv"`, "Cache-Control": "private, no-store" } });
}
