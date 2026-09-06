import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { adminReports } from "@/lib/queries/admin";
import { formatDateTime } from "@/lib/format";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/states";
import { ReportButtons } from "./report-buttons";

export const metadata: Metadata = { title: "Reports" };

export default async function AdminReportsPage() {
  const [, config] = await Promise.all([requireStaff(), getLiveConfig()]);
  const rows = await withActor((trx) => adminReports(trx));
  const tz = config.market.timezone;
  return (
    <div className="px-4 py-5 md:px-6 lg:px-7">
      {rows.length === 0 ? <EmptyState icon="alert" title="No reports" body="Renter reports on listings and bookings land here." /> : (
        <section className="card overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 border-b border-border px-5 py-3.5 last:border-b-0 md:flex-row md:items-center md:gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold capitalize">{r.kind.replace("_", " ")} · {r.listing_title ? <Link href={r.listing_id ? `/admin/listing-review?listing=${r.listing_id}` : "#"} className="text-charcoal no-underline hover:text-cobalt">{r.listing_title}</Link> : r.ref ? <Link href={`/rentals/${r.ref}`} className="t-mono text-charcoal no-underline hover:text-cobalt">{r.ref}</Link> : "—"}</div>
                <div className="text-[13px] text-text-2">{r.body}</div>
                <div className="text-[11px] text-text-3">{r.reporter ?? "Anonymous"} · {formatDateTime(r.created_at, tz)}</div>
              </div>
              <Pill tone={r.status === "open" ? "warn" : "neutral"} size="xs" dot={r.status === "open"}>{r.status}</Pill>
              {r.status === "open" && <ReportButtons reportId={r.id} />}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
