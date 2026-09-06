import { expect, test, type Page } from "@playwright/test";

/**
 * Provider path (Phase 2): approve a request, then run a pickup booking through
 * mark prepared → handoff (ID, serial, photo, checklist, signature → hold placed) → return check-in (no claim → hold released).
 * Uses the seeded Northlands account; the demo DB is reset between runs by `pnpm db:reset`.
 */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function signInAsDana(page: Page) {
  await page.goto("/auth?next=%2Fprovider");
  await page.getByRole("button", { name: /Demo · sign in as a seeded account/ }).click();
  await page.getByTestId("demo-account-dana@northlandstoolhire.example.com").click();
  await page.waitForURL(/\/provider/);
}

test("approve request → prepare → handoff → return check-in", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "phone-first flow; the desktop project covers the renter path");
  await signInAsDana(page);

  // dashboard shows the open request; approve it
  await expect(page.getByRole("heading", { name: "Needs your action" })).toBeVisible();
  const genie = page.getByText(/Genie GS-1930/).first();
  await expect(genie).toBeVisible();
  await page.getByTestId("approve-booking").first().click();
  await expect(page.getByText("Booking confirmed").first()).toBeVisible();

  // a confirmed pickup booking: mark prepared, then start the handoff
  await page.goto("/provider/bookings/FR-6HHT-31");
  await page.getByTestId("mark-prepared").click();
  await expect(page.getByText(/Marked prepared/).first()).toBeVisible();
  await page.getByTestId("start-handoff").click();
  await page.waitForURL(/\/handoff$/);

  // 1 · renter ID
  await page.getByRole("button", { name: /Check photo ID/ }).click();
  await page.getByTestId("handoff-next").click();
  // 2 · serial (simulated scan)
  await page.getByRole("button", { name: "Scan" }).click();
  await expect(page.getByText(/Matches assigned unit/)).toBeVisible();
  await page.getByTestId("handoff-next").click();
  // 3 · one condition photo
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: /^Front/ }).click()]);
  await chooser.setFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Front ✓")).toBeVisible();
  await page.getByTestId("handoff-next").click();
  // 4 · checklist
  const boxes = page.getByRole("checkbox");
  for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check();
  await page.getByTestId("handoff-next").click();
  // 5 · signature → complete (hold placed)
  const canvas = page.getByLabel("Sign here");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 8 });
  await page.mouse.move(box.x + 220, box.y + 50, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId("save-signature").click();
  await expect(page.getByTestId("complete-handoff")).toBeEnabled();
  await page.getByTestId("complete-handoff").click();
  await expect(page.getByText("Handoff complete").first()).toBeVisible();
  await page.waitForURL(/\/provider\/bookings\?ref=FR-6HHT-31/);

  // return check-in without a claim → completed, hold released
  await page.goto("/provider/bookings/FR-6HHT-31/return");
  await expect(page.getByText("Compare")).toBeVisible();
  await page.getByTestId("complete-no-claim").click();
  await expect(page.getByText(/Return complete/).first()).toBeVisible();
  await page.waitForURL(/tab=completed/);
  await expect(page.getByRole("row", { name: /FR-6HHT-31/ }).first()).toContainText(/Completed/);
});
