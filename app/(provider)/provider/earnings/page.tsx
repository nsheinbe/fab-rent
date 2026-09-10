import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now, fmt, payoutScheduleLabel } from "@/lib/time";
import { providerEarnings } from "@/lib/queries/provider";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { StatCard } from "@/components/domain/shells";
import { Pill, type PillTone } from "@/components/ui/pill";
import { KeyValueList } from "@/components/ui/side-panel";
import { PAYOUT_ACCOUNT_STATUS_LABEL, TAX_ID_REQUIREMENT, payoutProviderName, type PayoutAccountStatus } from "@/lib/payouts";
import { providerPayoutState, startPayoutOnboarding, syncConnectAccount } from "@/lib/payouts/connect";
import { appUrl } from "@/lib/notifications/events";
import { PayoutAccountCard } from "./payout-account";

export const metadata: Metadata = { title: "Earnings & payouts" };

const LEDGER_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "neutral" | "cobalt" | "error" }> = { available: { label: "Available", tone: "ok" }, pending: { label: "Pending", tone: "neutral" }, inspecting: { label: "Inspecting", tone: "neutral" }, held_claim: { label: "Claim open", tone: "warn" }, paid: { label: "Paid", tone: "cobalt" } };
const ACCOUNT_TONE: Record<PayoutAccountStatus, PillTone> = { not_connected: "neutral", onboarding: "warn", restricted: "error", action_needed: "warn", pending_verification: "cobalt", verified: "ok" };

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const [actor, config, sp] = await Promise.all([requireProvider(), getLiveConfig(), searchParams]);
  const nowAt = now();
  const tz = config.market.timezone;
  const isOwner = actor.provider.role === "owner";
  // Back from hosted onboarding (Phase 7): an expired or reused link asks the provider for a fresh one; a return re-reads the account's real state first.
  if (sp.onboarding === "refresh" && isOwner) {
    const base = appUrl();
    const link = await withActor((trx) => startPayoutOnboarding(trx, actor.provider.id, { return_url: `${base}/provider/earnings?onboarding=return`, refresh_url: `${base}/provider/earnings?onboarding=refresh` }));
    redirect(link.url);
  }
  if (sp.onboarding === "return") {
    await withActor((trx) => syncConnectAccount(trx, actor.provider.id)).catch((e: Error) => console.warn("[payouts] sync on return failed:", e.message));
  }
  const [e, payout] = await withActor((trx) => Promise.all([providerEarnings(trx, actor.provider.id, nowAt), providerPayoutState(trx, actor.provider.id)]));
  const d = payout.derived;
  const schedule = e.provider.payout_schedule;
  const maxWeek = Math.max(1, ...e.weeks.map((w) => w.rental + w.extras));
  const taxLabel = d.tax_id_verified ? "Verified" : !d.connected ? "Not provided" : d.pending.some((p) => TAX_ID_REQUIREMENT.test(p.key)) ? "Pending verification" : d.details_submitted ? "Missing" : "Not provided";
  const accountLabel = d.account_masked ?? (d.connected ? "No bank account yet" : "Not connected");
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 lg:px-7">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard dark label={`Available${e.next_payout ? ` · pays out ${formatDate(e.next_payout.scheduled_for, tz)}` : ""}`} value={formatMoney(e.available_cents)} mono sub={`${e.available_count} completed ${e.available_count === 1 ? "rental" : "rentals"} · to ${d.account_masked ?? "your payout account"}`} />
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
        <section className="card p-5" data-testid="payout-account">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[15px] font-bold">Payout account</h2>
            <span data-testid="payout-account-status"><Pill tone={ACCOUNT_TONE[d.status]} size="xs" dot>{PAYOUT_ACCOUNT_STATUS_LABEL[d.status]}</Pill></span>
          </div>
          <KeyValueList
            size="sm"
            className="mt-3"
            rows={[
              { k: "Schedule", v: payoutScheduleLabel(schedule) },
              { k: "Account", v: accountLabel, tone: d.payout_account_verified ? "default" : "warn" },
              { k: "Clears", v: config.payouts.clears_at === "return_checkin" ? "At return check-in" : "At handoff" },
              { k: "Commission", v: `${config.fees.provider_commission_pct}% of rental + extras` },
              { k: "Tax ID", v: taxLabel, tone: d.tax_id_verified ? "default" : "warn" },
            ]}
          />
          {sp.onboarding === "return" && <div className="mt-3 rounded-panel bg-ivory px-3 py-2 text-[12px] text-text-2" data-testid="onboarding-returned">Payout account updated · {PAYOUT_ACCOUNT_STATUS_LABEL[d.status]}{d.reason ? ` · ${d.reason}` : ""}</div>}
          {d.payouts_paused && d.connected && <div className="mt-3 rounded-panel bg-warn-bg px-3 py-2 text-[12px] font-semibold text-warn-text" data-testid="payouts-paused">Payouts paused · {payout.provider.payouts_paused_reason ?? d.paused_reason ?? d.reason}</div>}
          {d.outstanding.length > 0 && (
            <div className="mt-3 text-[12px]">
              <div className="t-label text-text-3">Still needed</div>
              <ul className="mt-1 flex flex-col gap-1" data-testid="payout-requirements">
                {d.outstanding.map((o) => (
                  <li key={o.key} className="flex justify-between gap-2"><span>{o.label}</span><span className={o.error || o.past_due ? "font-semibold text-error-text" : "text-text-3"}>{o.error ?? (o.past_due ? "overdue" : "due")}</span></li>
                ))}
              </ul>
            </div>
          )}
          {d.pending.length > 0 && <p className="mt-2 text-[12px] text-text-3">Being verified: {d.pending.map((p) => p.label).join(" · ")}</p>}
          {d.deadline && <p className="mt-1 text-[12px] text-text-3">Due by {formatDate(d.deadline, tz)}</p>}
          <PayoutAccountCard providerId={actor.provider.id} status={d.status} isOwner={isOwner} hosted={payoutProviderName()} schedule={schedule} schedules={config.payouts.schedules} />
          {payout.account?.last_synced_at && <p className="mt-2 text-[11px] text-text-3">Account state read {formatDateTime(payout.account.last_synced_at, tz)}</p>}
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[72px_112px_minmax(0,1fr)_96px_104px_120px_96px_110px] gap-3 border-b border-border bg-paper px-4 py-2.5 t-label text-text-3"><span>Date</span><span>Ref</span><span>Item · renter</span><span className="text-right">Gross</span><span className="text-right">Commission</span><span className="text-right">Adjust.</span><span className="text-right">Net</span><span>Status</span></div>
            {e.entries.map((row) => {
              const payoutRow = row.type === "payout";
              const st = LEDGER_STATUS[row.status] ?? { label: row.status, tone: "neutral" as const };
              return (
                <div key={row.id} className={`grid grid-cols-[72px_112px_minmax(0,1fr)_96px_104px_120px_96px_110px] items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0 ${payoutRow ? "bg-ivory/60" : ""}`}>
                  <span className="text-text-2">{formatDate(row.entry_date, tz).replace(/^\w+ /, "")}</span>
                  <span className="t-mono text-[12px]">{payoutRow ? <span className="font-bold text-text-2">PAYOUT</span> : row.ref ? <Link href={`/provider/bookings?ref=${row.ref}`} className="text-charcoal no-underline hover:text-cobalt">{row.ref}</Link> : "—"}</span>
                  <span className="truncate-1">{payoutRow ? (row.description?.startsWith("Payout reversed") ? row.description : `Weekly payout · ${row.rental_count ?? 0} rentals · ${row.account_masked ?? ""}`) : row.description}</span>
                  <span className="t-mono text-right">{payoutRow ? "—" : formatMoney(row.gross_cents)}</span>
                  <span className="t-mono text-right text-text-2">{payoutRow ? "—" : row.commission_cents ? `−${formatMoney(Math.abs(row.commission_cents))}` : "—"}</span>
                  <span className={`t-mono text-right ${row.adjustment_cents > 0 ? "text-ok-text" : row.adjustment_cents < 0 ? "text-error-text" : "text-text-3"}`}>{row.adjustment_cents ? `${row.adjustment_cents > 0 ? "+" : "−"}${formatMoney(Math.abs(row.adjustment_cents))}${row.adjustment_label ? ` ${row.adjustment_label.replace(/^[+−-]\$?[\d.,]+\s*/, "")}` : ""}` : "—"}</span>
                  <span className="t-mono text-right font-medium">{row.net_cents < 0 ? `−${formatMoney(Math.abs(row.net_cents))}` : formatMoney(row.net_cents)}</span>
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
