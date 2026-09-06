import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  billedDays,
  claimAgainstHold,
  defaultPartialAmount,
  instantBookEligible,
  lateFee,
  previewDecision,
  previewSettingsChange,
  quoteBooking,
  quoteExtension,
  renterCancellation,
  providerCancellation,
  type ListingExtra,
  type QuoteListing,
} from "@/lib/pricing";
import { CONFIG_BRIEF, CONFIG_PREVIOUS_9PCT } from "@/lib/settings/defaults";

const TZ = "America/Puerto_Rico";
const at = (iso: string) => fromZonedTime(iso, TZ);

/** DeWalt DWE7491 from the design. */
const dewalt: QuoteListing = {
  pricing: {
    day_cents: 5800,
    weekend_cents: 15000,
    week_cents: 21000,
    month_cents: 64000,
    hold_cents: 30000,
    hold_with_waiver_cents: 10000,
    late_fee_cents_per_hour: 1500,
    late_grace_minutes: 60,
    cleaning_fee_cents: 2500,
    min_days: 1,
    max_days: 30,
  },
  delivery: { enabled: true, radius_km: 15, base_cents: 2500, base_km: 5, per_km_cents: 150 },
};
const blade: ListingExtra = { id: "blade", name: "Diablo 60T blade", price_cents: 1200, per: "rental", is_damage_waiver: false };
const waiver: ListingExtra = { id: "waiver", name: "Damage waiver", price_cents: 800, per: "day", is_damage_waiver: true };
const cord: ListingExtra = { id: "cord", name: "15 m extension cord", price_cents: 500, per: "day", is_damage_waiver: false };

const FRI = at("2026-09-11T09:00:00");
const SUN = at("2026-09-13T17:00:00");

describe("billed days", () => {
  it("counts any part of a 24 h period", () => {
    expect(billedDays(FRI, SUN)).toBe(3);
    expect(billedDays(at("2026-09-05T11:00:00"), at("2026-09-07T11:00:00"))).toBe(2);
    expect(billedDays(at("2026-09-04T15:00:00"), at("2026-09-05T16:00:00"))).toBe(2);
    expect(billedDays(at("2026-09-14T07:00:00"), at("2026-09-18T17:00:00"))).toBe(5);
    expect(billedDays(at("2026-09-11T09:00:00"), at("2026-09-12T08:00:00"))).toBe(1);
  });
});

describe("vector 1 — pickup, no extras", () => {
  const q = quoteBooking(dewalt, { start: FRI, end: SUN, qty: 1, fulfillment: "pickup", extras: [], tz: TZ }, CONFIG_BRIEF);
  it("prices to the cent", () => {
    expect(q.billed_days).toBe(3);
    expect(q.rental_cents).toBe(17400);
    expect(q.service_fee_cents).toBe(1740);
    expect(q.tax_cents).toBe(1436);
    expect(q.charged_cents).toBe(20576);
    expect(q.hold_cents).toBe(30000);
    expect(q.rental.label).toBe("$58 × 3 days");
  });
});

describe("vector 2 — delivery 4.2 km, blade, waiver", () => {
  const q = quoteBooking(
    dewalt,
    { start: FRI, end: SUN, qty: 1, fulfillment: "delivery", delivery_km: 4.2, extras: [{ extra: blade }, { extra: waiver }], tz: TZ },
    CONFIG_BRIEF,
  );
  it("prices to the cent", () => {
    expect(q.delivery_cents).toBe(2500);
    expect(q.extras_cents).toBe(3600);
    expect(q.service_fee_cents).toBe(1740);
    expect(q.tax_cents).toBe(1893);
    expect(q.charged_cents).toBe(27133);
    expect(q.hold_cents).toBe(10000);
    expect(q.hold_without_waiver_cents).toBe(30000);
  });
  it("computes the provider side without commission on delivery", () => {
    expect(q.provider.gross_cents).toBe(23500);
    expect(q.provider.commission_cents).toBe(2520);
    expect(q.provider.payout_cents).toBe(20980);
  });
});

describe("vector 3 — extension", () => {
  it("+1 day on the Honda at $45", () => {
    const e = quoteExtension(1, 4500, 1, CONFIG_BRIEF);
    expect(e.rental_cents).toBe(4500);
    expect(e.service_fee_cents).toBe(450);
    expect(e.tax_cents).toBe(371);
    expect(e.charged_cents).toBe(5321);
  });
});

describe("vector 4 — late fee and claims", () => {
  it("2 h 10 m late, 1 h grace, $15/h → $15", () => {
    const r = lateFee(at("2026-09-04T12:00:00"), at("2026-09-04T14:10:00"), 1500, 60);
    expect(r.late_minutes).toBe(130);
    expect(r.billable_hours).toBe(1);
    expect(r.fee_cents).toBe(1500);
  });
  it("claim against the $250 hold", () => {
    const c = claimAgainstHold({ late_fee_cents: 1500, damage_cents: 18000, waiver_bought: false, hold_cents: 25000 });
    expect(c.claim_total_cents).toBe(19500);
    expect(c.uncovered_cents).toBe(0);
  });
  it("partial uphold with 20% wear", () => {
    const amount = defaultPartialAmount(18000, 3, CONFIG_BRIEF);
    expect(amount).toBe(14400);
    const d = previewDecision("uphold_partial", 18000, 25000, amount);
    expect(d.charged_to_renter_cents).toBe(14400);
    expect(d.paid_to_provider_cents).toBe(14400);
    expect(d.released_to_renter_cents).toBe(10600);
    expect(previewDecision("dismiss", 18000, 25000).released_to_renter_cents).toBe(25000);
    expect(previewDecision("uphold_full", 18000, 25000).released_to_renter_cents).toBe(7000);
  });
  it("wear allowance does not apply to tools under 2 years", () => {
    expect(defaultPartialAmount(18000, 1, CONFIG_BRIEF)).toBe(18000);
  });
});

describe("vector 5 — settings preview 9% → 10%", () => {
  it("renter pays $269.46 → $271.33, payout unchanged", () => {
    const p = previewSettingsChange(
      dewalt,
      { start: FRI, end: SUN, qty: 1, fulfillment: "delivery", delivery_km: 4.2, extras: [{ extra: blade }, { extra: waiver }], tz: TZ },
      CONFIG_PREVIOUS_9PCT,
      CONFIG_BRIEF,
    );
    expect(p.renter_pays.live).toBe(26946);
    expect(p.renter_pays.draft).toBe(27133);
    expect(p.rows.find((r) => r.label === "Renter service fee")).toMatchObject({ live_cents: 1566, draft_cents: 1740, changed: true });
    expect(p.rows.find((r) => r.label.startsWith("Sales tax"))).toMatchObject({ live_cents: 1880, draft_cents: 1893 });
    expect(p.provider_payout.changed).toBe(false);
    expect(p.provider_payout.live).toBe(20980);
  });
});

describe("rate selection", () => {
  it("uses the weekend rate for Fri → Mon", () => {
    const q = quoteBooking(dewalt, { start: FRI, end: at("2026-09-14T09:00:00"), qty: 1, fulfillment: "pickup", extras: [], tz: TZ }, CONFIG_BRIEF);
    expect(q.billed_days).toBe(3);
    expect(q.rental_cents).toBe(15000);
    expect(q.rental.rate_kind).toBe("weekend");
  });
  it("uses the week rate from 5 days and day rate for the remainder", () => {
    const five = quoteBooking(dewalt, { start: at("2026-09-14T07:00:00"), end: at("2026-09-18T17:00:00"), qty: 1, fulfillment: "pickup", extras: [], tz: TZ }, CONFIG_BRIEF);
    expect(five.rental_cents).toBe(21000);
    const nine = quoteBooking(dewalt, { start: at("2026-09-14T07:00:00"), end: at("2026-09-22T17:00:00"), qty: 1, fulfillment: "pickup", extras: [], tz: TZ }, CONFIG_BRIEF);
    expect(nine.billed_days).toBe(9);
    expect(nine.rental_cents).toBe(21000 + 2 * 5800);
    expect(nine.rental.label).toBe("$210 × 1 week + $58 × 2 days");
    const twelve = quoteBooking(dewalt, { start: at("2026-09-14T07:00:00"), end: at("2026-09-25T17:00:00"), qty: 1, fulfillment: "pickup", extras: [], tz: TZ }, CONFIG_BRIEF);
    expect(twelve.billed_days).toBe(12);
    expect(twelve.rental_cents).toBe(2 * 21000);
  });
  it("uses the month rate from 28 days", () => {
    const q = quoteBooking(dewalt, { start: at("2026-09-01T09:00:00"), end: at("2026-09-29T09:00:00"), qty: 1, fulfillment: "pickup", extras: [], tz: TZ }, CONFIG_BRIEF);
    expect(q.billed_days).toBe(28);
    expect(q.rental_cents).toBe(64000);
  });
  it("scales rental, waiver and hold with quantity and caps the hold", () => {
    const q = quoteBooking(dewalt, { start: FRI, end: SUN, qty: 10, fulfillment: "pickup", extras: [{ extra: cord, qty: 2 }], tz: TZ }, CONFIG_BRIEF);
    expect(q.rental_cents).toBe(174000);
    expect(q.extras_cents).toBe(500 * 3 * 2);
    expect(q.hold_cents).toBe(CONFIG_BRIEF.holds.max_hold_cents);
  });
  it("applies the renter fee minimum and cap", () => {
    const cheap: QuoteListing = { ...dewalt, pricing: { ...dewalt.pricing, day_cents: 1000, weekend_cents: null, week_cents: null, month_cents: null } };
    const q = quoteBooking(cheap, { start: FRI, end: at("2026-09-11T20:00:00"), qty: 1, fulfillment: "pickup", extras: [], tz: TZ }, CONFIG_BRIEF);
    expect(q.service_fee_cents).toBe(200);
    const pricey: QuoteListing = { ...dewalt, pricing: { ...dewalt.pricing, day_cents: 100000, weekend_cents: null, week_cents: null, month_cents: null } };
    const q2 = quoteBooking(pricey, { start: FRI, end: SUN, qty: 1, fulfillment: "pickup", extras: [], tz: TZ }, CONFIG_BRIEF);
    expect(q2.service_fee_cents).toBe(15000);
  });
  it("rounds delivery up per km", () => {
    const q = quoteBooking(dewalt, { start: FRI, end: SUN, qty: 1, fulfillment: "delivery", delivery_km: 8.4, extras: [], tz: TZ }, CONFIG_BRIEF);
    expect(q.delivery_cents).toBe(2500 + 4 * 150);
    expect(() => quoteBooking(dewalt, { start: FRI, end: SUN, qty: 1, fulfillment: "delivery", delivery_km: 20, extras: [], tz: TZ }, CONFIG_BRIEF)).toThrow(/radius/);
  });
  it("enforces min/max days", () => {
    const strict: QuoteListing = { ...dewalt, pricing: { ...dewalt.pricing, min_days: 2 } };
    expect(() => quoteBooking(strict, { start: FRI, end: at("2026-09-11T20:00:00"), qty: 1, fulfillment: "pickup", extras: [], tz: TZ }, CONFIG_BRIEF)).toThrow(/Minimum/);
    expect(() => quoteBooking(dewalt, { start: at("2026-09-01T09:00:00"), end: at("2026-10-05T09:00:00"), qty: 1, fulfillment: "pickup", extras: [], tz: TZ }, CONFIG_BRIEF)).toThrow(/Maximum/);
  });
});

describe("cancellation", () => {
  const q = quoteBooking(
    dewalt,
    { start: FRI, end: SUN, qty: 1, fulfillment: "delivery", delivery_km: 4.2, extras: [{ extra: blade }, { extra: waiver }], tz: TZ },
    CONFIG_BRIEF,
  );
  const base = { start: FRI, rental_cents: q.rental_cents, delivery_cents: q.delivery_cents, extras_cents: q.extras_cents, service_fee_cents: q.service_fee_cents, tax_cents: q.tax_cents, charged_cents: q.charged_cents };
  const [flexible, moderate, strict] = CONFIG_BRIEF.cancellation.policies;

  it("Flexible: free until 24 h before, then 50% of rental kept", () => {
    const free = renterCancellation({ ...base, policy: flexible!, cancelledAt: at("2026-09-10T08:59:00") }, CONFIG_BRIEF);
    expect(free.free).toBe(true);
    expect(free.refunded_cents).toBe(27133);
    expect(free.free_until).toEqual(at("2026-09-10T09:00:00"));
    const late = renterCancellation({ ...base, policy: flexible!, cancelledAt: at("2026-09-10T12:00:00") }, CONFIG_BRIEF);
    expect(late.keep_pct).toBe(50);
    expect(late.kept_rental_cents).toBe(8700);
    // kept: 87.00 rental + 8.70 fee + tax on 95.70 (7.18) = 102.88 → refund 168.45
    expect(late.refunded_cents).toBe(27133 - (8700 + 870 + 718));
  });
  it("Moderate: 72 h free, 50%, 100% inside 24 h", () => {
    expect(renterCancellation({ ...base, policy: moderate!, cancelledAt: at("2026-09-08T08:00:00") }, CONFIG_BRIEF).keep_pct).toBe(0);
    expect(renterCancellation({ ...base, policy: moderate!, cancelledAt: at("2026-09-09T12:00:00") }, CONFIG_BRIEF).keep_pct).toBe(50);
    expect(renterCancellation({ ...base, policy: moderate!, cancelledAt: at("2026-09-10T12:00:00") }, CONFIG_BRIEF).keep_pct).toBe(100);
  });
  it("Strict: 14 days free, 50%, 100% inside 7 days", () => {
    expect(renterCancellation({ ...base, policy: strict!, cancelledAt: at("2026-08-27T08:00:00") }, CONFIG_BRIEF).keep_pct).toBe(0);
    expect(renterCancellation({ ...base, policy: strict!, cancelledAt: at("2026-09-01T08:00:00") }, CONFIG_BRIEF).keep_pct).toBe(50);
    expect(renterCancellation({ ...base, policy: strict!, cancelledAt: at("2026-09-06T08:00:00") }, CONFIG_BRIEF).keep_pct).toBe(100);
  });
  it("provider cancellation refunds in full with a credit", () => {
    const flex = providerCancellation({ ...base, policy: flexible!, cancelledAt: at("2026-09-10T12:00:00") });
    expect(flex.refunded_cents).toBe(27133);
    expect(flex.credit_cents).toBe(2000);
    const str = providerCancellation({ ...base, policy: strict!, cancelledAt: at("2026-09-10T12:00:00") });
    expect(str.credit_cents).toBe(1740);
  });
});

describe("instant book eligibility", () => {
  it("needs verified ID and rating ≥ 4.5 or ≥ 3 completed", () => {
    expect(instantBookEligible({ id_verified: true, rating: 4.9, completed_count: 12 }, true, CONFIG_BRIEF)).toBe(true);
    expect(instantBookEligible({ id_verified: true, rating: null, completed_count: 3 }, true, CONFIG_BRIEF)).toBe(true);
    expect(instantBookEligible({ id_verified: true, rating: null, completed_count: 0 }, true, CONFIG_BRIEF)).toBe(false);
    expect(instantBookEligible({ id_verified: false, rating: 5, completed_count: 30 }, true, CONFIG_BRIEF)).toBe(false);
    expect(instantBookEligible({ id_verified: true, rating: 5, completed_count: 30 }, false, CONFIG_BRIEF)).toBe(false);
    expect(instantBookEligible(null, true, CONFIG_BRIEF)).toBe(false);
  });
});
