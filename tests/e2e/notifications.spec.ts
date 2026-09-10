import { expect, test } from "@playwright/test";
import { deliveries, otpCode, replayNotifications, runJob, signInDemo, transition, type Delivery } from "./helpers";

/**
 * Phase 6 acceptance (BUILD-PLAN): sign-in codes go out exactly once and never render in the page;
 * each booking transition tells each affected party exactly once and a replay tells nobody; a provider
 * who opted out of reminders still gets money and dispute messages; demo mode sends nothing over the
 * network (every delivery is the console adapter's). Transitions run through the real
 * transitionBooking via the test-only inspect route; the UI paths are covered by the other specs.
 */
test.describe.configure({ mode: "serial" });

const PRIYA = "priya.nair@example.com";
const MILLBROOK_OWNER = "hello@millbrookevents.example.com";
const DANA = "dana@northlandstoolhire.example.com";
const RIDGEWAY = "site@ridgewaybuilders.example.com";
const INES = "ines@fab.rent";

const by = (rows: Delivery[], template: string, party?: string) => rows.filter((d) => d.template === template && (!party || d.party === party));
/** rows written in one transaction share a created_at, so compare them as a set ordered by (template, party) */
const key = (d: Delivery | [string, string, string]) => (Array.isArray(d) ? `${d[0]}:${d[1]}` : `${d.template}:${d.party}`);
const sorted = <T extends Delivery | [string, string, string]>(rows: T[]) => [...rows].sort((a, b) => key(a).localeCompare(key(b)));
const consoleOnly = (rows: Delivery[]) => {
  for (const d of rows) expect(d.provider, `${d.template}/${d.party} must be the console adapter`).toBe("console");
};

test("sign-in by email sends exactly one code and no code appears in the page", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "viewport-independent");
  const email = `e2e-otp-${Date.now().toString(36)}@example.com`;
  await page.goto("/auth?next=%2Frentals");
  await page.getByRole("button", { name: "Continue with email or phone" }).click();
  await page.getByLabel("Email or phone").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByTestId("otp-sent")).toContainText(email);

  const code = await otpCode(request, email);
  expect(code).toMatch(/^\d{6}$/);
  await expect(page.getByTestId("demo-otp")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(code!);

  const sent = await deliveries(request, { email });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ template: "otp_code", party: "user", status: "sent", provider: "console", recipient_email: email, attempts: 1 });

  await page.getByLabel("Code").fill(code!);
  await page.getByLabel("Your name").fill("Otp Tester");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/rentals/);
  expect(await deliveries(request, { email })).toHaveLength(1);
});

test("each transition notifies each affected party once; replaying sends nothing", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "viewport-independent");
  const REF = "FR-8MZE-Q4"; // Priya · Chiavari chairs · Millbrook Event Co. · requested
  const before = await deliveries(request, { ref: REF });
  expect(before).toEqual([]);

  const steps: Array<{ event: string; expect: Array<[string, string, string]> }> = [
    { event: "provider_approve", expect: [["booking_confirmed", "renter", PRIYA]] },
    { event: "mark_prepared", expect: [["ready_for_pickup", "renter", PRIYA]] },
    { event: "handoff_complete", expect: [["handoff_complete", "renter", PRIYA]] },
    { event: "return_window_open", expect: [["return_due", "renter", PRIYA], ["return_due", "provider", MILLBROOK_OWNER]] },
    { event: "grace_elapsed", expect: [["overdue", "renter", PRIYA], ["overdue", "provider", MILLBROOK_OWNER]] },
    { event: "return_checkin_start", expect: [] },
    { event: "return_no_claim", expect: [["return_complete", "renter", PRIYA]] },
  ];
  let seen = 0;
  const seenIds = new Set<string>();
  for (const step of steps) {
    const r = await transition(request, REF, step.event);
    const fresh = r.deliveries.filter((d) => !seenIds.has(d.id));
    expect(sorted(fresh).map((d) => [d.template, d.party, d.recipient_email]), step.event).toEqual(sorted(step.expect));
    for (const d of fresh) expect(d, `${step.event} → ${d.template}/${d.party}`).toMatchObject({ status: "sent", provider: "console", attempts: 1 });
    for (const d of r.deliveries) seenIds.add(d.id);
    seen = r.deliveries.length;
  }
  expect(seen).toBe(8);

  // replay the notification hook for a transition that already happened: nothing new, nothing re-sent
  const replay = await replayNotifications(request, REF, "return_window_open");
  expect(replay.results.map((x) => x.status)).toEqual(["deduped", "deduped"]);
  expect(replay.deliveries).toHaveLength(8);
  expect(replay.deliveries.filter((d) => d.attempts !== 1)).toEqual([]);
  // and the state machine refuses the same transition twice, so nothing is enqueued either
  const again = await request.post("/api/e2e/inspect", { data: { action: "transition", ref: REF, event: "return_no_claim" } });
  expect(again.status()).toBe(409);
  expect(await deliveries(request, { ref: REF })).toHaveLength(8);
  consoleOnly(replay.deliveries);
});

test("a renter cancellation tells both parties what was refunded and kept", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "viewport-independent");
  const REF = "FR-DFC3-10"; // Docks Fit-out Crew · DeWalt · Northlands · confirmed
  const r = await transition(request, REF, "renter_cancel");
  expect(r.to).toBe("cancelled");
  expect(sorted(r.deliveries).map((d) => [d.template, d.party, d.recipient_email, d.status])).toEqual([
    ["booking_cancelled", "provider", DANA, "sent"],
    ["booking_cancelled", "renter", "crew@docksfitout.example.com", "sent"],
  ]);
  consoleOnly(r.deliveries);
});

test("a provider who opted out of reminders still receives money and dispute messages", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "the provider console is desktop-first");
  await signInDemo(page, DANA, "/provider/settings");
  await page.waitForURL(/\/provider\/settings/);
  const prefs = page.getByTestId("notification-prefs");
  await expect(prefs).toBeVisible();
  await expect(prefs).toContainText("always sent");
  await prefs.getByRole("switch", { name: "Return due" }).click();
  await expect(page.getByText("Return due emails off").first()).toBeVisible();
  await prefs.getByRole("switch", { name: "Handoff reminder" }).click();
  await expect(page.getByText("Handoff reminder emails off").first()).toBeVisible();
  const stored = (await (await request.get(`/api/e2e/inspect?email=${encodeURIComponent(DANA)}`)).json()) as { profile: { notification_prefs: Record<string, boolean> } };
  expect(stored.profile.notification_prefs).toEqual({ return_due: false, handoff_reminder: false });

  // reminder: renter told, provider skipped and the skip is recorded for ops
  const due = await transition(request, "FR-3W8C-K1", "return_window_open"); // Priya · Honda · Northlands · active
  expect(by(due.deliveries, "return_due", "renter")[0]).toMatchObject({ status: "sent", recipient_email: PRIYA });
  expect(by(due.deliveries, "return_due", "provider")[0]).toMatchObject({ status: "skipped", reason: "opted_out", recipient_email: DANA });

  // money + dispute: a claim disputed and decided on another Northlands booking still reaches Dana
  const REF = "FR-RGB6-27"; // Ridgeway Builders · Hilti · Northlands · confirmed
  await transition(request, REF, "handoff_complete");
  await transition(request, REF, "return_checkin_start");
  const disputed = await transition(request, REF, "claim_disputed");
  expect(by(disputed.deliveries, "claim_answered", "provider")[0]).toMatchObject({ status: "sent", recipient_email: DANA });
  expect(by(disputed.deliveries, "claim_answered", "renter")[0]).toMatchObject({ status: "sent", recipient_email: RIDGEWAY });
  const decided = await transition(request, REF, "admin_decision", { captureCents: 0 });
  expect(decided.to).toBe("completed");
  expect(by(decided.deliveries, "dispute_decided", "provider")[0]).toMatchObject({ status: "sent", recipient_email: DANA });
  expect(by(decided.deliveries, "dispute_decided", "renter")[0]).toMatchObject({ status: "sent", recipient_email: RIDGEWAY });
  consoleOnly(decided.deliveries);

  // payout sent (ops marks the scheduled Northlands payout paid) → money message, sent despite the opt-outs
  await page.context().clearCookies();
  await signInDemo(page, INES, "/admin/payouts");
  await page.waitForURL(/\/admin\/payouts/);
  await page.getByTestId("mark-payout-paid").first().click();
  await expect(page.getByText("Marked paid · provider notified").first()).toBeVisible();
  const danaMail = await deliveries(request, { email: DANA });
  const payout = by(danaMail, "payout_sent");
  expect(payout).toHaveLength(1);
  expect(payout[0]).toMatchObject({ status: "sent", provider: "console", party: "provider" });
  expect(payout[0]!.subject).toMatch(/^Payout sent · \$[\d,]+\.\d{2} to Maren Bank •••• 8812$/);
});

test("handoff reminders go out once per booking per party, whatever the job cadence", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "viewport-independent");
  // Thu 10 Sep 13:00 market time: FR-7KQ2-M9 (Fri 09:00) and FR-MBK5-44 (Fri 12:00) start within 24 h
  const at = "2026-09-10T17:00:00.000Z";
  const first = await runJob(request, "reminders", at);
  expect(first.reminded).toBe(2);
  const priya = await deliveries(request, { ref: "FR-7KQ2-M9" });
  expect(by(priya, "handoff_reminder", "renter")[0]).toMatchObject({ status: "sent", recipient_email: PRIYA });
  expect(by(priya, "handoff_reminder", "provider")[0]).toMatchObject({ status: "skipped", reason: "opted_out", recipient_email: DANA });
  expect(by(priya, "handoff_reminder")).toHaveLength(2);
  const second = await runJob(request, "reminders", at);
  expect(second.reminded).toBe(0);
  expect(by(await deliveries(request, { ref: "FR-7KQ2-M9" }), "handoff_reminder")).toHaveLength(2);
  expect(by(await deliveries(request, { ref: "FR-MBK5-44" }), "handoff_reminder").map((d) => `${d.party}:${d.status}`).sort()).toEqual(["provider:skipped", "renter:sent"]);
});
