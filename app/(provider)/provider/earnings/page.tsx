import type { Metadata } from "next";
import Link from "next/link";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now, fmt } from "@/lib/time";
import { providerEarnings } from "@/lib/queries/provider";
import { formatDate, formatMoney } from "@/lib/format";
import { StatCard } from "@/components/domain/shells";
import { Pill } from "@/components/ui/pill";
import { KeyValueList } from "@/components/ui/side-panel";
import { PayoutSettings } from "./payout-settings";

export const metadata: Metadata = { title: "Earnings & payouts" };

const LEDGER_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "neutral" | "cobalt" | "error" }> = { available: { label: "Available", tone: "ok" }, pending: { label: "Pending", tone: "neutral" }, inspecting: { label: "Inspecting", tone: "neutral" }, held_claim: { label: "Claim open", tone: "warn" }, paid: { label: "Paid", tone: "cobalt" } };

export default async function EarningsPage() {
  const [actor, config] = await Promise.all([requireProvider(), getLiveConfig()]);
  const nowAt = now();
  const tz = config.market.timezone;
  const e = await withActor((trx) => providerEarnings(trx, actor.provider.id, nowAt));
  const schedule = e.provider.payout_schedule;
  const scheduleLabel = schedule === "daily" ? "Daily" : schedule.startsWith("monthly") ? "Monthly · 1st" : `Weekly · ${{ mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays", thu: "Thursdays", fri: "Fridays" }[schedule.split("_")[1] ?? "tue"] ?? "Tuesdays"}`;
  const maxWeek = Math.max(1, ...e.weeks.map((w) => w.rental + w.extras));
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 lg:px-7">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard dark label={`Available${e.next_payout ? ` · pays out ${formatDate(e.next_payout.scheduled_for, tz)}` : ""}`} value={formatMoney(e.available_cents)} mono sub={`${e.available_count} completed ${e.available_count === 1 ? "rental" : "rentals"} · to ${e.provider.payout_account_masked ?? "your account"}`} />
        <StatCard label="Pending clearance" value={formatMoney(e.pending_cents)} mono sub={`${e.active_count} active ${e.active_count === 1 ? "rental" : "rentals"} · clears at ${config.payouts.clears_at === "return_checkin" ? "return check-in" : "handoff"}`} />
        <StatCard label={`Paid out · ${fmt(nowAt, "MMMM", tz)}`} value={formatMoney(e.paid_month_cents)} mono sub={e.paid_month_count ? `On time · ${e.paid_month_count} ${e.paid_month_count === 1 ? "payout" : "payouts"} so far` : "No payouts yet this month"} subTone="ok" />
        <StatCard label="Held for open claims" value={formatMoney(e.held_cents)} mono sub={e.held_count ? `${e.held_ref ?? ""} · renter has ${config.holds.renter_response_hours} h to respond · then admin review` : "Nothing held"} subTone={e.held_count ? "warn" : "default"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card p-5">
          <div className="flex items-baseline justify-between"><h2 className="text-[15px] font-bold">Net earnings by week</h2><div className="flex gap-4 text-[11px] font-semibold text-text-2"><span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-[2px] bg-cobalt" />Rentals</span><span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-[2px] bg-cobalt/35" />Delivery &amp; extras</span></div></div>
          <div className="mt-4 flex h-[160px] items-end gap-1.5">
            {e.weeks.map((w) => {
              const total = w.rental + w.extras;
              return (
                <div key={w.week.toISOString()} className="flex flex-1 flex-col items-center gap-1" title={`${formatDate(w.week, tz)} · ${formatMoney(total)}`}>
                  <div className="flex w-full flex-col justify-end" style={{ height: 140 }}>
                    <div className="w-full rounded-t-[4px] bg-cobalt/35" style={{ height: `${(w.extras / maxWeek) * 140}px` }} />
                    <div className="w-full bg-cobalt" style={{ height: `${(Math.max(0, w.rental) / maxWeek) * 140}px` }} />
                  </div>
                  <div className="text-[9px] text-text-3">{fmt(w.week, "d MMM", tz)}</div>
                </div>
              );
            })}
            {e.weeks.length === 0 && <div className="w-full text-center text-[12px] text-text-3">No earnings in the last 12 weeks</div>}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="text-[15px] font-bold">Payout settings</h2>
          <KeyValueList size="sm" className="mt-3" rows={[{ k: "Schedule", v: scheduleLabel }, { k: "Account", v: e.provider.payout_account_masked ?? "Not set", tone: e.provider.payout_account_verified ? "default" : "warn" }, { k: "Clears", v: config.payouts.clears_at === "return_checkin" ? "At return check-in" : "At handoff" }, { k: "Commission", v: `${config.fees.provider_commission_pct}% of rental + extras` }, { k: "Tax ID", v: e.provider.tax_id ?? "Not set", tone: e.provider.tax_id_verified ? "default" : "warn" }]} />
          {e.provider.payouts_paused && <div className="mt-3 rounded-panel bg-warn-bg px-3 py-2 text-[12px] font-semibold text-warn-text">Payouts paused · {e.provider.payouts_paused_reason ?? "see settings"}</div>}
          <PayoutSettings providerId={actor.provider.id} schedule={schedule} schedules={config.payouts.schedules} account={e.provider.payout_account_masked} taxId={e.provider.tax_id} isOwner={actor.provider.role === "owner"} />
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[72px_112px_minmax(0,1fr)_96px_104px_120px_96px_110px] gap-3 border-b border-border bg-paper px-4 py-2.5 t-label text-text-3"><span>Date</span><span>Ref</span><span>Item · renter</span><span className="text-right">Gross</span><span className="text-right">Commission</span><span className="text-right">Adjust.</span><span className="text-right">Net</span><span>Status</span></div>
            {e.entries.map((row) => {
              const payout = row.type === "payout";
              const st = LEDGER_STATUS[row.status] ?? { label: row.status, tone: "neutral" as const };
              return (
                <div key={row.id} className={`grid grid-cols-[72px_112px_minmax(0,1fr)_96px_104px_120px_96px_110px] items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0 ${payout ? "bg-ivory/60" : ""}`}>
                  <span className="text-text-2">{formatDate(row.entry_date, tz).replace(/^\w+ /, "")}</span>
                  <span className="t-mono text-[12px]">{payout ? <span className="font-bold text-text-2">PAYOUT</span> : row.ref ? <Link href={`/provider/bookings?ref=${row.ref}`} className="text-charcoal no-underline hover:text-cobalt">{row.ref}</Link> : "—"}</span>
                  <span className="truncate-1">{payout ? `Weekly payout · ${row.rental_count ?? 0} rentals · ${row.account_masked ?? ""}` : row.description}</span>
                  <span className="t-mono text-right">{payout ? "—" : formatMoney(row.gross_cents)}</span>
                  <span className="t-mono text-right text-text-2">{payout ? "—" : row.commission_cents ? `−${formatMoney(Math.abs(row.commission_cents))}` : "—"}</span>
                  <span className={`t-mono text-right ${row.adjustment_cents > 0 ? "text-ok-text" : row.adjustment_cents < 0 ? "text-error-text" : "text-text-3"}`}>{row.adjustment_cents ? `${row.adjustment_cents > 0 ? "+" : "−"}${formatMoney(Math.abs(row.adjustment_cents))}${row.adjustment_label ? ` ${row.adjustment_label.replace(/^[+−-]\$?[\d.,]+\s*/, "")}` : ""}` : "—"}</span>
                  <span className="t-mono text-right font-medium">{formatMoney(row.net_cents)}</span>
                  <span><Pill tone={st.tone} size="xs" dot={st.tone !== "neutral"}>{st.label}</Pill></span>
                </div>
              );
            })}
            {e.entries.length === 0 && <div className="p-6 text-center text-[13px] text-text-3">No ledger entries yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
