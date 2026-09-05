import { createHash } from "node:crypto";
import { addDays, addHours, addMinutes, setHours, setMinutes, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const TZ = "America/Puerto_Rico";

/** Anchor: Saturday 5 September 2026 10:00 market time unless DEMO_NOW overrides it. */
export const ANCHOR_ISO = process.env.DEMO_NOW && process.env.DEMO_NOW.trim() !== "" ? process.env.DEMO_NOW.trim() : "2026-09-05T10:00:00";
export const NOW = fromZonedTime(ANCHOR_ISO, TZ);
const zonedNow = toZonedTime(NOW, TZ);
const DAY0 = startOfDay(zonedNow); // market-local midnight of the anchor day

/** Market-local instant `offsetDays` from the anchor day at `HH:mm`. day(6, "09:00") = Fri 11 Sep 09:00. */
export function day(offsetDays: number, hhmm = "00:00"): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const local = setMinutes(setHours(addDays(DAY0, offsetDays), h ?? 0), m ?? 0);
  return fromZonedTime(local, TZ);
}
export function hoursAgo(h: number): Date {
  return addHours(NOW, -h);
}
export function minutesAgo(m: number): Date {
  return addMinutes(NOW, -m);
}
export { addDays, addHours, addMinutes };

/** Deterministic UUID (v4-shaped) from a key so seed rows can reference each other. */
export function uid(key: string): string {
  const h = createHash("sha1").update(`fab.rent:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Deterministic pseudo-random in [0,1) from a key. */
export function rand(key: string): number {
  const h = createHash("md5").update(key).digest();
  return h.readUInt32BE(0) / 0x100000000;
}
export function pick<T>(key: string, arr: readonly T[]): T {
  return arr[Math.floor(rand(key) * arr.length)]!;
}
export function randInt(key: string, min: number, max: number): number {
  return min + Math.floor(rand(key) * (max - min + 1));
}

export type SqlValue = string | number | boolean | null | undefined | Date | SqlValue[] | { [k: string]: unknown } | SqlRaw;
export class SqlRaw {
  constructor(readonly sql: string) {}
}
export const raw = (sql: string) => new SqlRaw(sql);

export function lit(v: SqlValue): string {
  if (v === null || v === undefined) return "null";
  if (v instanceof SqlRaw) return v.sql;
  if (v instanceof Date) return `'${v.toISOString()}'::timestamptz`;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  if (Array.isArray(v)) {
    if (v.length === 0) return "'{}'";
    return `array[${v.map((x) => lit(x as SqlValue)).join(",")}]`;
  }
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
}

/** Explicit jsonb literal (use for jsonb columns that hold arrays). */
export function json(v: unknown): SqlRaw {
  return raw(`'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`);
}

/** Column-typed text arrays (`text[]`) need a cast when empty; use this for text[] columns. */
export function textArray(values: string[]): SqlRaw {
  if (values.length === 0) return raw("'{}'::text[]");
  return raw(`array[${values.map((v) => lit(v)).join(",")}]::text[]`);
}
export function uuidArray(values: string[]): SqlRaw {
  if (values.length === 0) return raw("'{}'::uuid[]");
  return raw(`array[${values.map((v) => lit(v)).join(",")}]::uuid[]`);
}
/** Date-only literal for `date` columns. */
export function dateOnly(d: Date): SqlRaw {
  return raw(`'${toZonedTime(d, TZ).toISOString().slice(0, 10)}'::date`);
}
export function ymd(y: number, m: number, d: number): SqlRaw {
  return raw(`'${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}'::date`);
}

export class Sql {
  private parts: string[] = [];
  comment(text: string) {
    this.parts.push(`\n-- ${text}`);
  }
  insert(table: string, rows: Array<Record<string, SqlValue>>, onConflict = "") {
    if (rows.length === 0) return;
    const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const values = rows.map((r) => `(${cols.map((c) => (c in r ? lit(r[c]) : "default")).join(", ")})`).join(",\n  ");
    this.parts.push(`insert into ${table} (${cols.join(", ")}) values\n  ${values}${onConflict ? ` ${onConflict}` : ""};`);
  }
  rawSql(sql: string) {
    this.parts.push(sql);
  }
  toString() {
    return this.parts.join("\n") + "\n";
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[×]/g, "x")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function cents(dollars: number): number {
  return Math.round(dollars * 100);
}
