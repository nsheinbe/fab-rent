import { expect, test } from "@playwright/test";
import { inspect, resetPaymentCalls, signInWithOtp } from "./helpers";

/**
 * Declined card at checkout (mock last4 0000). Leaves no booking, no hold and no ledger entry.
 */
const LISTING = /DeWalt DWE7491/;

test("declined card at checkout leaves no booking, hold or ledger", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "money-path assertions are viewport-independent");
  await resetPaymentCalls(request);
  const email = `e2e-decline-${Date.now().toString(36)}@example.com`;

  await page.goto("/search?q=table+saw");
  await expect(page.getByRole("link", { name: LISTING }).first()).toBeVisible();
  await page.getByRole("link", { name: LISTING }).first().click();
  await page.waitForURL(/\/listings\//);
  await page.getByRole("link", { name: "Reserve" }).or(page.getByRole("button", { name: "Reserve" })).first().click();
  await page.waitForURL(/\/(book\/|auth|checkout\/)/);

  if (/\/book\//.test(page.url())) {
    await expect(page.getByText("Billed as")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/(auth|checkout)/);
  }
  if (/\/auth/.test(page.url())) {
    await signInWithOtp(page, email, "Declined Card");
    await page.waitForURL(/\/checkout\//);
  }

  const draftId = page.url().match(/\/checkout\/([^/?#]+)/)?.[1];
  expect(draftId).toBeTruthy();

  await page.getByRole("button", { name: /Add a (new )?card/ }).click();
  await page.getByTestId("card-number").fill("4242 4242 4242 0000");
  await page.getByLabel("Expiry").fill("1228");
  await page.getByLabel("CVC").fill("123");
  await page.getByTestId("save-card").click();
  await expect(page.getByRole("radio", { name: /Visa •••• 0000/ }).first()).toBeChecked();
  await page.getByRole("button", { name: /^Pay \$/ }).first().click();

  await expect(page.getByRole("alert")).toContainText(/card was declined/i);
  await expect(page).toHaveURL(/\/checkout\//);

  const byEmail = await inspect(request, { email });
  expect(byEmail.bookings ?? []).toEqual([]);
  expect(byEmail.ledger ?? []).toEqual([]);

  const declined = (byEmail.calls ?? []).filter((c) => c.op === "charge" && c.ok === false && c.code === "declined");
  expect(declined.length, "mock must record the declined charge").toBeGreaterThan(0);
  expect(declined.some((c) => c.method_label?.endsWith("0000"))).toBe(true);
  expect((byEmail.calls ?? []).some((c) => c.op === "authorize")).toBe(false);
  expect((byEmail.calls ?? []).some((c) => c.op === "charge" && c.ok)).toBe(false);

  const draft = await inspect(request, { draftId });
  expect(draft.draft, "failed checkout must leave the draft, not convert it").toBeTruthy();
  expect(draft.booking).toBeNull();
});
