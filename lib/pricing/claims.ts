import type { MarketplaceConfig } from "@/lib/settings/schema";
import { pctOf } from "./money";

export interface ClaimAgainstHold {
  late_fee_cents: number;
  damage_cents: number;
  cleaning_cents: number;
  waiver_bought: boolean;
  hold_cents: number;
  /** what is claimed against the hold — the design shows late + damage together */
  claim_total_cents: number;
  /** portion the hold cannot cover */
  uncovered_cents: number;
}

/** Return check-in totals. Undisputed late fee settles immediately but is shown in the claim total. */
export function claimAgainstHold(input: {
  late_fee_cents: number;
  damage_cents: number;
  cleaning_cents?: number;
  waiver_bought: boolean;
  waiver_covers_cents?: number;
  hold_cents: number;
}): ClaimAgainstHold {
  const cleaning_cents = input.cleaning_cents ?? 0;
  // with a waiver, accidental damage up to the cover is not the renter's liability
  const damage_cents = input.waiver_bought ? Math.max(0, input.damage_cents - (input.waiver_covers_cents ?? 0)) : input.damage_cents;
  const claim_total_cents = input.late_fee_cents + damage_cents + cleaning_cents;
  return {
    late_fee_cents: input.late_fee_cents,
    damage_cents,
    cleaning_cents,
    waiver_bought: input.waiver_bought,
    hold_cents: input.hold_cents,
    claim_total_cents,
    uncovered_cents: Math.max(0, claim_total_cents - input.hold_cents),
  };
}

export type DisputeDecision = "uphold_full" | "uphold_partial" | "dismiss" | "goodwill_credit";

export interface DecisionPreview {
  decision: DisputeDecision;
  charged_to_renter_cents: number;
  paid_to_provider_cents: number;
  released_to_renter_cents: number;
  platform_pays_cents: number;
}

/** Default partial amount: claim × (1 − wear allowance) when the tool is older than the threshold. */
export function defaultPartialAmount(claimCents: number, toolAgeYears: number | null, config: MarketplaceConfig): number {
  const applies = toolAgeYears != null && toolAgeYears > config.holds.wear_allowance_min_age_years;
  return applies ? claimCents - pctOf(claimCents, config.holds.wear_allowance_pct) : claimCents;
}

/**
 * Admin decision maths. The upheld amount is captured from the hold and paid to the provider
 * with no commission; the remainder of the hold is released to the renter.
 */
export function previewDecision(decision: DisputeDecision, claimCents: number, holdCents: number, partialCents?: number): DecisionPreview {
  switch (decision) {
    case "uphold_full": {
      const charged = Math.min(claimCents, holdCents);
      return { decision, charged_to_renter_cents: charged, paid_to_provider_cents: charged, released_to_renter_cents: holdCents - charged, platform_pays_cents: 0 };
    }
    case "uphold_partial": {
      const charged = Math.min(Math.max(0, partialCents ?? 0), holdCents);
      return { decision, charged_to_renter_cents: charged, paid_to_provider_cents: charged, released_to_renter_cents: holdCents - charged, platform_pays_cents: 0 };
    }
    case "dismiss":
      return { decision, charged_to_renter_cents: 0, paid_to_provider_cents: 0, released_to_renter_cents: holdCents, platform_pays_cents: 0 };
    case "goodwill_credit":
      return { decision, charged_to_renter_cents: 0, paid_to_provider_cents: claimCents, released_to_renter_cents: holdCents, platform_pays_cents: claimCents };
  }
}
