import { expect, type APIRequestContext, type Page } from "@playwright/test";

export async function signInDemo(page: Page, email: string, next = "/") {
  await page.goto(`/auth?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: /Demo · sign in as a seeded account/ }).click();
  await page.getByTestId(`demo-account-${email}`).click();
}

/** The one-time code is emailed (console adapter in e2e) and never rendered in the page: read it back through the inspect API. */
export async function signInWithOtp(page: Page, email: string, name: string) {
  await page.getByRole("button", { name: "Continue with email or phone" }).click();
  await page.getByLabel("Email or phone").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByTestId("otp-sent")).toContainText(email);
  const code = await otpCode(page.request, email);
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel("Code").fill(code!);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function otpCode(request: APIRequestContext, email: string): Promise<string | null> {
  const res = await request.get(`/api/e2e/inspect?otp=${encodeURIComponent(email)}`);
  expect(res.status(), "inspect API must be enabled (E2E_INSPECT=1, mock payments, console notifications)").toBe(200);
  return ((await res.json()) as { code: string | null }).code;
}

export type Delivery = { id: string; template: string; party: string | null; status: string; reason: string | null; provider: string; recipient_email: string | null; subject: string | null; attempts: number; booking_id: string | null };

export async function deliveries(request: APIRequestContext, query: { ref?: string; email?: string }): Promise<Delivery[]> {
  const qs = new URLSearchParams();
  if (query.ref) qs.set("ref", query.ref);
  if (query.email) qs.set("email", query.email);
  const res = await request.get(`/api/e2e/inspect?${qs}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { deliveries?: Delivery[] }).deliveries ?? [];
}

/** Applies a booking transition as staff/system through the real transitionBooking (test-only route). */
export async function transition(request: APIRequestContext, ref: string, event: string, opts: { captureCents?: number; at?: string } = {}) {
  const res = await request.post("/api/e2e/inspect", { data: { action: "transition", ref, event, ...opts } });
  const body = (await res.json()) as { from?: string; to?: string; deliveries?: Delivery[]; error?: string };
  expect(res.status(), `transition ${event} on ${ref}: ${body.error ?? ""}`).toBe(200);
  return body as { from: string; to: string; deliveries: Delivery[] };
}

export async function replayNotifications(request: APIRequestContext, ref: string, event: string) {
  const res = await request.post("/api/e2e/inspect", { data: { action: "replay_notifications", ref, event } });
  expect(res.status()).toBe(200);
  return (await res.json()) as { results: Array<{ status: string }>; deliveries: Delivery[] };
}

export async function runJob(request: APIRequestContext, job: string, at?: string) {
  const res = await request.post("/api/e2e/inspect", { data: { action: "run_job", job, at } });
  expect(res.status()).toBe(200);
  return (await res.json()) as Record<string, number | string>;
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
