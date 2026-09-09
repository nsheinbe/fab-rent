/**
 * CI / local gate: refuse Stripe without live secrets, and refuse Stripe in CI
 * unless HERMETIC=0. Exits 1 so a misconfigured workflow fails closed.
 *
 *   pnpm exec tsx scripts/assert-hermetic-payments.ts
 */
import { loadEnv } from "./env";
import { assertHermeticPayments } from "../lib/payments/hermetic";

loadEnv();

try {
  assertHermeticPayments();
  const provider = process.env.PAYMENTS_PROVIDER ?? "mock";
  console.log(`payments: hermetic ok (PAYMENTS_PROVIDER=${provider})`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
