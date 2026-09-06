import type { Metadata } from "next";
import Link from "next/link";
import { requireProvider, withActor } from "@/lib/auth";
import { listProviderListings } from "@/lib/queries/provider";
import { formatRate } from "@/lib/format";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Listings" };

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "neutral" | "error" | "cobalt" }> = {
  published: { label: "Published", tone: "ok" }, draft: { label: "Draft", tone: "neutral" }, pending_review: { label: "In review", tone: "warn" }, changes_requested: { label: "Changes requested", tone: "warn" }, rejected: { label: "Rejected", tone: "error" }, hidden: { label: "Hidden", tone: "neutral" },
};

export default async function ProviderListingsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [sp, actor] = await Promise.all([searchParams, requireProvider()]);
  const all = await withActor((trx) => listProviderListings(trx, actor.provider.id));
  const q = sp.q?.trim().toLowerCase();
  const rows = q ? all.filter((l) => l.title.toLowerCase().includes(q) || l.category.toLowerCase().includes(q)) : all;
  const groups = [
    { label: "Needs attention", rows: rows.filter((l) => ["changes_requested", "rejected", "draft"].includes(l.status) || l.photo_count === 0) },
    { label: "In review", rows: rows.filter((l) => l.status === "pending_review") },
    { label: "Live", rows: rows.filter((l) => ["published", "hidden"].includes(l.status) && l.photo_count > 0) },
  ].filter((g) => g.rows.length);
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 lg:px-7">
      {rows.length === 0 && <EmptyState icon="tag" title={q ? "No listings match" : "No listings yet"} body={q ? "Try another search." : "Your first listing takes about ten minutes: photos, specs, units by serial, pricing."} action={<Button size="md" href="/provider/listings/new">New listing</Button>} />}
      {groups.map((g) => (
        <section key={g.label} className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3"><h2 className="text-[14px] font-bold">{g.label}</h2><span className="text-[12px] text-text-3">{g.rows.length}</span></div>
          {g.rows.map((l, i) => {
            const s = STATUS[l.status] ?? { label: l.status, tone: "neutral" as const };
            return (
              <Link key={l.id} href={`/provider/listings/${l.id}`} className={`grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 text-charcoal no-underline hover:bg-ivory/60 md:grid-cols-[56px_minmax(0,2fr)_minmax(0,1fr)_100px_90px_auto] ${i < g.rows.length - 1 ? "border-b border-border" : ""}`}>
                <div className="relative size-14 overflow-hidden rounded-[10px]"><PhotoSlot src={l.cover_url} placeholder="" className="absolute inset-0" /></div>
                <div className="min-w-0"><div className="truncate-1 text-[14px] font-bold">{l.title}</div><div className="truncate-1 text-[12px] text-text-3">{l.category} · {l.units_total} {l.units_total === 1 ? "unit" : "units"}{l.units_rentable < l.units_total ? ` (${l.units_rentable} rentable)` : ""} · {l.photo_count} photos</div></div>
                <div className="hidden text-[12px] text-text-2 md:block">{l.upcoming ? `${l.upcoming} upcoming ${l.upcoming === 1 ? "booking" : "bookings"}` : "No upcoming bookings"}{l.rating ? ` · ★ ${l.rating.toFixed(1)} (${l.rating_count})` : ""}</div>
                <div className="hidden t-mono text-[13px] md:block">{formatRate(l.day_cents)}<span className="text-text-3">/day</span></div>
                <div className="hidden text-[12px] md:block"><span className={`font-semibold ${(l.quality_score ?? 0) >= 80 ? "text-ok-text" : (l.quality_score ?? 0) >= 50 ? "text-warn-text" : "text-error-text"}`}>{l.quality_score ?? 0}%</span> <span className="text-text-3">quality</span></div>
                <Pill tone={s.tone} size="sm" dot={s.tone !== "neutral"}>{s.label}</Pill>
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}
