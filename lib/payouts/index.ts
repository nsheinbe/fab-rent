import { assertHermeticPayouts, payoutProviderName } from "./hermetic";
import { MockPayoutProvider } from "./mock";
import type { PayoutProvider } from "./types";

export * from "./types";
export * from "./requirements";
export { MockPayoutProvider, mockNotStartedState, mockScenarioState } from "./mock";
export { assertHermeticPayouts, e2ePayoutsInspectable, liveModeAllowed, missingConnectSecrets, payoutProviderName, stripeKeyMode, CONNECT_SECRET_NAMES } from "./hermetic";

declare global {
  var __fabrentPayouts: PayoutProvider | undefined;
}

/** `PAYOUTS_PROVIDER=stripe` switches to Stripe Connect; anything else is the deterministic mock. Fail-closed without Connect secrets. */
export async function getPayoutProvider(): Promise<PayoutProvider> {
  if (globalThis.__fabrentPayouts) return globalThis.__fabrentPayouts;
  assertHermeticPayouts();
  if (payoutProviderName() === "stripe") {
    const { StripePayoutProvider } = await import("./stripe");
    globalThis.__fabrentPayouts = new StripePayoutProvider();
  } else {
    globalThis.__fabrentPayouts = new MockPayoutProvider();
  }
  return globalThis.__fabrentPayouts;
}

/** Test-only: drop the process-wide provider so the next call re-reads env. */
export function resetPayoutProviderForTests() {
  globalThis.__fabrentPayouts = undefined;
}
