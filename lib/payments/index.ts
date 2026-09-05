import { MockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

export * from "./types";
export { MockPaymentProvider } from "./mock";

declare global {
  var __fabrentPayments: PaymentProvider | undefined;
}

/** `PAYMENTS_PROVIDER=stripe` switches to Stripe; anything else is the deterministic mock. */
export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (globalThis.__fabrentPayments) return globalThis.__fabrentPayments;
  if (process.env.PAYMENTS_PROVIDER === "stripe") {
    const { StripePaymentProvider } = await import("./stripe");
    globalThis.__fabrentPayments = new StripePaymentProvider();
  } else {
    globalThis.__fabrentPayments = new MockPaymentProvider();
  }
  return globalThis.__fabrentPayments;
}
