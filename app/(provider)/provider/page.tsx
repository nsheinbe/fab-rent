import type { Metadata } from "next";
import Link from "next/link";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now, fmt } from "@/lib/time";
import { providerDashboard, providerStats, shortTitle, type TodayItem } from "@/lib/queries/provider";
import { formatDate, formatDateRange, formatDateTime, formatMoney, formatMoneyCompact, formatTime } from "@/lib/format";
import { StatCard } from "@/components/domain/shells";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { DecisionButtons } from "./decision-buttons";
import { TodayList } from "./today-list";
import { MessageRenterButton } from "./bookings/panel-actions";

export const metadata: Metadata = { title: "Dashboard" };

export default async function ProviderDashboard() {
  const actor = await requireProvider();
  const config = await getLiveConfig();
  const nowAt = now();
  const tz = config.market.timezone;
  const { provider, dash, stats } = await withActor(async (trx) => {
    const provider = await trx.selectFrom("providers").select(["name", "delivery_vans", "on_time_pct", "response_minutes", "payout_account_masked"]).where("id", "=", actor.provider.id).executeTakeFirstOrThrow();
    const vans = (provider.delivery_vans as string[]) ?? [];
    const [dash, stats] = await Promise.all([providerDashboard(trx, actor.provider.id, nowAt, vans), providerStats(trx, actor.provider.id, nowAt)]);
    return { provider, dash, stats };
  });
  const needsCount = dash.needs.requests.length + dash.needs.extensions.length + dash.needs.overdue.length;
  const handoffs = dash.today.filter((t) => t.kind === "pickup" || t.kind === "delivery");
  const returns = dash.today.filter((t) => t.kind === "return" || t.kind === "collection");
  const pickups = handoffs.filter((t) => t.kind === "pickup").length;
  const deliveries = handoffs.filter((t) => t.kind === "delivery").length;
  const done = handoffs.filter((t) => t.state.tone === "ok").length;
  const overdueReturns = returns.filter((t) => t.state.tone === "error");
  const monthName = fmt(nowAt, "MMMM", tz);
  const lastMonth = fmt(new Date(nowAt.getFullYear(), nowAt.getMonth() - 1, 1), "MMM", tz);
  const maxWeek = Math.max(1, ...stats.weeks.map((w) => w.net));
  const channels = [...new Set(dash.today.map((t) => t.channel))];

  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 lg:px-7">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Needs action" value={needsCount} sub={[dash.needs.requests.length && `${dash.needs.requests.length} ${dash.needs.requests.length === 1 ? "request" : "requests"}`, dash.needs.extensions.length && `${dash.needs.extensions.length} extension${dash.needs.extensions.length === 1 ? "" : "s"}`, dash.needs.overdue.length && `${dash.needs.overdue.length} overdue`].filter(Boolean).join(" · ") || "All clear"} subTone={dash.needs.overdue.length ? "error" : "default"} />
        <StatCard label="Handoffs today" value={handoffs.length} sub={handoffs.length ? `${pickups} ${pickups === 1 ? "pickup" : "pickups"} · ${deliveries} ${deliveries === 1 ? "delivery" : "deliveries"} · ${done} done` : "Nothing scheduled"} />
        <StatCard label="Returns due today" value={returns.length} sub={overdueReturns.length ? `${overdueReturns.length} overdue · ${shortTitle(overdueReturns[0]!.booking.listing.title)}` : returns.length ? "All on schedule" : "None due"} subTone={overdueReturns.length ? "error" : "default"} />
        <StatCard label="Units available" value={<>{Math.max(0, stats.units_total - stats.units_out - stats.units_maintenance)} <span className="text-[16px] font-bold text-text-3">/ {stats.units_total}</span></>} sub={`${stats.units_out} out on rentals · ${stats.units_maintenance} in maintenance`} />
        <StatCard dark label={`Earnings · ${monthName}`} value={formatMoneyCompact(stats.month_net_cents)} sub={stats.month_delta_pct == null ? "net of fees" : `${stats.month_delta_pct >= 0 ? "+" : ""}${stats.month_delta_pct}% vs same days in ${lastMonth}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-[15px] font-bold">Needs your action</h2>
              <Link href="/provider/bookings?tab=requests" className="text-[13px] font-semibold text-cobalt no-underline">Open bookings</Link>
            </div>
            {needsCount === 0 && <div className="px-5 py-8 text-center text-[13px] text-text-3">Nothing waiting on you. Requests, extensions and overdue returns land here.</div>}
            {dash.needs.requests.map((b) => (
              <NeedRow key={b.id} pill={{ label: "Request", tone: "warn" }} title={`${shortTitle(b.listing.title)}${b.qty > 1 ? ` · ${b.qty} ${b.qty === 1 ? "unit" : "units"}` : ""} · ${formatDateRange(b.start_at, b.end_at, { tz })}${b.fulfillment === "delivery" && b.delivery_area ? ` · delivery to ${b.delivery_area}` : ""}`} meta={`${b.renter.name} · ${renterTrust(b.renter)} · ${b.fulfillment} · ${formatMoney(b.charged_cents)} · ${b.ref}`} href={`/provider/bookings?tab=requests&ref=${b.ref}`}>
                <DecisionButtons bookingRef={b.ref} kind="booking" size="sm" />
              </NeedRow>
            ))}
            {dash.needs.extensions.map((b) => (
              <NeedRow key={`x-${b.id}`} pill={{ label: "Extension", tone: "cobalt" }} title={`${shortTitle(b.listing.title)} · +${b.extension!.extra_days} ${b.extension!.extra_days === 1 ? "day" : "days"} → ${formatDateTime(b.extension!.new_end_at, tz).replace(" · ", " ")}`} meta={`${b.renter.name} · +${formatMoney(b.extension!.amount_cents)} to renter · ${b.ref}`} href={`/provider/bookings?ref=${b.ref}`}>
                <DecisionButtons bookingRef={b.ref} kind="extension" size="sm" />
              </NeedRow>
            ))}
            {dash.needs.overdue.map((b) => {
              const late = Math.max(0, Math.round((nowAt.getTime() - (b.return_due_at ?? b.end_at).getTime()) / 60_000));
              return (
                <NeedRow key={`o-${b.id}`} pill={{ label: "Overdue", tone: "error" }} title={`${shortTitle(b.listing.title)} · due ${formatTime(b.return_due_at ?? b.end_at, tz)}, now ${late >= 60 ? `${Math.floor(late / 60)} h ${late % 60} min` : `${late} min`} late`} meta={`${b.renter.name} · ${b.fulfillment} return · ${formatMoney(0)}`.replace(` · ${formatMoney(0)}`, "") + ` · ${b.ref}`} href={`/provider/bookings?tab=returns&ref=${b.ref}`}>
                  <MessageRenterButton bookingRef={b.ref} size="sm" variant="secondary">Message</MessageRenterButton>
                  {b.renter.phone && <Button size="sm" href={`tel:${b.renter.phone.replace(/\s+/g, "")}`}>Call</Button>}
                </NeedRow>
              );
            })}
          </section>

          <section className="card overflow-hidden">
            <TodayList items={dash.today.map(serializeToday)} channels={channels} tz={tz} />
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section className="card p-5">
            <div className="flex items-baseline justify-between"><h2 className="text-[15px] font-bold">Earnings · last 8 weeks</h2><span className="text-[12px] text-text-3">net of fees</span></div>
            <div className="mt-4 flex h-[110px] items-end gap-1.5">
              {stats.weeks.map((w) => (
                <div key={w.week.toISOString()} className="flex flex-1 flex-col items-center gap-1" title={`${formatDate(w.week, tz)} · ${formatMoney(w.net)}`}>
                  <div className="w-full rounded-t-[4px] bg-cobalt" style={{ height: `${Math.max(4, Math.round((w.net / maxWeek) * 90))}px`, opacity: 0.35 + 0.65 * (w.net / maxWeek) }} />
                  <div className="text-[9px] text-text-3">{fmt(w.week, "d MMM", tz).replace(/ (\w+)$/, (m, mo: string) => (w.week.getDate() <= 7 ? ` ${mo}` : ""))}</div>
                </div>
              ))}
              {stats.weeks.length === 0 && <div className="w-full text-center text-[12px] text-text-3">No cleared earnings yet</div>}
            </div>
            <div className="mt-4 rounded-panel bg-ivory px-3.5 py-3">
              <div className="flex items-baseline justify-between"><span className="text-[12px] font-semibold text-text-2">Next payout{stats.next_payout ? ` · ${formatDate(stats.next_payout.scheduled_for, tz)}` : ""}</span>{stats.next_payout?.status === "paused" && <Pill tone="warn" size="xs">Paused</Pill>}</div>
              <div className="t-mono text-[22px] font-medium leading-tight">{formatMoney(stats.next_payout?.amount_cents ?? 0)}</div>
              <div className="text-[12px] text-text-3">to {stats.next_payout?.account ?? provider.payout_account_masked ?? "your account"}</div>
              <div className="mt-1 text-[12px] text-text-3">{formatMoney(stats.pending_cents)} pending clearance</div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-[15px] font-bold">Inventory health</h2>
            <ul className="mt-3 flex flex-col divide-y divide-border text-[13px]">
              <Health label="In maintenance" value={`${stats.units_maintenance} ${stats.units_maintenance === 1 ? "unit" : "units"}`} tone={stats.units_maintenance ? "warn" : "default"} />
              <Health label="Fully booked next 7 days" value={stats.fully_booked.length ? stats.fully_booked.join(" · ") : "—"} />
              <Health label="Service due this week" value={stats.service_due.length ? stats.service_due.join(" · ") : "—"} tone={stats.service_due.length ? "warn" : "default"} />
              <Health label="Listings with no photos" value={String(stats.listings_no_photos)} tone={stats.listings_no_photos ? "error" : "default"} />
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="text-[15px] font-bold">Rating · 30 days</h2>
            <div className="mt-2 text-[22px] font-extrabold tracking-[-0.01em]">★ {stats.rating_30d ? stats.rating_30d.toFixed(2) : "—"} <span className="text-[13px] font-semibold text-text-3">· {stats.rating_30d_count} {stats.rating_30d_count === 1 ? "review" : "reviews"}</span></div>
            <div className="mt-2 flex gap-4 text-[12px] text-text-2">
              <span className="flex items-center gap-1"><Icon name="check" size={12} className="text-ok-text" />{provider.on_time_pct ? `${Math.round(Number(provider.on_time_pct))}% on-time handoffs` : "on-time rate pending"}</span>
              <span className="flex items-center gap-1"><Icon name="clock" size={12} />~{provider.response_minutes ?? 60} min response</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function renterTrust(r: { rating: number | null; rentals: number; id_verified: boolean; is_business: boolean }) {
  if (r.is_business) return `business${r.id_verified ? " verified" : ""}${r.rentals ? ` · ${r.rentals} rentals` : ""}`;
  if (r.rentals === 0) return `new renter${r.id_verified ? " · ID verified" : ""}`;
  return `${r.rentals} ${r.rentals === 1 ? "rental" : "rentals"}${r.rating ? ` · ★ ${r.rating.toFixed(1)}` : ""}`;
}

function NeedRow({ pill, title, meta, href, children }: { pill: { label: string; tone: "warn" | "cobalt" | "error" }; title: string; meta: string; href: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-5 py-3.5 last:border-b-0 md:flex-row md:items-center">
      <Pill tone={pill.tone} size="sm" className="w-fit">{pill.label}</Pill>
      <Link href={href} className="min-w-0 flex-1 text-charcoal no-underline hover:text-charcoal">
        <div className="truncate-1 text-[14px] font-semibold">{title}</div>
        <div className="truncate-1 text-[12px] text-text-3">{meta}</div>
      </Link>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Health({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "error" }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <span className="text-text-2">{label}</span>
      <span className={`text-right font-semibold ${tone === "warn" ? "text-warn-text" : tone === "error" ? "text-error-text" : ""}`}>{value}</span>
    </li>
  );
}

function serializeToday(t: TodayItem) {
  return { ref: t.booking.ref, kind: t.kind, at: t.at.toISOString(), channel: t.channel, state: t.state, title: shortTitle(t.booking.listing.title), qty: t.booking.qty, renter: t.booking.renter.name, where: t.booking.fulfillment === "delivery" ? [t.booking.delivery_address, t.booking.delivery_area].filter(Boolean).join(", ") : null };
}
