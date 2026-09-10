import type { Metadata } from "next";
import { requireStaff, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { adminPayouts } from "@/lib/queries/admin";
import { formatDate, formatMoney } from "@/lib/format";
import { payoutProviderName, stripeKeyMode } from "@/lib/payouts";
import { Pill } from "@/components/ui/pill";
import { StatCard } from "@/components/domain/shells";
import { PayoutButtons } from "./payout-buttons";
import { RunPayoutsButton } from "./run-payouts-button";

export const metadata: Metadata = { title: "Payouts" };
const TONE: Record<string, "ok" | "warn" | "error" | "neutral" | "cobalt"> = { paid: "neutral", scheduled: "cobalt", paused: "warn", failed: "error" };

export default async function AdminPayoutsPage() {
  const [, config] = await Promise.all([requireStaff(), getLiveConfig()]);
  const rows = await withActor((trx) => adminPayouts(trx));
  const tz = config.market.timezone;
  const scheduled = rows.filter((r) => r.status === "scheduled");
  const exceptions = rows.filter((r) => r.status === "failed" || r.status === "paused");
  const provider = payoutProviderName();
  const mode = provider === "stripe" ? (stripeKeyMode(process.env.STRIPE_SECRET_KEY) === "live" ? "live mode" : "test mode") : "test mode";
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 lg:px-7">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Scheduled" value={formatMoney(scheduled.reduce((s, r) => s + r.amount_cents, 0))} mono sub={`${scheduled.length} payouts · next ${scheduled[0] ? formatDate(scheduled[scheduled.length - 1]!.scheduled_for, tz) : "—"}`} />
        <StatCard label="Exceptions" value={exceptions.length} sub={exceptions.length ? `${formatMoney(exceptions.reduce((s, r) => s + r.amount_cents, 0))} held` : "none"} subTone={exceptions.length ? "error" : "default"} />
        <StatCard label="Pause rules" value={config.payouts.pause_when.length} sub={config.payouts.pause_when.map((p) => p.replace("_", " ")).join(" · ")} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-text-3" data-testid="payout-provider-mode">
          Transfers via <span className="font-semibold text-charcoal">{provider === "stripe" ? "Stripe Connect" : "the demo payout provider"} · {mode}</span> · cleared earnings go out on each provider&apos;s schedule · minimum {formatMoney(config.payouts.min_payout_cents)}
        </div>
        <RunPayoutsButton />
      </div>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto"><div className="min-w-[860px]">
          <div className="grid grid-cols-[minmax(0,1.4fr)_100px_90px_110px_minmax(0,1.6fr)_110px_150px] gap-3 border-b border-border bg-paper px-4 py-2.5 t-label text-text-3"><span>Provider</span><span className="text-right">Amount</span><span>Rentals</span><span>Scheduled</span><span>Exception</span><span>Status</span><span /></div>
          {rows.map((r) => {
            const account = !r.account_ref ? "payout account not connected" : r.payouts_paused_reason ? r.payouts_paused_reason : r.payouts_enabled ? "account verified" : "verification incomplete";
            return (
              <div key={r.id} className="grid grid-cols-[minmax(0,1.4fr)_100px_90px_110px_minmax(0,1.6fr)_110px_150px] items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0" data-testid="payout-row" data-provider={r.provider_slug} data-status={r.status}>
                <div className="min-w-0"><div className="truncate-1 font-semibold">{r.provider}</div><div className="truncate-1 text-[11px] text-text-3" data-testid="payout-row-account">{r.account_masked ?? "no bank account"} · {account}</div></div>
                <span className="t-mono text-right">{formatMoney(r.amount_cents)}</span>
                <span className="text-text-2">{r.rental_count}</span>
                <span className="text-text-2">{formatDate(r.scheduled_for, tz)}</span>
                <span className="truncate-1 text-text-2" data-testid="payout-row-exception">{r.exception ? `${r.exception}${r.exception_detail ? ` · ${r.exception_detail}` : ""}` : r.paid_at ? `paid ${formatDate(r.paid_at, tz)}${r.transfer_ref ? ` · ${r.transfer_ref}` : ""}` : "—"}</span>
                <Pill tone={TONE[r.status] ?? "neutral"} size="xs" dot={r.status !== "paid"}>{r.status}</Pill>
                <PayoutButtons payoutId={r.id} status={r.status} />
              </div>
            );
          })}
          {rows.length === 0 && <div className="p-6 text-center text-[13px] text-text-3">No payouts yet.</div>}
        </div></div>
      </section>
    </div>
  );
}
