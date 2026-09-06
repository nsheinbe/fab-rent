import { differenceInMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const MINUTES_PER_DAY = 24 * 60;

/** Any part of a 24-hour period counts as a day. `Fri 09:00 → Sun 17:00` = 3. */
export function billedDays(start: Date, end: Date): number {
  const minutes = differenceInMinutes(end, start);
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / MINUTES_PER_DAY);
}

/** True when the span starts on a Friday and ends on the immediately following Monday (market zone). */
export function isWeekendSpan(start: Date, end: Date, tz: string): boolean {
  const s = toZonedTime(start, tz);
  const e = toZonedTime(end, tz);
  if (s.getDay() !== 5 || e.getDay() !== 1) return false;
  const days = billedDays(start, end);
  return days >= 2 && days <= 4;
}
