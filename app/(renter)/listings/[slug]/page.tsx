import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { getActor, withActor } from "@/lib/auth";
import { getLiveSettings } from "@/lib/settings/live";
import { now, toMarket } from "@/lib/time";
import { bookedDays, getAvailability, getListingBySlug, shortName } from "@/lib/queries/listings";
import { parseSearchParams, bookingContextQuery, type RawParams } from "@/lib/search/params";
import { quoteBooking, QuoteError, distanceKm, describePolicy, freeCancelUntil, instantBookEligible } from "@/lib/pricing";
import { formatDateRange, formatDateTime, formatKm, formatMoney, formatRate, formatShortDate, formatDate } from "@/lib/format";
import { RenterHeader, BackLink } from "@/components/domain/renter-header";
import { SearchBar } from "@/components/domain/search-bar";
import { FulfillmentCard } from "@/components/domain/date-location-summary";
import { PriceBreakdown } from "@/components/domain/price-breakdown";
import { FulfillmentPill } from "@/components/domain/pills";
import { RememberViewed } from "@/components/domain/recently-viewed";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Calendar } from "@/components/ui/calendar";
import { StarRating } from "@/components/ui/star-rating";
import { Gallery } from "./gallery";
import { SaveButton } from "./save-button";
import { MessageProviderButton } from "./message-button";
import { ChangeDates, DesktopBookingCard } from "./booking-card";
import type { ListingClientData } from "../booking-hooks";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const l = await withActor((trx) => getListingBySlug(trx, slug));
  return { title: l ? l.title : "Listing" };
}

export default async function ListingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> }) {
  const [{ slug }, sp, { config }, actor] = await Promise.all([params, searchParams, getLiveSettings(), getActor()]);
  const tz = config.market.timezone;
  const nowAt = now();
  const state = parseSearchParams(sp, config, nowAt);
  const listing = await withActor((trx) => getListingBySlug(trx, slug));
  if (!listing || (listing.status !== "published" && !actor.staff && !actor.providers.some((p) => p.id === listing.provider.id))) notFound();

  const monthZ = startOfMonth(toMarket(state.from, tz));
  const [available, booked, saved] = await withActor(async (trx) => [
    await getAvailability(trx, listing.id, state.from, state.to),
    await bookedDays(trx, listing.id, fromZonedTime(monthZ, tz), fromZonedTime(endOfMonth(monthZ), tz)),
    actor.userId ? await trx.selectFrom("saved_listings").select("id").where("profile_id", "=", actor.userId).where("listing_id", "=", listing.id).executeTakeFirst() : null,
  ] as const);

  const origin = state.where ? config.market.neighbourhoods.find((n) => n.slug === state.where) ?? null : actor.profile?.neighbourhood ? config.market.neighbourhoods.find((n) => n.name === actor.profile!.neighbourhood) ?? null : config.market.neighbourhoods[0] ?? null;
  const distance = origin && listing.lat != null && listing.lng != null ? +distanceKm(origin, { lat: listing.lat, lng: listing.lng }).toFixed(1) : null;
  const fulfillment: "pickup" | "delivery" = state.fulfillment === "delivery" && listing.delivery.enabled ? "delivery" : listing.pickup.enabled ? "pickup" : "delivery";
  let quote = null;
  let quoteError: string | null = null;
  try {
    quote = quoteBooking({ pricing: listing.pricing, delivery: listing.delivery }, { start: state.from, end: state.to, qty: state.qty, fulfillment: "pickup", extras: [], tz }, config);
  } catch (e) {
    quoteError = e instanceof QuoteError ? e.message : null;
  }
  const policy = config.cancellation.policies.find((p) => p.id === listing.policy_id) ?? config.cancellation.policies.find((p) => p.is_default)!;
  const freeUntil = freeCancelUntil(policy, state.from);
  const eligible = instantBookEligible(actor.profile ? { id_verified: actor.profile.id_verified, rating: actor.profile.rating_from_providers, completed_count: actor.profile.completed_count } : null, listing.instant_book, config);
  const ctx = bookingContextQuery({ from: state.from, to: state.to, qty: state.qty, fulfillment, where: state.where }, tz);
  const user = actor.profile ? { name: actor.profile.name } : null;
  const bookedList = [...booked];
  const conditionLine = [listing.last_serviced_at && `Serviced ${formatShortDate(listing.last_serviced_at)}`, listing.age_years != null && `${listing.age_years} ${listing.age_years === 1 ? "year" : "years"} old`].filter(Boolean).join(", ");
  const providerShort = listing.provider.name.split(" ")[0]!;
  const client: ListingClientData = { id: listing.id, slug: listing.slug, title: listing.title, short_title: listing.title.split(" ").slice(0, 3).join(" "), pricing: listing.pricing, delivery: listing.delivery, extras: listing.extras, pickup: listing.pickup, provider: { name: listing.provider.name, short: providerShort, distance_km: distance, response_minutes: listing.provider.response_minutes }, units_total: listing.units_total, instant_book: listing.instant_book, policy_id: listing.policy_id, lat: listing.lat, lng: listing.lng };
  const weekendLine = [listing.pricing.weekend_cents != null && `${formatRate(listing.pricing.weekend_cents)} weekend (Fri–Mon)`, listing.pricing.week_cents != null && `${formatRate(listing.pricing.week_cents)}/week`].filter(Boolean).join(" · ");
  const availabilityTitle = available >= state.qty ? `Available ${formatDateRange(state.from, state.to, { tz })}` : available === 0 ? `Unavailable ${formatDateRange(state.from, state.to, { tz })}` : `Only ${available} left ${formatDateRange(state.from, state.to, { tz })}`;
  const availabilitySub = quote ? `${available} of ${listing.units_total} units free · billed as ${quote.billed_days} ${quote.billed_days === 1 ? "day" : "days"}` : quoteError ?? "";
  const dot = available >= state.qty ? "bg-ok" : available > 0 ? "bg-warn" : "bg-neutral-dot";

  const specs = (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border bg-border lg:grid-cols-3">
      {listing.specs.map((s) => (
        <div key={s.key} className="bg-white px-3 py-2.5 lg:px-3.5 lg:py-3"><div className="text-[11px] text-text-3">{s.key}</div><div className="text-[13px] font-semibold lg:text-[14px]">{s.value}</div></div>
      ))}
    </div>
  );
  const condition = (
    <div className="card-sm flex items-start gap-3 rounded-panel px-3.5 py-3 lg:rounded-card-sm lg:p-4">
      <span className="flex size-8 flex-none items-center justify-center rounded-[8px] bg-ok-bg text-ok-text"><Icon name="check" size={16} strokeWidth={2.4} /></span>
      <div>
        <div className="text-[14px] font-bold">Condition · {listing.condition ?? "Good"}</div>
        <div className="text-[12px] leading-[1.5] text-text-2 lg:text-[13px]">{conditionLine}{conditionLine && ". "}Serial number and photos are recorded with you at every handoff and return.</div>
      </div>
    </div>
  );
  const included = (compact?: boolean) => (
    <div className="flex flex-wrap gap-1.5">
      {listing.included_accessories.map((a) => (
        <span key={a} className={compact ? "flex h-[26px] items-center rounded-pill bg-ivory px-2.5 text-[12px] font-semibold" : "flex h-[30px] items-center rounded-pill border border-border bg-white px-2.5 text-[12px] font-semibold"}>{a}</span>
      ))}
    </div>
  );
  const reviews = (
    <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3.5">
      {listing.reviews.slice(0, 2).map((r) => (
        <div key={r.id} className="card-sm flex flex-col gap-1.5 rounded-panel px-3.5 py-3 lg:rounded-card-sm lg:px-4 lg:py-3.5">
          <div className="flex justify-between text-[12px] text-text-3"><span><b className="text-charcoal">{r.author}</b> · {formatDate(r.submitted_at).replace(/^\w+ /, "").split(" ").slice(1).join(" ")} {r.submitted_at.getFullYear()}{r.days ? ` · ${r.days} ${r.days === 1 ? "day" : "days"}` : ""}</span><StarRating value={r.stars} size={12} /></div>
          <div className="text-[13px] leading-[1.5] lg:text-[14px]">{r.body}</div>
        </div>
      ))}
      {listing.reviews.length === 0 && <div className="text-[13px] text-text-3">No reviews yet — be the first.</div>}
    </div>
  );
  const rules = (
    <div className="flex flex-col gap-0.5 text-[13px] leading-[1.7]">
      <div>· Minimum {listing.pricing.min_days} {listing.pricing.min_days === 1 ? "day" : "days"} · maximum {listing.pricing.max_days} days</div>
      {listing.rules.map((r) => <div key={r}>· {r}</div>)}
    </div>
  );
  const cancellation = (
    <div className="text-[13px] leading-[1.55] text-text-2">
      Free cancellation until {formatDateTime(freeUntil).replace(" · ", " ")} ({policy.free_until_hours >= 48 ? `${policy.free_until_hours / 24} days` : `${policy.free_until_hours} h`} before start). {describePolicy(policy).split("After that, ")[1]?.replace(/\.$/, "")}. The hold is only placed at handoff, so nothing is held if you cancel.{policy.provider_cancel_credit_cents ? ` Provider cancellations are refunded in full plus a ${formatMoney(policy.provider_cancel_credit_cents, { whole: true })} credit.` : policy.provider_cancel_credit_pct ? ` Provider cancellations are refunded in full plus a ${policy.provider_cancel_credit_pct}% credit.` : ""}
    </div>
  );
  const calendar = <Calendar month={monthZ} today={toMarket(nowAt, tz)} range={{ start: toMarket(state.from, tz), end: toMarket(state.to, tz) }} bookedDays={bookedList} />;
  const providerCard = (
    <div className="card-sm flex flex-col gap-3 p-3.5 lg:flex-row lg:items-center lg:gap-4 lg:px-[18px] lg:py-4">
      <div className="flex items-center gap-3 lg:flex-1 lg:min-w-0">
        <Avatar name={listing.provider.name} size={48} tone="charcoal" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold lg:text-[16px]">{listing.provider.name}</div>
          <div className="text-[12px] text-text-2 lg:text-[13px]">{listing.provider.verified ? (listing.provider.kind === "business" ? "Verified business" : "Verified individual") : "New provider"}{listing.provider.years ? ` · ${listing.provider.years} yrs on fab.rent` : ""} · ★ {listing.provider.rating?.toFixed(1) ?? "new"}{listing.provider.rating_count ? ` (${listing.provider.rating_count})` : ""}{" "}<span className="hidden lg:inline">· {listing.provider.item_count} items</span></div>
          <div className="hidden gap-[18px] text-[12px] text-text-2 lg:mt-1.5 lg:flex">
            {listing.provider.response_minutes != null && <span><b className="text-charcoal">~{listing.provider.response_minutes} min</b> response</span>}
            {listing.provider.on_time_pct != null && <span><b className="text-charcoal">{Math.round(listing.provider.on_time_pct)}%</b> on-time handoffs</span>}
            {listing.provider.hours_label && <span><b className="text-charcoal">{listing.provider.hours_label}</b></span>}
          </div>
        </div>
      </div>
      <div className="flex gap-4 text-[12px] text-text-2 lg:hidden">
        {listing.provider.response_minutes != null && <div><b className="text-charcoal">~{listing.provider.response_minutes} min</b> response</div>}
        {listing.provider.on_time_pct != null && <div><b className="text-charcoal">{Math.round(listing.provider.on_time_pct)}%</b> on-time handoffs</div>}
        <div><b className="text-charcoal">{listing.provider.item_count}</b> items</div>
      </div>
      <MessageProviderButton listingSlug={listing.slug} variant="secondary" size="md" className="!h-10 lg:flex-none">Message{" "}<span className="lg:hidden">{providerShort}</span></MessageProviderButton>
    </div>
  );

  return (
    <>
      <RememberViewed slug={listing.slug} title={listing.title} day_cents={listing.pricing.day_cents} provider_name={listing.provider.name} cover_url={listing.photos[0]?.url ?? null} />
      <RenterHeader user={user} variant="search" search={<SearchBar variant="desktop" state={state} neighbourhoods={config.market.neighbourhoods} marketName={config.market.name} tz={tz} today={nowAt} />} />

      {/* ---------- mobile (M05): full scroll + sticky bottom bar */}
      <main className="flex flex-1 flex-col lg:hidden">
        <div className="relative">
          <Gallery photos={listing.photos} title={listing.title} variant="mobile" />
          <div className="absolute left-4 top-[max(14px,env(safe-area-inset-top))]"><BackLink round className="!bg-paper/90 !border-0" /></div>
          <div className="absolute right-4 top-[max(14px,env(safe-area-inset-top))] flex gap-2">
            <span className="flex size-10 items-center justify-center rounded-full bg-paper/90"><Icon name="share" size={18} /></span>
            <SaveButton listingId={listing.id} saved={!!saved} signedIn={!!actor.userId} />
          </div>
        </div>
        <div className="flex flex-col gap-2 px-5 pt-4">
          <div className="flex gap-1.5 text-[11px] font-semibold text-text-3"><Link href={`/search?category=${listing.category.parent_slug ?? listing.category.slug}&${ctx}`} className="text-text-3 no-underline">{listing.category.parent_name ?? listing.category.name}</Link>{listing.category.parent_name && <><span>›</span><Link href={`/search?category=${listing.category.parent_slug}&type=${listing.category.slug}&${ctx}`} className="text-text-3 no-underline">{listing.category.name}</Link></>}</div>
          <h1 className="text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-pretty">{listing.title}</h1>
          <div className="text-[13px] text-text-2"><b className="text-charcoal">★ {listing.rating?.toFixed(1) ?? "New"}</b>{listing.rating_count ? ` (${listing.rating_count} reviews)` : ""} · {listing.provider.name}{distance != null && ` · ${formatKm(distance)} away`}</div>
        </div>
        <div className="card-sm mx-5 mt-3.5 flex items-center justify-between gap-2.5 px-3.5 py-3">
          <div className="flex items-center gap-2.5"><span className={`size-2.5 flex-none rounded-full ${dot}`} /><div><div className="text-[14px] font-bold">{availabilityTitle}</div><div className="text-[12px] text-text-3">{availabilitySub}</div></div></div>
          <ChangeDates start={state.from} end={state.to} tz={tz} today={nowAt} minDays={listing.pricing.min_days} maxDays={listing.pricing.max_days} bookedDays={bookedList} carry={{ qty: state.qty, fulfillment, where: state.where }} />
        </div>
        <div className="flex flex-wrap items-baseline gap-3 px-5 pt-4"><div><span className="text-[28px] font-extrabold tracking-[-0.02em]">{formatRate(listing.pricing.day_cents)}</span><span className="text-[14px] text-text-3">/day</span></div><div className="text-[13px] text-text-2">{weekendLine}</div></div>
        <div className="grid grid-cols-2 gap-2.5 px-5 pt-4">
          {listing.pickup.enabled && <FulfillmentCard title="Pickup" price="Free" meta={`${listing.pickup.address?.split(",").slice(0, 2).join(",") ?? ""} · ${listing.pickup.hours_label ?? ""}`} selected={fulfillment === "pickup"} />}
          {listing.delivery.enabled && <FulfillmentCard title="Delivery" price={`from ${formatRate(listing.delivery.base_cents)}`} meta={`Within ${listing.delivery.radius_km} km · ${listing.delivery.window_hours}-hour windows · collected at end`} selected={fulfillment === "delivery"} />}
        </div>
        <section className="flex flex-col gap-3 px-5 pt-6"><h2 className="text-[16px] font-bold">Specifications</h2>{specs}{condition}</section>
        {listing.included_accessories.length > 0 && <section className="flex flex-col gap-2.5 px-5 pt-[22px]"><h2 className="text-[16px] font-bold">Included</h2>{included()}</section>}
        {listing.extras.length > 0 && (
          <section className="flex flex-col gap-2.5 px-5 pt-[22px]">
            <h2 className="text-[16px] font-bold">Optional extras</h2>
            <div className="card-sm overflow-hidden rounded-panel">
              {listing.extras.map((x, i) => (
                <div key={x.id} className={`flex items-center justify-between px-3.5 py-3 ${i < listing.extras.length - 1 ? "border-b border-border" : ""}`}>
                  <div><div className="text-[14px] font-semibold">{x.name}</div>{(x.description || (x.is_damage_waiver && listing.pricing.hold_with_waiver_cents != null)) && <div className="text-[12px] text-text-3">{x.is_damage_waiver ? `Covers accidental damage up to ${formatMoney(x.waiver_covers_cents ?? config.waiver.covers_up_to_cents, { whole: true })}${listing.pricing.hold_with_waiver_cents != null ? ` · reduces hold to ${formatRate(listing.pricing.hold_with_waiver_cents)}` : ""}` : x.description}</div>}</div>
                  <div className="text-[13px] font-bold">{formatRate(x.price_cents)}{x.per === "day" && <span className="font-medium text-text-3">/day</span>}</div>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="px-5 pt-[22px]">{providerCard}</div>
        <section className="flex flex-col gap-2.5 px-5 pt-[22px]">
          <div className="flex items-baseline justify-between"><h2 className="text-[16px] font-bold">Reviews{listing.rating ? ` · ${listing.rating.toFixed(1)}` : ""}</h2>{listing.rating_count > 2 && <span className="text-[13px] font-semibold text-cobalt">All {listing.rating_count}</span>}</div>
          {reviews}
        </section>
        <section className="flex flex-col gap-2.5 px-5 pt-[22px]">
          <div className="flex items-baseline justify-between"><h2 className="text-[16px] font-bold">Availability</h2><div className="text-[13px] text-text-2">{monthZ.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div></div>
          {calendar}
        </section>
        <section className="flex flex-col gap-2.5 px-5 pt-[22px]"><h2 className="text-[16px] font-bold">Rental rules</h2>{rules}</section>
        <div className="card-sm mx-5 mt-[22px] flex flex-col gap-1 p-3.5"><div className="text-[14px] font-bold">Cancellation · {policy.name}</div>{cancellation}</div>
        {quote && (
          <div className="mx-5 mt-[22px] mb-5">
            <PriceBreakdown size="sm" lines={quote.lines.map((l) => ({ label: l.label, cents: l.cents, keepZero: l.kind === "delivery" }))} charged={{ label: "Charged at booking", cents: quote.charged_cents }} held={{ label: `Held at handoff, not charged · released ≤${config.holds.auto_release_business_days} business days after return`, cents: quote.hold_cents, text: formatMoney(quote.hold_cents, { whole: true }) }} />
          </div>
        )}
        <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-border bg-paper px-5 pt-3 pb-[calc(76px+max(12px,env(safe-area-inset-bottom)))]">
          <div className="min-w-0">
            <div className="text-[17px] font-extrabold tracking-[-0.01em]">{quote ? formatMoney(quote.charged_cents) : formatRate(listing.pricing.day_cents)} <span className="text-[12px] font-medium text-text-3">{quote ? "total" : "/day"}</span></div>
            <div className="text-[12px] text-text-3 truncate-1">{quote ? `${quote.billed_days} ${quote.billed_days === 1 ? "day" : "days"} · ${fulfillment} · ${formatMoney(quote.hold_cents, { whole: true })} hold at handoff` : quoteError}</div>
          </div>
          <Button size="xl" href={available >= state.qty && quote ? `/book/${listing.id}?${ctx}` : undefined} disabled={!(available >= state.qty && quote)} className="!rounded-[12px] !px-6">Reserve</Button>
        </div>
      </main>

      {/* ---------- desktop (W03) & tablet (W05) */}
      <main className="hidden lg:block">
        <div className="flex flex-col gap-[18px] px-6 pb-12 pt-6 xl:px-10">
          <div className="flex gap-2 text-[12px] font-semibold text-text-3"><Link href="/" className="text-text-3 no-underline">Explore</Link><span>›</span><Link href={`/search?category=${listing.category.parent_slug ?? listing.category.slug}&${ctx}`} className="text-text-3 no-underline">{listing.category.parent_name ?? listing.category.name}</Link>{listing.category.parent_name && <><span>›</span><Link href={`/search?category=${listing.category.parent_slug}&type=${listing.category.slug}&${ctx}`} className="text-text-3 no-underline">{listing.category.name}</Link></>}</div>
          <div className="flex items-end justify-between gap-6">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[30px] font-extrabold leading-[1.15] tracking-[-0.025em]">{listing.title}</h1>
              <div className="text-[14px] text-text-2"><b className="text-charcoal">★ {listing.rating?.toFixed(1) ?? "New"}</b>{listing.rating_count ? ` (${listing.rating_count} reviews)` : ""} · {listing.provider.name}{listing.provider.verified ? ` · Verified ${listing.provider.kind}` : ""}{listing.pickup.address ? ` · ${listing.pickup.address}` : ""}{distance != null && ` · ${formatKm(distance)} away`}</div>
            </div>
            <div className="flex flex-none gap-2">
              <button type="button" className="flex h-[38px] items-center gap-2 rounded-pill border border-border-strong bg-white px-3.5 text-[13px] font-semibold"><Icon name="share" size={16} />Share</button>
              <SaveButton listingId={listing.id} saved={!!saved} variant="pill" signedIn={!!actor.userId} />
            </div>
          </div>
          <div className="hidden xl:block"><Gallery photos={listing.photos} title={listing.title} variant="desktop" /></div>
          <div className="xl:hidden"><Gallery photos={listing.photos} title={listing.title} variant="tablet" /></div>
          <div className="mt-2 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-12">
            <div className="flex flex-col gap-7">
              <div className="card-sm flex items-center justify-between gap-2.5 px-[18px] py-3.5">
                <div className="flex items-center gap-3"><span className={`size-2.5 flex-none rounded-full ${dot}`} /><div><div className="text-[15px] font-bold">{availabilityTitle}</div><div className="text-[13px] text-text-3">{availabilitySub}{listing.pricing.week_cents != null && " · weekly rate from 5 days"}</div></div></div>
                <div className="flex gap-2">
                  <div className="xl:hidden"><ChangeDates start={state.from} end={state.to} tz={tz} today={nowAt} minDays={listing.pricing.min_days} maxDays={listing.pricing.max_days} bookedDays={bookedList} carry={{ qty: state.qty, fulfillment, where: state.where }} /></div>
                  <div className="hidden gap-2 xl:flex">
                    {listing.pickup.enabled && <FulfillmentPill kind="pickup" />}
                    {listing.delivery.enabled && <FulfillmentPill kind="delivery" deliveryFromCents={listing.delivery.base_cents} />}
                    {listing.instant_book && <FulfillmentPill kind="instant" />}
                  </div>
                </div>
              </div>
              <div className="xl:hidden grid grid-cols-2 gap-2.5">
                {listing.pickup.enabled && <FulfillmentCard title="Pickup" price="Free" meta={`${listing.pickup.address?.split(",")[0] ?? ""} · ${listing.pickup.hours_label ?? ""}`} selected={fulfillment === "pickup"} />}
                {listing.delivery.enabled && <FulfillmentCard title="Delivery" price={`from ${formatRate(listing.delivery.base_cents)}`} meta={`Within ${listing.delivery.radius_km} km · ${listing.delivery.window_hours}-hour windows`} selected={fulfillment === "delivery"} />}
              </div>
              <section className="flex flex-col gap-2.5"><h2 className="text-[18px] font-bold">About this {listing.title.toLowerCase().includes("saw") ? "saw" : "item"}</h2><p className="max-w-[720px] text-[14px] leading-[1.65]">{listing.description}</p></section>
              <section className="flex flex-col gap-2.5"><h2 className="text-[18px] font-bold">Specifications</h2>{specs}</section>
              <div className="grid gap-4 xl:grid-cols-2">
                {condition}
                <div className="card-sm flex flex-col gap-2 p-4"><div className="text-[14px] font-bold">Included</div>{included(true)}</div>
              </div>
              {listing.extras.length > 0 && (
                <section className="flex flex-col gap-2.5">
                  <h2 className="text-[18px] font-bold">Optional extras</h2>
                  <div className="card-sm overflow-hidden rounded-panel">
                    {listing.extras.map((x, i) => (
                      <div key={x.id} className={`flex items-center justify-between px-4 py-3 ${i < listing.extras.length - 1 ? "border-b border-border" : ""}`}>
                        <div><div className="text-[14px] font-semibold">{x.name}</div>{(x.description || x.is_damage_waiver) && <div className="text-[12px] text-text-3">{x.is_damage_waiver ? `Covers accidental damage up to ${formatMoney(x.waiver_covers_cents ?? config.waiver.covers_up_to_cents, { whole: true })}${listing.pricing.hold_with_waiver_cents != null ? ` · reduces hold to ${formatRate(listing.pricing.hold_with_waiver_cents)}` : ""}` : x.description}</div>}</div>
                        <div className="text-[13px] font-bold">{formatRate(x.price_cents)}{x.per === "day" && <span className="font-medium text-text-3">/day</span>}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {providerCard}
              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between"><h2 className="text-[18px] font-bold">Reviews{listing.rating ? ` · ★ ${listing.rating.toFixed(1)}` : ""} <span className="text-[14px] font-medium text-text-3">{listing.rating_count} reviews</span></h2>{listing.rating_count > 2 && <span className="text-[13px] font-semibold text-cobalt">Read all</span>}</div>
                {reviews}
              </section>
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="flex flex-col gap-2.5"><h2 className="text-[16px] font-bold">Rental rules</h2>{rules}</section>
                <section className="flex flex-col gap-2.5"><h2 className="text-[16px] font-bold">Cancellation · {policy.name}</h2>{cancellation}</section>
              </div>
              <section className="flex flex-col gap-2.5 max-w-[420px]">
                <div className="flex items-baseline justify-between"><h2 className="text-[16px] font-bold">Availability</h2><div className="text-[13px] text-text-2">{monthZ.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div></div>
                {calendar}
              </section>
            </div>
            <div className="hidden xl:block">
              <DesktopBookingCard listing={client} config={config} initial={{ start: state.from, end: state.to, qty: state.qty, fulfillment, where: state.where }} today={nowAt} bookedDays={bookedList} eligibleForInstant={eligible} signedIn={!!actor.userId} />
            </div>
          </div>
        </div>
        {/* tablet sticky bottom bar (W05) */}
        <div className="sticky bottom-0 z-30 flex items-center justify-between gap-4 border-t border-border bg-paper px-6 pb-4 pt-3 xl:hidden">
          <div className="min-w-0">
            <div className="text-[18px] font-extrabold tracking-[-0.01em]">{quote ? formatMoney(quote.charged_cents) : formatRate(listing.pricing.day_cents)} <span className="text-[12px] font-medium text-text-3">{quote ? `total · ${quote.billed_days} ${quote.billed_days === 1 ? "day" : "days"} · ${fulfillment}` : "/day"}</span></div>
            <div className="text-[12px] text-text-3">{formatDateTime(state.from).replace(" · ", " ")} → {formatDateTime(state.to).replace(" · ", " ")}{quote && ` · ${formatMoney(quote.hold_cents, { whole: true })} hold at handoff`}</div>
          </div>
          <div className="flex gap-2">
            <div className="flex h-[46px] items-center rounded-[12px] border border-border-strong bg-white px-4 text-[14px] font-semibold"><ChangeDates start={state.from} end={state.to} tz={tz} today={nowAt} minDays={listing.pricing.min_days} maxDays={listing.pricing.max_days} bookedDays={bookedList} carry={{ qty: state.qty, fulfillment, where: state.where }} /></div>
            <Button size="xl" href={available >= state.qty && quote ? `/book/${listing.id}?${ctx}` : undefined} disabled={!(available >= state.qty && quote)} className="!rounded-[12px] !px-6">Reserve</Button>
          </div>
        </div>
      </main>
    </>
  );
}

export { shortName, addMonths };
