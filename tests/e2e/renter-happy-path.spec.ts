import { expect, test, type Page } from "@playwright/test";

/**
 * Renter happy path (brief §9, Phase 1): search → listing → book → sign in → pay → confirmation → rentals.
 * Runs against the seeded demo database on both projects (390 mobile, 1280 desktop).
 */
const LISTING = /DeWalt DWE7491/;

async function signInWithOtp(page: Page, email: string, name: string) {
  await page.getByRole("button", { name: "Continue with email or phone" }).click();
  await page.getByLabel("Email or phone").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  // demo mode shows the one-time code inline (real delivery is out of scope)
  const code = (await page.getByTestId("demo-otp").textContent())?.trim();
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel("Code").fill(code!);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
}

test("search → listing → book → sign in → pay → confirmation → rentals", async ({ page }, testInfo) => {
  const email = `e2e-${testInfo.project.name}-${Date.now().toString(36)}@example.com`;

  // search
  await page.goto("/search?q=table+saw");
  await expect(page.getByRole("link", { name: LISTING }).first()).toBeVisible();
  await page.getByRole("link", { name: LISTING }).first().click();

  // listing → reserve (mobile: sticky bar link; desktop: booking card button)
  await page.waitForURL(/\/listings\//);
  await expect(page.getByRole("heading", { name: LISTING }).first()).toBeVisible();
  await page.getByRole("link", { name: "Reserve" }).or(page.getByRole("button", { name: "Reserve" })).first().click();
  await page.waitForURL(/\/(book\/|auth|checkout\/)/);

  // booking builder (mobile flow) → Continue writes the draft
  if (/\/book\//.test(page.url())) {
    await expect(page.getByText("Billed as")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/(auth|checkout)/);
  }

  // sign in — selections are kept on the draft
  if (/\/auth/.test(page.url())) {
    await expect(page.getByText("Your selections are saved")).toBeVisible();
    await signInWithOtp(page, email, "Evan Tester");
    await page.waitForURL(/\/checkout\//);
  }

  // checkout: add a card (masked data only), pay
  await expect(page.getByRole("button", { name: /^Pay \$/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Add a (new )?card/ }).click();
  await page.getByTestId("card-number").fill("4242 4242 4242 4242");
  await page.getByLabel("Expiry").fill("1228");
  await page.getByLabel("CVC").fill("123");
  await page.getByTestId("save-card").click();
  await expect(page.getByRole("radio", { name: /Visa •••• 4242/ }).first()).toBeChecked();
  await page.getByRole("button", { name: /^Pay \$/ }).first().click();

  // confirmation
  await page.waitForURL(/\/bookings\/FR-[A-Z0-9]{4}-[A-Z0-9]{2}\/confirmed/);
  const ref = page.url().match(/FR-[A-Z0-9]{4}-[A-Z0-9]{2}/)![0];
  await expect(page.getByRole("heading", { name: /Request sent|You're booked/ })).toBeVisible();
  await expect(page.getByText(ref)).toBeVisible();
  await expect(page.getByText("Charged to Visa •••• 4242")).toBeVisible();

  // rentals: the new booking is listed as upcoming, and its detail page opens
  await page.getByTestId("view-booking").click();
  await page.waitForURL(new RegExp(`/rentals/${ref}$`));
  await expect(page.getByText(/Booked & paid|Requested · charged/)).toBeVisible();
  await page.goto("/rentals");
  await expect(page.getByRole("link", { name: LISTING }).first()).toBeVisible();

  // receipt and calendar endpoints are reachable for the renter
  const receipt = await page.request.get(`/api/bookings/${ref}/receipt.pdf`);
  expect(receipt.status()).toBe(200);
  expect(receipt.headers()["content-type"]).toContain("application/pdf");
  const ics = await page.request.get(`/api/bookings/${ref}/calendar.ics`);
  expect(ics.status()).toBe(200);
  expect(await ics.text()).toContain("BEGIN:VEVENT");
});
