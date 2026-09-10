import { createHash } from "node:crypto";
import type { BalanceResult, ConnectAccountState, CreateAccountInput, OnboardingScenario, PayoutCall, PayoutErrorCode, PayoutProvider, TransferInput, TransferResult } from "./types";
import { PayoutError } from "./types";

/**
 * Deterministic, key-less payout provider for the demo and CI. Never touches the network.
 * Account refs and transfer refs derive from their inputs, so repeating an action yields the same
 * ref; a repeated idempotency key returns the same transfer, exactly as Stripe would. Hosted
 * onboarding is simulated by /provider/earnings/onboarding, which reports one of four outcomes.
 * The platform balance is a demo constant; a connected account's balance is the sum of transfers
 * it received in this process (the "provider's balance increases" check in tests).
 */
const MOCK_PLATFORM_BALANCE_CENTS = 25_000_000;

function sha(key: string) {
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

/** The mock's account ref for a provider: deterministic, so the seed and a fresh createAccount agree. */
export function mockAccountRef(providerId: string): string {
  return `acct_mock_${sha(providerId)}`;
}

function emptyRequirements() {
  return { currently_due: [] as string[], past_due: [] as string[], eventually_due: [] as string[], pending_verification: [] as string[], errors: [] as Array<{ code: string; reason: string; requirement: string }>, current_deadline: null as string | null };
}

function taxKey(business_type: string | null) {
  return business_type === "company" ? "company.tax_id" : "individual.id_number";
}

/** A freshly created account before the provider has done anything. */
export function mockNotStartedState(account_ref: string, business_type: "individual" | "company" = "individual"): ConnectAccountState {
  const due = business_type === "company" ? ["business_profile.url", "company.name", "company.tax_id", "company.address.line1", "representative.first_name", "external_account", "tos_acceptance.date"] : ["individual.first_name", "individual.dob.day", "individual.address.line1", "individual.id_number", "external_account", "tos_acceptance.date"];
  return { account_ref, livemode: false, business_type, details_submitted: false, charges_enabled: false, payouts_enabled: false, requirements: { ...emptyRequirements(), currently_due: due, eventually_due: due }, disabled_reason: null, external_account: null };
}

/** The state each simulated onboarding outcome leaves the account in. */
export function mockScenarioState(account_ref: string, scenario: OnboardingScenario, opts: { business_type?: "individual" | "company"; last4?: string; bank_name?: string } = {}): ConnectAccountState {
  const business_type = opts.business_type ?? "individual";
  const last4 = (opts.last4 ?? "4242").replace(/\D/g, "").slice(-4).padStart(4, "0");
  const bank_name = opts.bank_name?.trim() || "Maren Bank";
  const bank = { bank_name, last4, currency: "usd", status: "verified" };
  const base: ConnectAccountState = { account_ref, livemode: false, business_type, details_submitted: true, charges_enabled: false, payouts_enabled: true, requirements: emptyRequirements(), disabled_reason: null, external_account: bank };
  switch (scenario) {
    case "verified":
      return base;
    case "tax_id_missing":
      return { ...base, requirements: { ...emptyRequirements(), currently_due: [taxKey(business_type)], eventually_due: [taxKey(business_type)] } };
    case "bank_failed":
      return { ...base, payouts_enabled: false, external_account: { ...bank, status: "verification_failed" }, requirements: { ...emptyRequirements(), currently_due: ["external_account"], eventually_due: ["external_account"], errors: [{ code: "verification_failed_other", reason: "The bank account could not be verified", requirement: "external_account" }] } };
    case "pending":
      return { ...base, payouts_enabled: false, disabled_reason: "requirements.pending_verification", requirements: { ...emptyRequirements(), pending_verification: [`${business_type}.verification.document`] } };
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class MockPayoutProvider implements PayoutProvider {
  readonly name = "mock" as const;
  readonly livemode = false;
  private accounts = new Map<string, ConnectAccountState>();
  private byKey = new Map<string, TransferResult>();
  private byRef = new Map<string, TransferResult>();
  private received = new Map<string, number>();
  private calls: PayoutCall[] = [];
  private nextFailure: { reason: string; code: PayoutErrorCode } | null = null;

  private record(call: Omit<PayoutCall, "at">): PayoutCall {
    const row: PayoutCall = { ...call, at: new Date().toISOString() };
    this.calls.push(row);
    return row;
  }

  recordedCalls(): PayoutCall[] {
    return this.calls.map((c) => ({ ...c }));
  }

  clearRecordedCalls() {
    this.calls = [];
  }

  completeOnboarding(account_ref: string, scenario: OnboardingScenario, opts: { business_type?: "individual" | "company"; last4?: string; bank_name?: string } = {}): ConnectAccountState {
    const prev = this.accounts.get(account_ref);
    const state = mockScenarioState(account_ref, scenario, { business_type: opts.business_type ?? (prev?.business_type === "company" ? "company" : "individual"), last4: opts.last4 ?? prev?.external_account?.last4 ?? undefined, bank_name: opts.bank_name ?? prev?.external_account?.bank_name ?? undefined });
    this.accounts.set(account_ref, state);
    return clone(state);
  }

  failNextTransfer(reason: string, code: PayoutErrorCode = "provider_error") {
    this.nextFailure = { reason, code };
  }

  async createAccount(input: CreateAccountInput): Promise<ConnectAccountState> {
    const account_ref = mockAccountRef(input.provider_id);
    const state = this.accounts.get(account_ref) ?? mockNotStartedState(account_ref, input.business_type);
    this.accounts.set(account_ref, state);
    this.record({ op: "createAccount", ok: true, account_ref });
    return clone(state);
  }

  async createOnboardingLink(input: { account_ref: string; refresh_url: string; return_url: string }): Promise<{ url: string; expires_at: Date }> {
    const qs = new URLSearchParams({ account: input.account_ref, return_url: input.return_url, refresh_url: input.refresh_url });
    this.record({ op: "createOnboardingLink", ok: true, account_ref: input.account_ref });
    return { url: `/provider/earnings/onboarding?${qs.toString()}`, expires_at: new Date(Date.now() + 3_600_000) };
  }

  async getAccount(account_ref: string, known?: ConnectAccountState | null): Promise<ConnectAccountState> {
    const state = this.accounts.get(account_ref) ?? (known ? clone(known) : mockNotStartedState(account_ref));
    this.accounts.set(account_ref, state);
    this.record({ op: "getAccount", ok: true, account_ref });
    return clone(state);
  }

  async transfer(input: TransferInput): Promise<TransferResult> {
    try {
      if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) throw new PayoutError("invalid_amount", "Nothing to transfer");
      if (this.nextFailure) {
        const f = this.nextFailure;
        this.nextFailure = null;
        throw new PayoutError(f.code, f.reason);
      }
      const existing = this.byKey.get(input.idempotency_key);
      if (existing) {
        if (existing.amount_cents !== input.amount_cents || existing.destination !== input.account_ref) throw new PayoutError("provider_error", "Idempotency key reused with different parameters");
        this.record({ op: "transfer", ok: true, account_ref: input.account_ref, amount_cents: input.amount_cents, ref: existing.ref, idempotency_key: input.idempotency_key, transfer_group: input.transfer_group, replayed: true });
        return { ...existing };
      }
      const result: TransferResult = { ok: true, ref: `tr_mock_${sha(input.idempotency_key)}`, amount_cents: input.amount_cents, currency: (input.currency ?? "usd").toLowerCase(), livemode: false, destination: input.account_ref, created_at: new Date(), reversed: false };
      this.byKey.set(input.idempotency_key, result);
      this.byRef.set(result.ref, result);
      this.received.set(input.account_ref, (this.received.get(input.account_ref) ?? 0) + input.amount_cents);
      this.record({ op: "transfer", ok: true, account_ref: input.account_ref, amount_cents: input.amount_cents, ref: result.ref, idempotency_key: input.idempotency_key, transfer_group: input.transfer_group });
      return { ...result };
    } catch (e) {
      if (e instanceof PayoutError) this.record({ op: "transfer", ok: false, account_ref: input.account_ref, amount_cents: input.amount_cents, idempotency_key: input.idempotency_key, transfer_group: input.transfer_group, error: e.message, code: e.code });
      throw e;
    }
  }

  async getTransfer(ref: string): Promise<TransferResult> {
    const t = this.byRef.get(ref);
    if (!t) {
      this.record({ op: "getTransfer", ok: false, ref, error: "No such transfer", code: "not_found" });
      throw new PayoutError("not_found", `No such transfer: ${ref}`);
    }
    this.record({ op: "getTransfer", ok: true, ref, amount_cents: t.amount_cents });
    return { ...t };
  }

  async platformBalance(): Promise<BalanceResult> {
    this.record({ op: "platformBalance", ok: true, amount_cents: MOCK_PLATFORM_BALANCE_CENTS });
    return { available_cents: MOCK_PLATFORM_BALANCE_CENTS, pending_cents: 0, currency: "usd", livemode: false };
  }

  async accountBalance(account_ref: string): Promise<BalanceResult> {
    const available = this.received.get(account_ref) ?? 0;
    this.record({ op: "accountBalance", ok: true, account_ref, amount_cents: available });
    return { available_cents: available, pending_cents: 0, currency: "usd", livemode: false };
  }
}
