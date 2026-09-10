/**
 * Fail-closed payout (Stripe Connect) configuration, mirroring lib/payments/hermetic.ts.
 *
 * Hermetic first: CI, Playwright and local development use the mock payout provider, which never
 * touches the network. Real transfers need PAYOUTS_PROVIDER=stripe plus every Connect secret, are
 * refused in CI unless HERMETIC=0, and are refused beside mock card payments (transfers draw on the
 * same Stripe balance as the charges). Test mode and live mode are separated by configuration, not
 * by care: a live key is refused unless PAYOUTS_LIVE_MODE=1 is set deliberately, CI never accepts
 * that flag, and a test key with the flag set is refused too — so a test-mode run cannot move live
 * money and a live run cannot happen by accident.
 */
export const CONNECT_SECRET_NAMES = ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET"] as const;

type Env = Record<string, string | undefined>;

export type PayoutProviderName = "mock" | "stripe";

export function payoutProviderName(env: Env = process.env): PayoutProviderName {
  return (env.PAYOUTS_PROVIDER ?? "mock").toLowerCase() === "stripe" ? "stripe" : "mock";
}

export function missingConnectSecrets(env: Env = process.env): string[] {
  return CONNECT_SECRET_NAMES.filter((k) => !env[k]);
}

/** Which Stripe mode a secret key belongs to. Unknown prefixes are refused rather than guessed. */
export function stripeKeyMode(key: string | undefined): "live" | "test" | null {
  if (!key) return null;
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  return null;
}

export function liveModeAllowed(env: Env = process.env): boolean {
  return env.PAYOUTS_LIVE_MODE === "1";
}

export function assertHermeticPayouts(env: Env = process.env): void {
  const provider = payoutProviderName(env);
  const live = liveModeAllowed(env);
  if (live && env.CI) {
    throw new Error("CI is hermetic: PAYOUTS_LIVE_MODE=1 is refused. Live payouts never run from CI.");
  }
  if (provider !== "stripe") {
    if (live) throw new Error("PAYOUTS_LIVE_MODE=1 has no meaning with the mock payout provider. Unset it, or set PAYOUTS_PROVIDER=stripe deliberately.");
    return;
  }
  const missing = missingConnectSecrets(env);
  if (missing.length) {
    throw new Error(`PAYOUTS_PROVIDER=stripe is fail-closed without Connect secrets: missing ${missing.join(", ")}`);
  }
  if ((env.PAYMENTS_PROVIDER ?? "mock").toLowerCase() !== "stripe") {
    throw new Error("PAYOUTS_PROVIDER=stripe requires PAYMENTS_PROVIDER=stripe: transfers draw on the same Stripe balance as the renter charges, so mock charges beside real transfers are refused.");
  }
  const mode = stripeKeyMode(env.STRIPE_SECRET_KEY);
  if (mode === null) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key whose mode is unambiguous (sk_test_… / rk_test_… for test mode, sk_live_… / rk_live_… for live mode).");
  }
  if (mode === "live" && !live) {
    throw new Error("STRIPE_SECRET_KEY is a live key: live payouts are refused unless PAYOUTS_LIVE_MODE=1 is set deliberately. Test mode uses an sk_test_… key.");
  }
  if (mode === "test" && live) {
    throw new Error("PAYOUTS_LIVE_MODE=1 with a test key: unset the flag for test mode, or supply the live key deliberately.");
  }
  if (env.CI && env.HERMETIC !== "0") {
    throw new Error("CI is hermetic: PAYOUTS_PROVIDER=stripe is refused. Unset it, or set HERMETIC=0 for an explicit test-secret job.");
  }
}

/** True when the payout call log and mock onboarding may be exposed to the e2e inspect API (mock only). */
export function e2ePayoutsInspectable(env: Env = process.env): boolean {
  return payoutProviderName(env) === "mock";
}
