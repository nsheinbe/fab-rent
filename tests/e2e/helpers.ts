import { expect, type APIRequestContext, type Page } from "@playwright/test";

export async function signInDemo(page: Page, email: string, next = "/") {
  await page.goto(`/auth?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: /Demo · sign in as a seeded account/ }).click();
  await page.getByTestId(`demo-account-${email}`).click();
}

export async function signInWithOtp(page: Page, email: string, name: string) {
  await page.getByRole("button", { name: "Continue with email or phone" }).click();
  await page.getByLabel("Email or phone").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  const code = (await page.getByTestId("demo-otp").textContent())?.trim();
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel("Code").fill(code!);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
}

export type InspectPayload = {
  booking?: {
    id: string;
    ref: string;
    status: string;
    charged_cents: number;
    hold_cents: number;
    hold_status: string;
    hold_captured_cents: number;
    payment_refs: Record<string, string | null>;
    price_snapshot: {
      rental_cents: number;
      delivery_cents: number;
      extras_cents: number;
      service_fee_cents: number;
      tax_cents: number;
      charged_cents: number;
    };
    cancellation_snapshot: {
      refunded_cents: number;
      kept_rental_cents: number;
      keep_pct: number;
      free: boolean;
    } | null;
    cancellation_policy_snapshot: { id: string; name: string; free_until_hours: number; tiers: Array<{ within_hours: number | null; keep_pct: number }> };
    start_at: string;
  } | null;
  ledger?: Array<{
    type: string;
    status: string;
    gross_cents: number;
    commission_cents: number;
    adjustment_cents: number;
    net_cents: number;
    adjustment_label: string | null;
    balances: boolean;
  }>;
  claims?: Array<{ id: string; type: string; status: string; amount_cents: number; settled_cents: number | null }>;
  bookings?: Array<{ ref: string; status: string; hold_status: string }>;
  draft?: { id: string } | null;
  calls?: Array<{
    op: string;
    ok: boolean;
    amount_cents?: number;
    captured_cents?: number;
    released_cents?: number;
    charge_ref?: string;
    authorization_ref?: string;
    code?: string;
    method_label?: string;
  }>;
};

export async function inspect(request: APIRequestContext, query: { ref?: string; draftId?: string; email?: string }): Promise<InspectPayload> {
  const qs = new URLSearchParams();
  if (query.ref) qs.set("ref", query.ref);
  if (query.draftId) qs.set("draftId", query.draftId);
  if (query.email) qs.set("email", query.email);
  const res = await request.get(`/api/e2e/inspect?${qs}`);
  expect(res.status(), "inspect API must be enabled (E2E_INSPECT=1, mock payments)").toBe(200);
  return (await res.json()) as InspectPayload;
}

export async function resetPaymentCalls(request: APIRequestContext) {
  const res = await request.post("/api/e2e/inspect", { data: { action: "reset_calls" } });
  expect(res.status()).toBe(200);
}

export async function seedOpenClaim(request: APIRequestContext, ref: string, amount_cents: number) {
  const res = await request.post("/api/e2e/inspect", { data: { action: "seed_open_claim", ref, amount_cents, type: "damage" } });
  expect(res.status()).toBe(200);
  return (await res.json()) as { ok: true; claim_id: string };
}

export function ledgerIdentity(row: { gross_cents: number; commission_cents: number; adjustment_cents: number; net_cents: number }) {
  return row.net_cents === row.gross_cents + row.commission_cents + row.adjustment_cents;
}
