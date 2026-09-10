import { afterEach, describe, expect, it, vi } from "vitest";
import { BOOKING_EVENTS } from "@/lib/booking-state/machine";
import { NOTIFICATION_TEMPLATES, TRANSITION_NOTIFICATIONS, dedupeKey, isOptedOut, notificationCatalogue, optionalTemplatesFor, parsePrefs, planTransition } from "@/lib/notifications/catalogue";
import { renderBooking, renderListingReviewed, renderOtp, renderPayoutReminder, renderPayoutSent, toHtml, type BookingContext } from "@/lib/notifications/templates";
import { ConsoleNotificationProvider } from "@/lib/notifications/console";
import { ResendNotificationProvider } from "@/lib/notifications/resend";
import { assertHermeticNotifications, e2eNotificationsInspectable, missingResendSecrets, notificationProviderName } from "@/lib/notifications/hermetic";
import { getNotificationProvider, resetNotificationProviderForTests } from "@/lib/notifications";

const TZ = "America/Puerto_Rico";

const booking: BookingContext = {
  ref: "FR-7KQ2-M9",
  title: "DeWalt DWE7491 table saw",
  provider_name: "Northlands Tool & Hire",
  renter_name: "Priya Nair",
  start_at: new Date("2026-09-11T13:00:00Z"), // Fri 11 Sep 09:00 market time
  end_at: new Date("2026-09-13T21:00:00Z"), // Sun 13 Sep 17:00
  tz: TZ,
  fulfillment: "delivery",
  pickup_address: "42 Foundry Rd, Northlands",
  delivery_address: "18 Lantern St, Vesper Hill",
  drop_window: { start: "08:00", end: "10:00" },
  collect_window: { start: "16:00", end: "18:00" },
  charged_cents: 27133,
  hold_cents: 10000,
  payment_method_label: "Visa •••• 4421",
  free_cancel_until: new Date("2026-09-10T13:00:00Z"),
  response_minutes: 10,
  late_fee_cents_per_hour: 1500,
  late_grace_minutes: 60,
  auto_release_business_days: 3,
  renter_response_hours: 48,
  admin_decision_sla_hours: 48,
  appeal_days: 7,
  late_fee_cents: 0,
  claim_cents: 0,
  payload: {},
  app_url: "https://fab.rent",
};

afterEach(() => {
  resetNotificationProviderForTests();
  vi.restoreAllMocks();
});

describe("catalogue", () => {
  it("covers every booking transition with a plan (silent transitions are explicit nulls)", () => {
    for (const ev of BOOKING_EVENTS) expect(TRANSITION_NOTIFICATIONS, ev).toHaveProperty(ev);
    expect(planTransition("return_checkin_start")).toEqual([]);
    expect(planTransition("instant_confirm")).toEqual([
      { template: "booking_confirmed", party: "renter" },
      { template: "booking_confirmed", party: "provider" },
    ]);
    expect(planTransition("provider_approve")).toEqual([{ template: "booking_confirmed", party: "renter" }]);
    expect(planTransition("admin_decision").map((p) => p.party)).toEqual(["renter", "provider"]);
  });

  it("never lets money or dispute messages be switched off", () => {
    for (const key of NOTIFICATION_TEMPLATES) {
      const meta = notificationCatalogue[key];
      if (meta.category === "money" || meta.category === "dispute" || meta.category === "sign_in") expect(meta.optional, key).toBe(false);
    }
    expect(optionalTemplatesFor("renter")).toEqual(["ready_for_pickup", "out_for_delivery", "handoff_reminder", "return_due"]);
    expect(optionalTemplatesFor("provider")).toEqual(["handoff_reminder", "return_due"]);
  });

  it("honours opt-outs for reminders only", () => {
    const prefs = parsePrefs({ return_due: false, handoff_reminder: false, payout_sent: false, dispute_decided: false, junk: false, overdue: "no" });
    expect(prefs).toEqual({ return_due: false, handoff_reminder: false, payout_sent: false, dispute_decided: false });
    expect(isOptedOut(prefs, "return_due")).toBe(true);
    expect(isOptedOut(prefs, "handoff_reminder")).toBe(true);
    // money + dispute still go even when the map says false
    expect(isOptedOut(prefs, "payout_sent")).toBe(false);
    expect(isOptedOut(prefs, "dispute_decided")).toBe(false);
    expect(isOptedOut(prefs, "claim_raised")).toBe(false);
    expect(isOptedOut(prefs, "overdue")).toBe(false);
    expect(isOptedOut(undefined, "return_due")).toBe(false);
    expect(parsePrefs(null)).toEqual({});
    expect(parsePrefs([1])).toEqual({});
  });

  it("derives one stable key per message, subject and party", () => {
    expect(dedupeKey("return_due", "b1", "renter")).toBe("return_due:b1:renter");
    expect(dedupeKey("return_due", "b1", "renter")).toBe(dedupeKey("return_due", "b1", "renter"));
    expect(dedupeKey("return_due", "b1", "provider")).not.toBe(dedupeKey("return_due", "b1", "renter"));
  });
});

describe("templates", () => {
  const bookingTemplates = NOTIFICATION_TEMPLATES.filter((k) => !["otp_code", "payout_sent", "payout_reminder", "listing_reviewed"].includes(k)) as Array<Parameters<typeof renderBooking>[0]>;

  it("renders every booking template for both parties without throwing", () => {
    const payload = { refunded_cents: 12000, kept_rental_cents: 8700, credit_cents: 2000, keep_pct: 50, captured_cents: 14400, released_cents: 10600, decision: "uphold_partial", extra_days: 1, new_end_at: "2026-09-14T21:00:00Z", amount_cents: 5321, event: "claim_accepted" };
    for (const t of bookingTemplates) {
      for (const party of ["renter", "provider"] as const) {
        const r = renderBooking(t, party, { ...booking, payload });
        expect(r.subject.length, `${t}/${party} subject`).toBeGreaterThan(5);
        expect(r.text.length, `${t}/${party} text`).toBeGreaterThan(20);
        expect(r.text).toContain("https://fab.rent");
      }
    }
  });

  it("puts the money and the dates in the confirmation, to the cent, in market time", () => {
    const r = renderBooking("booking_confirmed", "renter", booking);
    expect(r.subject).toBe("You're booked · FR-7KQ2-M9 · DeWalt DWE7491 table saw");
    expect(r.text).toContain("Fri 11 Sep 09:00 → Sun 13 Sep 17:00");
    expect(r.text).toContain("Charged: $271.33 to Visa •••• 4421.");
    expect(r.text).toContain("$100 deposit hold");
    expect(r.text).toContain("released 3 business days after return check-in");
    expect(r.text).toContain("Delivery Fri 11 Sep · 08:00–10:00 · 18 Lantern St, Vesper Hill");
    expect(r.text).toContain("https://fab.rent/api/bookings/FR-7KQ2-M9/receipt.pdf");
  });

  it("tells the renter what was refunded and the provider what was kept", () => {
    const payload = { refunded_cents: 16845, kept_rental_cents: 8700, credit_cents: 0, keep_pct: 50, cancelled_by: "renter", policy_name: "Flexible" };
    expect(renderBooking("booking_cancelled", "renter", { ...booking, payload }).text).toContain("Refund: $168.45 to Visa •••• 4421. $87.00 of the rental charge is kept under the Flexible policy.");
    expect(renderBooking("booking_cancelled", "provider", { ...booking, payload }).text).toContain("You keep $87.00 of the rental charge (50% under the policy)");
    const byProvider = renderBooking("booking_cancelled", "renter", { ...booking, payload: { refunded_cents: 27133, kept_rental_cents: 0, credit_cents: 2000, keep_pct: 0, cancelled_by: "provider" } });
    expect(byProvider.text).toContain("Northlands Tool & Hire cancelled");
    expect(byProvider.text).toContain("Credit: $20.00");
  });

  it("uses the decision vector for disputes (uphold partially → charge $144.00, release $106.00)", () => {
    const payload = { captured_cents: 14400, released_cents: 10600, decision: "uphold_partial", reasoning: "20% wear allowance on a 3-year-old tool." };
    const r = renderBooking("dispute_decided", "provider", { ...booking, hold_cents: 25000, payload });
    expect(r.subject).toBe("Decision on FR-7KQ2-M9: claim upheld partially");
    expect(r.text).toContain("$144.00 charged from the hold · $106.00 released to the renter.");
    expect(r.text).toContain("no commission");
    expect(r.text).toContain("Reasoning: 20% wear allowance");
    expect(r.text).toContain("appeal once within 7 days");
  });

  it("distinguishes accepted and disputed claims per party", () => {
    const acc = { event: "claim_accepted", captured_cents: 8000, released_cents: 4000 };
    expect(renderBooking("claim_answered", "renter", { ...booking, hold_cents: 12000, payload: acc }).subject).toContain("$80.00 charged from your hold");
    expect(renderBooking("claim_answered", "provider", { ...booking, hold_cents: 12000, payload: acc }).subject).toContain("Claim accepted · $80.00 captured");
    const dis = { event: "claim_disputed" };
    expect(renderBooking("claim_answered", "renter", { ...booking, payload: dis }).subject).toContain("Dispute opened");
    expect(renderBooking("claim_answered", "provider", { ...booking, payload: dis }).subject).toContain("Claim disputed");
  });

  it("states the late fee rule and the claim window", () => {
    const r = renderBooking("claim_raised", "renter", { ...booking, hold_cents: 25000, claim_cents: 19500, late_fee_cents: 1500 });
    expect(r.subject).toBe("Claim on FR-7KQ2-M9 · $195.00 against your $250 hold");
    expect(r.text).toContain("late fee of $15.00 was charged");
    expect(r.text).toContain("48 hours to accept or dispute");
    expect(renderBooking("overdue", "renter", booking).text).toContain("$15.00 per whole hour applies after the 1 h grace period");
  });

  it("renders the sign-in code, payouts and listing review", () => {
    const otp = renderOtp("482913", 10);
    expect(otp.subject).toBe("482913 is your fab.rent sign-in code");
    expect(otp.text).toContain("482913");
    const payout = { provider_name: "Northlands Tool & Hire", amount_cents: 862000, account_masked: "Maren Bank •••• 8812", rental_count: 27, scheduled_for: new Date("2026-09-08T13:00:00Z"), tz: TZ, exception: null, exception_detail: null, app_url: "https://fab.rent" };
    expect(renderPayoutSent(payout).subject).toBe("Payout sent · $8,620.00 to Maren Bank •••• 8812");
    expect(renderPayoutSent(payout).text).toContain("27 rentals");
    expect(renderPayoutReminder({ ...payout, amount_cents: 41230, exception: "Tax ID missing", exception_detail: "payout paused since 1 Sep" }).text).toContain("Tax ID missing · payout paused since 1 Sep");
    const review = renderListingReviewed({ title: "Stihl MS 251 chainsaw", listing_id: "l1", decision: "request_changes", message: "Attach the chain-brake cert.", checklist: ["Add a photo of the chain brake"], reject_reason: null, app_url: "https://fab.rent" });
    expect(review.subject).toBe("Changes requested on Stihl MS 251 chainsaw");
    expect(review.text).toContain("• Add a photo of the chain brake");
    expect(renderListingReviewed({ title: "X", listing_id: "l1", decision: "reject", message: null, checklist: [], reject_reason: "Policy breach", app_url: "https://fab.rent" }).text).toContain("Reason: Policy breach");
  });

  it("escapes HTML and links URLs", () => {
    const html = toHtml("A <b> test", "Line <one>\nhttps://fab.rent/rentals/FR-1");
    expect(html).toContain("A &lt;b&gt; test");
    expect(html).toContain("Line &lt;one&gt;");
    expect(html).toContain('<a href="https://fab.rent/rentals/FR-1"');
  });
});

describe("console adapter — demo mode sends nothing over the network", () => {
  it("records the send, logs it, and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.reject(new Error("network must not be used")));
    const lines: string[] = [];
    const p = new ConsoleNotificationProvider({ log: (l) => lines.push(l), logBody: true });
    const r = await p.send({ to: { email: "priya.nair@example.com", name: "Priya" }, subject: "Hello", text: "Your code is 123456", idempotency_key: "otp_code:x:user", metadata: { template: "otp_code" } });
    expect(r.ok).toBe(true);
    expect(r.ref).toMatch(/^console_[0-9a-f]{16}$/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lines[0]).toContain("priya.nair@example.com · Hello");
    expect(lines[0]).toContain("Your code is 123456");
    expect(p.recordedSends()).toEqual([expect.objectContaining({ ok: true, to: "priya.nair@example.com", subject: "Hello", template: "otp_code", ref: r.ref })]);
    p.clearRecordedSends();
    expect(p.recordedSends()).toEqual([]);
  });

  it("is the default provider and is deterministic per idempotency key", async () => {
    const prev = process.env.NOTIFICATIONS_PROVIDER;
    delete process.env.NOTIFICATIONS_PROVIDER;
    try {
      const p = await getNotificationProvider();
      expect(p.name).toBe("console");
      const a = await p.send({ to: { email: "a@example.com" }, subject: "s", text: "t", idempotency_key: "k" });
      const b = await p.send({ to: { email: "a@example.com" }, subject: "s", text: "t", idempotency_key: "k" });
      expect(a.ref).toBe(b.ref);
    } finally {
      if (prev === undefined) delete process.env.NOTIFICATIONS_PROVIDER;
      else process.env.NOTIFICATIONS_PROVIDER = prev;
    }
  });
});

describe("hermetic notifications — fail closed", () => {
  it("allows the console adapter with no secrets", () => {
    expect(() => assertHermeticNotifications({})).not.toThrow();
    expect(() => assertHermeticNotifications({ NOTIFICATIONS_PROVIDER: "console" })).not.toThrow();
    expect(notificationProviderName({})).toBe("console");
    expect(e2eNotificationsInspectable({})).toBe(true);
    expect(e2eNotificationsInspectable({ NOTIFICATIONS_PROVIDER: "resend" })).toBe(false);
  });

  it("names the missing Resend secrets", () => {
    const env = { NOTIFICATIONS_PROVIDER: "resend" };
    expect(missingResendSecrets(env)).toEqual(["RESEND_API_KEY", "NOTIFICATIONS_FROM"]);
    expect(() => assertHermeticNotifications(env)).toThrow(/fail-closed without live secrets: missing RESEND_API_KEY, NOTIFICATIONS_FROM/);
    expect(() => new ResendNotificationProvider({ env })).toThrow(/missing RESEND_API_KEY, NOTIFICATIONS_FROM/);
  });

  it("refuses Resend in CI even with secrets unless HERMETIC=0", () => {
    const env = { NOTIFICATIONS_PROVIDER: "resend", RESEND_API_KEY: "re_x", NOTIFICATIONS_FROM: "fab.rent <x@fab.rent>", CI: "true" };
    expect(() => assertHermeticNotifications(env)).toThrow(/CI is hermetic/);
    expect(() => assertHermeticNotifications({ ...env, HERMETIC: "0" })).not.toThrow();
  });

  it("getNotificationProvider throws before constructing Resend when a secret is missing", async () => {
    const prev = { p: process.env.NOTIFICATIONS_PROVIDER, k: process.env.RESEND_API_KEY, f: process.env.NOTIFICATIONS_FROM };
    process.env.NOTIFICATIONS_PROVIDER = "resend";
    delete process.env.RESEND_API_KEY;
    process.env.NOTIFICATIONS_FROM = "fab.rent <x@fab.rent>";
    resetNotificationProviderForTests();
    try {
      await expect(getNotificationProvider()).rejects.toThrow(/fail-closed without live secrets: missing RESEND_API_KEY/);
    } finally {
      if (prev.p === undefined) delete process.env.NOTIFICATIONS_PROVIDER;
      else process.env.NOTIFICATIONS_PROVIDER = prev.p;
      if (prev.k === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = prev.k;
      if (prev.f === undefined) delete process.env.NOTIFICATIONS_FROM;
      else process.env.NOTIFICATIONS_FROM = prev.f;
    }
  });
});

describe("resend adapter (fetch mocked — no network)", () => {
  const env = { RESEND_API_KEY: "re_test", NOTIFICATIONS_FROM: "fab.rent <bookings@fab.rent>", NOTIFICATIONS_REPLY_TO: "support@fab.rent" };

  it("posts one email with the idempotency key and returns the provider id", async () => {
    const calls: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> = [];
    const p = new ResendNotificationProvider({
      env,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "em_123" }) };
      },
    });
    const r = await p.send({ to: { email: "priya.nair@example.com", name: "Priya Nair" }, subject: "You're booked", text: "hi", html: "<p>hi</p>", idempotency_key: "booking_confirmed:b1:renter", metadata: { template: "booking_confirmed" } });
    expect(r).toMatchObject({ ok: true, ref: "em_123" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.init.headers.Authorization).toBe("Bearer re_test");
    expect(calls[0]!.init.headers["Idempotency-Key"]).toBe("booking_confirmed:b1:renter");
    const body = JSON.parse(calls[0]!.init.body) as Record<string, unknown>;
    expect(body).toMatchObject({ from: env.NOTIFICATIONS_FROM, to: ["Priya Nair <priya.nair@example.com>"], subject: "You're booked", text: "hi", html: "<p>hi</p>", reply_to: "support@fab.rent" });
  });

  it("surfaces provider errors as NotificationError so the delivery is recorded as failed", async () => {
    const p = new ResendNotificationProvider({ env, fetch: async () => ({ ok: false, status: 422, text: async () => JSON.stringify({ message: "Invalid `from` field" }) }) });
    await expect(p.send({ to: { email: "x@example.com" }, subject: "s", text: "t", idempotency_key: "k" })).rejects.toMatchObject({ name: "NotificationError", code: "provider_error", message: "Resend 422: Invalid `from` field" });
  });
});
