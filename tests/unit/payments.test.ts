import { afterEach, describe, expect, it } from "vitest";
import { assertHermeticPayments, e2eInspectEnabled, missingStripeSecrets } from "@/lib/payments/hermetic";
import { MockPaymentProvider } from "@/lib/payments/mock";
import { getPaymentProvider, resetPaymentProviderForTests } from "@/lib/payments";
import { isPaymentError } from "@/lib/payments/types";

const method = { id: "pm", provider_ref: null, label: "Visa •••• 4242" };
const declined = { id: "pm-bad", provider_ref: null, label: "Visa •••• 0000" };

afterEach(() => {
  resetPaymentProviderForTests();
});

describe("hermetic payments — fail closed", () => {
  it("allows the mock with no Stripe secrets", () => {
    expect(() => assertHermeticPayments({ PAYMENTS_PROVIDER: "mock" })).not.toThrow();
    expect(() => assertHermeticPayments({})).not.toThrow();
  });

  it("names the missing Stripe secrets", () => {
    const env = { PAYMENTS_PROVIDER: "stripe" };
    expect(missingStripeSecrets(env)).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]);
    expect(() => assertHermeticPayments(env)).toThrow(/fail-closed without live secrets: missing STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
  });

  it("refuses Stripe in CI even when secrets are present (hermetic first)", () => {
    const env = {
      PAYMENTS_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_x",
      CI: "true",
    };
    expect(() => assertHermeticPayments(env)).toThrow(/CI is hermetic/);
    expect(() => assertHermeticPayments({ ...env, HERMETIC: "0" })).not.toThrow();
  });

  it("never enables the inspect API beside Stripe", () => {
    expect(e2eInspectEnabled({ E2E_INSPECT: "1", PAYMENTS_PROVIDER: "mock" })).toBe(true);
    expect(e2eInspectEnabled({ E2E_INSPECT: "1", PAYMENTS_PROVIDER: "stripe" })).toBe(false);
    expect(e2eInspectEnabled({ PAYMENTS_PROVIDER: "mock" })).toBe(false);
  });

  it("getPaymentProvider throws before constructing Stripe when the secret is missing", async () => {
    const prev = process.env.PAYMENTS_PROVIDER;
    const prevKey = process.env.STRIPE_SECRET_KEY;
    process.env.PAYMENTS_PROVIDER = "stripe";
    delete process.env.STRIPE_SECRET_KEY;
    resetPaymentProviderForTests();
    try {
      await expect(getPaymentProvider()).rejects.toThrow(/fail-closed without live secrets/);
    } finally {
      if (prev === undefined) delete process.env.PAYMENTS_PROVIDER;
      else process.env.PAYMENTS_PROVIDER = prev;
      if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = prevKey;
    }
  });
});

describe("mock payment recording", () => {
  it("records a successful charge and a declined card", async () => {
    const p = new MockPaymentProvider();
    const ok = await p.charge({ amount_cents: 20576, method, idempotency_key: "charge:ok" });
    expect(ok.amount_cents).toBe(20576);
    await expect(p.charge({ amount_cents: 20576, method: declined, idempotency_key: "charge:no" })).rejects.toSatisfy((e) => isPaymentError(e) && e.code === "declined");
    const calls = p.recordedCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ op: "charge", ok: true, amount_cents: 20576, ref: ok.ref });
    expect(calls[1]).toMatchObject({ op: "charge", ok: false, code: "declined", method_label: "Visa •••• 0000" });
  });

  it("records a refund of the fee-window amount", async () => {
    const p = new MockPaymentProvider();
    const r = await p.refund({ charge_ref: "mock_ch_FR-2QRX-77", amount_cents: 16845 });
    expect(p.recordedCalls()).toEqual([expect.objectContaining({ op: "refund", ok: true, amount_cents: 16845, charge_ref: "mock_ch_FR-2QRX-77", ref: r.ref })]);
  });

  it("records a partial capture against a remembered hold", async () => {
    const p = new MockPaymentProvider();
    p.rememberAuthorization("mock_auth_FR-4CWE-19", 12000);
    const c = await p.capture({ authorization_ref: "mock_auth_FR-4CWE-19", amount_cents: 8000 });
    expect(c.captured_cents).toBe(8000);
    expect(c.released_cents).toBe(4000);
    expect(p.recordedCalls()[0]).toMatchObject({ op: "capture", ok: true, captured_cents: 8000, released_cents: 4000 });
  });
});
