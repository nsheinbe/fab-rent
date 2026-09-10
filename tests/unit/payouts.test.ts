import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { assertHermeticPayouts, e2ePayoutsInspectable, missingConnectSecrets, payoutProviderName, stripeKeyMode } from "@/lib/payouts/hermetic";
import { accountMasked, derivePayoutState, describeRequirement, outstandingRequirements } from "@/lib/payouts/requirements";
import { MockPayoutProvider, mockAccountRef, mockNotStartedState, mockScenarioState } from "@/lib/payouts/mock";
import { StripePayoutProvider, normaliseStripeAccount, type StripeConnectClient } from "@/lib/payouts/stripe";
import { getPayoutProvider, resetPayoutProviderForTests } from "@/lib/payouts";
import { isPayoutError } from "@/lib/payouts/types";

const fixture = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/stripe/${name}`, import.meta.url)), "utf8")) as unknown as Stripe.Account;
const RULES = { pause_when: ["tax_id_unverified", "bank_unverified"] as const };
const opts = (paused_since: Date | null = null) => ({ paused_since, formatDate: (d: Date) => d.toISOString().slice(0, 10) });

afterEach(() => {
  resetPayoutProviderForTests();
});

describe("hermetic payouts — fail closed", () => {
  it("allows the mock with no Connect secrets", () => {
    expect(() => assertHermeticPayouts({})).not.toThrow();
    expect(() => assertHermeticPayouts({ PAYOUTS_PROVIDER: "mock", CI: "true" })).not.toThrow();
    expect(payoutProviderName({})).toBe("mock");
  });

  it("names the missing Connect secrets", () => {
    const env = { PAYOUTS_PROVIDER: "stripe", PAYMENTS_PROVIDER: "stripe" };
    expect(missingConnectSecrets(env)).toEqual(["STRIPE_SECRET_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET"]);
    expect(() => assertHermeticPayouts(env)).toThrow(/fail-closed without Connect secrets: missing STRIPE_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET/);
  });

  it("refuses real transfers beside mock card payments", () => {
    expect(() => assertHermeticPayouts({ PAYOUTS_PROVIDER: "stripe", PAYMENTS_PROVIDER: "mock", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_x" })).toThrow(/requires PAYMENTS_PROVIDER=stripe/);
  });

  it("refuses Stripe in CI even with secrets unless HERMETIC=0", () => {
    const env = { PAYOUTS_PROVIDER: "stripe", PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_x", CI: "true" };
    expect(() => assertHermeticPayouts(env)).toThrow(/CI is hermetic: PAYOUTS_PROVIDER=stripe is refused/);
    expect(() => assertHermeticPayouts({ ...env, HERMETIC: "0" })).not.toThrow();
  });

  it("separates test mode and live mode by configuration, never by care", () => {
    const test = { PAYOUTS_PROVIDER: "stripe", PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_x" };
    expect(() => assertHermeticPayouts(test)).not.toThrow();
    expect(() => assertHermeticPayouts({ ...test, STRIPE_SECRET_KEY: "sk_live_x" })).toThrow(/live payouts are refused unless PAYOUTS_LIVE_MODE=1/);
    expect(() => assertHermeticPayouts({ ...test, STRIPE_SECRET_KEY: "sk_live_x", PAYOUTS_LIVE_MODE: "1" })).not.toThrow();
    expect(() => assertHermeticPayouts({ ...test, PAYOUTS_LIVE_MODE: "1" })).toThrow(/PAYOUTS_LIVE_MODE=1 with a test key/);
    expect(() => assertHermeticPayouts({ ...test, STRIPE_SECRET_KEY: "sk_live_x", PAYOUTS_LIVE_MODE: "1", CI: "true", HERMETIC: "0" })).toThrow(/CI is hermetic: PAYOUTS_LIVE_MODE=1 is refused/);
    expect(() => assertHermeticPayouts({ PAYOUTS_PROVIDER: "mock", PAYOUTS_LIVE_MODE: "1" })).toThrow(/no meaning with the mock/);
    expect(() => assertHermeticPayouts({ ...test, STRIPE_SECRET_KEY: "abc123" })).toThrow(/unambiguous/);
    expect(stripeKeyMode("rk_live_1")).toBe("live");
    expect(stripeKeyMode("sk_test_1")).toBe("test");
    expect(stripeKeyMode(undefined)).toBeNull();
  });

  it("getPayoutProvider throws before constructing Stripe when a secret is missing", async () => {
    const prev = { ...process.env };
    process.env.PAYOUTS_PROVIDER = "stripe";
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    resetPayoutProviderForTests();
    try {
      await expect(getPayoutProvider()).rejects.toThrow(/fail-closed without Connect secrets/);
    } finally {
      process.env.PAYOUTS_PROVIDER = prev.PAYOUTS_PROVIDER;
      if (prev.PAYOUTS_PROVIDER === undefined) delete process.env.PAYOUTS_PROVIDER;
      if (prev.STRIPE_SECRET_KEY !== undefined) process.env.STRIPE_SECRET_KEY = prev.STRIPE_SECRET_KEY;
      if (prev.STRIPE_CONNECT_WEBHOOK_SECRET !== undefined) process.env.STRIPE_CONNECT_WEBHOOK_SECRET = prev.STRIPE_CONNECT_WEBHOOK_SECRET;
    }
  });

  it("never exposes the inspect API beside Stripe payouts", () => {
    expect(e2ePayoutsInspectable({ PAYOUTS_PROVIDER: "stripe" })).toBe(false);
    expect(e2ePayoutsInspectable({})).toBe(true);
  });
});

describe("requirement state → console flags (recorded Connect fixtures)", () => {
  it("a verified Express account: nothing outstanding, payouts on", () => {
    const state = normaliseStripeAccount(fixture("account-verified.json"), false);
    expect(state).toMatchObject({ account_ref: "acct_1RxVERIFIED0001", livemode: false, business_type: "company", details_submitted: true, payouts_enabled: true, charges_enabled: false, disabled_reason: null, external_account: { bank_name: "STRIPE TEST BANK", last4: "6789", currency: "usd", status: "new" } });
    const d = derivePayoutState(state, RULES, opts());
    expect(d).toMatchObject({ status: "verified", connected: true, tax_id_verified: true, payout_account_verified: true, payouts_paused: false, reason: null, paused_reason: null, account_masked: "STRIPE TEST BANK •••• 6789", outstanding: [], pending: [] });
  });

  it("a missing tax ID pauses payouts under the pause rule and reads 'Tax ID missing'", () => {
    const state = normaliseStripeAccount(fixture("account-tax-id-due.json"), false);
    expect(state.requirements.currently_due).toEqual(["individual.id_number"]);
    expect(state.requirements.current_deadline).toBe(new Date(1758200000 * 1000).toISOString());
    const d = derivePayoutState(state, RULES, opts(new Date("2026-09-01T13:00:00Z")));
    expect(d).toMatchObject({ status: "action_needed", tax_id_verified: false, payout_account_verified: true, payouts_paused: true, reason: "Tax ID missing", detail: "payout paused since 2026-09-01", paused_reason: "Tax ID missing · payout paused since 2026-09-01" });
    expect(d.outstanding).toEqual([{ key: "individual.id_number", label: "Tax ID (personal)", past_due: false, error: null }]);
    // the pause is the marketplace's rule: without it Stripe would still pay, and so would the run
    const lax = derivePayoutState(state, { pause_when: ["bank_unverified"] }, opts());
    expect(lax.payouts_paused).toBe(false);
    expect(lax.status).toBe("action_needed");
    expect(lax.detail).toBe(`due by ${new Date(1758200000 * 1000).toISOString().slice(0, 10)}`);
  });

  it("a failed bank verification disables payouts whatever the rules say", () => {
    const state = normaliseStripeAccount(fixture("account-bank-failed.json"), false);
    const d = derivePayoutState(state, { pause_when: [] }, opts());
    expect(d).toMatchObject({ status: "restricted", payouts_enabled: false, payout_account_verified: false, tax_id_verified: true, payouts_paused: true, reason: "Bank account verification failed", detail: "The bank account provided could not be validated.", account_masked: "DOCKSIDE MUTUAL •••• 0193" });
    expect(d.outstanding[0]).toMatchObject({ key: "external_account", label: "Bank account", past_due: true, error: "The bank account provided could not be validated." });
    expect(derivePayoutState(state, RULES, opts(new Date("2026-09-01T13:00:00Z"))).paused_reason).toBe("Bank account verification failed · payout paused since 2026-09-01");
  });

  it("a document under review is neither verified nor paused", () => {
    const state = normaliseStripeAccount(fixture("account-pending.json"), false);
    const d = derivePayoutState(state, RULES, opts());
    expect(d).toMatchObject({ status: "pending_verification", payouts_paused: false, tax_id_verified: true, payout_account_verified: true, reason: "Verification pending" });
    expect(d.pending).toEqual([{ key: "individual.verification.document", label: "Photo ID document" }]);
  });

  it("an account that never finished onboarding, and no account at all, cannot be paid", () => {
    const d = derivePayoutState(mockNotStartedState("acct_mock_x", "individual"), RULES, opts());
    expect(d).toMatchObject({ status: "onboarding", payouts_paused: true, reason: "Verification incomplete", tax_id_verified: false, payout_account_verified: false });
    expect(derivePayoutState(null, RULES, opts())).toMatchObject({ status: "not_connected", connected: false, payouts_paused: true, reason: "Payout account not connected", paused_reason: "Payout account not connected" });
  });

  it("labels requirement keys for people and never hides an unknown one", () => {
    expect(describeRequirement("individual.id_number")).toBe("Tax ID (personal)");
    expect(describeRequirement("company.tax_id")).toBe("Business tax ID");
    expect(describeRequirement("external_account")).toBe("Bank account");
    expect(describeRequirement("tos_acceptance.date")).toBe("Accept the payout terms");
    expect(describeRequirement("company.verification.document")).toBe("Business registration document");
    expect(describeRequirement("individual.verification.document")).toBe("Photo ID document");
    expect(describeRequirement("individual.political_exposure")).toBe("Political exposure");
    expect(accountMasked({ bank_name: null, last4: "4242", currency: "usd", status: null })).toBe("Bank •••• 4242");
    expect(accountMasked(null)).toBeNull();
    expect(outstandingRequirements(mockScenarioState("acct_mock_a", "bank_failed")).map((o) => o.key)).toEqual(["external_account"]);
  });
});

describe("mock payout provider (deterministic, no network)", () => {
  const input = { account_ref: "acct_mock_a", amount_cents: 20980, idempotency_key: "payout:p1:1", transfer_group: "payout_p1", description: "test" };

  it("creates one account per provider and simulates hosted onboarding", async () => {
    const p = new MockPayoutProvider();
    const a = await p.createAccount({ provider_id: "prov-1", email: null, name: "Kestrel Party Hire", business_type: "company" });
    expect(a.account_ref).toBe(mockAccountRef("prov-1"));
    expect(a.details_submitted).toBe(false);
    expect((await p.createAccount({ provider_id: "prov-1", email: null, name: "Kestrel Party Hire", business_type: "company" })).account_ref).toBe(a.account_ref);
    const link = await p.createOnboardingLink({ account_ref: a.account_ref, refresh_url: "http://x/refresh", return_url: "http://x/return" });
    expect(link.url).toMatch(/^\/provider\/earnings\/onboarding\?account=/);
    const done = p.completeOnboarding(a.account_ref, "tax_id_missing", { last4: "7788" });
    expect(done.requirements.currently_due).toEqual(["company.tax_id"]);
    expect((await p.getAccount(a.account_ref)).external_account).toMatchObject({ last4: "7788", bank_name: "Maren Bank" });
    // an account this process has not seen is taken from the stored snapshot, as Stripe would be the remote truth
    const fresh = new MockPayoutProvider();
    const known = mockScenarioState("acct_mock_seeded", "verified", { last4: "8812" });
    expect(await fresh.getAccount("acct_mock_seeded", known)).toEqual(known);
  });

  it("transfers are idempotent per key and recorded", async () => {
    const p = new MockPayoutProvider();
    const first = await p.transfer(input);
    const again = await p.transfer(input);
    expect(again.ref).toBe(first.ref);
    expect(first).toMatchObject({ ok: true, amount_cents: 20980, destination: "acct_mock_a", livemode: false, reversed: false });
    await expect(p.transfer({ ...input, amount_cents: 1 })).rejects.toMatchObject({ code: "provider_error" });
    expect(p.recordedCalls().filter((c) => c.op === "transfer").map((c) => [c.ok, !!c.replayed])).toEqual([[true, false], [true, true], [false, false]]);
    expect((await p.accountBalance("acct_mock_a")).available_cents).toBe(20980);
    expect((await p.getTransfer(first.ref)).amount_cents).toBe(20980);
    await expect(p.getTransfer("tr_nope")).rejects.toSatisfy((e) => isPayoutError(e) && e.code === "not_found");
  });

  it("a scripted failure lands once; the next attempt goes through", async () => {
    const p = new MockPayoutProvider();
    p.failNextTransfer("Simulated", "insufficient_funds");
    await expect(p.transfer({ ...input, idempotency_key: "payout:p2:1" })).rejects.toMatchObject({ name: "PayoutError", code: "insufficient_funds", message: "Simulated" });
    expect((await p.transfer({ ...input, idempotency_key: "payout:p2:2" })).ok).toBe(true);
    expect(p.recordedCalls().filter((c) => c.op === "transfer").map((c) => [c.ok, c.idempotency_key])).toEqual([[false, "payout:p2:1"], [true, "payout:p2:2"]]);
    await expect(p.transfer({ ...input, amount_cents: 0 })).rejects.toMatchObject({ code: "invalid_amount" });
  });
});

describe("stripe payout adapter (stubbed client — no network)", () => {
  const env = { PAYOUTS_PROVIDER: "stripe", PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_x", STRIPE_CURRENCY: "usd" };
  const input = { account_ref: "acct_1RxVERIFIED0001", amount_cents: 20980, idempotency_key: "payout:p1:1", transfer_group: "payout_p1", description: "fab.rent payout · 1 rental", metadata: { payout_id: "p1" } };
  const transferObject = (params: Stripe.TransferCreateParams, livemode = false): Stripe.Transfer =>
    ({ id: "tr_1Test", object: "transfer", amount: params.amount ?? 0, amount_reversed: 0, balance_transaction: "txn_1", created: 1757400000, currency: params.currency, description: params.description ?? null, destination: params.destination, destination_payment: "py_1", livemode, metadata: params.metadata ?? {}, reversals: { object: "list", data: [], has_more: false, url: "/v1/transfers/tr_1Test/reversals" }, reversed: false, source_transaction: null, source_type: "card", transfer_group: params.transfer_group ?? null }) as unknown as Stripe.Transfer;

  function stub(overrides: { transferCreate?: (params: Stripe.TransferCreateParams) => Promise<Stripe.Transfer> } = {}) {
    const calls: Array<{ method: string; params?: unknown; options?: unknown }> = [];
    const verified = fixture("account-verified.json");
    const client: StripeConnectClient = {
      accounts: {
        create: async (params) => {
          calls.push({ method: "accounts.create", params });
          return { ...verified, id: "acct_1New" } as Stripe.Account;
        },
        retrieve: async (id) => {
          calls.push({ method: "accounts.retrieve", params: id });
          return verified;
        },
      },
      accountLinks: {
        create: async (params) => {
          calls.push({ method: "accountLinks.create", params });
          return { object: "account_link", created: 1757400000, expires_at: 1757403600, url: "https://connect.stripe.com/setup/e/acct_1New/abc" } as Stripe.AccountLink;
        },
      },
      transfers: {
        create: async (params, options) => {
          calls.push({ method: "transfers.create", params, options });
          return overrides.transferCreate ? overrides.transferCreate(params) : transferObject(params);
        },
        retrieve: async (id) => {
          calls.push({ method: "transfers.retrieve", params: id });
          return transferObject({ amount: 20980, currency: "usd", destination: "acct_1RxVERIFIED0001" });
        },
      },
      balance: {
        retrieve: async (params, options) => {
          calls.push({ method: "balance.retrieve", params, options });
          return { object: "balance", available: [{ amount: 500000, currency: "usd", source_types: { card: 500000 } }, { amount: 100, currency: "eur", source_types: {} }], pending: [{ amount: 2500, currency: "usd", source_types: {} }], livemode: false } as unknown as Stripe.Balance;
        },
      },
    };
    return { client, calls };
  }

  it("refuses to construct without secrets, with a live key unless allowed, or with the flag on a test key", () => {
    expect(() => new StripePayoutProvider({ env: { ...env, STRIPE_CONNECT_WEBHOOK_SECRET: "" }, client: stub().client })).toThrow(/missing STRIPE_CONNECT_WEBHOOK_SECRET/);
    expect(() => new StripePayoutProvider({ env: { ...env, STRIPE_SECRET_KEY: "sk_live_x" }, client: stub().client })).toThrow(/live payouts are refused/);
    expect(() => new StripePayoutProvider({ env: { ...env, PAYOUTS_LIVE_MODE: "1" }, client: stub().client })).toThrow(/with a test key/);
    expect(new StripePayoutProvider({ env, client: stub().client }).livemode).toBe(false);
    expect(new StripePayoutProvider({ env: { ...env, STRIPE_SECRET_KEY: "sk_live_x", PAYOUTS_LIVE_MODE: "1" }, client: stub().client }).livemode).toBe(true);
  });

  it("creates an Express account with the transfers capability and a hosted onboarding link", async () => {
    const { client, calls } = stub();
    const p = new StripePayoutProvider({ env, client });
    const state = await p.createAccount({ provider_id: "prov-1", email: "dana@northlandstoolhire.example.com", name: "Northlands Tool & Hire", business_type: "company" });
    expect(state.account_ref).toBe("acct_1New");
    expect(calls[0]!.params).toMatchObject({ type: "express", country: "US", email: "dana@northlandstoolhire.example.com", business_type: "company", capabilities: { transfers: { requested: true } }, metadata: { provider_id: "prov-1" } });
    const link = await p.createOnboardingLink({ account_ref: "acct_1New", refresh_url: "https://fab.rent/provider/earnings?onboarding=refresh", return_url: "https://fab.rent/provider/earnings?onboarding=return" });
    expect(link.url).toContain("connect.stripe.com");
    expect(link.expires_at.toISOString()).toBe(new Date(1757403600 * 1000).toISOString());
    expect(calls[1]!.params).toMatchObject({ account: "acct_1New", type: "account_onboarding", refresh_url: "https://fab.rent/provider/earnings?onboarding=refresh", return_url: "https://fab.rent/provider/earnings?onboarding=return" });
    expect((await p.getAccount("acct_1RxVERIFIED0001")).payouts_enabled).toBe(true);
  });

  it("transfers the ledger amount to the connected account under the idempotency key and transfer group", async () => {
    const { client, calls } = stub();
    const p = new StripePayoutProvider({ env, client });
    const tr = await p.transfer(input);
    expect(tr).toMatchObject({ ok: true, ref: "tr_1Test", amount_cents: 20980, currency: "usd", livemode: false, destination: "acct_1RxVERIFIED0001", reversed: false });
    expect(calls[0]).toMatchObject({ method: "transfers.create", params: { amount: 20980, currency: "usd", destination: "acct_1RxVERIFIED0001", transfer_group: "payout_p1", description: "fab.rent payout · 1 rental", metadata: { payout_id: "p1" } }, options: { idempotencyKey: "payout:p1:1" } });
    await expect(p.transfer({ ...input, amount_cents: 0 })).rejects.toMatchObject({ code: "invalid_amount" });
    expect((await p.getTransfer("tr_1Test")).amount_cents).toBe(20980);
  });

  it("maps Stripe errors onto payout error codes", async () => {
    const failing = (raw: { type: string; code?: string; message: string }) => new StripePayoutProvider({ env, client: stub({ transferCreate: async () => { throw Object.assign(new Error(raw.message), raw); } }).client }).transfer(input);
    await expect(failing({ type: "StripeInvalidRequestError", code: "balance_insufficient", message: "You have insufficient funds in your Stripe account." })).rejects.toMatchObject({ code: "insufficient_funds" });
    await expect(failing({ type: "StripeInvalidRequestError", code: "account_invalid", message: "No such destination" })).rejects.toMatchObject({ code: "not_found" });
    await expect(failing({ type: "StripeInvalidRequestError", message: "The destination account needs to have the transfers capability enabled" })).rejects.toMatchObject({ code: "account_restricted" });
    await expect(failing({ type: "StripeAPIError", message: "Stripe is having a moment" })).rejects.toMatchObject({ code: "provider_error" });
    // the SDK's own error classes take the same path
    const real = stub({ transferCreate: async () => { throw new Stripe.errors.StripeInvalidRequestError({ type: "invalid_request_error", message: "No such destination: 'acct_x'", code: "resource_missing" }); } });
    await expect(new StripePayoutProvider({ env, client: real.client }).transfer(input)).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a live-mode object from a test configuration", async () => {
    const { client } = stub({ transferCreate: async (params) => transferObject(params, true) });
    await expect(new StripePayoutProvider({ env, client }).transfer(input)).rejects.toMatchObject({ code: "mode_mismatch" });
  });

  it("reads balances for the platform and for a connected account in the configured currency", async () => {
    const { client, calls } = stub();
    const p = new StripePayoutProvider({ env, client });
    expect(await p.platformBalance()).toEqual({ available_cents: 500000, pending_cents: 2500, currency: "usd", livemode: false });
    expect((await p.accountBalance("acct_1RxVERIFIED0001")).available_cents).toBe(500000);
    expect(calls[1]).toMatchObject({ method: "balance.retrieve", options: { stripeAccount: "acct_1RxVERIFIED0001" } });
  });
});
