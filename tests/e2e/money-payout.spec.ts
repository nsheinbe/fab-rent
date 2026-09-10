import { expect, test } from "@playwright/test";
import { failNextPayout, inspectProvider, ledgerIdentity, resetPaymentCalls, runJob, signInDemo, transition, type ProviderInspect } from "./helpers";

/**
 * Phase 7 acceptance (BUILD-PLAN), hermetic: the mock payout provider records every Connect call, so
 * the assertions are on the money path — account requirement state, transfer amounts, the ledger the
 * transfer reconciles against — not only the screen. Stripe test mode runs the same code through
 * lib/payouts/stripe.ts (unit-tested against recorded fixtures; the live run needs the platform
 * account, see PROGRESS.md).
 */
test.describe.configure({ mode: "serial" });

const BEA = "bea@kestrelpartyhire.example.com"; // Kestrel Party Hire: never onboarded
const INES = "ines@fab.rent";
const NORTHLANDS = "northlands-tool-hire";
const REF_TUESDAY = "FR-SRC4-09"; // confirmed Northlands delivery rental, untouched by the other specs
const REF_RETRY = "FR-OC12-88"; // confirmed Northlands pickup rental, untouched by the other specs
const TUE_8_SEP = "2026-09-08T13:30:00.000Z"; // Tue 8 Sep 09:30 market time · Northlands' scheduled payout day
const TUE_8_SEP_LATER = "2026-09-08T15:00:00.000Z";
const TUE_15_SEP = "2026-09-15T13:30:00.000Z";

const cleared = (n: ProviderInspect) => n.ledger.filter((l) => l.status === "available" && l.type !== "payout" && !l.payout_id);
const transfersTo = (n: ProviderInspect, ref: string) => n.payout_calls.filter((c) => c.op === "transfer" && c.account_ref === ref);

async function completeRental(request: Parameters<typeof transition>[0], ref: string) {
  await transition(request, ref, "handoff_complete");
  await transition(request, ref, "return_checkin_start");
  await transition(request, ref, "return_no_claim");
}

test("provider onboarding drives the console from the account's real requirement state", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "money-path assertions are viewport-independent");
  const main = page.locator("#main");
  await signInDemo(page, BEA, "/provider/earnings");
  await page.waitForURL(/\/provider\/earnings/);
  await expect(main.getByTestId("payout-account-status")).toHaveText("Not connected");

  // hosted onboarding (the demo stand-in for Stripe's) ends with the tax ID left out
  await main.getByTestId("payout-onboard").click();
  await page.waitForURL(/\/provider\/earnings\/onboarding/);
  await main.getByLabel(/Account number/).fill("000123457788");
  await main.getByTestId("mock-onboarding-tax_id_missing").click();
  await main.getByTestId("mock-onboarding-continue").click();
  await page.waitForURL(/\/provider\/earnings\?onboarding=return/);
  await expect(main.getByTestId("payout-account-status")).toHaveText("Action needed");
  await expect(main.getByTestId("payouts-paused")).toContainText("Tax ID missing");
  await expect(main.getByTestId("payout-requirements")).toContainText("Business tax ID");

  let k = await inspectProvider(request, "kestrel-party-hire");
  expect(k.connect?.details_submitted).toBe(true);
  expect(k.connect?.requirements.currently_due).toContain("company.tax_id");
  // the flags the console renders are derived from that state, not hand-set
  expect(k.provider).toMatchObject({ payouts_paused: true, tax_id_verified: false, payout_account_verified: true, payout_account_masked: "Maren Bank •••• 7788" });
  expect(k.provider?.payouts_paused_reason).toMatch(/^Tax ID missing · payout paused since \d+ \w+$/);
  expect(k.payout_calls.some((c) => c.op === "createAccount" && c.account_ref === k.connect?.account_ref)).toBe(true);
  const action = k.deliveries.filter((d) => d.template === "payout_account_action");
  expect(action).toHaveLength(1);
  expect(action[0]).toMatchObject({ status: "sent", provider: "console", party: "provider" });
  expect(action[0]!.subject).toContain("Tax ID missing");

  // the provider resolves it with the payout provider → verified, payouts on
  await main.getByTestId("payout-onboard").click();
  await page.waitForURL(/\/provider\/earnings\/onboarding/);
  await main.getByTestId("mock-onboarding-verified").click();
  await main.getByTestId("mock-onboarding-continue").click();
  await page.waitForURL(/\/provider\/earnings\?onboarding=return/);
  await expect(main.getByTestId("payout-account-status")).toHaveText("Verified");
  await expect(main.getByTestId("payouts-paused")).toHaveCount(0);
  await expect(main.getByTestId("payout-requirements")).toHaveCount(0);

  k = await inspectProvider(request, "kestrel-party-hire");
  expect(k.connect?.payouts_enabled).toBe(true);
  expect(k.connect?.requirements.currently_due).toEqual([]);
  expect(k.provider).toMatchObject({ payouts_paused: false, payouts_paused_reason: null, payouts_paused_since: null, tax_id_verified: true, payout_account_verified: true, payout_account_masked: "Maren Bank •••• 7788" });
  const verified = k.deliveries.filter((d) => d.template === "payout_account_verified");
  expect(verified).toHaveLength(1);
  expect(verified[0]).toMatchObject({ status: "sent", provider: "console" });
  expect(verified[0]!.subject).toContain("Maren Bank •••• 7788");
  // onboarding never moves money
  expect(transfersTo(k, k.connect!.account_ref)).toHaveLength(0);
});

test("a completed rental transfers rental + extras + delivery − commission to the cent and reconciles against the ledger", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "money-path assertions are viewport-independent");
  await resetPaymentCalls(request);
  const before = await inspectProvider(request, NORTHLANDS);
  const sentBefore = before.deliveries.filter((d) => d.template === "payout_sent").length;
  const balanceBefore = before.account_balance?.available_cents ?? 0;

  // one more rental clears at return check-in: handoff → check-in → no claim
  await completeRental(request, REF_TUESDAY);
  let n = await inspectProvider(request, NORTHLANDS);
  const entry = n.ledger.find((l) => l.ref === REF_TUESDAY && l.type === "rental");
  expect(entry, "the rental's ledger entry").toBeTruthy();
  expect(entry!.status).toBe("available");
  expect(ledgerIdentity(entry!)).toBe(true);
  // rental + extras + delivery − commission, from the booking's own price snapshot
  expect(entry!.net_cents).toBe(entry!.provider_payout_cents);
  expect(entry!.commission_cents).toBeLessThan(0);
  const due = cleared(n);
  const expected = due.reduce((s, l) => s + l.net_cents, 0);
  expect(due.map((l) => l.id)).toContain(entry!.id);
  expect(expected).toBeGreaterThan(0);

  // Tuesday's run
  const run = await runJob(request, "payouts", TUE_8_SEP);
  expect(run.paid).toBe(1);
  n = await inspectProvider(request, NORTHLANDS);
  const paid = n.payouts.find((p) => p.status === "paid" && p.transfer_ref);
  expect(paid, "a paid payout with a transfer").toBeTruthy();
  expect(paid!.transfer_ref).toMatch(/^tr_mock_/);
  expect(paid!.livemode).toBe(false);
  expect(paid!.payout_provider).toBe("mock");
  expect(paid!.transfer_attempts).toBe(1);
  expect(paid!.exception).toBeNull();
  expect(paid!.amount_cents).toBe(expected);
  expect(paid!.rental_count).toBe(due.length);

  // every cleared entry, and only those, is attached and paid; the sum is the transfer, to the cent
  const attached = n.ledger.filter((l) => l.payout_id === paid!.id && l.type !== "payout");
  expect(attached.map((l) => l.id).sort()).toEqual(due.map((l) => l.id).sort());
  expect(attached.every((l) => l.status === "paid")).toBe(true);
  expect(attached.reduce((s, l) => s + l.net_cents, 0)).toBe(paid!.amount_cents);
  // every attached entry balances; the one this test completed equals its booking's provider payout to the cent
  // (other cleared entries may carry cancellation keeps or claim adjustments from the other specs — the ledger, not the snapshot, is what was owed)
  for (const l of attached) expect(ledgerIdentity(l)).toBe(true);
  const paidEntry = attached.find((l) => l.id === entry!.id)!;
  expect(paidEntry.net_cents).toBe(paidEntry.provider_payout_cents);
  expect(cleared(n)).toHaveLength(0);
  const payoutRow = n.ledger.find((l) => l.type === "payout" && l.payout_id === paid!.id);
  expect(payoutRow?.net_cents).toBe(paid!.amount_cents);

  // the provider recorded exactly one transfer, for that amount, to Northlands' connected account, and the account's balance rose by it
  const transfers = transfersTo(n, n.connect!.account_ref);
  expect(transfers).toHaveLength(1);
  expect(transfers[0]).toMatchObject({ ok: true, amount_cents: expected, ref: paid!.transfer_ref, idempotency_key: `payout:${paid!.id}:1`, transfer_group: `payout_${paid!.id}` });
  expect(n.account_balance!.available_cents - balanceBefore).toBe(expected);
  expect(n.payout_calls.filter((c) => c.op === "transfer")).toHaveLength(1);

  // the provider is told once, with the amount and the account
  const sent = n.deliveries.filter((d) => d.template === "payout_sent");
  expect(sent).toHaveLength(sentBefore + 1);
  const latest = sent[sent.length - 1]!;
  expect(latest).toMatchObject({ status: "sent", provider: "console", party: "provider" });
  expect(latest.subject).toMatch(/^Payout sent · \$[\d,]+\.\d{2} to Maren Bank •••• 8812$/);
});

test("a provider with incomplete verification cannot be paid and the console explains why", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "money-path assertions are viewport-independent");
  // Tomas Reinholt: tax ID missing at the payout provider; his payout has been paused since 1 Sep. Tuesday's run above re-read his account and left his money alone.
  let t = await inspectProvider(request, "tomas-reinholt");
  const paused = t.payouts.find((p) => p.status === "paused");
  expect(paused, "the paused payout").toBeTruthy();
  expect(paused!.exception).toBe("Tax ID missing");
  expect(t.provider).toMatchObject({ payouts_paused: true, tax_id_verified: false });
  expect(t.connect?.requirements.currently_due).toContain("individual.id_number");
  expect(t.payout_calls.some((c) => c.op === "getAccount" && c.account_ref === t.connect!.account_ref)).toBe(true);
  expect(transfersTo(t, t.connect!.account_ref)).toHaveLength(0);

  await signInDemo(page, INES, "/admin/payouts");
  await page.waitForURL(/\/admin\/payouts/);
  const row = page.locator('[data-testid="payout-row"][data-provider="tomas-reinholt"]').first();
  await expect(row.getByTestId("payout-row-exception")).toContainText("Tax ID missing");
  await expect(row.getByTestId("payout-row-account")).toContainText("Tax ID missing");
  // "Release" re-reads the account and refuses with the blocker instead of paying
  await row.getByTestId("release-payout").click();
  await expect(page.getByText(/Still paused: Tax ID missing/).first()).toBeVisible();

  t = await inspectProvider(request, "tomas-reinholt");
  expect(t.payouts.find((p) => p.id === paused!.id)?.status).toBe("paused");
  expect(t.provider?.payouts_paused).toBe(true);
  expect(transfersTo(t, t.connect!.account_ref)).toHaveLength(0);
});

test("a failed transfer lands in the exception state and retry actually retries", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "money-path assertions are viewport-independent");
  await resetPaymentCalls(request);
  await completeRental(request, REF_RETRY);
  // the run after Tuesday's schedules the newly cleared rental for the following Tuesday
  const scheduled = await runJob(request, "payouts", TUE_8_SEP_LATER);
  expect(scheduled.scheduled).toBe(1);
  let n = await inspectProvider(request, NORTHLANDS);
  const row = n.payouts.find((p) => p.status === "scheduled");
  expect(row, "a scheduled payout for the following Tuesday").toBeTruthy();
  expect(row!.scheduled_for.slice(0, 10)).toBe("2026-09-15");
  const entry = n.ledger.find((l) => l.ref === REF_RETRY && l.type === "rental")!;
  expect(entry.status).toBe("available");

  // the payout provider refuses the transfer
  await failNextPayout(request, "Simulated transfer failure");
  const failedRun = await runJob(request, "payouts", TUE_15_SEP);
  expect(failedRun.failed).toBe(1);
  n = await inspectProvider(request, NORTHLANDS);
  const failed = n.payouts.find((p) => p.id === row!.id)!;
  expect(failed).toMatchObject({ status: "failed", exception: "Transfer failed", transfer_attempts: 1, transfer_ref: null });
  expect(failed.exception_detail).toContain("Simulated transfer failure");
  expect(failed.exception_detail).toContain("attempt 1");
  // nothing was attached or paid on failure
  expect(n.ledger.find((l) => l.id === entry.id)).toMatchObject({ status: "available", payout_id: null });

  // ops retries: the same amount goes out under a fresh idempotency key
  await signInDemo(page, INES, "/admin/payouts");
  await page.waitForURL(/\/admin\/payouts/);
  const line = page.locator(`[data-testid="payout-row"][data-provider="${NORTHLANDS}"][data-status="failed"]`).first();
  await expect(line.getByTestId("payout-row-exception")).toContainText("Transfer failed · Simulated transfer failure");
  await line.getByTestId("retry-payout").click();
  await expect(page.getByText("Transfer retried · paid · provider notified").first()).toBeVisible();

  n = await inspectProvider(request, NORTHLANDS);
  const paid = n.payouts.find((p) => p.id === row!.id)!;
  expect(paid).toMatchObject({ status: "paid", transfer_attempts: 2, exception: null, exception_detail: null });
  expect(paid.transfer_ref).toMatch(/^tr_mock_/);
  expect(paid.amount_cents).toBe(entry.net_cents);
  expect(n.ledger.find((l) => l.id === entry.id)).toMatchObject({ status: "paid", payout_id: paid.id });
  const transfers = transfersTo(n, n.connect!.account_ref);
  expect(transfers.map((c) => [c.ok, c.idempotency_key])).toEqual([
    [false, `payout:${row!.id}:1`],
    [true, `payout:${row!.id}:2`],
  ]);
  expect(transfers[1]!.amount_cents).toBe(paid.amount_cents);
  expect(transfers[1]!.ref).toBe(paid.transfer_ref);
});
