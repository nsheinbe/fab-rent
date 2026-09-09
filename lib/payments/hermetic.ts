/**
 * Fail-closed payment configuration.
 *
 * Hermetic first: CI and Playwright always run the mock. Stripe is refused unless every
 * live secret is present, and refused again in CI unless HERMETIC=0 (an explicit opt-out
 * for a future live-secret job — Phase 5 does not ship one).
 */
export const STRIPE_SECRET_NAMES = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] as const;

type Env = Record<string, string | undefined>;

export function missingStripeSecrets(env: Env = process.env): string[] {
  return STRIPE_SECRET_NAMES.filter((k) => !env[k]);
}

export function assertHermeticPayments(env: Env = process.env): void {
  const provider = (env.PAYMENTS_PROVIDER ?? "mock").toLowerCase();
  if (provider !== "stripe") return;
  const missing = missingStripeSecrets(env);
  if (missing.length) {
    throw new Error(`PAYMENTS_PROVIDER=stripe is fail-closed without live secrets: missing ${missing.join(", ")}`);
  }
  if (env.CI && env.HERMETIC !== "0") {
    throw new Error("CI is hermetic: PAYMENTS_PROVIDER=stripe is refused. Unset it, or set HERMETIC=0 for an explicit live-secret job.");
  }
}

/** True when the inspect API and mock call log may be exposed (never beside live Stripe). */
export function e2eInspectEnabled(env: Env = process.env): boolean {
  return env.E2E_INSPECT === "1" && (env.PAYMENTS_PROVIDER ?? "mock") !== "stripe";
}
