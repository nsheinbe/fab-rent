import { fmt, getMarketTz, toMarket } from "@/lib/time";

const CURRENCY_SYMBOL = "$";

/** The one money formatter. Cents in, string out. `$1,184.60`. */
export function formatMoney(
  cents: number,
  opts: { whole?: boolean; sign?: boolean; symbol?: string } = {},
): string {
  const symbol = opts.symbol ?? CURRENCY_SYMBOL;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = dollars.toLocaleString("en-US");
  const body = opts.whole && rem === 0 ? grouped : `${grouped}.${String(rem).padStart(2, "0")}`;
  const signed = negative ? `−${symbol}${body}` : opts.sign ? `+${symbol}${body}` : `${symbol}${body}`;
  return signed;
}

/** `$58` style — whole dollars when even, otherwise cents. Used for day rates. */
export function formatRate(cents: number): string {
  return formatMoney(cents, { whole: true });
}

/** `$486k` / `$98.4k` style for KPI cards. */
export function formatMoneyCompact(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}m`;
  if (dollars >= 100_000) return `$${Math.round(dollars / 1000)}k`;
  if (dollars >= 10_000) return `$${(dollars / 1000).toFixed(1)}k`;
  return formatMoney(cents, { whole: true });
}

export function formatPct(pct: number): string {
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

export function formatKm(km: number): string {
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** `Fri 11 Sep · 09:00` */
export function formatDateTime(d: Date, tz = getMarketTz()): string {
  return fmt(d, "EEE d MMM · HH:mm", tz);
}
/** `Fri 11 Sep` */
export function formatDate(d: Date, tz = getMarketTz()): string {
  return fmt(d, "EEE d MMM", tz);
}
/** `09:00` */
export function formatTime(d: Date, tz = getMarketTz()): string {
  return fmt(d, "HH:mm", tz);
}
/** `Saturday 5 September` */
export function formatLongDate(d: Date, tz = getMarketTz()): string {
  return fmt(d, "EEEE d MMMM", tz);
}
/** `5 Sep 2026` */
export function formatShortDate(d: Date, tz = getMarketTz()): string {
  return fmt(d, "d MMM yyyy", tz);
}

/**
 * The one date-range formatter.
 *  - same month:  `Fri 11 – Sun 13 Sep`
 *  - different:   `Sat 29 Aug – Tue 1 Sep`
 *  - with times:  `Fri 11 Sep 09:00 → Sun 13 Sep 17:00`
 */
export function formatDateRange(
  start: Date,
  end: Date,
  opts: { times?: boolean; tz?: string } = {},
): string {
  const tz = opts.tz ?? getMarketTz();
  if (opts.times) {
    return `${fmt(start, "EEE d MMM HH:mm", tz)} → ${fmt(end, "EEE d MMM HH:mm", tz)}`;
  }
  const s = toMarket(start, tz);
  const e = toMarket(end, tz);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    if (s.getDate() === e.getDate()) return fmt(start, "EEE d MMM", tz);
    return `${fmt(start, "EEE d", tz)} – ${fmt(end, "EEE d MMM", tz)}`;
  }
  return `${fmt(start, "EEE d MMM", tz)} – ${fmt(end, "EEE d MMM", tz)}`;
}

/** `11–13 Sep` compact variant for pills. */
export function formatDateRangeCompact(start: Date, end: Date, tz = getMarketTz()): string {
  const s = toMarket(start, tz);
  const e = toMarket(end, tz);
  if (s.getMonth() === e.getMonth()) return `${fmt(start, "d", tz)}–${fmt(end, "d MMM", tz)}`;
  return `${fmt(start, "d MMM", tz)} – ${fmt(end, "d MMM", tz)}`;
}

/** `2 h 10 m`, `25 h`, `3 days` */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(Math.abs(ms) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 48) return `${Math.floor(h / 24)} days`;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} m`;
}

/** `25 h left` / `SLA passed 6 h` style helpers */
export function formatHoursLeft(ms: number): string {
  const h = Math.floor(Math.abs(ms) / 3_600_000);
  const m = Math.round((Math.abs(ms) % 3_600_000) / 60_000);
  if (h >= 24 * 2) return `${Math.floor(h / 24)} d`;
  if (h === 0) return `${m} min`;
  return `${h} h`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]!.slice(0, 1) + parts[parts.length - 1]!.slice(0, 1)).toUpperCase();
}

export function maskCard(brand: string, last4: string): string {
  return `${brand} •••• ${last4}`;
}
