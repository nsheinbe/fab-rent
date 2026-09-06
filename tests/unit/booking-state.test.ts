import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUSES,
  TRANSITIONS,
  TransitionError,
  availableEvents,
  bookingStatus,
  canTransition,
  nextStatus,
} from "@/lib/booking-state";

describe("booking status map", () => {
  it("has exactly the 11 pills in order with tones from the design", () => {
    expect(BOOKING_STATUSES).toEqual([
      "requested", "confirmed", "ready_for_pickup", "out_for_delivery", "active", "return_due", "overdue", "inspecting", "completed", "cancelled", "disputed",
    ]);
    expect(bookingStatus.requested.tone).toBe("warn");
    expect(bookingStatus.confirmed.tone).toBe("cobalt");
    expect(bookingStatus.ready_for_pickup.tone).toBe("cobalt");
    expect(bookingStatus.out_for_delivery.tone).toBe("cobalt");
    expect(bookingStatus.active.tone).toBe("ok");
    expect(bookingStatus.return_due.tone).toBe("warn");
    expect(bookingStatus.overdue.tone).toBe("error");
    expect(bookingStatus.inspecting.tone).toBe("neutral");
    expect(bookingStatus.completed.tone).toBe("neutral");
    expect(bookingStatus.cancelled).toMatchObject({ tone: "neutral", dot: false, strike: true });
    expect(bookingStatus.disputed.tone).toBe("error");
  });
});

describe("transitions", () => {
  it("follows the brief's table", () => {
    expect(nextStatus("requested", "provider_approve", "provider")).toBe("confirmed");
    expect(nextStatus("requested", "instant_confirm", "system")).toBe("confirmed");
    expect(nextStatus("requested", "provider_decline", "provider")).toBe("cancelled");
    expect(nextStatus("requested", "renter_cancel", "renter")).toBe("cancelled");
    expect(nextStatus("confirmed", "mark_prepared", "provider")).toBe("ready_for_pickup");
    expect(nextStatus("confirmed", "dispatch", "provider")).toBe("out_for_delivery");
    expect(nextStatus("confirmed", "renter_cancel", "renter")).toBe("cancelled");
    expect(nextStatus("confirmed", "provider_cancel", "provider")).toBe("cancelled");
    expect(nextStatus("ready_for_pickup", "handoff_complete", "provider")).toBe("active");
    expect(nextStatus("out_for_delivery", "handoff_complete", "provider")).toBe("active");
    expect(nextStatus("active", "return_window_open", "system")).toBe("return_due");
    expect(nextStatus("return_due", "grace_elapsed", "system")).toBe("overdue");
    expect(nextStatus("active", "return_checkin_start", "provider")).toBe("inspecting");
    expect(nextStatus("return_due", "return_checkin_start", "provider")).toBe("inspecting");
    expect(nextStatus("overdue", "return_checkin_start", "provider")).toBe("inspecting");
    expect(nextStatus("inspecting", "return_no_claim", "provider")).toBe("completed");
    expect(nextStatus("inspecting", "claim_accepted", "renter")).toBe("completed");
    expect(nextStatus("inspecting", "claim_disputed", "renter")).toBe("disputed");
    expect(nextStatus("disputed", "admin_decision", "staff")).toBe("completed");
  });
  it("rejects invalid transitions and wrong actors", () => {
    expect(() => nextStatus("active", "renter_cancel", "renter")).toThrow(TransitionError);
    expect(() => nextStatus("completed", "handoff_complete", "provider")).toThrow(/Cannot apply/);
    expect(() => nextStatus("requested", "provider_approve", "renter")).toThrow(/cannot apply/);
    expect(canTransition("active", "renter_cancel", "renter")).toBe(false);
    expect(canTransition("confirmed", "renter_cancel", "renter")).toBe(true);
    // cancellation is never available after handoff
    for (const s of ["active", "return_due", "overdue", "inspecting", "completed", "disputed"] as const) {
      expect(canTransition(s, "renter_cancel", "renter")).toBe(false);
      expect(canTransition(s, "provider_cancel", "provider")).toBe(false);
    }
  });
  it("lists available events per actor", () => {
    expect(availableEvents("requested", "provider")).toEqual(["provider_approve", "provider_decline"]);
    expect(availableEvents("inspecting", "renter")).toEqual(["claim_accepted", "claim_disputed"]);
    expect(availableEvents("completed", "renter")).toEqual([]);
  });
  it("every event's target is a known status", () => {
    for (const t of Object.values(TRANSITIONS)) expect(BOOKING_STATUSES).toContain(t.to);
  });
});
