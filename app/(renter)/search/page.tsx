import type { Metadata } from "next";
import { getActor, withActor } from "@/lib/auth";
import { getLiveSettings } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { searchListings } from "@/lib/queries/listings";
import { parseSearchParams, bookingContextQuery, toSearchQuery, type RawParams } from "@/lib/search/params";
import { RenterHeader, BackLink } from "@/components/domain/renter-header";
import { SearchBar } from "@/components/domain/search-bar";
import { ListingCard } from "@/components/domain/listing-card";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { formatDateRange } from "@/lib/format";
import { MobileFilters, FilterRail, SortSelect, ShowHiddenLink } from "./filters";
import { DesktopResults, MobileMap } from "./results";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<RawParams> }): Promise<Metadata> {
  const sp = await searchParams;
  const q = typeof sp.q === "string" && sp.q ? sp.q : "Everything";
  return { title: `${q.charAt(0).toUpperCase() + q.slice(1)} in Port Maren` };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const sp = await searchParams;
  const [{ config }, actor] = await Promise.all([getLiveSettings(), getActor()]);
  const tz = config.market.timezone;
  const nowAt = now();
  const state = parseSearchParams(sp, config, nowAt);
  const result = await withActor((trx) => searchListings(trx, { ...state, min: state.min ?? undefined, max: state.max ?? undefined, rating: state.rating ?? undefined, category: state.category ?? undefined }, config));
  const ctx = bookingContextQuery({ from: state.from, to: state.to, qty: state.qty, fulfillment: state.fulfillment, where: state.where }, tz);
  const histogram = Array.from({ length: 8 }, () => 0);
  for (const i of result.items) histogram[Math.min(7, Math.floor(i.day_cents / 100 / 50))]! += 1;
  const user = actor.profile ? { name: actor.profile.name } : null;
  const dates = formatDateRange(state.from, state.to, { tz });
  const noun = state.q ? `${state.q.toLowerCase()}${state.q.toLowerCase().endsWith("s") ? "" : "s"}` : "items";
  const empty = (
    <EmptyState
      icon="search"
      title={result.hidden_for_dates > 0 ? `Nothing free for ${dates}` : "No results"}
      body={result.hidden_for_dates > 0 ? `${result.hidden_for_dates} ${result.hidden_for_dates === 1 ? "listing matches" : "listings match"} but ${result.hidden_for_dates === 1 ? "is" : "are"} booked for your dates. Show them anyway, or try different dates.` : "Try a broader search, a bigger distance or fewer filters."}
      action={result.hidden_for_dates > 0 ? <ShowHiddenLink state={state} tz={tz}>Show unavailable listings</ShowHiddenLink> : <Button variant="secondary" size="md" href="/search">Clear search</Button>}
    />
  );

  return (
    <>
      <RenterHeader user={user} variant="search" search={<SearchBar variant="desktop" state={state} neighbourhoods={config.market.neighbourhoods} marketName={config.market.name} tz={tz} today={nowAt} carry={state} />} />

      {/* ---------- mobile */}
      <div className="lg:hidden flex flex-1 flex-col">
        {state.view === "map" ? (
          <>
            <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2.5 px-4 pt-[max(14px,env(safe-area-inset-top))]">
              <BackLink href="/" round className="shadow-[0_4px_14px_rgba(30,30,28,.1)]" />
              <SearchBar variant="pill" state={state} neighbourhoods={config.market.neighbourhoods} marketName={config.market.name} tz={tz} today={nowAt} carry={state} className="!shadow-[0_4px_14px_rgba(30,30,28,.1)] mr-[70px]" />
            </div>
            <MobileMap items={result.items} origin={result.origin} radius={state.radius} ctx={ctx} state={state} tz={tz} />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 px-4 pt-[max(14px,env(safe-area-inset-top))]">
              <BackLink href="/" round />
              <SearchBar variant="pill" state={state} neighbourhoods={config.market.neighbourhoods} marketName={config.market.name} tz={tz} today={nowAt} carry={state} />
              <Link href={`/search?${toSearchQuery({ ...state, view: "map" }, tz)}`} aria-label="Show map" className="flex size-10 flex-none items-center justify-center rounded-full border border-border bg-white text-charcoal no-underline"><Icon name="pin" size={18} /></Link>
            </div>
            <div className="pt-3.5"><MobileFilters state={state} config={config} typeCounts={result.type_counts} hidden={result.hidden_for_dates} histogram={histogram} resultCount={result.items.length} /></div>
            <div className="flex items-baseline justify-between px-5 pt-3.5">
              <div className="text-[13px] text-text-2"><b className="text-charcoal">{result.items.length} available</b>{result.hidden_for_dates > 0 && !state.showUnavailable ? ` · ${result.hidden_for_dates} hidden for your dates` : state.showUnavailable ? " · showing unavailable too" : ""}</div>
              {(result.hidden_for_dates > 0 || state.showUnavailable) && <ShowHiddenLink state={state} tz={tz}>{state.showUnavailable ? "Hide" : "Show"}</ShowHiddenLink>}
            </div>
            <div className="flex flex-col gap-2.5 px-4 pt-2.5 pb-6">
              {result.items.length === 0 ? empty : result.items.map((l) => <ListingCard key={l.id} listing={l} variant="row" href={`/listings/${l.slug}?${ctx}`} />)}
            </div>
          </>
        )}
      </div>

      {/* ---------- desktop */}
      <div className="hidden lg:grid h-[calc(100vh-64px)] grid-rows-[minmax(0,1fr)] overflow-hidden grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_420px]">
        <FilterRail state={state} config={config} typeCounts={result.type_counts} hidden={result.hidden_for_dates} histogram={histogram} />
        <DesktopResults
          items={result.items}
          origin={result.origin}
          radius={state.radius}
          ctx={ctx}
          empty={empty}
          header={
            <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-1">
              <div className="text-[15px]"><b>{result.items.length} {noun}</b> <span className="text-text-2">{state.showUnavailable ? "matching" : "available"} {dates} within {state.radius} km{result.hidden_for_dates > 0 && !state.showUnavailable ? ` · ${result.hidden_for_dates} hidden for your dates` : ""}</span> {(result.hidden_for_dates > 0 || state.showUnavailable) && <ShowHiddenLink state={state} tz={tz}>{state.showUnavailable ? "Hide unavailable" : "Show"}</ShowHiddenLink>}</div>
              <SortSelect state={state} tz={tz} />
            </div>
          }
        />
      </div>
    </>
  );
}
