/** The 11 canonical booking statuses, in lifecycle order. */
export const BOOKING_STATUSES = [
  "requested",
  "confirmed",
  "ready_for_pickup",
  "out_for_delivery",
  "active",
  "return_due",
  "overdue",
  "inspecting",
  "completed",
  "cancelled",
  "disputed",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type PillTone = "warn" | "cobalt" | "ok" | "error" | "neutral";

export interface StatusMeta {
  label: string;
  /** shortened label for dense tables */
  short: string;
  tone: PillTone;
  /** show the coloured dot (cancelled has none and is struck through) */
  dot: boolean;
  strike?: boolean;
  /** renter-facing tab bucket */
  bucket: "upcoming" | "active" | "past";
}

/** The single source of truth for status copy and colour. Never inline a pill colour elsewhere. */
export const bookingStatus: Record<BookingStatus, StatusMeta> = {
  requested: { label: "Requested", short: "Requested", tone: "warn", dot: true, bucket: "upcoming" },
  confirmed: { label: "Confirmed", short: "Confirmed", tone: "cobalt", dot: true, bucket: "upcoming" },
  ready_for_pickup: { label: "Ready for pickup", short: "Ready", tone: "cobalt", dot: true, bucket: "upcoming" },
  out_for_delivery: { label: "Out for delivery", short: "Out for delivery", tone: "cobalt", dot: true, bucket: "upcoming" },
  active: { label: "Active", short: "Active", tone: "ok", dot: true, bucket: "active" },
  return_due: { label: "Return due", short: "Return due", tone: "warn", dot: true, bucket: "active" },
  overdue: { label: "Overdue", short: "Overdue", tone: "error", dot: true, bucket: "active" },
  inspecting: { label: "Inspecting", short: "Inspecting", tone: "neutral", dot: true, bucket: "past" },
  completed: { label: "Completed", short: "Completed", tone: "neutral", dot: true, bucket: "past" },
  cancelled: { label: "Cancelled", short: "Cancelled", tone: "neutral", dot: false, strike: true, bucket: "past" },
  disputed: { label: "Disputed", short: "Disputed", tone: "error", dot: true, bucket: "past" },
};

export const ACTIVE_STATUSES: BookingStatus[] = ["active", "return_due", "overdue"];
export const UPCOMING_STATUSES: BookingStatus[] = ["requested", "confirmed", "ready_for_pickup", "out_for_delivery"];
export const PAST_STATUSES: BookingStatus[] = ["inspecting", "completed", "cancelled", "disputed"];
/** Statuses that occupy a unit on the calendar / block availability. */
export const BLOCKING_STATUSES: BookingStatus[] = ["requested", "confirmed", "ready_for_pickup", "out_for_delivery", "active", "return_due", "overdue"];
/** Statuses where the renter may still cancel (before handoff). */
export const CANCELLABLE_STATUSES: BookingStatus[] = ["requested", "confirmed", "ready_for_pickup", "out_for_delivery"];

export function isBookingStatus(v: string): v is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(v);
}
