import { formatInTimeZone } from "date-fns-tz";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import { comingWeekend, marketLocal } from "@/lib/time";

export type Fulfillment = "any" | "pickup" | "delivery";
export type SortKey = "best" | "price_asc" | "price_desc" | "distance" | "rating";

export interface SearchState {
  q: string;
  where: string; // neighbourhood slug or "" for the whole market
  radius: number;
  from: Date;
  to: Date;
  qty: number;
  fulfillment: Fulfillment;
  min: number | null;
  max: number | null;
  types: string[];
  category: string | null;
  provider: Array<"business" | "individual">;
  rating: number | null;
  instant: boolean;
  sort: SortKey;
  showUnavailable: boolean;
  view: "list" | "map";
}

export type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []).filter(Boolean);

/** ISO without offset in market time: "2026-09-11T09:00" */
export function toLocalIso(d: Date, tz: string) {
  return formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm");
}

export function parseDate(v: string, tz: string): Date | null {
  if (!v) return null;
  const d = marketLocal(v.length === 10 ? `${v}T09:00` : v, tz);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseSearchParams(raw: RawParams, config: MarketplaceConfig, nowAt: Date): SearchState {
  const tz = config.market.timezone;
  const weekend = comingWeekend(nowAt, tz);
  let from = parseDate(one(raw.from), tz) ?? weekend.start;
  let to = parseDate(one(raw.to), tz) ?? weekend.end;
  if (to <= from) {
    from = weekend.start;
    to = weekend.end;
  }
  const radiusRaw = Number(one(raw.radius));
  const sort = one(raw.sort) as SortKey;
  const fulfillment = one(raw.fulfillment) as Fulfillment;
  const provider = many(raw.provider).filter((p): p is "business" | "individual" => p === "business" || p === "individual");
  return {
    q: one(raw.q).trim(),
    where: config.market.neighbourhoods.some((n) => n.slug === one(raw.where)) ? one(raw.where) : "",
    radius: Number.isFinite(radiusRaw) && radiusRaw >= 1 ? Math.min(50, radiusRaw) : config.market.default_radius_km,
    from,
    to,
    qty: Math.max(1, Math.min(50, Number(one(raw.qty)) || 1)),
    fulfillment: ["any", "pickup", "delivery"].includes(fulfillment) ? fulfillment : "any",
    min: one(raw.min) ? Number(one(raw.min)) : null,
    max: one(raw.max) ? Number(one(raw.max)) : null,
    types: many(raw.type),
    category: one(raw.category) || null,
    provider,
    rating: one(raw.rating) ? Number(one(raw.rating)) : null,
    instant: one(raw.instant) === "1",
    sort: ["best", "price_asc", "price_desc", "distance", "rating"].includes(sort) ? sort : "best",
    showUnavailable: one(raw.show) === "all",
    view: one(raw.view) === "map" ? "map" : "list",
  };
}

export function toSearchQuery(s: Partial<SearchState> & { from?: Date; to?: Date }, tz: string): string {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.where) p.set("where", s.where);
  if (s.radius != null) p.set("radius", String(s.radius));
  if (s.from) p.set("from", toLocalIso(s.from, tz));
  if (s.to) p.set("to", toLocalIso(s.to, tz));
  if (s.qty && s.qty > 1) p.set("qty", String(s.qty));
  if (s.fulfillment && s.fulfillment !== "any") p.set("fulfillment", s.fulfillment);
  if (s.min != null) p.set("min", String(s.min));
  if (s.max != null) p.set("max", String(s.max));
  if (s.types && s.types.length) p.set("type", s.types.join(","));
  if (s.category) p.set("category", s.category);
  if (s.provider && s.provider.length) p.set("provider", s.provider.join(","));
  if (s.rating != null) p.set("rating", String(s.rating));
  if (s.instant) p.set("instant", "1");
  if (s.sort && s.sort !== "best") p.set("sort", s.sort);
  if (s.showUnavailable) p.set("show", "all");
  if (s.view === "map") p.set("view", "map");
  return p.toString();
}

/** How many filters are active beyond the defaults (for the "Filters · 2" chip). */
export function activeFilterCount(s: SearchState, config: MarketplaceConfig): number {
  let n = 0;
  if (s.fulfillment !== "any") n++;
  if (s.min != null || s.max != null) n++;
  if (s.types.length) n++;
  if (s.provider.length) n++;
  if (s.rating != null) n++;
  if (s.instant) n++;
  if (s.radius !== config.market.default_radius_km) n++;
  if (!s.showUnavailable) n++; // "Only show available" is on by default and counts as a filter in the design
  return n;
}

/** Query params that carry booking context onto listing/booking pages. */
export function bookingContextQuery(s: Pick<SearchState, "from" | "to" | "qty"> & { fulfillment?: Fulfillment; where?: string }, tz: string) {
  const p = new URLSearchParams();
  p.set("from", toLocalIso(s.from, tz));
  p.set("to", toLocalIso(s.to, tz));
  if (s.qty > 1) p.set("qty", String(s.qty));
  if (s.fulfillment && s.fulfillment !== "any") p.set("fulfillment", s.fulfillment);
  if (s.where) p.set("where", s.where);
  return p.toString();
}
