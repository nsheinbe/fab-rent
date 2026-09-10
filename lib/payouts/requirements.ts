import type { ConnectAccountState, ConnectExternalAccount } from "./types";

/**
 * Pure mapping from a connected account's real requirement state to what fab.rent shows and does:
 * the tax-ID / bank flags the console already renders, whether payouts are paused (the marketplace's
 * `pause_when` rules, plus "the provider cannot receive payouts" which no setting can override), and
 * the copy in the design's vocabulary ("Tax ID missing · payout paused since 1 Sep").
 */

const LABELS: Array<[RegExp, string]> = [
  [/^external_account$/, "Bank account"],
  [/^tos_acceptance\./, "Accept the payout terms"],
  [/^company\.verification\.document$/, "Business registration document"],
  [/^(individual|representative)\.(id_number|ssn_last_4)$/, "Tax ID (personal)"],
  [/^company\.tax_id$/, "Business tax ID"],
  [/^company\.vat_id$/, "VAT number"],
  [/\.verification\.additional_document$/, "Proof of address"],
  [/\.verification\.document$/, "Photo ID document"],
  [/^(individual|representative)\.dob\./, "Date of birth"],
  [/^(individual|representative)\.address\./, "Home address"],
  [/^company\.address\./, "Business address"],
  [/^(individual|representative)\.(first_name|last_name)$/, "Legal name"],
  [/^(individual|representative)\.email$/, "Email address"],
  [/^(individual|representative)\.phone$/, "Phone number"],
  [/^company\.name$/, "Legal business name"],
  [/^company\.phone$/, "Business phone"],
  [/^business_profile\.url$/, "Business website"],
  [/^business_profile\.mcc$/, "Business category"],
  [/^business_profile\.product_description$/, "What you rent out"],
  [/^business_type$/, "Business type"],
  [/^(owners|directors|executives)\./, "Owners and directors"],
  [/^representative\./, "Company representative"],
  [/^settings\.payments\.statement_descriptor$/, "Statement descriptor"],
  [/^person_/, "Person details"],
];

/** Human label for a requirement key ("individual.id_number" → "Tax ID (personal)"); unknown keys are tidied, never hidden. */
export function describeRequirement(key: string): string {
  for (const [re, label] of LABELS) if (re.test(key)) return label;
  const cleaned = key.replace(/^(individual|company|representative)\./, "").replace(/[._]+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : key;
}

export const TAX_ID_REQUIREMENT = /(^|\.)(id_number|ssn_last_4|tax_id|vat_id|tax_id_registrar)$/;
export const BANK_REQUIREMENT = /^external_account/;

export interface OutstandingRequirement {
  key: string;
  label: string;
  past_due: boolean;
  /** the provider's reason when the field failed validation or verification */
  error: string | null;
}

function unique(keys: string[]): string[] {
  return Array.from(new Set(keys.filter((k) => typeof k === "string" && k.length > 0)));
}

/** Everything the provider must still do now: due, overdue, or failed. (`eventually_due` alone is not outstanding.) */
export function outstandingRequirements(state: ConnectAccountState): OutstandingRequirement[] {
  const r = state.requirements;
  const errors = r.errors ?? [];
  const keys = unique([...(r.currently_due ?? []), ...(r.past_due ?? []), ...errors.map((e) => e.requirement)]);
  return keys.map((key) => ({ key, label: describeRequirement(key), past_due: (r.past_due ?? []).includes(key), error: errors.find((e) => e.requirement === key)?.reason ?? null }));
}

export function accountMasked(ext: ConnectExternalAccount | null | undefined): string | null {
  if (!ext?.last4) return null;
  return `${ext.bank_name?.trim() || "Bank"} •••• ${ext.last4}`;
}

/** Copy for Stripe's `requirements.disabled_reason` values. */
export function disabledReasonCopy(reason: string | null | undefined): string | null {
  if (!reason) return null;
  if (reason.startsWith("rejected.")) return "Account rejected by the payout provider";
  switch (reason) {
    case "requirements.past_due":
      return "Verification overdue";
    case "requirements.pending_verification":
      return "Verification pending";
    case "under_review":
      return "Under review by the payout provider";
    case "platform_paused":
      return "Paused by fab.rent";
    case "listed":
      return "Account listed by the payout provider";
    case "action_required.requested_capabilities":
      return "Action required on the payout account";
    default:
      return "Payouts disabled by the payout provider";
  }
}

export type PayoutAccountStatus = "not_connected" | "onboarding" | "restricted" | "action_needed" | "pending_verification" | "verified";

export const PAYOUT_ACCOUNT_STATUS_LABEL: Record<PayoutAccountStatus, string> = {
  not_connected: "Not connected",
  onboarding: "Verification incomplete",
  restricted: "Payouts disabled",
  action_needed: "Action needed",
  pending_verification: "Pending verification",
  verified: "Verified",
};

export interface DerivedPayoutState {
  status: PayoutAccountStatus;
  connected: boolean;
  details_submitted: boolean;
  payouts_enabled: boolean;
  tax_id_verified: boolean;
  payout_account_verified: boolean;
  account_masked: string | null;
  payouts_paused: boolean;
  /** what blocks or needs attention, in the design's vocabulary; null when nothing does */
  reason: string | null;
  /** the second half of the exception line: "payout paused since 1 Sep", the bank error, a deadline */
  detail: string | null;
  /** `reason · detail` — what providers.payouts_paused_reason and payouts.exception carry */
  paused_reason: string | null;
  outstanding: OutstandingRequirement[];
  pending: Array<{ key: string; label: string }>;
  deadline: Date | null;
}

export type PauseRule = "tax_id_unverified" | "bank_unverified";

export function derivePayoutState(
  state: ConnectAccountState | null,
  config: { pause_when: ReadonlyArray<PauseRule> },
  opts: { paused_since: Date | null; formatDate: (d: Date) => string },
): DerivedPayoutState {
  const base = { connected: false, details_submitted: false, payouts_enabled: false, tax_id_verified: false, payout_account_verified: false, account_masked: null, outstanding: [] as OutstandingRequirement[], pending: [] as Array<{ key: string; label: string }>, deadline: null as Date | null };
  if (!state) {
    return { ...base, status: "not_connected", payouts_paused: true, reason: "Payout account not connected", detail: null, paused_reason: "Payout account not connected" };
  }
  const outstanding = outstandingRequirements(state);
  const pending = unique(state.requirements.pending_verification ?? []).map((key) => ({ key, label: describeRequirement(key) }));
  const taxOutstanding = outstanding.some((o) => TAX_ID_REQUIREMENT.test(o.key));
  const taxPending = pending.some((p) => TAX_ID_REQUIREMENT.test(p.key));
  const bank = outstanding.find((o) => BANK_REQUIREMENT.test(o.key)) ?? null;
  const bankStatus = state.external_account?.status ?? null;
  const bankFailed = !!bank?.error || bankStatus === "verification_failed" || bankStatus === "errored";
  const hasBank = !!state.external_account?.last4;
  const tax_id_verified = state.details_submitted && !taxOutstanding && !taxPending;
  const payout_account_verified = hasBank && !bank && !bankFailed && state.payouts_enabled;
  const bankReason = bankFailed ? "Bank account verification failed" : hasBank ? "Bank account needs attention" : "Bank account missing";

  let status: PayoutAccountStatus;
  let reason: string | null;
  if (!state.details_submitted) {
    status = "onboarding";
    reason = "Verification incomplete";
  } else if (state.disabled_reason || !state.payouts_enabled) {
    status = "restricted";
    reason = bank || bankFailed ? bankReason : taxOutstanding ? "Tax ID missing" : outstanding.length ? `${outstanding[0]!.label} needed` : disabledReasonCopy(state.disabled_reason) ?? "Payouts not yet enabled";
  } else if (outstanding.length || bankFailed) {
    status = "action_needed";
    reason = taxOutstanding ? "Tax ID missing" : bank || bankFailed ? bankReason : `${outstanding[0]!.label} needed`;
  } else if (pending.length) {
    status = "pending_verification";
    reason = taxPending ? "Tax ID verification pending" : "Verification pending";
  } else {
    status = "verified";
    reason = null;
  }

  // an account that cannot receive payouts is always paused; otherwise the marketplace's pause rules decide
  const rules = config.pause_when;
  const payouts_paused = status === "onboarding" || status === "restricted" || (rules.includes("tax_id_unverified") && !tax_id_verified) || (rules.includes("bank_unverified") && !payout_account_verified);
  const deadline = state.requirements.current_deadline ? new Date(state.requirements.current_deadline) : null;
  let detail: string | null = null;
  if (payouts_paused && opts.paused_since) detail = `payout paused since ${opts.formatDate(opts.paused_since)}`;
  else if (bank?.error) detail = bank.error;
  else if (deadline && (outstanding.length || pending.length)) detail = `due by ${opts.formatDate(deadline)}`;
  const paused_reason = payouts_paused ? [reason ?? "Payouts paused", detail].filter(Boolean).join(" · ") : null;
  return {
    ...base,
    connected: true,
    details_submitted: state.details_submitted,
    payouts_enabled: state.payouts_enabled,
    tax_id_verified,
    payout_account_verified,
    account_masked: accountMasked(state.external_account),
    status,
    payouts_paused,
    reason,
    detail,
    paused_reason,
    outstanding,
    pending,
    deadline,
  };
}
