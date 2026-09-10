import { ConsoleNotificationProvider } from "./console";
import { assertHermeticNotifications, notificationProviderName } from "./hermetic";
import type { NotificationProvider } from "./types";

export * from "./types";
export * from "./catalogue";
export { ConsoleNotificationProvider } from "./console";
export { assertHermeticNotifications, e2eNotificationsInspectable, missingResendSecrets, notificationProviderName, RESEND_SECRET_NAMES } from "./hermetic";

declare global {
  var __fabrentNotifications: NotificationProvider | undefined;
}

/** `NOTIFICATIONS_PROVIDER=resend` switches to real email; anything else is the console adapter. Fail-closed without live secrets. */
export async function getNotificationProvider(): Promise<NotificationProvider> {
  if (globalThis.__fabrentNotifications) return globalThis.__fabrentNotifications;
  assertHermeticNotifications();
  if (notificationProviderName() === "resend") {
    const { ResendNotificationProvider } = await import("./resend");
    globalThis.__fabrentNotifications = new ResendNotificationProvider();
  } else {
    globalThis.__fabrentNotifications = new ConsoleNotificationProvider();
  }
  return globalThis.__fabrentNotifications;
}

/** Test-only: drop the process-wide provider so the next call re-reads env. */
export function resetNotificationProviderForTests() {
  globalThis.__fabrentNotifications = undefined;
}
