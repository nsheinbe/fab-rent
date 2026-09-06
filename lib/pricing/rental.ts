import { isWeekendSpan } from "./days";
import type { ListingPricing, RentalBreakdown } from "./types";
import { formatRate } from "@/lib/format";

interface Decomp {
  cents: number;
  months: number;
  weeks: number;
  days: number;
}

/**
 * Lowest-wins decomposition of `days` into months (from 28 d), weeks (from 5 d) and days.
 * A remainder of ≥5 days is itself billed as a week; shorter remainders at the day rate.
 */
function cheapest(days: number, p: ListingPricing, memo = new Map<number, Decomp>()): Decomp {
  if (days <= 0) return { cents: 0, months: 0, weeks: 0, days: 0 };
  const hit = memo.get(days);
  if (hit) return hit;

  let best: Decomp = { cents: days * p.day_cents, months: 0, weeks: 0, days };

  if (p.week_cents != null && days >= 5) {
    const rest = cheapest(Math.max(0, days - 7), p, memo);
    const cand = { cents: p.week_cents + rest.cents, months: rest.months, weeks: rest.weeks + 1, days: rest.days };
    if (cand.cents < best.cents) best = cand;
  }
  if (p.month_cents != null && days >= 28) {
    const rest = cheapest(Math.max(0, days - 28), p, memo);
    const cand = { cents: p.month_cents + rest.cents, months: rest.months + 1, weeks: rest.weeks, days: rest.days };
    if (cand.cents < best.cents) best = cand;
  }
  memo.set(days, best);
  return best;
}

function describe(d: Decomp, p: ListingPricing): string {
  const parts: string[] = [];
  if (d.months) parts.push(`${formatRate(p.month_cents!)} × ${d.months} ${d.months === 1 ? "month" : "months"}`);
  if (d.weeks) parts.push(`${formatRate(p.week_cents!)} × ${d.weeks} ${d.weeks === 1 ? "week" : "weeks"}`);
  if (d.days) parts.push(`${formatRate(p.day_cents)} × ${d.days} ${d.days === 1 ? "day" : "days"}`);
  return parts.join(" + ");
}

/** Rental charge for one unit over the span. */
export function rentalForOneUnit(
  start: Date,
  end: Date,
  billed_days: number,
  p: ListingPricing,
  tz: string,
): RentalBreakdown {
  const decomp = cheapest(billed_days, p);
  let cents = decomp.cents;
  let rate_kind: RentalBreakdown["rate_kind"] =
    decomp.months && !decomp.weeks && !decomp.days
      ? "month"
      : decomp.weeks && !decomp.months && !decomp.days
        ? "week"
        : !decomp.weeks && !decomp.months
          ? "day"
          : "mixed";
  let label = describe(decomp, p);

  if (p.weekend_cents != null && isWeekendSpan(start, end, tz) && p.weekend_cents < cents) {
    cents = p.weekend_cents;
    rate_kind = "weekend";
    label = `Weekend rate (Fri–Mon)`;
  }
  return { billed_days, rate_kind, label, cents };
}
