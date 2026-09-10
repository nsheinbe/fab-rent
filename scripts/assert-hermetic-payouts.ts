/**
 * CI / local gate: refuse Stripe Connect payouts without the Connect secrets, beside mock card
 * payments, or in CI unless HERMETIC=0; refuse live keys unless PAYOUTS_LIVE_MODE=1 (never in CI).
 * Exits 1 so a misconfigured workflow fails closed.
 *
 *   pnpm exec tsx scripts/assert-hermetic-payouts.ts
 */
import { loadEnv } from "./env";
import { assertHermeticPayouts, payoutProviderName, stripeKeyMode } from "../lib/payouts/hermetic";

loadEnv();

try {
  assertHermeticPayouts();
  const provider = payoutProviderName();
  const mode = provider === "stripe" ? stripeKeyMode(process.env.STRIPE_SECRET_KEY) : "test";
  console.log(`payouts: hermetic ok (PAYOUTS_PROVIDER=${provider}, ${mode} mode)`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
