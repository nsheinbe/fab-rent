export type ExtraPer = "rental" | "day";

export interface ListingPricing {
  day_cents: number;
  weekend_cents: number | null;
  week_cents: number | null;
  month_cents: number | null;
  hold_cents: number;
  hold_with_waiver_cents: number | null;
  late_fee_cents_per_hour: number;
  late_grace_minutes: number;
  cleaning_fee_cents: number;
  min_days: number;
  max_days: number;
}

export interface ListingDelivery {
  enabled: boolean;
  radius_km: number;
  base_cents: number;
  base_km: number;
  per_km_cents: number;
}

export interface ListingExtra {
  id: string;
  name: string;
  price_cents: number;
  per: ExtraPer;
  is_damage_waiver: boolean;
}

export type Fulfillment = "pickup" | "delivery";

export interface QuoteInput {
  start: Date;
  end: Date;
  qty: number;
  fulfillment: Fulfillment;
  /** straight-line km from provider to the delivery address; required for delivery */
  delivery_km?: number;
  extras: Array<{ extra: ListingExtra; qty?: number }>;
  /** IANA zone for weekday decisions */
  tz: string;
  /** optional context for labels */
  delivery_area?: string;
  payment_method_label?: string;
}

export type QuoteLineKind =
  | "rental"
  | "delivery"
  | "extra"
  | "waiver"
  | "service_fee"
  | "tax";

export interface QuoteLine {
  kind: QuoteLineKind;
  label: string;
  cents: number;
  /** for extras: the extra id */
  ref?: string;
}

export interface RentalBreakdown {
  billed_days: number;
  rate_kind: "day" | "weekend" | "week" | "month" | "mixed";
  /** human explanation, e.g. "$58 × 3 days" or "$210 week + $58 × 2 days" */
  label: string;
  cents: number;
}

export interface Quote {
  billed_days: number;
  qty: number;
  rental: RentalBreakdown;
  lines: QuoteLine[];
  rental_cents: number;
  delivery_cents: number;
  extras_cents: number;
  service_fee_cents: number;
  tax_cents: number;
  charged_cents: number;
  hold_cents: number;
  hold_without_waiver_cents: number;
  waiver_bought: boolean;
  /** what the provider sees */
  provider: ProviderEarnings;
  fee_pct: number;
  tax_pct: number;
  commission_pct: number;
}

export interface ProviderEarnings {
  gross_cents: number; // rental + extras + delivery
  rental_cents: number;
  extras_cents: number;
  delivery_cents: number;
  commission_cents: number;
  payout_cents: number;
}
