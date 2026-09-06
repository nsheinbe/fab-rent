import { differenceInMinutes } from "date-fns";

export interface LateFeeResult {
  late_minutes: number;
  billable_hours: number;
  fee_cents: number;
}

/** per_hour × whole hours beyond the grace period (floor). 2 h 10 m late, 1 h grace, $15/h → $15. */
export function lateFee(dueAt: Date, returnedAt: Date, perHourCents: number, graceMinutes: number): LateFeeResult {
  const late_minutes = Math.max(0, differenceInMinutes(returnedAt, dueAt));
  const beyondGrace = Math.max(0, late_minutes - graceMinutes);
  const billable_hours = Math.floor(beyondGrace / 60);
  return { late_minutes, billable_hours, fee_cents: billable_hours * perHourCents };
}
