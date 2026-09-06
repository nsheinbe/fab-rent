import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActor, withActor } from "@/lib/auth";
import { getLiveSettings } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { getListingBySlug } from "@/lib/queries/listings";
import { parseSearchParams, type RawParams } from "@/lib/search/params";
import { distanceKm } from "@/lib/pricing";
import { BookingBuilder } from "./builder";
import type { ListingClientData } from "../../listings/booking-hooks";

export const metadata: Metadata = { title: "Dates & delivery" };
export const dynamic = "force-dynamic";

export default async function BookPage({ params, searchParams }: { params: Promise<{ listingId: string }>; searchParams: Promise<RawParams> }) {
  const [{ listingId }, sp, { config }, actor] = await Promise.all([params, searchParams, getLiveSettings(), getActor()]);
  const nowAt = now();
  const state = parseSearchParams(sp, config, nowAt);
  const listing = await withActor(async (trx) => {
    const row = await trx.selectFrom("listings").select("slug").where("id", "=", listingId).executeTakeFirst();
    return row ? getListingBySlug(trx, row.slug) : null;
  });
  if (!listing || listing.status !== "published") notFound();
  const origin = state.where ? config.market.neighbourhoods.find((n) => n.slug === state.where) : actor.profile?.neighbourhood ? config.market.neighbourhoods.find((n) => n.name === actor.profile!.neighbourhood) : config.market.neighbourhoods[0];
  const distance = origin && listing.lat != null && listing.lng != null ? +distanceKm(origin, { lat: listing.lat, lng: listing.lng }).toFixed(1) : null;
  const client: ListingClientData = { id: listing.id, slug: listing.slug, title: listing.title, short_title: listing.title.split(" ").slice(0, 3).join(" "), pricing: listing.pricing, delivery: listing.delivery, extras: listing.extras, pickup: listing.pickup, provider: { name: listing.provider.name, short: listing.provider.name.split(" ")[0]!, distance_km: distance, response_minutes: listing.provider.response_minutes }, units_total: listing.units_total, instant_book: listing.instant_book, policy_id: listing.policy_id, lat: listing.lat, lng: listing.lng };
  const defaultArea = actor.profile?.neighbourhood ? config.market.neighbourhoods.find((n) => n.name === actor.profile!.neighbourhood)?.slug : state.where || undefined;
  return <BookingBuilder listing={client} config={config} initial={{ start: state.from, end: state.to, qty: state.qty, fulfillment: state.fulfillment === "delivery" && listing.delivery.enabled ? "delivery" : listing.pickup.enabled ? "pickup" : "delivery" }} today={nowAt} defaultArea={defaultArea} where={state.where} backHref={`/listings/${listing.slug}?${new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString()}`} />;
}
