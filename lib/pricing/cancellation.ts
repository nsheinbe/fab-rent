import { differenceInMinutes, subHours } from "date-fns";
import type { CancellationPolicy, MarketplaceConfig } from "@/lib/settings/schema";
import { pctOf } from "./money";

export interface CancellationInput {
  policy: CancellationPolicy;
  start: Date;
  cancelledAt: Date;
  rental_cents: number;
  delivery_cents: number;
  extras_cents: number;
  service_fee_cents: number;
  tax_cents: number;
  charged_cents: number;
}

export interface CancellationResult {
  by: "renter" | "provider";
  free: boolean;
  keep_pct: number;
  /** portion of the rental the provider keeps */
  kept_rental_cents: number;
  /** service fee + tax on the refunded portion are always returned; delivery & extras always refunded */
  refunded_cents: number;
  credit_cents: number;
  free_until: Date;
  explanation: string;
}

export function freeCancelUntil(policy: CancellationPolicy, start: Date): Date {
  return subHours(start, policy.free_until_hours);
}

/** The tier that applies at `cancelledAt` (after the free window). */
export function applicableKeepPct(policy: CancellationPolicy, start: Date, cancelledAt: Date): number {
  if (cancelledAt <= freeCancelUntil(policy, start)) return 0;
  const hoursBefore = differenceInMinutes(start, cancelledAt) / 60;
  // tiers with a within_hours bound come first (most restrictive), null = catch-all
  const bounded = policy.tiers.filter((t) => t.within_hours != null).sort((a, b) => a.within_hours! - b.within_hours!);
  for (const t of bounded) if (hoursBefore <= t.within_hours!) return t.keep_pct;
  const fallback = policy.tiers.find((t) => t.within_hours == null);
  return fallback?.keep_pct ?? 0;
}

/**
 * Renter cancellation. Kept = keep_pct of the rental charge; everything else (delivery, extras,
 * the service fee and the tax on the refunded portion) is returned. Nothing is ever held.
 */
export function renterCancellation(input: CancellationInput, config: MarketplaceConfig): CancellationResult {
  const keep_pct = applicableKeepPct(input.policy, input.start, input.cancelledAt);
  const kept_rental_cents = pctOf(input.rental_cents, keep_pct);
  // fee on the kept rental portion is also kept (it is fab.rent's fee on money that changed hands)
  const kept_fee = keep_pct > 0 ? Math.min(input.service_fee_cents, pctOf(kept_rental_cents, config.fees.renter_fee_pct)) : 0;
  const kept_tax = salesTaxOn(kept_rental_cents + kept_fee, config);
  const kept_total = kept_rental_cents + kept_fee + kept_tax;
  const refunded_cents = Math.max(0, input.charged_cents - kept_total);
  const free_until = freeCancelUntil(input.policy, input.start);
  return {
    by: "renter",
    free: keep_pct === 0,
    keep_pct,
    kept_rental_cents,
    refunded_cents,
    credit_cents: 0,
    free_until,
    explanation:
      keep_pct === 0
        ? "Cancelled inside the free window — full refund."
        : `${keep_pct}% of the rental charge is kept under the ${input.policy.name} policy; delivery, extras and the fee and tax on the refunded portion are returned.`,
  };
}

function salesTaxOn(cents: number, config: MarketplaceConfig) {
  return pctOf(cents, config.tax.sales_tax_pct);
}

/** Provider cancellation: full refund plus a credit ($20, or 10 % of the rental on Strict). */
export function providerCancellation(input: CancellationInput): CancellationResult {
  const p = input.policy;
  const credit_cents =
    p.provider_cancel_credit_pct != null ? pctOf(input.rental_cents, p.provider_cancel_credit_pct) : (p.provider_cancel_credit_cents ?? 0);
  return {
    by: "provider",
    free: true,
    keep_pct: 0,
    kept_rental_cents: 0,
    refunded_cents: input.charged_cents,
    credit_cents,
    free_until: freeCancelUntil(p, input.start),
    explanation: `Provider cancelled — refunded in full plus a credit.`,
  };
}

/** Copy for the listing page / checkout agreement line. */
export function describePolicy(policy: CancellationPolicy): string {
  const free = policy.free_until_hours >= 48 && policy.free_until_hours % 24 === 0 ? `${policy.free_until_hours / 24} days` : `${policy.free_until_hours} h`;
  const tiers = [...policy.tiers].sort((a, b) => (b.within_hours ?? Infinity) - (a.within_hours ?? Infinity));
  const parts = tiers.map((t) =>
    t.within_hours == null
      ? `${t.keep_pct}% of the rental charge is kept`
      : `${t.keep_pct}% inside ${t.within_hours >= 48 ? `${t.within_hours / 24} days` : `${t.within_hours} h`}`,
  );
  return `Free cancellation until ${free} before start. After that, ${parts.join(", then ")}.`;
}
