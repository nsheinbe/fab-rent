import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { adminDisputes } from "@/lib/queries/admin";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Pill, TabChip } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Disputes" };
const STATUS: Record<string, { label: string; tone: "warn" | "error" | "neutral" | "cobalt" }> = { awaiting_decision: { label: "Awaiting decision", tone: "warn" }, more_evidence: { label: "More evidence", tone: "cobalt" }, appealed: { label: "Appealed", tone: "error" }, resolved: { label: "Resolved", tone: "neutral" } };

export default async function DisputesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [sp, , config] = await Promise.all([searchParams, requireStaff(), getLiveConfig()]);
  const nowAt = now();
  const tz = config.market.timezone;
  const all = await withActor((trx) => adminDisputes(trx, nowAt));
  const filter = sp.status && STATUS[sp.status] ? sp.status : "open";
  const rows = filter === "open" ? all.filter((d) => d.status !== "resolved") : all.filter((d) => d.status === filter);
  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 lg:px-7">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        <TabChip href="/admin/disputes" selected={filter === "open"} count={all.filter((d) => d.status !== "resolved").length}>Open</TabChip>
        {Object.entries(STATUS).map(([k, v]) => <TabChip key={k} href={`/admin/disputes?status=${k}`} selected={filter === k} count={all.filter((d) => d.status === k).length || undefined}>{v.label}</TabChip>)}
      </div>
      {rows.length === 0 ? <EmptyState icon="shield" title="Nothing here" body="Disputes appear when a renter contests a claim within the response window." /> : (
        <section className="card overflow-hidden">
          {rows.map((d) => {
            const st = STATUS[d.status] ?? { label: d.status, tone: "neutral" as const };
            const left = d.sla_minutes_left;
            return (
              <Link key={d.id} href={`/admin/disputes/${d.code}`} className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-5 py-3 text-charcoal no-underline last:border-b-0 hover:bg-white/60 md:grid-cols-[84px_minmax(0,1.6fr)_minmax(0,1fr)_120px_130px]">
                <span className="t-mono text-[13px] font-medium">{d.code}</span>
                <div className="min-w-0"><div className="truncate-1 text-[13px] font-semibold">{d.summary}</div><div className="truncate-1 text-[12px] text-text-3">{d.parties} · {d.ref}{d.assignee ? ` · ${d.assignee.split(" ")[0]}` : ""}</div></div>
                <div className="hidden truncate-1 text-[12px] text-text-2 md:block">{d.last_event}{d.last_event_at ? ` · ${formatDateTime(d.last_event_at, tz).replace(" · ", " ")}` : ""}</div>
                <div className="hidden text-[12px] md:block">{d.status === "resolved" ? <span className="text-text-2">{d.charged_cents != null ? `${formatMoney(d.charged_cents)} charged` : "—"}</span> : <span className={left < 0 ? "font-semibold text-error-text" : left < 6 * 60 ? "font-semibold text-warn-text" : "text-text-2"}>{left < 0 ? `SLA passed ${Math.round(-left / 60)} h` : `${Math.round(left / 60)} h left`}</span>}</div>
                <Pill tone={st.tone} size="xs" dot={st.tone !== "neutral"}>{st.label}</Pill>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
