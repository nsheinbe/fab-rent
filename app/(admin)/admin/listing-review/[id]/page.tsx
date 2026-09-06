import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { adminReviewDetail, adminReviewQueue } from "@/lib/queries/admin";
import { formatDate, formatDateTime, formatMoney, formatRate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Pill, TabChip } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { DecisionPanel } from "./decision";

export const metadata: Metadata = { title: "Listing review" };

export default async function ListingReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  const [{ id }, sp, , config] = await Promise.all([params, searchParams, requireStaff(), getLiveConfig()]);
  const nowAt = now();
  const tz = config.market.timezone;
  const { queue, detail } = await withActor(async (trx) => ({ queue: await adminReviewQueue(trx, nowAt), detail: await adminReviewDetail(trx, id, config, nowAt) }));
  if (!detail) notFound();
  const kind = sp.kind === "new" || sp.kind === "edited" || sp.kind === "reported" ? sp.kind : null;
  const shown = kind ? queue.filter((q) => q.kind === kind) : queue;
  const counts = { new: queue.filter((q) => q.kind === "new").length, edited: queue.filter((q) => q.kind === "edited").length, reported: queue.filter((q) => q.kind === "reported").length };
  const l = detail.listing;
  const p = detail.provider;
  const suggestions = detail.checks.filter((c) => c.status !== "pass").map((c) => (c.key === "documents" ? `Attach ${detail.rule?.required_documents[0]?.label ?? "the required certificate"}` : c.key === "price" ? "Explain the above-median price in the description" : c.key === "photos" ? "Add original photos including the serial plate" : c.key === "description" ? "Remove off-platform contact details or prohibited terms" : c.key === "serial_plate" ? "Add a photo of the serial plate" : c.key === "duplicate" ? "Confirm this isn't a duplicate listing" : c.message));
  return (
    <div className="grid min-h-[calc(100vh-64px)] xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-paper xl:block">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 py-3">
          <TabChip href={`/admin/listing-review/${id}`} selected={!kind}>All</TabChip>
          <TabChip href={`/admin/listing-review/${id}?kind=new`} selected={kind === "new"} count={counts.new}>New</TabChip>
          <TabChip href={`/admin/listing-review/${id}?kind=edited`} selected={kind === "edited"} count={counts.edited}>Edited</TabChip>
          <TabChip href={`/admin/listing-review/${id}?kind=reported`} selected={kind === "reported"} count={counts.reported}>Reported</TabChip>
        </div>
        <div className="max-h-[calc(100vh-120px)] overflow-y-auto">
          {shown.map((q) => (
            <Link key={q.id} href={`/admin/listing-review/${q.id}${kind ? `?kind=${kind}` : ""}`} className={cn("flex items-start gap-3 border-t border-border px-4 py-3 text-charcoal no-underline hover:bg-white/70", q.id === id && "bg-white shadow-[inset_3px_0_0_#1E42E8]")}>
              <div className="min-w-0 flex-1">
                <div className="truncate-1 text-[13px] font-semibold">{q.title}</div>
                <div className="truncate-1 text-[12px] text-text-3">{q.provider}{q.completed_count < 5 ? " · new provider" : ""} · {q.parent ? `${q.parent} › ` : ""}{q.category}{q.kind !== "new" ? ` · ${q.kind}` : ""}</div>
                <div className={cn("truncate-1 text-[12px]", q.summary.includes("passed") ? "text-ok-text" : q.summary.toLowerCase().includes("missing") || q.summary.includes("Stock") ? "text-error-text" : "text-warn-text")}>{q.summary}</div>
              </div>
              <span className={cn("t-mono text-[12px]", q.waiting_hours > 24 ? "font-semibold text-error-text" : "text-text-3")}>{q.waiting_hours} h</span>
            </Link>
          ))}
        </div>
      </aside>

      <div className="flex flex-col gap-5 px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-extrabold tracking-[-0.02em]">{l.title} <span className="t-mono text-[13px] font-medium text-text-3">{l.listing_code}</span></h1>
            <div className="mt-1 text-[13px] text-text-2">Submitted {formatDateTime(detail.review.submitted_at, tz).replace(" · ", " ")} · {p.name} (★ {p.rating ? Number(p.rating).toFixed(1) : "new"}, {p.listings} listings, {p.rejected} rejections){detail.first_in_category ? ` · first ${detail.category.name.toLowerCase()} listing` : ""}{detail.review.kind === "reported" ? " · reported by a renter" : detail.review.kind === "edited" ? " · edited" : ""}</div>
          </div>
          <div className="flex gap-2">
            <Button size="md" variant="secondary" href={`/listings/${l.slug}`} leading={<Icon name="eye" size={14} />}>Open as renter</Button>
            <Button size="md" variant="secondary" href={`mailto:${p.owner_email ?? ""}`} leading={<Icon name="message" size={14} />}>Message provider</Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-5">
            <section className="card overflow-hidden">
              <div className="border-b border-border px-5 py-3 text-[14px] font-bold">Automated checks</div>
              {detail.checks.map((c) => (
                <div key={c.key} className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0">
                  <span className={cn("mt-0.5 flex size-5 flex-none items-center justify-center rounded-full text-[11px] font-bold", c.status === "pass" ? "bg-ok text-white" : c.status === "warning" ? "bg-warn text-white" : "bg-error text-white")}>{c.status === "pass" ? <Icon name="check" size={11} strokeWidth={3} /> : "!"}</span>
                  <div className="min-w-0 flex-1 text-[13px]">{c.message}</div>
                  <Pill tone={c.status === "pass" ? "ok" : c.status === "warning" ? "warn" : "error"} size="xs">{c.status}</Pill>
                </div>
              ))}
              {detail.reports.length > 0 && <div className="border-t border-border bg-error-bg/60 px-5 py-3 text-[13px] text-error-text"><b>Report:</b> {detail.reports[0]!.body}</div>}
            </section>

            <section className="card p-5">
              <div className="text-[14px] font-bold">Listing as submitted</div>
              <div className="mt-3 grid gap-3 md:grid-cols-[112px_minmax(0,1fr)]">
                <div className="grid grid-cols-3 gap-1.5 md:grid-cols-1">
                  {detail.photos.slice(0, 3).map((ph) => <div key={ph.id} className="relative aspect-square overflow-hidden rounded-[8px] bg-ivory-deep">{ph.url ? <img src={ph.url} alt={ph.label ?? ""} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-text-3"><Icon name="image" size={16} /></div>}{ph.has_serial_plate && <span className="absolute left-1 top-1 rounded-[3px] bg-white/90 px-1 text-[9px] font-bold">Serial</span>}</div>)}
                  {detail.photos.length > 3 && <div className="flex aspect-square items-center justify-center rounded-[8px] bg-ivory-deep text-[12px] font-semibold text-text-2">+{detail.photos.length - 3}</div>}
                </div>
                <div className="flex flex-col gap-2 text-[13px]">
                  <Row k="Pricing" v={`${formatRate(l.day_cents)}/day${l.week_cents ? ` · ${formatRate(l.week_cents)}/week` : ""} · hold ${formatMoney(l.hold_cents, { whole: true })}${detail.median_day_cents ? ` · category median ${formatRate(detail.median_day_cents)}` : ""}`} />
                  <Row k="Fulfillment" v={[l.pickup_enabled && `Pickup${l.pickup_address ? ` · ${l.pickup_address.split(",")[0]}` : ""}`, l.delivery_enabled && `Delivery ${formatRate(l.delivery_base_cents)} ≤${Number(l.delivery_base_km)} km`].filter(Boolean).join(" · ") || "—"} />
                  <Row k="Rules" v={[`${l.min_renter_age}+`, ...l.rules.slice(0, 3)].join(" · ")} />
                  <Row k="Units" v={`${detail.listing.status === "draft" ? "draft · " : ""}${detail.extras.length} extras · docs: ${detail.documents.length ? detail.documents.map((d) => d.label).join(", ") : "none"}`} />
                  <p className="mt-1 leading-[1.55] text-text-2">{l.description || <span className="text-text-3">No description.</span>}</p>
                </div>
              </div>
            </section>

            <div className="text-[12px] text-text-3">Provider history: {p.approved} listings approved, {p.rejected} rejected, {p.change_requests} change requests. {p.insurance_valid_until ? `Insurance valid until ${formatDate(p.insurance_valid_until, tz).replace(/^\w+ /, "")} ${p.insurance_valid_until.getFullYear()}.` : "No insurance on file."} Owner {p.owner_name}.</div>
          </div>

          <DecisionPanel reviewId={detail.review.id} listingTitle={l.title} providerFirst={(p.owner_name ?? p.name).split(" ")[0]!} suggestions={suggestions} hasRequired={detail.checks.some((c) => c.status === "required")} decided={detail.review.decision} />
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2"><span className="text-text-3">{k}</span><span className="font-semibold">{v}</span></div>;
}
