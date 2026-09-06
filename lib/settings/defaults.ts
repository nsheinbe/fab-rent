import type { MarketplaceConfig } from "./schema";

/**
 * Port Maren neighbourhoods on a fictional coastal grid. Old Harbour is the centre;
 * offsets are chosen so the design's distances come out (Northlands 2.1 km, Ridgeway 3.4,
 * Vesper Hill 3.9, The Docks 5.8, Millbrook 6.4; Northlands ↔ Vesper Hill 4.2).
 */
export const PORT_MAREN_CENTER = { lat: 44.62, lng: -63.57 };
const KM_PER_DEG_LAT = 111.32;
const KM_PER_DEG_LNG = 111.32 * Math.cos((PORT_MAREN_CENTER.lat * Math.PI) / 180);
export function offsetKm(eastKm: number, northKm: number) {
  return {
    lat: +(PORT_MAREN_CENTER.lat + northKm / KM_PER_DEG_LAT).toFixed(6),
    lng: +(PORT_MAREN_CENTER.lng + eastKm / KM_PER_DEG_LNG).toFixed(6),
  };
}

export const NEIGHBOURHOODS = [
  { name: "Old Harbour", slug: "old-harbour", ...offsetKm(0, 0) },
  { name: "Vesper Hill", slug: "vesper-hill", ...offsetKm(3.87, 0.47) },
  { name: "Northlands", slug: "northlands", ...offsetKm(0, 2.1) },
  { name: "Millbrook", slug: "millbrook", ...offsetKm(4.5, 4.55) },
  { name: "Saltway", slug: "saltway", ...offsetKm(-7.0, 1.5) },
  { name: "The Docks", slug: "the-docks", ...offsetKm(-1.5, -5.6) },
  { name: "Kestrel Park", slug: "kestrel-park", ...offsetKm(5.0, -1.0) },
  { name: "Ridgeway", slug: "ridgeway", ...offsetKm(-2.4, 2.4) },
];

export const CATEGORY_RULES: MarketplaceConfig["review"]["category_rules"] = [
  { category_slug: "power-tools", review_mode: "auto_publish_verified", price_alert_pct: 35, required_documents: [], renter_requirements: [] },
  { category_slug: "construction", review_mode: "auto_publish_verified", price_alert_pct: 30, required_documents: [], renter_requirements: [] },
  { category_slug: "construction-lifts-access", review_mode: "manual", price_alert_pct: 25, required_documents: [{ key: "inspection_cert", label: "Inspection certificate", max_age_months: 6 }], renter_requirements: ["Operator licence required from renter"] },
  { category_slug: "garden", review_mode: "auto_publish_verified", price_alert_pct: 35, required_documents: [], renter_requirements: [] },
  { category_slug: "garden-chainsaws", review_mode: "manual", price_alert_pct: 35, required_documents: [{ key: "chain_brake_cert", label: "Chain-brake safety check certificate", max_age_months: 12 }], renter_requirements: [] },
  { category_slug: "events-party", review_mode: "auto_publish_verified", price_alert_pct: 40, required_documents: [], renter_requirements: [] },
  { category_slug: "events-inflatables", review_mode: "manual", price_alert_pct: 50, required_documents: [{ key: "public_liability", label: "Public liability insurance ≥ $1M", max_age_months: null }], renter_requirements: [] },
  { category_slug: "cameras-av", review_mode: "auto_publish_verified", price_alert_pct: 40, required_documents: [{ key: "serial_plate_photo", label: "Serial plate photo", max_age_months: null }], renter_requirements: [] },
  { category_slug: "outdoor", review_mode: "auto_publish_verified", price_alert_pct: 40, required_documents: [], renter_requirements: [] },
  { category_slug: "cleaning", review_mode: "auto_publish_verified", price_alert_pct: 35, required_documents: [], renter_requirements: [] },
  { category_slug: "moving", review_mode: "auto_publish_verified", price_alert_pct: 35, required_documents: [], renter_requirements: [] },
  { category_slug: "electronics", review_mode: "manual", price_alert_pct: 40, required_documents: [{ key: "serial_plate_photo", label: "Serial plate photo", max_age_months: null }], renter_requirements: [] },
  { category_slug: "kitchen-catering", review_mode: "auto_publish_verified", price_alert_pct: 40, required_documents: [], renter_requirements: [] },
  { category_slug: "sports-fitness", review_mode: "auto_publish_verified", price_alert_pct: 40, required_documents: [], renter_requirements: [] },
  { category_slug: "music-stage", review_mode: "auto_publish_verified", price_alert_pct: 40, required_documents: [], renter_requirements: [] },
  { category_slug: "baby-family", review_mode: "auto_publish_verified", price_alert_pct: 40, required_documents: [], renter_requirements: [] },
  { category_slug: "vehicles-trailers", review_mode: "manual", price_alert_pct: 30, required_documents: [{ key: "registration", label: "Registration & insurance", max_age_months: 12 }], renter_requirements: ["Driving licence"] },
];

/** Live config v41 — the values in the brief (§1/§5). */
export const CONFIG_V41: MarketplaceConfig = {
  fees: {
    renter_fee_pct: 10,
    renter_fee_min_cents: 200,
    renter_fee_cap_cents: 15000,
    provider_commission_pct: 12,
    commission_tiers: null,
    show_all_in_totals: true,
  },
  tax: { sales_tax_pct: 7.5, label: "Port Maren sales tax" },
  holds: {
    placed_at: "handoff",
    auto_release_business_days: 3,
    max_hold_cents: 250000,
    claim_window: "return_checkin",
    renter_response_hours: 48,
    admin_decision_sla_hours: 48,
    hold_expiry_days: 7,
    wear_allowance_pct: 20,
    wear_allowance_min_age_years: 2,
    appeal_days: 7,
  },
  waiver: {
    enabled: true,
    price_pct_per_day: 5,
    min_cents_per_day: 300,
    covers_up_to_cents: 150000,
    hold_with_waiver_max_fraction: 1 / 3,
    excludes: ["Loss", "Theft", "Misuse"],
  },
  cancellation: {
    policies: [
      { id: "flexible", name: "Flexible", free_until_hours: 24, tiers: [{ within_hours: null, keep_pct: 50 }], provider_cancel_credit_cents: 2000, provider_cancel_credit_pct: null, is_default: true },
      { id: "moderate", name: "Moderate", free_until_hours: 72, tiers: [{ within_hours: 24, keep_pct: 100 }, { within_hours: null, keep_pct: 50 }], provider_cancel_credit_cents: 2000, provider_cancel_credit_pct: null, is_default: false },
      { id: "strict", name: "Strict", short_label: "Strict · events", free_until_hours: 14 * 24, tiers: [{ within_hours: 7 * 24, keep_pct: 100 }, { within_hours: null, keep_pct: 50 }], provider_cancel_credit_cents: null, provider_cancel_credit_pct: 10, is_default: false },
    ],
  },
  payouts: {
    clears_at: "return_checkin",
    schedules: ["weekly_tue", "weekly_fri", "monthly"],
    default_schedule: "weekly_tue",
    min_payout_cents: 2500,
    pause_when: ["tax_id_unverified", "bank_unverified"],
  },
  review: { always_review_below_completed: 5, category_rules: CATEGORY_RULES, listing_sla_hours: 24 },
  verification: {
    photo_id_before_first_booking: true,
    instant_book: { require_id: true, min_rating: 4.5, or_min_completed: 3 },
    condition_photos_min: 4,
    auto_suspend_on_chargeback: true,
    review_auto_publish_days: 14,
  },
  market: {
    name: "Port Maren",
    currency: { code: "MRD", symbol: "$", name: "Maren dollar" },
    default_radius_km: 15,
    max_delivery_radius_km: 50,
    timezone_label: "Maren Standard",
    timezone: "America/Puerto_Rico",
    week_starts: "monday",
    center: PORT_MAREN_CENTER,
    neighbourhoods: NEIGHBOURHOODS,
  },
};

/** Draft v42 (seeded as the unpublished draft): renter fee 10 → 11 %, max hold $2,500 → $3,000. */
export const CONFIG_V42_DRAFT: MarketplaceConfig = {
  ...CONFIG_V41,
  fees: { ...CONFIG_V41.fees, renter_fee_pct: 11 },
  holds: { ...CONFIG_V41.holds, max_hold_cents: 300000 },
};

/** The config the brief's §5 vectors are written against (fee 10 %, cap $2,500). */
export const CONFIG_BRIEF: MarketplaceConfig = CONFIG_V41;

/** Vector 5's "previous" config: fee 9 %, max hold $2,000. */
export const CONFIG_PREVIOUS_9PCT: MarketplaceConfig = {
  ...CONFIG_V41,
  fees: { ...CONFIG_V41.fees, renter_fee_pct: 9 },
  holds: { ...CONFIG_V41.holds, max_hold_cents: 200000 },
};
