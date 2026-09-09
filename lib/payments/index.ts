import { assertHermeticPayments } from "./hermetic";
import { MockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

export * from "./types";
export { MockPaymentProvider } from "./mock";
export { assertHermeticPayments, e2eInspectEnabled, missingStripeSecrets } from "./hermetic";

declare global {
  var __fabrentPayments: PaymentProvider | undefined;
}

/** `PAYMENTS_PROVIDER=stripe` switches to Stripe; anything else is the deterministic mock. Fail-closed without live secrets. */
export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (globalThis.__fabrentPayments) return globalThis.__fabrentPayments;
  assertHermeticPayments();
  if (process.env.PAYMENTS_PROVIDER === "stripe") {
    const { StripePaymentProvider } = await import("./stripe");
    globalThis.__fabrentPayments = new StripePaymentProvider();
  } else {
    globalThis.__fabrentPayments = new MockPaymentProvider();
  }
  return globalThis.__fabrentPayments;
}

/** Test-only: drop the process-wide provider so the next call re-reads env. */
export function resetPaymentProviderForTests() {
  globalThis.__fabrentPayments = undefined;
}
