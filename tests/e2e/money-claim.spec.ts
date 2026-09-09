import { expect, test } from "@playwright/test";
import { inspect, resetPaymentCalls, seedOpenClaim, signInDemo } from "./helpers";

/**
 * Accept a damage claim: capture the upheld amount from the hold, release the remainder,
 * no commission on the claim. FR-4CWE-19 is already inspecting with a placed $120 hold.
 */
const REF = "FR-4CWE-19";
const TOMAS = "tomas.r@example.com";
const CLAIM_CENTS = 8000;
const HOLD_CENTS = 12000;

test("accepted claim captures from the hold and releases the remainder with no commission", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "money-path assertions are viewport-independent");
  await resetPaymentCalls(request);
  await seedOpenClaim(request, REF, CLAIM_CENTS);
  await signInDemo(page, TOMAS, `/rentals/${REF}`);
  await page.waitForURL(new RegExp(`/rentals/${REF}`));

  await expect(page.getByText("$80.00")).toBeVisible();
  await page.getByTestId("accept-claim").click();
  await expect(page.getByText("Claim accepted").first()).toBeVisible();

  const data = await inspect(request, { ref: REF });
  expect(data.booking?.status).toBe("completed");
  expect(data.booking?.hold_status).toBe("partially_captured");
  expect(data.booking?.hold_captured_cents).toBe(CLAIM_CENTS);
  expect(data.booking?.hold_cents).toBe(HOLD_CENTS);

  const capture = (data.calls ?? []).find((c) => c.op === "capture" && c.ok);
  expect(capture, "mock must record a capture against the hold").toBeTruthy();
  expect(capture!.amount_cents).toBe(CLAIM_CENTS);
  expect(capture!.captured_cents).toBe(CLAIM_CENTS);
  expect(capture!.released_cents).toBe(HOLD_CENTS - CLAIM_CENTS);
  expect(capture!.authorization_ref).toBe(data.booking?.payment_refs.hold);

  const accepted = (data.claims ?? []).find((c) => c.status === "accepted");
  expect(accepted?.amount_cents).toBe(CLAIM_CENTS);
  expect(accepted?.settled_cents).toBe(CLAIM_CENTS);

  const rental = (data.ledger ?? []).find((r) => r.type === "rental");
  expect(rental, "rental ledger must clear at claim accept").toBeTruthy();
  expect(rental!.balances).toBe(true);
  expect(rental!.status).toBe("available");
  expect(rental!.adjustment_cents).toBe(CLAIM_CENTS);
  expect(rental!.adjustment_label).toMatch(/claim/);
  // commission is only on the original rental — the claim adjustment is added in full
  expect(rental!.net_cents).toBe(rental!.gross_cents + rental!.commission_cents + CLAIM_CENTS);
  expect(rental!.commission_cents).toBeLessThan(0);
});
