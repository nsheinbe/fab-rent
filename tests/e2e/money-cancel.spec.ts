import { expect, test } from "@playwright/test";
import { fromZonedTime } from "date-fns-tz";
import { CONFIG_V41 } from "@/lib/settings/defaults";
import { providerCommission, renterCancellation } from "@/lib/pricing";
import { inspect, resetPaymentCalls, signInDemo } from "./helpers";

/**
 * Cancel inside the Flexible fee window (after the 24 h free period).
 * FR-2QRX-77 starts today at 09:30; DEMO_NOW is 10:00 the same Saturday — 50 % of rental is kept.
 * Asserts the refund (fee + tax on the refunded portion), the mock refund call, and a balancing ledger row.
 */
const REF = "FR-2QRX-77";
const MARCUS = "marcus.l@example.com";

test("cancel inside the fee window refunds fee and tax on the refunded portion", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "money-path assertions are viewport-independent");
  await resetPaymentCalls(request);
  await signInDemo(page, MARCUS, `/rentals/${REF}`);
  await page.waitForURL(new RegExp(`/rentals/${REF}`));

  await expect(page.getByTestId("cancel-booking")).toBeVisible();
  await page.getByTestId("cancel-booking").click();
  await expect(page.getByText(/50% of the rental charge is kept/)).toBeVisible();
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByText("Booking cancelled").first()).toBeVisible();

  const data = await inspect(request, { ref: REF });
  expect(data.booking, "booking row must still exist after cancel").toBeTruthy();
  const b = data.booking!;
  expect(b.status).toBe("cancelled");
  expect(b.hold_status).toBe("none");

  const policy = CONFIG_V41.cancellation.policies.find((p) => p.id === b.cancellation_policy_snapshot.id) ?? CONFIG_V41.cancellation.policies[0]!;
  const snap = b.price_snapshot;
  const expected = renterCancellation(
    {
      policy,
      start: new Date(b.start_at),
      cancelledAt: fromZonedTime("2026-09-05T10:00:00", "America/Puerto_Rico"),
      rental_cents: snap.rental_cents,
      delivery_cents: snap.delivery_cents,
      extras_cents: snap.extras_cents,
      service_fee_cents: snap.service_fee_cents,
      tax_cents: snap.tax_cents,
      charged_cents: snap.charged_cents,
    },
    CONFIG_V41,
  );
  expect(expected.free, "this booking must be inside the fee window, not the free window").toBe(false);
  expect(expected.keep_pct).toBe(50);
  expect(b.cancellation_snapshot?.refunded_cents).toBe(expected.refunded_cents);
  expect(b.cancellation_snapshot?.kept_rental_cents).toBe(expected.kept_rental_cents);
  // extras + delivery always return; fee and tax on the refunded (not kept) portion return too
  expect(expected.refunded_cents).toBeGreaterThan(snap.delivery_cents + snap.extras_cents);

  const refund = (data.calls ?? []).find((c) => c.op === "refund" && c.ok);
  expect(refund, "mock must record a refund call").toBeTruthy();
  expect(refund!.amount_cents).toBe(expected.refunded_cents);
  expect(refund!.charge_ref).toBe(b.payment_refs.charge);

  const rental = (data.ledger ?? []).find((r) => r.type === "rental");
  expect(rental, "cancellation must leave a rental ledger entry").toBeTruthy();
  expect(rental!.balances, "ledger row must satisfy net = gross + commission + adjustment").toBe(true);
  expect(rental!.gross_cents).toBe(expected.kept_rental_cents);
  expect(rental!.commission_cents).toBe(-providerCommission(expected.kept_rental_cents, 0, CONFIG_V41));
  expect(rental!.adjustment_cents).toBe(0);
  expect(rental!.net_cents).toBe(rental!.gross_cents + rental!.commission_cents);
  expect(rental!.status).toBe("available");
});
