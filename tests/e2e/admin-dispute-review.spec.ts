import { expect, test, type Page } from "@playwright/test";

/** Admin path (Phase 3): resolve the seeded dispute D-0912 partially, then approve the oldest listing in the review queue. */
async function signInAsInes(page: Page) {
  await page.goto("/auth?next=%2Fadmin");
  await page.getByRole("button", { name: /Demo · sign in as a seeded account/ }).click();
  await page.getByTestId("demo-account-ines@fab.rent").click();
  await page.waitForURL(/\/admin/);
}

test("resolve a dispute partially and approve a listing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "the ops console is desktop-only");
  await signInAsInes(page);
  await expect(page.getByRole("heading", { name: "Disputes awaiting decision" })).toBeVisible();

  // D-0912: wear allowance default → uphold partially $144 of $180, release $106 of the $250 hold
  await page.goto("/admin/disputes/D-0912");
  // role query ignores the hidden copy React keeps for ~50 ms while streaming the segment behind loading.tsx
  await expect(page.getByRole("button", { name: /Uphold partially/ }).last()).toBeVisible();
  await expect(page.getByTestId("partial-amount").last()).toHaveValue("144");
  await expect(page.getByTestId("resolve-dispute").last()).toContainText("charge $144.00, release $106.00");
  await page.getByTestId("resolve-dispute").last().click();
  await expect(page.getByText("D-0912 resolved").first()).toBeVisible();
  await expect(page.getByText("Uphold partial", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("$144.00 charged from the hold")).toBeVisible();

  // listing review: approve the oldest item
  await page.goto("/admin/listing-review");
  await page.waitForURL(/\/admin\/listing-review\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: "Automated checks" }).or(page.getByText("Automated checks")).first()).toBeVisible();
  await page.getByRole("button", { name: "Approve & publish", exact: true }).first().click();
  await page.getByTestId("review-submit").last().click();
  await expect(page.getByText("Approved & published").first()).toBeVisible();
});
