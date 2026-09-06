import type { Metadata } from "next";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { providerReviews } from "@/lib/queries/provider";
import { formatDate } from "@/lib/format";
import { StarRating } from "@/components/ui/star-rating";
import { StatCard } from "@/components/domain/shells";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Reviews" };

export default async function ProviderReviewsPage() {
  const [actor, config] = await Promise.all([requireProvider(), getLiveConfig()]);
  const [reviews, provider] = await withActor((trx) => Promise.all([providerReviews(trx, actor.provider.id), trx.selectFrom("providers").select(["rating", "rating_count", "on_time_pct"]).where("id", "=", actor.provider.id).executeTakeFirstOrThrow()]));
  const published = reviews.filter((r) => r.published_at);
  const avgItem = published.length ? published.reduce((s, r) => s + (r.item_stars ?? 0), 0) / published.filter((r) => r.item_stars).length : null;
  const avgProv = published.length ? published.reduce((s, r) => s + (r.provider_stars ?? 0), 0) / published.filter((r) => r.provider_stars).length : null;
  const tags = new Map<string, number>();
  for (const r of published) for (const t of r.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1);
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 lg:px-7">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Provider rating" value={provider.rating ? `★ ${Number(provider.rating).toFixed(2)}` : "—"} sub={`${provider.rating_count} ${provider.rating_count === 1 ? "review" : "reviews"} all time`} />
        <StatCard label="Items · avg" value={avgItem ? `★ ${avgItem.toFixed(2)}` : "—"} sub="condition, accuracy" />
        <StatCard label="You · avg" value={avgProv ? `★ ${avgProv.toFixed(2)}` : "—"} sub="communication, handoff, fairness" />
        <StatCard label="On-time handoffs" value={provider.on_time_pct ? `${Math.round(Number(provider.on_time_pct))}%` : "—"} sub="last 90 days" />
      </div>
      {tags.size > 0 && <div className="flex flex-wrap gap-1.5">{[...tags.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => <Pill key={t} tone="outline" size="sm">{t} · {n}</Pill>)}</div>}
      {reviews.length === 0 ? <EmptyState icon="star" title="No reviews yet" body="Reviews publish once both sides have reviewed, or after 14 days." /> : (
        <div className="card overflow-hidden">
          {reviews.map((r, i) => (
            <div key={r.id} className={`flex flex-col gap-1.5 px-5 py-3.5 ${i < reviews.length - 1 ? "border-b border-border" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-text-3">
                <span><b className="text-charcoal">{r.author}</b> · {r.listing_title ?? "Listing"} · {r.ref} · {formatDate(r.submitted_at, config.market.timezone)}</span>
                <span className="flex items-center gap-3">{r.item_stars != null && <span className="flex items-center gap-1">Item <StarRating value={r.item_stars} size={12} /></span>}{r.provider_stars != null && <span className="flex items-center gap-1">You <StarRating value={r.provider_stars} size={12} /></span>}{!r.published_at && <Pill tone="neutral" size="xs">Unpublished · waiting for your review</Pill>}</span>
              </div>
              {r.body && <p className="text-[13px] leading-[1.5]">{r.body}</p>}
              {r.tags?.length ? <div className="flex flex-wrap gap-1">{r.tags.map((t) => <Pill key={t} tone="neutral" size="xs">{t}</Pill>)}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
