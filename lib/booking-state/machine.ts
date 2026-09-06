import type { BookingStatus } from "./status";

export const BOOKING_EVENTS = [
  "instant_confirm",
  "provider_approve",
  "provider_decline",
  "renter_cancel",
  "provider_cancel",
  "mark_prepared",
  "dispatch",
  "handoff_complete",
  "return_window_open",
  "grace_elapsed",
  "return_checkin_start",
  "return_no_claim",
  "claim_accepted",
  "claim_disputed",
  "admin_decision",
] as const;

export type BookingEvent = (typeof BOOKING_EVENTS)[number];

export type ActorRole = "renter" | "provider" | "staff" | "system";

interface Transition {
  from: BookingStatus[];
  to: BookingStatus;
  actors: ActorRole[];
}

export const TRANSITIONS: Record<BookingEvent, Transition> = {
  instant_confirm: { from: ["requested"], to: "confirmed", actors: ["system"] },
  provider_approve: { from: ["requested"], to: "confirmed", actors: ["provider", "staff"] },
  provider_decline: { from: ["requested"], to: "cancelled", actors: ["provider", "staff"] },
  renter_cancel: { from: ["requested", "confirmed", "ready_for_pickup", "out_for_delivery"], to: "cancelled", actors: ["renter", "staff"] },
  provider_cancel: { from: ["confirmed", "ready_for_pickup", "out_for_delivery"], to: "cancelled", actors: ["provider", "staff"] },
  mark_prepared: { from: ["confirmed"], to: "ready_for_pickup", actors: ["provider", "staff"] },
  dispatch: { from: ["confirmed"], to: "out_for_delivery", actors: ["provider", "staff"] },
  handoff_complete: { from: ["ready_for_pickup", "out_for_delivery", "confirmed"], to: "active", actors: ["provider", "staff"] },
  return_window_open: { from: ["active"], to: "return_due", actors: ["system", "staff"] },
  grace_elapsed: { from: ["return_due", "active"], to: "overdue", actors: ["system", "staff"] },
  return_checkin_start: { from: ["active", "return_due", "overdue"], to: "inspecting", actors: ["provider", "staff"] },
  return_no_claim: { from: ["inspecting"], to: "completed", actors: ["provider", "staff", "system"] },
  claim_accepted: { from: ["inspecting"], to: "completed", actors: ["renter", "staff", "system"] },
  claim_disputed: { from: ["inspecting"], to: "disputed", actors: ["renter", "staff"] },
  admin_decision: { from: ["disputed"], to: "completed", actors: ["staff"] },
};

export class TransitionError extends Error {
  constructor(
    readonly from: BookingStatus,
    readonly event: BookingEvent,
    readonly reason: "invalid_transition" | "forbidden_actor",
    readonly actor?: ActorRole,
  ) {
    super(
      reason === "invalid_transition"
        ? `Cannot apply "${event}" to a booking that is ${from.replace(/_/g, " ")}`
        : `A ${actor} cannot apply "${event}"`,
    );
  }
}

/** Pure check: the status that results from applying `event` to `from`, or a TransitionError. */
export function nextStatus(from: BookingStatus, event: BookingEvent, actor: ActorRole): BookingStatus {
  const t = TRANSITIONS[event];
  if (!t.from.includes(from)) throw new TransitionError(from, event, "invalid_transition");
  if (!t.actors.includes(actor)) throw new TransitionError(from, event, "forbidden_actor", actor);
  return t.to;
}

export function canTransition(from: BookingStatus, event: BookingEvent, actor: ActorRole): boolean {
  try {
    nextStatus(from, event, actor);
    return true;
  } catch {
    return false;
  }
}

/** Events a given actor may apply from a status — used to render action buttons. */
export function availableEvents(from: BookingStatus, actor: ActorRole): BookingEvent[] {
  return BOOKING_EVENTS.filter((e) => canTransition(from, e, actor));
}
