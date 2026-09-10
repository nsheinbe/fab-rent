import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ? Number(process.env.PORT) : 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The sandbox ships a pinned Chromium; set CHROMIUM_PATH to reuse it instead of downloading.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  webServer: {
    command: `pnpm exec next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      DEMO_NOW: process.env.DEMO_NOW ?? "2026-09-05T10:00:00",
      PORT: String(port),
      NEXT_PUBLIC_DISABLE_MAPLIBRE: process.env.NEXT_PUBLIC_DISABLE_MAPLIBRE ?? "1",
      // Hermetic: Playwright always drives the mock and exposes the inspect API. Never inherit live Stripe.
      PAYMENTS_PROVIDER: "mock",
      NOTIFICATIONS_PROVIDER: "console",
      APP_URL: baseURL,
      E2E_INSPECT: "1",
    },
  },
  projects: [
    { name: "mobile-390", use: { ...devices["iPhone 14"], defaultBrowserType: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
});
