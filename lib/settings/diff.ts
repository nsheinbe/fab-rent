import type { MarketplaceConfig } from "./schema";

const LABELS: Record<string, string> = {
  "fees.renter_fee_pct": "Renter service fee", "fees.provider_commission_pct": "Provider commission", "fees.renter_fee_min_cents": "Minimum renter fee", "fees.renter_fee_cap_cents": "Renter fee cap", "fees.show_all_in_totals": "Show all-in totals",
  "tax.sales_tax_pct": "Sales tax", "holds.max_hold_cents": "Max hold", "holds.auto_release_business_days": "Auto-release after return", "holds.renter_response_hours": "Renter response window", "holds.admin_decision_sla_hours": "Admin decision SLA", "holds.wear_allowance_pct": "Wear allowance", "holds.hold_expiry_days": "Hold expiry", "holds.appeal_days": "Appeal window",
  "waiver.price_pct_per_day": "Waiver price", "waiver.min_cents_per_day": "Waiver minimum", "waiver.covers_up_to_cents": "Waiver covers up to", "waiver.hold_with_waiver_max_fraction": "Hold with waiver", "waiver.enabled": "Damage waiver",
  "payouts.min_payout_cents": "Minimum payout", "payouts.default_schedule": "Default payout schedule", "review.always_review_below_completed": "Always review below N rentals", "review.listing_sla_hours": "Listing review SLA",
  "verification.condition_photos_min": "Minimum condition photos", "verification.auto_suspend_on_chargeback": "Auto-suspend on chargeback", "verification.photo_id_before_first_booking": "Photo ID before first booking",
  "market.default_radius_km": "Default search radius", "market.max_delivery_radius_km": "Max delivery radius", "cancellation.policies": "Cancellation policies", "review.category_rules": "Category review rules",
};

function flatten(o: unknown, prefix = ""): Record<string, unknown> {
  if (o === null || typeof o !== "object" || Array.isArray(o)) return { [prefix]: o };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k));
  return out;
}
export function diffConfigs(live: MarketplaceConfig, draft: MarketplaceConfig) {
  const a = flatten(live);
  const b = flatten(draft);
  const changes: Array<{ path: string; label: string; from: unknown; to: unknown }> = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changes.push({ path: k, label: LABELS[k] ?? LABELS[k.split(".").slice(0, 2).join(".")] ?? k, from: summarize(a[k]), to: summarize(b[k]) });
  }
  return changes;
}
function summarize(v: unknown) {
  if (Array.isArray(v)) return `${v.length} items`;
  return v;
}
