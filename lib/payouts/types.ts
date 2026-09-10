/**
 * The payout boundary (Stripe Connect or the demo mock). Money reaches a provider only through
 * `transfer`, and only for cleared ledger entries; onboarding, requirement state and balances are
 * read through the same interface so the console always shows the account's real state.
 */

export interface ConnectRequirements {
  /** fields due now (Stripe's names, e.g. "individual.id_number", "external_account") */
  currently_due: string[];
  /** fields past their deadline — the account is disabled until they are resolved */
  past_due: string[];
  eventually_due: string[];
  /** fields the provider is reviewing */
  pending_verification: string[];
  /** fields that failed validation or verification, with the provider's reason */
  errors: Array<{ code: string; reason: string; requirement: string }>;
  /** ISO timestamp, when the provider set a deadline for `currently_due` */
  current_deadline: string | null;
}

export interface ConnectExternalAccount {
  bank_name: string | null;
  last4: string | null;
  currency: string | null;
  /** provider-side status of the bank account: "new" | "validated" | "verified" | "verification_failed" | "errored" */
  status: string | null;
}

/** Normalised view of a connected account, the same shape from Stripe and from the mock. */
export interface ConnectAccountState {
  account_ref: string;
  livemode: boolean;
  business_type: string | null;
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements: ConnectRequirements;
  disabled_reason: string | null;
  external_account: ConnectExternalAccount | null;
}

export interface TransferResult {
  ok: true;
  /** tr_… */
  ref: string;
  amount_cents: number;
  currency: string;
  livemode: boolean;
  destination: string;
  created_at: Date;
  reversed: boolean;
}

export interface BalanceResult {
  available_cents: number;
  pending_cents: number;
  currency: string;
  livemode: boolean;
}

export type OnboardingScenario = "verified" | "tax_id_missing" | "bank_failed" | "pending";
export const ONBOARDING_SCENARIOS: readonly OnboardingScenario[] = ["verified", "tax_id_missing", "bank_failed", "pending"];

export type PayoutErrorCode = "misconfigured" | "not_found" | "account_restricted" | "insufficient_funds" | "live_mode_refused" | "mode_mismatch" | "invalid_amount" | "provider_error";

export class PayoutError extends Error {
  constructor(
    readonly code: PayoutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PayoutError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isPayoutError(e: unknown): e is PayoutError {
  if (e instanceof PayoutError) return true;
  if (!e || typeof e !== "object" || !(e instanceof Error)) return false;
  const code = (e as { code?: unknown }).code;
  return (e as { name?: string }).name === "PayoutError" && typeof code === "string";
}

/** One recorded boundary call. The mock keeps these so tests assert money paths, not only the screen. */
export type PayoutCall = {
  op: "createAccount" | "createOnboardingLink" | "getAccount" | "transfer" | "getTransfer" | "platformBalance" | "accountBalance";
  ok: boolean;
  account_ref?: string;
  amount_cents?: number;
  ref?: string;
  idempotency_key?: string;
  transfer_group?: string;
  replayed?: boolean;
  error?: string;
  code?: PayoutErrorCode;
  at: string;
};

export interface CreateAccountInput {
  provider_id: string;
  email: string | null;
  name: string;
  business_type: "individual" | "company";
  country?: string;
  metadata?: Record<string, string>;
}

export interface TransferInput {
  account_ref: string;
  amount_cents: number;
  currency?: string;
  /** stable per (payout, attempt): a replay after a crash returns the same transfer, a retry after a recorded failure gets a fresh key */
  idempotency_key: string;
  transfer_group: string;
  description: string;
  metadata?: Record<string, string>;
}

export interface PayoutProvider {
  readonly name: "mock" | "stripe";
  /** true only for a live Stripe key; every transfer and account carries the same flag so modes can never mix */
  readonly livemode: boolean;
  createAccount(input: CreateAccountInput): Promise<ConnectAccountState>;
  createOnboardingLink(input: { account_ref: string; refresh_url: string; return_url: string }): Promise<{ url: string; expires_at: Date }>;
  /** Fresh state from the provider. `known` is the last stored snapshot: Stripe ignores it, the mock uses it as its remote truth for accounts it has not seen in this process. */
  getAccount(account_ref: string, known?: ConnectAccountState | null): Promise<ConnectAccountState>;
  transfer(input: TransferInput): Promise<TransferResult>;
  getTransfer(ref: string): Promise<TransferResult>;
  platformBalance(): Promise<BalanceResult>;
  accountBalance(account_ref: string): Promise<BalanceResult>;
  /** Mock-only: recorded calls for money-path assertions. */
  recordedCalls?(): PayoutCall[];
  /** Mock-only: drop the call log between e2e cases that share the Next process. */
  clearRecordedCalls?(): void;
  /** Mock-only: the outcome of the simulated hosted onboarding. */
  completeOnboarding?(account_ref: string, scenario: OnboardingScenario, opts?: { business_type?: "individual" | "company"; last4?: string; bank_name?: string }): ConnectAccountState;
  /** Mock-only: make the next transfer fail so the exception + retry path can be exercised. */
  failNextTransfer?(reason: string, code?: PayoutErrorCode): void;
}
