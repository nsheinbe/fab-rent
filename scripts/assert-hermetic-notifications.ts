/**
 * CI / local gate: refuse the real email adapter without live secrets, and refuse it in CI
 * unless HERMETIC=0. Exits 1 so a misconfigured workflow fails closed.
 *
 *   pnpm exec tsx scripts/assert-hermetic-notifications.ts
 */
import { loadEnv } from "./env";
import { assertHermeticNotifications, notificationProviderName } from "../lib/notifications/hermetic";

loadEnv();

try {
  assertHermeticNotifications();
  console.log(`notifications: hermetic ok (NOTIFICATIONS_PROVIDER=${notificationProviderName()})`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
