import { z } from "zod";

export const reviewModeSchema = z.enum(["auto_publish_verified", "manual"]);

export const cancellationTierSchema = z.object({
  /** Applies when the cancellation happens within this many hours of start; null = any time after free window */
  within_hours: z.number().nullable(),
  keep_pct: z.number().min(0).max(100),
});

export const cancellationPolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  short_label: z.string().optional(),
  free_until_hours: z.number().nonnegative(),
  tiers: z.array(cancellationTierSchema).min(1),
  provider_cancel_credit_cents: z.number().int().nonnegative().nullable(),
  provider_cancel_credit_pct: z.number().nullable(),
  is_default: z.boolean().default(false),
});

export const categoryRuleSchema = z.object({
  category_slug: z.string(),
  review_mode: reviewModeSchema,
  price_alert_pct: z.number(),
  required_documents: z.array(z.object({ key: z.string(), label: z.string(), max_age_months: z.number().nullable().optional() })),
  renter_requirements: z.array(z.string()).default([]),
});

export const neighbourhoodSchema = z.object({ name: z.string(), slug: z.string(), lat: z.number(), lng: z.number() });

export const marketplaceConfigSchema = z.object({
  fees: z.object({
    renter_fee_pct: z.number(),
    renter_fee_min_cents: z.number().int(),
    renter_fee_cap_cents: z.number().int(),
    provider_commission_pct: z.number(),
    commission_tiers: z.array(z.object({ from_cents: z.number().int(), pct: z.number() })).nullable(),
    show_all_in_totals: z.boolean(),
  }),
  tax: z.object({ sales_tax_pct: z.number(), label: z.string() }),
  holds: z.object({
    placed_at: z.enum(["handoff", "booking"]),
    auto_release_business_days: z.number().int(),
    max_hold_cents: z.number().int(),
    claim_window: z.enum(["return_checkin"]),
    renter_response_hours: z.number().int(),
    admin_decision_sla_hours: z.number().int(),
    hold_expiry_days: z.number().int(),
    wear_allowance_pct: z.number(),
    wear_allowance_min_age_years: z.number(),
    appeal_days: z.number().int(),
  }),
  waiver: z.object({
    enabled: z.boolean(),
    price_pct_per_day: z.number(),
    min_cents_per_day: z.number().int(),
    covers_up_to_cents: z.number().int(),
    hold_with_waiver_max_fraction: z.number(),
    excludes: z.array(z.string()),
  }),
  cancellation: z.object({ policies: z.array(cancellationPolicySchema).min(1) }),
  payouts: z.object({
    clears_at: z.enum(["return_checkin", "handoff"]),
    schedules: z.array(z.string()),
    default_schedule: z.string(),
    min_payout_cents: z.number().int(),
    pause_when: z.array(z.enum(["tax_id_unverified", "bank_unverified"])),
  }),
  review: z.object({
    always_review_below_completed: z.number().int(),
    category_rules: z.array(categoryRuleSchema),
    listing_sla_hours: z.number().int(),
  }),
  verification: z.object({
    photo_id_before_first_booking: z.boolean(),
    instant_book: z.object({ require_id: z.boolean(), min_rating: z.number(), or_min_completed: z.number().int() }),
    condition_photos_min: z.number().int(),
    auto_suspend_on_chargeback: z.boolean(),
    review_auto_publish_days: z.number().int(),
  }),
  market: z.object({
    name: z.string(),
    currency: z.object({ code: z.string(), symbol: z.string(), name: z.string() }),
    default_radius_km: z.number(),
    max_delivery_radius_km: z.number(),
    timezone_label: z.string(),
    timezone: z.string(),
    week_starts: z.enum(["monday", "sunday"]),
    center: z.object({ lat: z.number(), lng: z.number() }),
    neighbourhoods: z.array(neighbourhoodSchema),
  }),
});

export type MarketplaceConfig = z.infer<typeof marketplaceConfigSchema>;
export type CancellationPolicy = z.infer<typeof cancellationPolicySchema>;
export type CategoryRule = z.infer<typeof categoryRuleSchema>;
export type Neighbourhood = z.infer<typeof neighbourhoodSchema>;
