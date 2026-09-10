/**
 * Fail-closed notification configuration, mirroring lib/payments/hermetic.ts.
 *
 * Hermetic first: CI, Playwright and local development use the console adapter, which never
 * touches the network. The real email adapter (Resend) is refused unless every live secret is
 * present, and refused again in CI unless HERMETIC=0.
 */
export const RESEND_SECRET_NAMES = ["RESEND_API_KEY", "NOTIFICATIONS_FROM"] as const;

type Env = Record<string, string | undefined>;

export type NotificationProviderName = "console" | "resend";

export function notificationProviderName(env: Env = process.env): NotificationProviderName {
  return (env.NOTIFICATIONS_PROVIDER ?? "console").toLowerCase() === "resend" ? "resend" : "console";
}

export function missingResendSecrets(env: Env = process.env): string[] {
  return RESEND_SECRET_NAMES.filter((k) => !env[k]);
}

export function assertHermeticNotifications(env: Env = process.env): void {
  if (notificationProviderName(env) !== "resend") return;
  const missing = missingResendSecrets(env);
  if (missing.length) {
    throw new Error(`NOTIFICATIONS_PROVIDER=resend is fail-closed without live secrets: missing ${missing.join(", ")}`);
  }
  if (env.CI && env.HERMETIC !== "0") {
    throw new Error("CI is hermetic: NOTIFICATIONS_PROVIDER=resend is refused. Unset it, or set HERMETIC=0 for an explicit live-secret job.");
  }
}

/** True when delivery records and sign-in codes may be exposed to the e2e inspect API (console adapter only). */
export function e2eNotificationsInspectable(env: Env = process.env): boolean {
  return notificationProviderName(env) === "console";
}
