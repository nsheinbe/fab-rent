"use client";
import { useEffect, useMemo, useState } from "react";
import { addHours } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import { distanceKm, quoteBooking, QuoteError, type ListingDelivery, type ListingExtra, type ListingPricing, type Quote } from "@/lib/pricing";
import { checkAvailability } from "./actions";
import { toLocalIso } from "@/lib/search/params";

export interface ListingClientData {
  id: string;
  slug: string;
  title: string;
  short_title: string;
  pricing: ListingPricing;
  delivery: ListingDelivery & { window_hours: number };
  extras: Array<ListingExtra & { description: string | null; waiver_covers_cents: number | null }>;
  pickup: { enabled: boolean; address: string | null; hours_label: string | null };
  provider: { name: string; short: string; distance_km: number | null; response_minutes: number | null };
  units_total: number;
  instant_book: boolean;
  policy_id: string;
  lat: number | null;
  lng: number | null;
}

export interface BookingState {
  start: Date;
  end: Date;
  qty: number;
  fulfillment: "pickup" | "delivery";
  address: string;
  area: string; // neighbourhood slug
  drop: string; // "08:00-10:00"
  collect: string;
  extras: Record<string, number>; // extra id → qty
}

export function windowsFor(windowHours: number, openHour = 8, closeHour = 18): string[] {
  const out: string[] = [];
  for (let h = openHour; h + windowHours <= closeHour; h += windowHours) out.push(`${String(h).padStart(2, "0")}:00-${String(h + windowHours).padStart(2, "0")}:00`);
  return out;
}
export function windowContaining(windows: string[], hour: number): string {
  return windows.find((w) => { const [a, b] = w.split("-").map((x) => Number(x.split(":")[0])); return hour >= a! && hour < b!; }) ?? windows.find((w) => Number(w.split("-")[0]!.split(":")[0]) <= hour) ?? windows[windows.length - 1] ?? "08:00-10:00";
}
export function windowLabel(w: string) {
  const [a, b] = w.split("-");
  return `${a}–${b}`;
}

export function useBookingDraft(listing: ListingClientData, config: MarketplaceConfig, initial: Partial<BookingState> & { start: Date; end: Date }, defaultArea?: string) {
  const tz = config.market.timezone;
  const windows = useMemo(() => windowsFor(listing.delivery.window_hours), [listing.delivery.window_hours]);
  const startHour = toZonedTime(initial.start, tz).getHours();
  const endHour = toZonedTime(initial.end, tz).getHours();
  const [state, setState] = useState<BookingState>({
    start: initial.start,
    end: initial.end,
    qty: initial.qty ?? 1,
    fulfillment: initial.fulfillment ?? (listing.pickup.enabled ? "pickup" : "delivery"),
    address: initial.address ?? "",
    area: initial.area ?? defaultArea ?? config.market.neighbourhoods[0]?.slug ?? "",
    drop: initial.drop ?? windowContaining(windows, startHour),
    collect: initial.collect ?? windowContaining(windows, endHour),
    extras: initial.extras ?? {},
  });
  const spanKey = `${toLocalIso(state.start, tz)}|${toLocalIso(state.end, tz)}`;
  const [availability, setAvailability] = useState<{ key: string; n: number | null } | null>(null);
  const available = availability && availability.key === spanKey ? availability.n : null;
  const checking = !availability || availability.key !== spanKey;

  useEffect(() => {
    let alive = true;
    const [from, to] = spanKey.split("|") as [string, string];
    checkAvailability(listing.id, from, to)
      .then((n) => alive && setAvailability({ key: spanKey, n }))
      .catch(() => alive && setAvailability({ key: spanKey, n: null }));
    return () => {
      alive = false;
    };
  }, [listing.id, spanKey]);

  const areaPoint = config.market.neighbourhoods.find((n) => n.slug === state.area);
  const deliveryKm = state.fulfillment === "delivery" && areaPoint && listing.lat != null && listing.lng != null ? +distanceKm({ lat: listing.lat, lng: listing.lng }, areaPoint).toFixed(1) : null;

  let quote: Quote | null = null;
  let error: string | null = null;
  try {
    const extras = Object.entries(state.extras).filter(([, q]) => q > 0).map(([id, q]) => ({ extra: listing.extras.find((x) => x.id === id)!, qty: q })).filter((e) => e.extra);
    quote = quoteBooking({ pricing: listing.pricing, delivery: listing.delivery }, { start: state.start, end: state.end, qty: state.qty, fulfillment: state.fulfillment, delivery_km: deliveryKm ?? undefined, extras, tz, delivery_area: areaPoint?.name }, config);
  } catch (e) {
    error = e instanceof QuoteError ? e.message : (e as Error).message;
  }

  const setDates = (start: Date, end: Date) => {
    const sh = toZonedTime(start, tz).getHours();
    const eh = toZonedTime(end, tz).getHours();
    setState((s) => ({ ...s, start, end, drop: windowContaining(windows, sh), collect: windowContaining(windows, eh) }));
  };
  const toggleExtra = (id: string, on: boolean) => setState((s) => ({ ...s, extras: { ...s.extras, [id]: on ? 1 : 0 } }));

  const waiverBought = Object.entries(state.extras).some(([id, q]) => q > 0 && listing.extras.find((x) => x.id === id)?.is_damage_waiver);
  const maxQty = Math.max(1, available ?? listing.units_total);
  const canReserve = !!quote && !error && (available == null || available >= state.qty) && (state.fulfillment === "pickup" || (state.address.trim().length > 3 && !!areaPoint && deliveryKm != null && deliveryKm <= listing.delivery.radius_km));

  return { state, setState, setDates, toggleExtra, quote, error, available, checking, deliveryKm, areaPoint, windows, waiverBought, maxQty, canReserve, tz };
}

export function defaultStartEnd(tz: string, from?: Date, to?: Date) {
  if (from && to && to > from) return { start: from, end: to };
  const base = toZonedTime(new Date(), tz);
  const start = fromZonedTime(addHours(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1), 9), tz);
  return { start, end: addHours(start, 32) };
}
