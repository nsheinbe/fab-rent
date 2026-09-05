import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icons";
import { Logo, AppIcon } from "@/components/domain/logo";
import { StatusPill, AvailabilityPill, FulfillmentPill } from "@/components/domain/pills";
import { ListingCard } from "@/components/domain/listing-card";
import { PriceBreakdown } from "@/components/domain/price-breakdown";
import { DateLocationSummary } from "@/components/domain/date-location-summary";
import { BOOKING_STATUSES } from "@/lib/booking-state/status";
import { marketLocal } from "@/lib/time";
import { StyleguideExtras } from "./extras";

export const metadata: Metadata = { title: "Design system" };

const swatches: Array<[string, string, string?]> = [
  ["Ivory", "#F6F3EC", "border"],
  ["Ivory deep", "#EFEBE2"],
  ["Border", "#E3DED3"],
  ["Charcoal", "#1E1E1C"],
  ["Text 2", "#5F5C55"],
  ["Text 3", "#6E6A61"],
  ["Cobalt", "#1E42E8"],
  ["Cobalt tint", "#E9EDFD", "tint"],
];

function Section({ n, title, sub, children }: { n: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-3.5">
        <span className="t-label text-text-3">{n}</span>
        <h2 className="text-[20px] font-bold tracking-[-0.01em]">{title}</h2>
        {sub && <span className="text-[13px] text-text-3">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function Panel({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card flex flex-col gap-4 p-5 ${className ?? ""}`}>
      <div className="t-label text-text-3">{label}</div>
      {children}
    </div>
  );
}

export default function StyleguidePage() {
  const start = marketLocal("2026-09-11T09:00:00");
  const end = marketLocal("2026-09-13T17:00:00");
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-14 px-6 pb-20 pt-12 lg:px-14" style={{ background: "#E9E5DC" }}>
      <div className="flex flex-col gap-7">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Logo size={44} href={null} />
          <Pill tone="dark" className="!h-auto min-h-[30px] !px-3 py-1 tracking-[.04em] !whitespace-normal">DEMO PRODUCT · all data fictional · market: Port Maren · currency: Maren dollar ($)</Pill>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3 rounded-card border border-border bg-ivory p-6">
            <div className="t-label text-text-3">Design brief → decisions</div>
            <div className="text-[22px] font-bold leading-[1.25] tracking-[-0.02em]">Premium rental marketplace for equipment, tools and event supplies — renters, providers, admins, one design language.</div>
            <div className="flex flex-col gap-1.5 text-[14px] leading-[1.55] text-text-2">
              <div><b className="text-charcoal">Assumed:</b> admin is desktop-only, provider is desktop + mobile (handoffs happen on phones), renter is mobile-first with a fully responsive web app.</div>
              <div><b className="text-charcoal">Money model:</b> renters pay rental + required fees + tax + optional extras <i>now</i>; a separate refundable authorization hold is placed at handoff and released after return check-in. Held money is always visually separated from charged money.</div>
              <div><b className="text-charcoal">Auth:</b> browsing, filtering and building a booking are open; sign-in is requested only at payment, and the selected item, dates, fulfillment and extras are preserved through it.</div>
              <div><b className="text-charcoal">Photography:</b> every image is a drop slot — drag real product photos onto them and they persist.</div>
            </div>
          </div>
          <div className="card flex flex-col gap-3.5 p-6">
            <div className="t-label text-text-3">Demo market</div>
            <div className="text-[18px] font-bold tracking-[-0.01em]">Port Maren</div>
            <div className="text-[13px] leading-[1.55] text-text-2">Fictional coastal metro, 1.2M people. Neighbourhoods: Old Harbour, Vesper Hill, Northlands, Millbrook, Saltway, The Docks, Kestrel Park, Ridgeway.</div>
            <div className="grid grid-cols-2 gap-2.5 text-[13px]">
              {[["Currency", "Maren dollar · $ (MRD)"], ["Sales tax", "7.5% on rentals + fees"], ["Service fee", "10% renter · 12% provider"], ["Today", "Sat 5 Sep 2026"]].map(([k, v]) => (
                <div key={k} className="well px-3 py-2.5"><div className="text-[11px] text-text-3">{k}</div><div className="font-semibold">{v}</div></div>
              ))}
            </div>
            <div className="text-[13px] leading-[1.55] text-text-2"><b className="text-charcoal">Providers:</b> Northlands Tool &amp; Hire · Millbrook Event Co. · Vesper Camera Collective · Docks Equipment Depot · Saltway Marine &amp; Outdoor · Tomas Reinholt (individual)</div>
          </div>
          <div className="card flex flex-col gap-3 p-6">
            <div className="t-label text-text-3">Surfaces</div>
            {[["Renter · iOS & Android", "Discovery → booking → sign-in → confirmation → manage", "/"], ["Renter · responsive web", "Home, results + map, listing, checkout, tablet", "/search?q=table+saw"], ["Provider · dashboard & ops", "Dashboard, bookings, listing editor, calendar, handoff, earnings", "/provider"], ["Admin · desktop console", "Overview, users, listing review, dispute, settings", "/admin"]].map(([t, s, href]) => (
              <a key={t} href={href} className="flex items-center justify-between gap-3 rounded-panel border border-border bg-ivory px-3.5 py-3 no-underline text-charcoal hover:text-charcoal">
                <div><div className="text-[14px] font-bold">{t}</div><div className="text-[12px] text-text-3">{s}</div></div>
                <span className="text-[12px] font-semibold text-cobalt">Open →</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <Section n="01" title="Identity">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="card grid grid-cols-2 grid-rows-[150px_150px] overflow-hidden">
            <div className="flex items-center justify-center bg-ivory"><Logo size={34} href={null} /></div>
            <div className="flex items-center justify-center bg-charcoal text-white"><Logo size={34} href={null} onDark /></div>
            <div className="flex items-center justify-center bg-cobalt text-white"><Logo size={34} href={null} dotColor="#BFD0FF" /></div>
            <div className="flex flex-col items-center justify-center gap-2.5 bg-white"><AppIcon size={44} /><div className="text-[11px] text-text-3">App icon · favicon</div></div>
          </div>
          <div className="card grid grid-cols-3 content-start gap-2.5 p-5">
            {swatches.map(([name, hex, kind]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <div className="h-[52px] rounded-control" style={{ background: hex, border: kind === "border" ? "1px solid #E3DED3" : kind === "tint" ? "1px solid #C9D3FA" : undefined }} />
                <div className="text-[12px] font-semibold">{name}</div>
                <div className="t-mono text-[11px] text-text-3">{hex}</div>
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <div className="grid h-[52px] grid-cols-3 overflow-hidden rounded-control"><div className="bg-ok" /><div className="bg-warn" /><div className="bg-error" /></div>
              <div className="text-[12px] font-semibold">Status</div>
              <div className="t-mono text-[11px] text-text-3">ok · warn · error</div>
            </div>
          </div>
          <div className="card flex flex-col gap-3.5 px-6 py-5">
            <div className="flex items-baseline justify-between gap-3"><div className="t-display">Display 32 / 800</div><div className="text-[11px] text-text-3">Plus Jakarta Sans</div></div>
            <div className="t-title">Title 24 / 700 — listing names, page titles</div>
            <div className="t-heading">Heading 18 / 700 — section heads</div>
            <div className="text-[15px] font-medium leading-[1.5]">Body 15 / 500 mobile · 14 / 500 desktop — descriptions, rows, forms. Text 2 for secondary lines.</div>
            <div className="t-meta text-text-3">Meta 12 / 500 — distance, timestamps, helper text</div>
            <div className="t-label text-text-3">Label 11 / 600 / caps — group labels</div>
            <div className="flex items-center gap-2.5"><span className="t-mono rounded-[8px] border border-border bg-ivory px-2.5 py-1.5 text-[14px] font-medium tracking-[.04em]">FR-7KQ2-M9</span><span className="text-[12px] text-text-3">DM Mono — booking references, serials, amounts in tables</span></div>
          </div>
        </div>
      </Section>

      <Section n="02" title="Core components" sub="Availability, dates, location and price are always the first four facts a renter reads.">
        <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Panel label="Buttons & inputs">
            <div className="flex flex-wrap gap-2.5">
              <Button>Reserve · $271.33</Button>
              <Button variant="secondary">Message provider</Button>
              <Button variant="ghost">Save</Button>
              <Button variant="danger">Cancel booking</Button>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button size="md">Approve</Button>
              <Button size="md" variant="secondary">Decline</Button>
              <Button size="md" variant="text">Text action</Button>
            </div>
            <StyleguideExtras />
          </Panel>

          <Panel label="Booking status pills">
            <div className="flex flex-wrap gap-2">
              {BOOKING_STATUSES.map((s) => (
                <StatusPill key={s} status={s} />
              ))}
            </div>
            <div className="t-label mt-1 text-text-3">Availability &amp; fulfillment</div>
            <div className="flex flex-wrap gap-2">
              <AvailabilityPill availability={{ kind: "available", range: { start, end } }} />
              <AvailabilityPill availability={{ kind: "only_left", count: 1 }} />
              <AvailabilityPill availability={{ kind: "unavailable", next: marketLocal("2026-09-14T09:00:00") }} />
              <FulfillmentPill kind="pickup" />
              <FulfillmentPill kind="delivery" deliveryFromCents={2500} />
              <FulfillmentPill kind="instant" />
            </div>
          </Panel>

          <Panel label="Listing card · the four facts">
            <ListingCard
              listing={{ id: "x", slug: "dewalt-dwe7491-10-in-jobsite-table-saw-with-rolling-stand-northlands", title: "DeWalt DWE7491 10-in Jobsite Table Saw", provider_name: "Northlands Tool & Hire", rating: 4.9, rating_count: 87, distance_km: 2.1, day_cents: 5800, total_cents: 17400, billed_days: 3, availability: { kind: "available" }, fulfillment: "delivery", delivery_from_cents: 2500 }}
              variant="row"
            />
            <div className="text-[12px] leading-[1.5] text-text-3">Title → provider/rating/distance → availability + fulfillment → per-day and total for the searched dates. Distance and total only appear once location and dates are known.</div>
          </Panel>

          <Panel label="Price breakdown · charged vs held">
            <PriceBreakdown
              lines={[
                { label: "$58 × 3 days", cents: 17400 },
                { label: "Delivery & collection · Vesper Hill", cents: 2500 },
                { label: "Extras · 60T blade, damage waiver", cents: 3600 },
                { label: "Service fee (10%)", cents: 1740 },
                { label: "Sales tax 7.5%", cents: 1893 },
              ]}
              charged={{ label: "Charged now", cents: 27133, sub: "Visa •••• 4421" }}
              held={{ label: "Held, not charged", cents: 10000, explanation: "Authorization at handoff · released ≤3 business days after return · $300 without the waiver" }}
            />
          </Panel>

          <Panel label="Date · location · fulfillment summary">
            <DateLocationSummary start={start} end={end} days={3} pickup={{ meta: "42 Foundry Rd, Northlands · 2.1 km · Mon–Sat 7–18" }} delivery={{ price: "$25", meta: "To 18 Corrin St, Vesper Hill · 2-hour window", selected: true }} />
            <div className="flex h-16 items-center justify-around border-t border-border pt-2">
              {[["compass", "Explore", true], ["heart", "Saved"], ["box", "Rentals"], ["message", "Inbox"], ["user", "Profile"]].map(([icon, label, active]) => (
                <div key={label as string} className={`flex flex-col items-center gap-[3px] text-[10px] font-semibold ${active ? "text-cobalt" : "text-text-3"}`}>
                  <Icon name={icon as "compass"} size={22} />
                  {label as string}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </Section>

      <div className="flex flex-wrap gap-8 rounded-card border border-border bg-ivory px-6 py-5 text-[13px] leading-[1.55] text-text-2">
        <div className="min-w-[260px] flex-1"><div className="t-label mb-1.5 text-text-3">Not designed yet</div>Saved lists, profile &amp; settings, provider onboarding/KYC, notifications centre, Android-specific chrome (screens are platform-neutral; the iOS frame is presentational).</div>
        <div className="min-w-[260px] flex-1"><div className="t-label mb-1.5 text-text-3">Suggested next</div>Drop real product photography into the slots · pick a screen to turn into a clickable prototype · dark-mode pass for the provider app used outdoors.</div>
      </div>
    </div>
  );
}
