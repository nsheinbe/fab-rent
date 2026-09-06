import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { adminOverview } from "@/lib/queries/admin";
import { formatDateTime, formatMoney, formatMoneyCompact, formatTime, formatDate } from "@/lib/format";
import { StatCard } from "@/components/domain/shells";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { PayoutButtons } from "./payouts/payout-buttons";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  const [, config] = await Promise.all([requireStaff(), getLiveConfig()]);
  const nowAt = now();
  const tz = config.market.timezone;
  const o = await withActor((trx) => adminOverview(trx, nowAt));
  const sla = (mins: number) => (mins >= 0 ? { label: `${Math.round(mins / 60)} h left`, tone: mins < 6 * 60 ? ("warn" as const) : ("neutral" as const) } : { label: `SLA passed ${Math.round(-mins / 60)} h`, tone: "error" as const });
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 lg:px-7">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard dark label="GMV · 30 d" value={formatMoneyCompact(o.gmv_cents)} sub={o.gmv_delta_pct == null ? "no prior period" : `${o.gmv_delta_pct >= 0 ? "+" : ""}${o.gmv_delta_pct}% vs prior 30 d`} />
        <StatCard label="Bookings · 30 d" value={o.bookings.toLocaleString()} sub={`avg ${formatMoney(o.avg_booking_cents, { whole: true })} · ${o.avg_days.toFixed(1)} days`} />
        <StatCard label="Net revenue" value={formatMoneyCompact(o.net_revenue_cents)} sub={`${o.take_rate_pct}% blended take`} />
        <StatCard label="Open disputes" value={o.disputes.length} sub={o.disputes_past_sla ? `${o.disputes_past_sla} past ${config.holds.admin_decision_sla_hours} h SLA` : "all within SLA"} subTone={o.disputes_past_sla ? "error" : "default"} />
        <StatCard label="Listings to review" value={o.reviews.length} sub={o.reviews_over_24h ? `${o.reviews_over_24h} waiting > 24 h` : "none over 24 h"} subTone={o.reviews_over_24h ? "warn" : "default"} />
        <StatCard label="Flagged users" value={o.flagged.length} sub={[o.flagged_chargebacks && `${o.flagged_chargebacks} chargeback`, o.flagged_id && `${o.flagged_id} ID ${o.flagged_id === 1 ? "mismatch" : "mismatches"}`].filter(Boolean).join(" · ") || "no flags"} subTone={o.flagged.length ? "warn" : "default"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5"><h2 className="text-[15px] font-bold">Disputes awaiting decision</h2><Link href="/admin/disputes" className="text-[13px] font-semibold text-cobalt no-underline">All {o.disputes.length}</Link></div>
            {o.disputes.length === 0 && <div className="px-5 py-8 text-center text-[13px] text-text-3">No open disputes.</div>}
            {o.disputes.slice(0, 5).map((d) => {
              const s = sla(d.sla_minutes_left);
              return (
                <div key={d.id} className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-5 py-3 last:border-b-0 md:grid-cols-[84px_minmax(0,1fr)_150px_110px_auto]">
                  <span className="t-mono text-[13px] font-medium">{d.code}</span>
                  <div className="min-w-0"><div className="truncate-1 text-[13px] font-semibold">{d.summary}</div><div className="truncate-1 text-[12px] text-text-3">{d.parties} · {d.ref}</div></div>
                  <div className="hidden text-[12px] text-text-2 md:block">{d.last_event}{d.last_event_at ? ` ${formatDate(d.last_event_at, tz) === formatDate(nowAt, tz) ? formatTime(d.last_event_at, tz) : formatDate(d.last_event_at, tz).split(" ")[0]}` : ""}</div>
                  <div className="hidden md:block"><Pill tone={s.tone} size="xs" dot={s.tone !== "neutral"}>{s.label}</Pill></div>
                  <Button size="sm" variant="secondary" href={`/admin/disputes/${d.code}`}>Review</Button>
                </div>
              );
            })}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5"><h2 className="text-[15px] font-bold">Listing review</h2><Link href="/admin/listing-review" className="text-[13px] font-semibold text-cobalt no-underline">Queue · {o.reviews.length}</Link></div>
              {o.reviews.slice(0, 4).map((r) => (
                <Link key={r.id} href={`/admin/listing-review/${r.id}`} className="flex items-center gap-3 border-b border-border px-5 py-3 text-charcoal no-underline last:border-b-0 hover:bg-white/60">
                  <div className="min-w-0 flex-1"><div className="truncate-1 text-[13px] font-semibold">{r.title} · {r.provider.split(" ").slice(0, 2).join(" ")}</div><div className={`truncate-1 text-[12px] ${r.summary.includes("passed") ? "text-ok-text" : "text-text-3"}`}>{r.summary}</div></div>
                  <span className={`t-mono text-[12px] ${r.waiting_hours > 24 ? "font-semibold text-error-text" : "text-text-3"}`}>{r.waiting_hours} h</span>
                </Link>
              ))}
              {o.reviews.length === 0 && <div className="px-5 py-6 text-center text-[13px] text-text-3">Queue is empty.</div>}
            </section>
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5"><h2 className="text-[15px] font-bold">Payout exceptions</h2><Link href="/admin/payouts" className="text-[13px] font-semibold text-cobalt no-underline">{o.payout_exceptions.length}</Link></div>
              {o.payout_exceptions.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1"><div className="truncate-1 text-[13px] font-semibold">{p.provider} · {formatMoney(p.amount_cents)}</div><div className="truncate-1 text-[12px] text-text-3">{p.exception}{p.exception_detail ? ` · ${p.exception_detail}` : ""}</div></div>
                  <PayoutButtons payoutId={p.id} status={p.status} compact />
                </div>
              ))}
              {o.payout_exceptions.length === 0 && <div className="px-5 py-6 text-center text-[13px] text-text-3">All payouts on schedule.</div>}
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <section className="card p-5">
            <h2 className="text-[15px] font-bold">Marketplace health · 30 d</h2>
            <ul className="mt-3 flex flex-col divide-y divide-border text-[13px]">
              <Metric label="Search → booking" value="—" hint="analytics land in Phase 4" />
              <Metric label="On-time handoffs" value={o.health.on_time_pct == null ? "—" : `${o.health.on_time_pct}%`} />
              <Metric label={`Holds released ≤${config.holds.auto_release_business_days} business days`} value={o.health.released_fast_pct == null ? "—" : `${o.health.released_fast_pct}%`} />
              <Metric label="Bookings ending in a claim" value={o.health.claim_pct == null ? "—" : `${o.health.claim_pct}%`} />
              <Metric label="Cancellations (renter · provider)" value={o.health.renter_cancel_pct == null ? "—" : `${o.health.renter_cancel_pct}% · ${o.health.provider_cancel_pct}%`} />
            </ul>
          </section>
          <section className="card p-5">
            <h2 className="text-[15px] font-bold">Recent admin actions</h2>
            <ul className="mt-3 flex flex-col gap-2 text-[13px]">
              {o.actions.map((a) => <li key={a.id} className="flex justify-between gap-3"><span className="min-w-0 truncate-1"><b>{a.actor_name}</b> {a.action}</span><span className="flex-none text-[12px] text-text-3">{formatDate(a.occurred_at, tz) === formatDate(nowAt, tz) ? formatTime(a.occurred_at, tz) : formatDateTime(a.occurred_at, tz).replace(/ \d+ \w+ · /, " ")}</span></li>)}
              {o.actions.length === 0 && <li className="text-text-3">Nothing yet.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"><span className="text-text-2">{label}{hint ? <span className="ml-1 text-[11px] text-text-3">· {hint}</span> : null}</span><span className="t-mono font-medium">{value}</span></li>;
}
