import {
  addDays,
  addHours,
  differenceInMilliseconds,
  isWeekend,
  startOfDay,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/** Fallback when no config is loaded yet. The live value is `config.market.timezone`. */
export const DEFAULT_MARKET_TZ = "America/Puerto_Rico";
export const DEFAULT_DEMO_NOW = "2026-09-05T10:00:00";

let marketTz: string = process.env.MARKET_TZ ?? DEFAULT_MARKET_TZ;

/** Called once the live settings are loaded so every formatter agrees on the zone. */
export function setMarketTz(tz: string) {
  marketTz = tz;
}
export function getMarketTz() {
  return marketTz;
}

/**
 * The application clock. Returns DEMO_NOW (interpreted as market-local time) when set,
 * otherwise the real time. Everything that reasons about "today" goes through here.
 */
export function now(): Date {
  const demo = process.env.DEMO_NOW;
  if (demo && demo.trim() !== "") {
    return fromZonedTime(demo.trim(), marketTz);
  }
  return new Date();
}

/** Parse a market-local ISO string ("2026-09-11T09:00") into an instant. */
export function marketLocal(iso: string, tz = marketTz): Date {
  return fromZonedTime(iso, tz);
}

/** Shift an instant into a Date whose *local* fields are the market's wall clock. */
export function toMarket(date: Date, tz = marketTz): Date {
  return toZonedTime(date, tz);
}

export function fmt(date: Date, pattern: string, tz = marketTz): string {
  return formatInTimeZone(date, tz, pattern);
}

/** 0 = Sunday … 6 = Saturday, in the market time zone. */
export function marketWeekday(date: Date, tz = marketTz): number {
  return toZonedTime(date, tz).getDay();
}

/** Start of the market-local day containing `date`, as an instant. */
export function marketStartOfDay(date: Date, tz = marketTz): Date {
  const zoned = toZonedTime(date, tz);
  return fromZonedTime(startOfDay(zoned), tz);
}

export function hoursBetween(a: Date, b: Date): number {
  return differenceInMilliseconds(b, a) / 3_600_000;
}

/** Add N business days (Mon–Fri) in the market time zone, keeping the wall-clock time. */
export function addBusinessDays(date: Date, days: number, tz = marketTz): Date {
  let zoned = toZonedTime(date, tz);
  let remaining = days;
  while (remaining > 0) {
    zoned = addDays(zoned, 1);
    if (!isWeekend(zoned)) remaining -= 1;
  }
  return fromZonedTime(zoned, tz);
}

export { addDays, addHours };

/** Coming weekend relative to `from`: Fri 09:00 → Sun 17:00 market time (the search default). */
export function comingWeekend(from: Date = now(), tz = marketTz): { start: Date; end: Date } {
  const zoned = toZonedTime(from, tz);
  const day = zoned.getDay(); // 0 Sun … 6 Sat
  // days until next Friday (if today is Fri/Sat/Sun, jump to the following weekend)
  let delta = (5 - day + 7) % 7;
  if (delta === 0 || day === 6 || day === 0) delta = day === 5 ? 7 : day === 6 ? 6 : 5;
  const fri = startOfDay(addDays(zoned, delta));
  const start = fromZonedTime(addHours(fri, 9), tz);
  const end = fromZonedTime(addHours(addDays(fri, 2), 17), tz);
  return { start, end };
}
