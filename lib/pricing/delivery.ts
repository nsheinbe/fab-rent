import type { ListingDelivery } from "./types";

/** base up to base_km, then per_km for each additional km rounded up. Includes collection. */
export function deliveryCents(distanceKm: number, d: ListingDelivery): number {
  if (!d.enabled) throw new Error("Delivery is not offered for this listing");
  if (distanceKm > d.radius_km) throw new Error(`Address is outside the ${d.radius_km} km delivery radius`);
  const extraKm = Math.max(0, Math.ceil(distanceKm - d.base_km));
  return d.base_cents + extraKm * d.per_km_cents;
}

/** Haversine distance in km (straight line — Port Maren has no road routing). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
