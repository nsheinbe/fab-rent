import type { CategoryRule, MarketplaceConfig } from "@/lib/settings/schema";
import { formatRate } from "@/lib/format";

export type CheckStatus = "pass" | "warning" | "required";

export interface ListingCheck {
  key: "photos" | "description" | "price" | "documents" | "duplicate" | "insurance" | "serial_plate";
  status: CheckStatus;
  message: string;
}

export interface ListingForChecks {
  title: string;
  description: string;
  day_cents: number;
  hold_cents: number;
  photos: Array<{ has_serial_plate: boolean; is_stock?: boolean; hash?: string | null }>;
  documents: Array<{ key: string; issued_at?: Date | null }>;
  unit_serials: string[];
  category_slug: string;
  parent_category_slug?: string | null;
}

export interface CheckContext {
  category_median_day_cents: number | null;
  /** all serials already on the marketplace (excluding this listing) */
  known_serials: Set<string>;
  known_photo_hashes: Set<string>;
  provider: {
    completed_count: number;
    verified: boolean;
    insurance_valid_until: Date | null;
    kind: "business" | "individual";
  };
  now: Date;
}

const PROHIBITED = [/\bwhatsapp\b/i, /\bvenmo\b/i, /\bcash only\b/i, /\bpay(?:pal| me)\b/i, /\b\+?\d[\d\s-]{8,}\d\b/, /[\w.+-]+@[\w-]+\.[\w.]+/];
const HYPE = [/\blike[- ]new\b/i];

export function ruleFor(config: MarketplaceConfig, listing: Pick<ListingForChecks, "category_slug" | "parent_category_slug">): CategoryRule | null {
  const rules = config.review.category_rules;
  return rules.find((r) => r.category_slug === listing.category_slug) ?? rules.find((r) => r.category_slug === listing.parent_category_slug) ?? null;
}

/** The automated checks shown in A03. Pure: listing + context + config → checks. */
export function runListingChecks(listing: ListingForChecks, ctx: CheckContext, config: MarketplaceConfig): ListingCheck[] {
  const checks: ListingCheck[] = [];
  const rule = ruleFor(config, listing);

  // Photos
  const originals = listing.photos.filter((p) => !p.is_stock).length;
  const stock = listing.photos.length - originals;
  const serialPlate = listing.photos.some((p) => p.has_serial_plate);
  if (listing.photos.length === 0) {
    checks.push({ key: "photos", status: "required", message: "No photos — at least 3 original photos including the serial plate are required" });
  } else if (stock > 0) {
    checks.push({ key: "photos", status: "required", message: `Photos: ${stock} stock ${stock === 1 ? "image" : "images"} detected${serialPlate ? "" : " · serial plate hidden"} — originals required` });
  } else if (listing.photos.length < 3) {
    checks.push({ key: "photos", status: "warning", message: `Photos: only ${listing.photos.length} — renters compare the return against these; add at least 3` });
  } else if (!serialPlate) {
    const needsPlate = rule?.required_documents.some((d) => d.key === "serial_plate_photo");
    checks.push({ key: "photos", status: needsPlate ? "required" : "warning", message: `Photos: ${originals} originals, serial plate not visible` });
  } else {
    checks.push({ key: "photos", status: "pass", message: `Photos: ${originals} originals, serial plate visible, no stock imagery` });
  }

  // Description
  const prohibited = PROHIBITED.filter((re) => re.test(listing.description));
  if (prohibited.length > 0) {
    checks.push({ key: "description", status: "required", message: "Description: off-platform contact details or prohibited payment terms found" });
  } else if (listing.description.trim().length < 80) {
    checks.push({ key: "description", status: "warning", message: "Description: under 80 characters — say what's included and how it's serviced" });
  } else if (HYPE.some((re) => re.test(listing.title) || re.test(listing.description))) {
    checks.push({ key: "description", status: "warning", message: "Description: condition claims like \"like-new\" need a service or purchase date" });
  } else {
    checks.push({ key: "description", status: "pass", message: "Description: no prohibited terms, no off-platform contact details" });
  }

  // Price vs category median
  if (ctx.category_median_day_cents && ctx.category_median_day_cents > 0) {
    const pct = Math.trunc(((listing.day_cents - ctx.category_median_day_cents) / ctx.category_median_day_cents) * 100);
    const alert = rule?.price_alert_pct ?? 35;
    const label = `${formatRate(listing.day_cents)}/day is ${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% ${pct >= 0 ? "above" : "below"} the category median (${formatRate(ctx.category_median_day_cents)}) for ${config.market.name}`;
    checks.push({ key: "price", status: Math.abs(pct) > alert ? "warning" : "pass", message: `Price ${label}` });
  } else {
    checks.push({ key: "price", status: "pass", message: "Price: no category median yet — first listing of its kind" });
  }

  // Required documents
  const requiredDocs = (rule?.required_documents ?? []).filter((d) => d.key !== "serial_plate_photo");
  for (const doc of requiredDocs) {
    const have = listing.documents.find((d) => d.key === doc.key);
    if (!have) {
      checks.push({ key: "documents", status: "required", message: `${doc.label}${doc.max_age_months ? ` (≤${doc.max_age_months} months)` : ""} — not attached` });
    } else if (doc.max_age_months && have.issued_at) {
      const ageMonths = (ctx.now.getTime() - have.issued_at.getTime()) / (30.44 * 86_400_000);
      checks.push(
        ageMonths > doc.max_age_months
          ? { key: "documents", status: "required", message: `${doc.label} is older than ${doc.max_age_months} months` }
          : { key: "documents", status: "pass", message: `${doc.label} attached and current` },
      );
    } else {
      checks.push({ key: "documents", status: "pass", message: `${doc.label} attached` });
    }
  }

  // Insurance for businesses
  if (ctx.provider.kind === "business") {
    if (!ctx.provider.insurance_valid_until) {
      checks.push({ key: "insurance", status: "required", message: "Business insurance not uploaded" });
    } else if (ctx.provider.insurance_valid_until < ctx.now) {
      checks.push({ key: "insurance", status: "required", message: "Business insurance has expired" });
    }
  }

  // Hold cap
  if (listing.hold_cents > config.holds.max_hold_cents) {
    checks.push({ key: "price", status: "required", message: `Hold ${formatRate(listing.hold_cents)} exceeds the marketplace cap of ${formatRate(config.holds.max_hold_cents)}` });
  }

  // Duplicate detection
  const dupSerial = listing.unit_serials.find((s) => ctx.known_serials.has(s));
  const dupPhoto = listing.photos.find((p) => p.hash && ctx.known_photo_hashes.has(p.hash));
  if (dupSerial || dupPhoto) {
    checks.push({ key: "duplicate", status: "required", message: `Duplicate detection: ${dupSerial ? `serial ${dupSerial} already listed` : "photo matches another listing"}` });
  } else {
    checks.push({ key: "duplicate", status: "pass", message: "Duplicate detection: no matching serial or photo hash on the marketplace" });
  }

  return checks;
}

export type ReviewRoute = { mode: "auto_publish" } | { mode: "manual"; reasons: string[]; kind: "new" | "edited" | "reported" };

export interface RoutingInput {
  kind: "new" | "edited" | "reported";
  checks: ListingCheck[];
  /** for edits: old vs new day rate */
  previous_day_cents?: number | null;
  day_cents: number;
}

/**
 * Review routing (§7): category review_mode, providers with < N completed rentals, edited listings
 * with a price change beyond the category alert %, reported listings, or any failed/required check.
 */
export function routeForReview(listing: ListingForChecks, input: RoutingInput, ctx: CheckContext, config: MarketplaceConfig): ReviewRoute {
  const rule = ruleFor(config, listing);
  const reasons: string[] = [];
  if (input.kind === "reported") reasons.push("Reported by a renter");
  if (rule?.review_mode === "manual") reasons.push("Category requires manual review");
  if (rule?.review_mode === "auto_publish_verified" && !ctx.provider.verified) reasons.push("Provider not yet verified");
  if (ctx.provider.completed_count < config.review.always_review_below_completed) reasons.push(`Provider has fewer than ${config.review.always_review_below_completed} completed rentals`);
  if (input.kind === "edited" && input.previous_day_cents && input.previous_day_cents > 0) {
    const pct = Math.trunc(((input.day_cents - input.previous_day_cents) / input.previous_day_cents) * 100);
    if (Math.abs(pct) > (rule?.price_alert_pct ?? 35)) reasons.push(`Price changed ${pct >= 0 ? "+" : ""}${pct}%`);
  }
  if (input.checks.some((c) => c.status === "required")) reasons.push("An automated check requires attention");
  if (reasons.length === 0) return { mode: "auto_publish" };
  return { mode: "manual", reasons, kind: input.kind };
}

/** One-line summary chips for the queue ("2 warnings", "Insurance missing", "All checks passed"). */
export function summarizeChecks(checks: ListingCheck[]): { label: string; tone: "ok" | "warn" | "error" } {
  const required = checks.filter((c) => c.status === "required");
  const warnings = checks.filter((c) => c.status === "warning");
  if (required.length > 0) {
    const first = required[0]!;
    const short = first.key === "insurance" ? "Insurance missing" : first.key === "photos" ? "Stock photos · serial hidden" : first.key === "duplicate" ? "Possible duplicate" : `${required.length} required`;
    return { label: short, tone: "error" };
  }
  if (warnings.length > 0) return { label: `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`, tone: "warn" };
  return { label: "All checks passed", tone: "ok" };
}

/** Listing quality score for the editor's right rail (P03). */
export interface QualityItem {
  label: string;
  done: boolean;
}
export function listingQuality(l: {
  photo_count: number;
  has_serial_plate_photo: boolean;
  specs_count: number;
  accessories_count: number;
  rules_count: number;
  prep_hours: number | null;
  description_length: number;
  has_video?: boolean;
}): { score: number; items: QualityItem[] } {
  const items: QualityItem[] = [
    { label: `${l.photo_count} photos${l.has_serial_plate_photo ? " incl. serial plate" : ""}`, done: l.photo_count >= 4 && l.has_serial_plate_photo },
    { label: "Specs, accessories, rules", done: l.specs_count >= 3 && l.accessories_count >= 1 && l.rules_count >= 1 },
    { label: "Prep time set", done: l.prep_hours != null },
    { label: "Description over 120 characters", done: l.description_length >= 120 },
    { label: "Add a 30-second video walkthrough", done: !!l.has_video },
  ];
  const weights = [30, 25, 15, 26, 4];
  const score = items.reduce((acc, it, i) => acc + (it.done ? weights[i]! : 0), 0);
  return { score, items };
}
