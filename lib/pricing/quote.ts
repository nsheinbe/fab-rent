import type { MarketplaceConfig } from "@/lib/settings/schema";
import { formatKm, formatMoney, formatRate } from "@/lib/format";
import { billedDays } from "./days";
import { deliveryCents } from "./delivery";
import { clamp, pctOf } from "./money";
import { rentalForOneUnit } from "./rental";
import type { ListingDelivery, ListingPricing, ProviderEarnings, Quote, QuoteInput, QuoteLine } from "./types";

export function renterServiceFee(rentalCents: number, config: MarketplaceConfig): number {
  if (rentalCents <= 0) return 0;
  const raw = pctOf(rentalCents, config.fees.renter_fee_pct);
  return clamp(raw, config.fees.renter_fee_min_cents, config.fees.renter_fee_cap_cents);
}

export function salesTax(taxableCents: number, config: MarketplaceConfig): number {
  return pctOf(taxableCents, config.tax.sales_tax_pct);
}

export function providerCommission(rentalCents: number, extrasCents: number, config: MarketplaceConfig): number {
  return pctOf(rentalCents + extrasCents, config.fees.provider_commission_pct);
}

export function providerEarnings(
  rental_cents: number,
  extras_cents: number,
  delivery_cents: number,
  config: MarketplaceConfig,
): ProviderEarnings {
  const commission_cents = providerCommission(rental_cents, extras_cents, config);
  const gross_cents = rental_cents + extras_cents + delivery_cents;
  return { gross_cents, rental_cents, extras_cents, delivery_cents, commission_cents, payout_cents: gross_cents - commission_cents };
}

/** Hold for the booking: listing hold (or hold-with-waiver), × qty, never above the market cap. */
export function holdCents(p: ListingPricing, qty: number, waiverBought: boolean, config: MarketplaceConfig): number {
  const base = waiverBought && p.hold_with_waiver_cents != null ? p.hold_with_waiver_cents : p.hold_cents;
  return Math.min(base * Math.max(1, qty), config.holds.max_hold_cents);
}

export interface QuoteListing {
  pricing: ListingPricing;
  delivery: ListingDelivery;
}

export class QuoteError extends Error {
  constructor(
    message: string,
    readonly code: "min_days" | "max_days" | "invalid_span" | "delivery" | "qty",
  ) {
    super(message);
  }
}

/** The renter-facing quote. Pure: config + listing + inputs → cents. */
export function quoteBooking(listing: QuoteListing, input: QuoteInput, config: MarketplaceConfig): Quote {
  const { pricing } = listing;
  const days = billedDays(input.start, input.end);
  if (days <= 0) throw new QuoteError("Return must be after the start", "invalid_span");
  if (days < pricing.min_days) throw new QuoteError(`Minimum rental is ${pricing.min_days} day${pricing.min_days === 1 ? "" : "s"}`, "min_days");
  if (days > pricing.max_days) throw new QuoteError(`Maximum rental is ${pricing.max_days} days`, "max_days");
  const qty = Math.max(1, Math.floor(input.qty));
  if (!Number.isFinite(qty) || qty < 1) throw new QuoteError("Quantity must be at least 1", "qty");

  const oneUnit = rentalForOneUnit(input.start, input.end, days, pricing, input.tz);
  const rental_cents = oneUnit.cents * qty;
  const rentalLabel = qty > 1 ? `${oneUnit.label} × ${qty} units` : oneUnit.label;

  const lines: QuoteLine[] = [{ kind: "rental", label: rentalLabel, cents: rental_cents }];

  let delivery_cents = 0;
  if (input.fulfillment === "delivery") {
    if (input.delivery_km == null) throw new QuoteError("Delivery distance is required", "delivery");
    try {
      delivery_cents = deliveryCents(input.delivery_km, listing.delivery);
    } catch (e) {
      throw new QuoteError((e as Error).message, "delivery");
    }
    const where = input.delivery_area ? ` · ${input.delivery_area}` : ` · ${formatKm(input.delivery_km)}`;
    lines.push({ kind: "delivery", label: `Delivery & collection${where}`, cents: delivery_cents });
  } else {
    lines.push({ kind: "delivery", label: "Pickup", cents: 0 });
  }

  let extras_cents = 0;
  let waiverBought = false;
  for (const { extra, qty: exQty } of input.extras) {
    if (extra.is_damage_waiver) {
      waiverBought = true;
      const cents = extra.per === "day" ? extra.price_cents * days * qty : extra.price_cents * qty;
      extras_cents += cents;
      const per = extra.per === "day" ? ` · ${formatRate(extra.price_cents)} × ${days}${qty > 1 ? ` × ${qty}` : ""}` : "";
      lines.push({ kind: "waiver", label: `${extra.name}${per}`, cents, ref: extra.id });
    } else {
      const n = Math.max(1, exQty ?? 1);
      const cents = extra.per === "day" ? extra.price_cents * days * n : extra.price_cents * n;
      extras_cents += cents;
      const per =
        extra.per === "day"
          ? ` · ${formatRate(extra.price_cents)} × ${days}${n > 1 ? ` × ${n}` : ""}`
          : n > 1
            ? ` × ${n}`
            : "";
      lines.push({ kind: "extra", label: `${extra.name}${per}`, cents, ref: extra.id });
    }
  }

  const service_fee_cents = renterServiceFee(rental_cents, config);
  lines.push({
    kind: "service_fee",
    label: `Service fee (${config.fees.renter_fee_pct}% of rental)`,
    cents: service_fee_cents,
  });

  const taxable = rental_cents + service_fee_cents + delivery_cents + extras_cents;
  const tax_cents = salesTax(taxable, config);
  lines.push({ kind: "tax", label: `${config.tax.label} ${config.tax.sales_tax_pct}%`, cents: tax_cents });

  const charged_cents = rental_cents + delivery_cents + extras_cents + service_fee_cents + tax_cents;

  return {
    billed_days: days,
    qty,
    rental: { ...oneUnit, cents: rental_cents, label: rentalLabel },
    lines,
    rental_cents,
    delivery_cents,
    extras_cents,
    service_fee_cents,
    tax_cents,
    charged_cents,
    hold_cents: holdCents(pricing, qty, waiverBought, config),
    hold_without_waiver_cents: holdCents(pricing, qty, false, config),
    waiver_bought: waiverBought,
    provider: providerEarnings(rental_cents, extras_cents, delivery_cents, config),
    fee_pct: config.fees.renter_fee_pct,
    tax_pct: config.tax.sales_tax_pct,
    commission_pct: config.fees.provider_commission_pct,
  };
}

/** `$174 · 3 days` for cards. */
export function cardTotalLabel(q: Quote): string {
  return `${formatMoney(q.rental_cents, { whole: true })} · ${q.billed_days} ${q.billed_days === 1 ? "day" : "days"}`;
}
