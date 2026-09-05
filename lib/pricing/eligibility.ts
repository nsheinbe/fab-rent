import type { MarketplaceConfig } from "@/lib/settings/schema";
import { differenceInMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export interface RenterTrust {
  id_verified: boolean;
  rating: number | null;
  completed_count: number;
}

/** verified ID and (rating ≥ 4.5 or ≥ 3 completed rentals). */
export function instantBookEligible(renter: RenterTrust | null, listingInstant: boolean, config: MarketplaceConfig): boolean {
  if (!listingInstant || !renter) return false;
  const rule = config.verification.instant_book;
  if (rule.require_id && !renter.id_verified) return false;
  return (renter.rating != null && renter.rating >= rule.min_rating) || renter.completed_count >= rule.or_min_completed;
}

/**
 * Same-day bookings are blocked after the listing's cutoff. `cutoffMinutes` is minutes before
 * the provider's closing time on the start day; `closingHour` is the market-local closing hour.
 */
export function sameDayAllowed(start: Date, nowAt: Date, cutoffMinutes: number, closingHour: number, tz: string): boolean {
  const s = toZonedTime(start, tz);
  const n = toZonedTime(nowAt, tz);
  const sameDay = s.getFullYear() === n.getFullYear() && s.getMonth() === n.getMonth() && s.getDate() === n.getDate();
  if (!sameDay) return true;
  const closing = new Date(n);
  closing.setHours(closingHour, 0, 0, 0);
  return differenceInMinutes(closing, n) >= cutoffMinutes;
}
