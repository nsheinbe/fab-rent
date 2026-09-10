/**
 * Phase 7 stop condition, in Stripe TEST mode: "one rental, end to end, where the provider's balance
 * increases by the reconciled amount". Needs the Connect-enabled platform account's test keys
 * (BUILD-PLAN §3 — not available to the build; see PROGRESS.md):
 *
 *   PAYMENTS_PROVIDER=stripe PAYOUTS_PROVIDER=stripe STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… \
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_… STRIPE_CONNECT_WEBHOOK_SECRET=whsec_… \
 *   pnpm payouts:smoke [--account acct_…] [--amount 20980] [--wait 20]
 *
 *   1. creates an Express connected account (or reuses --account) and prints its hosted onboarding
 *      link — complete it in the browser with Stripe's test data (any test phone, SSN 000-00-0000,
 *      bank 000123456789 / routing 110000000)
 *   2. re-reads the account until payouts are enabled, printing the requirement state fab.rent derives
 *   3. funds the platform's test balance with a bypass-pending charge (pm_card_bypassPending) so a
 *      transfer can settle
 *   4. transfers the amount (vector 2's provider payout, $209.80, by default) under a fresh idempotency
 *      key, reads the transfer back, and asserts the connected account's balance rose by exactly that
 *
 * No database and no live mode: the hermetic gate refuses live keys, and every object is checked
 * against the key's mode. This exercises StripePayoutProvider exactly as lib/payouts/run.ts does.
 */
import Stripe from "stripe";
import { loadEnv } from "./env";
import { assertHermeticPayouts } from "../lib/payouts/hermetic";
import { StripePayoutProvider } from "../lib/payouts/stripe";
import { derivePayoutState } from "../lib/payouts/requirements";

loadEnv();

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  process.env.PAYOUTS_PROVIDER ??= "stripe";
  process.env.PAYMENTS_PROVIDER ??= "stripe";
  assertHermeticPayouts();
  const payouts = new StripePayoutProvider();
  if (payouts.livemode) throw new Error("The smoke run is test mode only");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const amount = Number(arg("amount", "20980"));
  const waitMinutes = Number(arg("wait", "20"));
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const rules = { pause_when: ["tax_id_unverified", "bank_unverified"] as const };
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // 1 · the connected account and its hosted onboarding
  let accountRef = arg("account");
  if (!accountRef) {
    const created = await payouts.createAccount({ provider_id: `smoke-${Date.now()}`, email: null, name: "fab.rent smoke provider", business_type: "individual", metadata: { smoke: "1" } });
    accountRef = created.account_ref;
    const link = await payouts.createOnboardingLink({ account_ref: accountRef, refresh_url: `${base}/provider/earnings?onboarding=refresh`, return_url: `${base}/provider/earnings?onboarding=return` });
    console.log(`\nConnected account ${accountRef} created (test mode).`);
    console.log(`Complete Stripe's hosted onboarding here, with test data:\n  ${link.url}\n`);
  }

  // 2 · wait until the account can be paid, showing what the console would derive
  const deadline = Date.now() + waitMinutes * 60_000;
  for (;;) {
    const state = await payouts.getAccount(accountRef);
    const d = derivePayoutState(state, rules, { paused_since: null, formatDate: fmt });
    console.log(`${new Date().toISOString()} · ${d.status} · ${d.reason ?? "ok"} · outstanding: ${d.outstanding.map((o) => o.label).join(", ") || "none"} · bank: ${d.account_masked ?? "none"}`);
    if (!d.payouts_paused) break;
    if (Date.now() > deadline) {
      console.log(`\nStill not payable after ${waitMinutes} min. Finish onboarding, then re-run with --account ${accountRef}.`);
      process.exit(2);
    }
    await sleep(10_000);
  }

  // 3 · the platform balance the transfer draws on
  let platform = await payouts.platformBalance();
  if (platform.available_cents < amount) {
    const pi = await stripe.paymentIntents.create({ amount, currency: platform.currency, payment_method: "pm_card_bypassPending", payment_method_types: ["card"], confirm: true, description: "fab.rent smoke top-up (test mode)" });
    console.log(`Topped up the test balance with ${pi.id} (${pi.status}).`);
    platform = await payouts.platformBalance();
  }
  console.log(`Platform balance: ${money(platform.available_cents)} available · ${money(platform.pending_cents)} pending`);

  // 4 · transfer and reconcile
  const before = await payouts.accountBalance(accountRef);
  const key = `smoke:${accountRef}:${Date.now()}`;
  const tr = await payouts.transfer({ account_ref: accountRef, amount_cents: amount, idempotency_key: key, transfer_group: key, description: "fab.rent smoke payout · vector 2 provider payout", metadata: { smoke: "1" } });
  const read = await payouts.getTransfer(tr.ref);
  const after = await payouts.accountBalance(accountRef);
  const delta = after.available_cents + after.pending_cents - (before.available_cents + before.pending_cents);
  console.log(`Transfer ${tr.ref}: ${money(read.amount_cents)} → ${read.destination} · reversed=${read.reversed} · livemode=${read.livemode}`);
  console.log(`Connected balance: ${money(before.available_cents + before.pending_cents)} → ${money(after.available_cents + after.pending_cents)} (Δ ${money(delta)})`);
  const problems: string[] = [];
  if (read.amount_cents !== amount) problems.push(`transfer amount ${read.amount_cents} ≠ ${amount}`);
  if (read.destination !== accountRef) problems.push(`destination ${read.destination} ≠ ${accountRef}`);
  if (read.reversed) problems.push("transfer is reversed");
  if (read.livemode) problems.push("transfer is live mode");
  if (delta !== amount) problems.push(`balance rose by ${delta}, not ${amount}`);
  if (problems.length) {
    console.error(`\nNOT reconciled: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`\nOK — the provider's balance increased by the reconciled amount (${money(amount)}).`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
