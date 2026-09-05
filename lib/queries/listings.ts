import "server-only";
import { sql, type Trx } from "@/lib/db";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import { distanceKm, quoteBooking, QuoteError, type ListingDelivery, type ListingExtra, type ListingPricing, type Quote } from "@/lib/pricing";
import type { Availability } from "@/components/domain/pills";
import type { ListingCardData } from "@/components/domain/listing-card";
import { photoUrl } from "@/lib/storage";

export interface SearchParams {
  q?: string;
  where?: string; // neighbourhood slug or "port-maren"
  radius?: number; // km
  from?: Date;
  to?: Date;
  qty?: number;
  fulfillment?: "any" | "pickup" | "delivery";
  min?: number; // $/day
  max?: number;
  types?: string[]; // subcategory slugs
  category?: string; // top-level slug
  provider?: Array<"business" | "individual">;
  rating?: number;
  instant?: boolean;
  sort?: "best" | "price_asc" | "price_desc" | "distance" | "rating";
  showUnavailable?: boolean;
  limit?: number;
  /** restrict to these listing ids (saved listings) */
  ids?: string[];
}

export interface SearchResultItem extends ListingCardData {
  lat: number | null;
  lng: number | null;
  units_available: number;
  units_total: number;
  category_slug: string;
  parent_slug: string | null;
  provider_kind: "business" | "individual";
  quote: Quote | null;
}

export interface SearchResult {
  items: SearchResultItem[];
  hidden_for_dates: number;
  type_counts: Array<{ slug: string; name: string; count: number }>;
  total_matching: number;
  origin: { lat: number; lng: number; label: string };
}

export function originFor(config: MarketplaceConfig, where?: string) {
  const n = where ? config.market.neighbourhoods.find((x) => x.slug === where) : null;
  if (n) return { lat: n.lat, lng: n.lng, label: n.name };
  return { lat: config.market.center.lat, lng: config.market.center.lng, label: config.market.name };
}

function toPricing(l: { day_cents: number; weekend_cents: number | null; week_cents: number | null; month_cents: number | null; hold_cents: number; hold_with_waiver_cents: number | null; late_fee_cents_per_hour: number; late_grace_minutes: number; cleaning_fee_cents: number; min_days: number; max_days: number }): ListingPricing {
  return { day_cents: l.day_cents, weekend_cents: l.weekend_cents, week_cents: l.week_cents, month_cents: l.month_cents, hold_cents: l.hold_cents, hold_with_waiver_cents: l.hold_with_waiver_cents, late_fee_cents_per_hour: l.late_fee_cents_per_hour, late_grace_minutes: l.late_grace_minutes, cleaning_fee_cents: l.cleaning_fee_cents, min_days: l.min_days, max_days: l.max_days };
}
function toDelivery(l: { delivery_enabled: boolean; delivery_radius_km: number | string; delivery_base_cents: number; delivery_base_km: number | string; delivery_per_km_cents: number }): ListingDelivery {
  return { enabled: l.delivery_enabled, radius_km: Number(l.delivery_radius_km), base_cents: l.delivery_base_cents, base_km: Number(l.delivery_base_km), per_km_cents: l.delivery_per_km_cents };
}

export function availabilityFor(available: number, total: number, dates: boolean, nextFree?: Date | null): Availability | null {
  if (!dates) return null;
  if (available <= 0) return { kind: "unavailable", next: nextFree ?? null };
  if (available === 1 && total > 1) return { kind: "only_left", count: 1 };
  return { kind: "available" };
}

/** Results computed for the searched dates: availability, totals, distance from the searched origin. */
export async function searchListings(trx: Trx, params: SearchParams, config: MarketplaceConfig): Promise<SearchResult> {
  const origin = originFor(config, params.where);
  const radius = params.radius ?? config.market.default_radius_km;
  const hasDates = !!(params.from && params.to && params.to > params.from);
  const qty = Math.max(1, params.qty ?? 1);

  let q = trx
    .selectFrom("listings as l")
    .innerJoin("providers as p", "p.id", "l.provider_id")
    .innerJoin("categories as c", "c.id", "l.category_id")
    .leftJoin("categories as pc", "pc.id", "c.parent_id")
    .select((eb) => [
      "l.id", "l.slug", "l.title", "l.day_cents", "l.weekend_cents", "l.week_cents", "l.month_cents", "l.hold_cents", "l.hold_with_waiver_cents", "l.late_fee_cents_per_hour", "l.late_grace_minutes", "l.cleaning_fee_cents", "l.min_days", "l.max_days",
      "l.instant_book", "l.pickup_enabled", "l.delivery_enabled", "l.delivery_radius_km", "l.delivery_base_cents", "l.delivery_base_km", "l.delivery_per_km_cents", "l.pickup_lat", "l.pickup_lng", "l.rating", "l.rating_count", "l.published_at",
      "p.name as provider_name", "p.kind as provider_kind", "p.lat as provider_lat", "p.lng as provider_lng", "p.rating as provider_rating",
      "c.slug as category_slug", "c.name as category_name", "pc.slug as parent_slug",
      eb.selectFrom("listing_photos as ph").select("ph.storage_path").whereRef("ph.listing_id", "=", "l.id").orderBy("ph.is_cover", "desc").orderBy("ph.sort").limit(1).as("cover_path"),
      eb.selectFrom("units as u").select(eb.fn.countAll<number>().as("n")).whereRef("u.listing_id", "=", "l.id").where("u.status", "in", ["rentable", "service_due"]).as("units_total"),
      hasDates ? sql<number>`public.units_available(l.id, ${params.from!.toISOString()}::timestamptz, ${params.to!.toISOString()}::timestamptz)`.as("units_available") : sql<number>`(select count(*) from public.units u where u.listing_id = l.id and u.status in ('rentable','service_due'))`.as("units_available"),
    ])
    .where("l.status", "=", "published")
    .where("p.accepting_bookings", "=", true);

  if (params.q && params.q.trim()) {
    const term = params.q.trim();
    const like = `%${term}%`;
    q = q.where((eb) => eb.or([sql<boolean>`l.search_text @@ websearch_to_tsquery('english', ${term})`, eb("c.name", "ilike", like), eb("pc.name", "ilike", like), eb("l.title", "ilike", like)]));
  }
  if (params.category) q = q.where((eb) => eb.or([eb("c.slug", "=", params.category!), eb("pc.slug", "=", params.category!)]));
  if (params.fulfillment === "pickup") q = q.where("l.pickup_enabled", "=", true);
  if (params.fulfillment === "delivery") q = q.where("l.delivery_enabled", "=", true);
  if (params.min != null) q = q.where("l.day_cents", ">=", Math.round(params.min * 100));
  if (params.max != null && params.max < 1000) q = q.where("l.day_cents", "<=", Math.round(params.max * 100));
  if (params.provider && params.provider.length === 1) q = q.where("p.kind", "=", params.provider[0]!);
  if (params.provider && params.provider.includes("business")) q = q.where((eb) => eb.or([eb("p.kind", "=", "individual"), eb("p.verified", "=", true)]));
  if (params.rating) q = q.where("l.rating", ">=", params.rating);
  if (params.instant) q = q.where("l.instant_book", "=", true);
  if (params.ids) q = q.where("l.id", "in", params.ids.length ? params.ids : ["00000000-0000-0000-0000-000000000000"]);

  const rows = await q.execute();

  // distance filter + per-type counts (before the type filter so the rail shows counts for every type)
  const withDistance = rows
    .map((r) => {
      const lat = r.pickup_lat ?? r.provider_lat;
      const lng = r.pickup_lng ?? r.provider_lng;
      const distance = lat != null && lng != null ? distanceKm(origin, { lat, lng }) : null;
      return { ...r, lat, lng, distance };
    })
    .filter((r) => r.distance == null || r.distance <= radius);

  const typeCountMap = new Map<string, { slug: string; name: string; count: number }>();
  for (const r of withDistance) {
    const cur = typeCountMap.get(r.category_slug) ?? { slug: r.category_slug, name: r.category_name, count: 0 };
    cur.count += 1;
    typeCountMap.set(r.category_slug, cur);
  }
  const type_counts = [...typeCountMap.values()].sort((a, b) => b.count - a.count);

  const typed = params.types && params.types.length > 0 ? withDistance.filter((r) => params.types!.includes(r.category_slug)) : withDistance;

  const items: SearchResultItem[] = [];
  let hidden = 0;
  for (const r of typed) {
    const total = Number(r.units_total ?? 0);
    const available = Number(r.units_available ?? 0);
    let quote: Quote | null = null;
    if (hasDates) {
      try {
        quote = quoteBooking({ pricing: toPricing(r), delivery: toDelivery(r) }, { start: params.from!, end: params.to!, qty, fulfillment: "pickup", extras: [], tz: config.market.timezone }, config);
      } catch (e) {
        if (!(e instanceof QuoteError)) throw e;
        quote = null;
      }
    }
    const unavailable = hasDates && (available < qty || quote === null);
    if (unavailable && !params.showUnavailable) {
      hidden += 1;
      continue;
    }
    const fulfillment: SearchResultItem["fulfillment"] = r.delivery_enabled ? "delivery" : "pickup_only";
    items.push({
      id: r.id,
      slug: r.slug,
      title: r.title,
      provider_name: r.provider_name,
      provider_short: r.provider_kind === "individual" ? `${r.provider_name.split(" ")[0]} ${r.provider_name.split(" ")[1]?.[0] ?? ""}.`.trim() : r.provider_name,
      provider_kind: r.provider_kind,
      rating: r.rating == null ? null : Number(r.rating),
      rating_count: r.rating_count,
      distance_km: r.distance == null ? null : +r.distance.toFixed(1),
      day_cents: r.day_cents,
      total_cents: quote && config.fees.show_all_in_totals ? quote.rental_cents : null,
      billed_days: quote?.billed_days ?? null,
      availability: availabilityFor(available, total, hasDates),
      fulfillment,
      delivery_from_cents: r.delivery_enabled ? r.delivery_base_cents : null,
      instant: r.instant_book,
      cover_url: await photoUrl("listing-photos", r.cover_path),
      lat: r.lat,
      lng: r.lng,
      units_available: available,
      units_total: total,
      category_slug: r.category_slug,
      parent_slug: r.parent_slug,
      quote,
    });
  }

  const sort = params.sort ?? "best";
  items.sort((a, b) => {
    switch (sort) {
      case "price_asc": return a.day_cents - b.day_cents;
      case "price_desc": return b.day_cents - a.day_cents;
      case "distance": return (a.distance_km ?? 999) - (b.distance_km ?? 999);
      case "rating": return (b.rating ?? 0) - (a.rating ?? 0);
      default: {
        // best match: rating-weighted, nearer first, instant bookable ahead
        const score = (x: SearchResultItem) => (x.rating ?? 4) * 10 - (x.distance_km ?? 10) * 1.5 + (x.instant ? 2 : 0) + Math.min(x.rating_count ?? 0, 100) / 25;
        return score(b) - score(a);
      }
    }
  });

  return { items: items.slice(0, params.limit ?? 60), hidden_for_dates: hidden, type_counts, total_matching: typed.length, origin };
}

export interface ListingDetail {
  id: string;
  slug: string;
  listing_code: string;
  title: string;
  brand: string | null;
  model: string | null;
  condition: string | null;
  age_years: number | null;
  last_serviced_at: Date | null;
  description: string;
  specs: Array<{ key: string; value: string }>;
  included_accessories: string[];
  pricing: ListingPricing;
  delivery: ListingDelivery & { window_hours: number; notes: string | null };
  pickup: { enabled: boolean; address: string | null; hours_label: string | null; instructions: string | null; hours: Record<string, [string, string] | null> };
  prep_hours: number;
  same_day_cutoff_minutes: number;
  instant_book: boolean;
  rules: string[];
  id_required: boolean;
  min_renter_age: number;
  policy_id: string;
  status: string;
  rating: number | null;
  rating_count: number;
  quality_score: number | null;
  lat: number | null;
  lng: number | null;
  category: { slug: string; name: string; parent_slug: string | null; parent_name: string | null };
  provider: { id: string; slug: string; name: string; kind: "business" | "individual"; verified: boolean; rating: number | null; rating_count: number; response_minutes: number | null; on_time_pct: number | null; years: number | null; item_count: number; hours_label: string | null; address: string | null; owner_name: string | null; lat: number | null; lng: number | null };
  photos: Array<{ id: string; label: string | null; url: string | null; is_cover: boolean; has_serial_plate: boolean; sort: number }>;
  extras: Array<ListingExtra & { description: string | null; waiver_covers_cents: number | null }>;
  units: Array<{ id: string; unit_number: number; serial: string; status: string; acquired_at: Date | null; hours: number | null; next_service_at: Date | null }>;
  units_total: number;
  reviews: Array<{ id: string; author: string; stars: number; body: string | null; submitted_at: Date; days: number | null }>;
  blocks: Array<{ id: string; unit_id: string | null; start_at: Date; end_at: Date; reason: string; note: string | null }>;
}

export async function getListingBySlug(trx: Trx, slug: string): Promise<ListingDetail | null> {
  const l = await trx
    .selectFrom("listings as l")
    .innerJoin("providers as p", "p.id", "l.provider_id")
    .innerJoin("categories as c", "c.id", "l.category_id")
    .leftJoin("categories as pc", "pc.id", "c.parent_id")
    .leftJoin("profiles as owner", "owner.id", "p.owner_profile_id")
    .selectAll("l")
    .select((eb) => [
      "p.id as provider_id", "p.slug as provider_slug", "p.name as provider_name", "p.kind as provider_kind", "p.verified as provider_verified", "p.rating as provider_rating", "p.rating_count as provider_rating_count", "p.response_minutes", "p.on_time_pct", "p.years_on_platform", "p.opening_hours as provider_hours", "p.address as provider_address", "p.lat as provider_lat", "p.lng as provider_lng",
      "c.slug as category_slug", "c.name as category_name", "pc.slug as parent_slug", "pc.name as parent_name", "owner.name as owner_name",
      eb.selectFrom("listings as l2").select(eb.fn.countAll<number>().as("n")).whereRef("l2.provider_id", "=", "p.id").where("l2.status", "=", "published").as("item_count"),
    ])
    .where("l.slug", "=", slug)
    .executeTakeFirst();
  if (!l) return null;

  const [photos, extras, units, reviews, blocks] = await Promise.all([
    trx.selectFrom("listing_photos").selectAll().where("listing_id", "=", l.id).orderBy("is_cover", "desc").orderBy("sort").execute(),
    trx.selectFrom("listing_extras").selectAll().where("listing_id", "=", l.id).orderBy("sort").execute(),
    trx.selectFrom("units").selectAll().where("listing_id", "=", l.id).orderBy("unit_number").execute(),
    trx
      .selectFrom("reviews as r")
      .innerJoin("public_profiles as a", "a.id", "r.author_id")
      .leftJoin("bookings as b", "b.id", "r.booking_id")
      .select(["r.id", "a.name as author", "r.item_stars", "r.body", "r.submitted_at", "b.billed_days"])
      .where("r.listing_id", "=", l.id)
      .where("r.published_at", "is not", null)
      .where("r.item_stars", "is not", null)
      .orderBy("r.submitted_at", "desc")
      .limit(20)
      .execute(),
    trx.selectFrom("availability_blocks").selectAll().where("listing_id", "=", l.id).execute(),
  ]);

  const hours = ((l.pickup_hours as { days?: Record<string, [string, string] | null> } | null)?.days ?? (l.provider_hours as { days?: Record<string, [string, string] | null> })?.days ?? {}) as Record<string, [string, string] | null>;

  return {
    id: l.id,
    slug: l.slug,
    listing_code: l.listing_code,
    title: l.title,
    brand: l.brand,
    model: l.model,
    condition: l.condition,
    age_years: l.age_years == null ? null : Number(l.age_years),
    last_serviced_at: l.last_serviced_at,
    description: l.description,
    specs: (l.specs as Array<{ key: string; value: string }>) ?? [],
    included_accessories: l.included_accessories,
    pricing: toPricing(l),
    delivery: { ...toDelivery(l), window_hours: Number(l.delivery_window_hours), notes: l.delivery_notes },
    pickup: { enabled: l.pickup_enabled, address: l.pickup_address, hours_label: l.pickup_hours_label, instructions: l.pickup_instructions, hours },
    prep_hours: Number(l.prep_hours),
    same_day_cutoff_minutes: l.same_day_cutoff_minutes,
    instant_book: l.instant_book,
    rules: l.rules,
    id_required: l.id_required,
    min_renter_age: l.min_renter_age,
    policy_id: l.cancellation_policy_id,
    status: l.status,
    rating: l.rating == null ? null : Number(l.rating),
    rating_count: l.rating_count,
    quality_score: l.quality_score,
    lat: l.pickup_lat ?? l.provider_lat,
    lng: l.pickup_lng ?? l.provider_lng,
    category: { slug: l.category_slug, name: l.category_name, parent_slug: l.parent_slug, parent_name: l.parent_name },
    provider: { id: l.provider_id, slug: l.provider_slug, name: l.provider_name, kind: l.provider_kind, verified: l.provider_verified, rating: l.provider_rating == null ? null : Number(l.provider_rating), rating_count: l.provider_rating_count, response_minutes: l.response_minutes, on_time_pct: l.on_time_pct == null ? null : Number(l.on_time_pct), years: l.years_on_platform, item_count: Number(l.item_count ?? 0), hours_label: (l.provider_hours as { label?: string })?.label ?? null, address: l.provider_address, owner_name: l.owner_name, lat: l.provider_lat, lng: l.provider_lng },
    photos: await Promise.all(photos.map(async (p) => ({ id: p.id, label: p.label, url: await photoUrl("listing-photos", p.storage_path), is_cover: p.is_cover, has_serial_plate: p.has_serial_plate, sort: p.sort }))),
    extras: extras.map((x) => ({ id: x.id, name: x.name, description: x.description, price_cents: x.price_cents, per: x.per, is_damage_waiver: x.is_damage_waiver, waiver_covers_cents: x.waiver_covers_cents })),
    units: units.map((u) => ({ id: u.id, unit_number: u.unit_number, serial: u.serial, status: u.status, acquired_at: u.acquired_at, hours: u.hours, next_service_at: u.next_service_at })),
    units_total: units.filter((u) => u.status === "rentable" || u.status === "service_due").length,
    reviews: reviews.map((r) => ({ id: r.id, author: shortName(r.author ?? "Renter"), stars: r.item_stars ?? 0, body: r.body, submitted_at: r.submitted_at, days: r.billed_days })),
    blocks: blocks.map((b) => ({ id: b.id, unit_id: b.unit_id, start_at: b.start_at, end_at: b.end_at, reason: b.reason, note: b.note })),
  };
}

export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

/** Units free for a span (count) and per-day "all units booked" flags for a month (listing page calendar). */
export async function getAvailability(trx: Trx, listingId: string, from: Date, to: Date): Promise<number> {
  const r = await sql<{ n: number }>`select public.units_available(${listingId}::uuid, ${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz) as n`.execute(trx);
  return Number(r.rows[0]?.n ?? 0);
}

export async function bookedDays(trx: Trx, listingId: string, monthStart: Date, monthEnd: Date): Promise<Set<string>> {
  // one query per day of the month is fine for a 30-row month at demo scale; return market-local yyyy-mm-dd keys
  const r = await sql<{ d: string; n: number }>`
    with days as (select generate_series(${monthStart.toISOString()}::timestamptz, ${monthEnd.toISOString()}::timestamptz, interval '1 day') as d)
    select to_char(d, 'YYYY-MM-DD') as d, public.units_available(${listingId}::uuid, d + interval '9 hours', d + interval '17 hours') as n from days`.execute(trx);
  return new Set(r.rows.filter((x) => Number(x.n) <= 0).map((x) => x.d));
}

export async function getCategoriesWithCounts(trx: Trx) {
  return trx
    .selectFrom("categories as c")
    .select((eb) => ["c.id", "c.slug", "c.name", "c.icon", "c.sort", "c.listing_count_display", eb.selectFrom("listings as l").innerJoin("categories as sc", "sc.id", "l.category_id").select(eb.fn.countAll<number>().as("n")).where("l.status", "=", "published").where((e2) => e2.or([e2("sc.id", "=", e2.ref("c.id")), e2("sc.parent_id", "=", e2.ref("c.id"))])).as("count")])
    .where("c.parent_id", "is", null)
    .orderBy("c.sort")
    .execute();
}

export async function getSubcategories(trx: Trx, parentSlug: string) {
  return trx.selectFrom("categories as c").innerJoin("categories as p", "p.id", "c.parent_id").select(["c.slug", "c.name"]).where("p.slug", "=", parentSlug).orderBy("c.sort").execute();
}

/** Cards for the home page ("Available this weekend near …"). */
export async function featuredListings(trx: Trx, config: MarketplaceConfig, from: Date, to: Date, where?: string, limit = 8): Promise<SearchResultItem[]> {
  const r = await searchListings(trx, { from, to, where, radius: 50, sort: "best", limit: 60 }, config);
  const picks = ["dwe7491", "honda-eu2200i", "frame-tent", "sony-fx3", "karcher", "makita-2705", "tandem-sea-kayak", "chiavari"];
  const chosen: SearchResultItem[] = [];
  for (const p of picks) {
    const hit = r.items.find((i) => i.slug.includes(p) && !chosen.includes(i));
    if (hit) chosen.push(hit);
  }
  for (const i of r.items) if (chosen.length < limit && !chosen.includes(i)) chosen.push(i);
  return chosen.slice(0, limit);
}
