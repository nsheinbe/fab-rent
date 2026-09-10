import { addBusinessDays } from "@/lib/time";
import { CONFIG_V41 } from "@/lib/settings/defaults";
import { NEIGHBOURHOODS } from "@/lib/settings/defaults";
import { distanceKm, lateFee, quoteBooking, quoteExtension, freeCancelUntil, type Quote } from "@/lib/pricing";
import { Sql, NOW, TZ, day, addHours, addMinutes, uid, uuidArray, rand, dateOnly, json, textArray, type SqlValue } from "./lib";
import { P, PR, PROVIDERS, PEOPLE, providerLatLng } from "./people";
import { L, U, X, listingBy, type ListingSeed } from "./catalog";

const CONFIG = CONFIG_V41;
const POLICIES = CONFIG.cancellation.policies;

export type BookingStatus =
  | "requested" | "confirmed" | "ready_for_pickup" | "out_for_delivery" | "active"
  | "return_due" | "overdue" | "inspecting" | "completed" | "cancelled" | "disputed";

export interface BookingSpec {
  ref: string;
  renter: string;
  listing: string;
  units?: number[];
  qty?: number;
  start: Date;
  end: Date;
  fulfillment: "pickup" | "delivery";
  address?: string;
  area?: string;
  drop?: [string, string];
  collect?: [string, string];
  van?: string;
  extras?: string[];
  status: BookingStatus;
  instant?: boolean;
  created_at: Date;
  handoff_at?: Date;
  returned_at?: Date;
  completed_at?: Date;
  cancelled_at?: Date;
  cancelled_by?: "renter" | "provider";
  prep_note?: string;
  settings_version?: number;
  ledger?: "pending" | "available" | "paid" | "held_claim" | "inspecting" | null;
  payout?: string; // payout key when paid
  adjustment?: { cents: number; label: string };
  payment?: string; // payment method key
  handoff_photos?: number;
  fuel?: string;
  extension?: { extra_days: number; new_end: Date; status: "requested" | "approved" | "declined" };
  skipEvents?: boolean;
}

export const B = (ref: string) => uid(`booking:${ref}`);
const PM = (key: string) => uid(`pm:${key}`);

const DEFAULT_PM: Record<string, string> = {
  priya: "priya-visa", jonas: "jonas-visa", marcus: "marcus-visa", elena: "elena-mc", ada: "ada-visa", harbourline: "harbourline-amex",
  "millbrook-owner": "millbrook-visa", "ridgeway-builders": "ridgeway-mc", tomas: "tomas-visa", owen: "owen-visa", maya: "maya-mc", amara: "amara-visa",
  "kestrel-pta": "kestrelpta-visa", "saltmarsh-rowing": "saltmarsh-visa", "docks-fitout": "docksfitout-mc", sofia: "sofia-visa", devon: "devon-visa", lin: "lin-mc", rowan: "rowan-visa",
};
const PM_LABEL: Record<string, string> = {
  "priya-visa": "Visa •••• 4421", "priya-mc": "Mastercard •••• 9930", "jonas-visa": "Visa •••• 8813", "marcus-visa": "Visa •••• 2210", "elena-mc": "Mastercard •••• 7702", "ada-visa": "Visa •••• 1188",
  "harbourline-amex": "Amex •••• 3009", "millbrook-visa": "Visa •••• 5520", "ridgeway-mc": "Mastercard •••• 6641", "tomas-visa": "Visa •••• 9017", "owen-visa": "Visa •••• 0042", "maya-mc": "Mastercard •••• 3391",
  "amara-visa": "Visa •••• 7264", "kestrelpta-visa": "Visa •••• 8125", "saltmarsh-visa": "Visa •••• 4478", "docksfitout-mc": "Mastercard •••• 9902", "sofia-visa": "Visa •••• 1133", "devon-visa": "Visa •••• 5561", "lin-mc": "Mastercard •••• 2087", "rowan-visa": "Visa •••• 6109",
};

const ADDRESS: Record<string, [string, string]> = {
  priya: ["18 Corrin St, Vesper Hill", "Vesper Hill"],
  harbourline: ["Berth 4, Pier Rd, The Docks", "The Docks"],
  "millbrook-owner": ["Kestrel Park Pavilion, Kestrel Park", "Kestrel Park"],
  "saltmarsh-rowing": ["Saltmarsh Boathouse, Quay Walk, Saltway", "Saltway"],
  "ridgeway-builders": ["Site 12, Ridgeway Ave, Ridgeway", "Ridgeway"],
  "kestrel-pta": ["Kestrel Park School Hall, Kestrel Park", "Kestrel Park"],
  ada: ["41 Mill Lane, Millbrook", "Millbrook"],
  owen: ["6 Wharf St, Old Harbour", "Old Harbour"],
  sofia: ["22 Corrin St, Vesper Hill", "Vesper Hill"],
};

function neighbourhoodLatLng(name: string) {
  const n = NEIGHBOURHOODS.find((x) => x.name === name)!;
  return { lat: n.lat, lng: n.lng };
}

export function quoteFor(spec: BookingSpec): { quote: Quote; listing: ListingSeed; delivery_km: number | null } {
  const listing = listingBy(spec.listing);
  const prov = PROVIDERS.find((p) => p.key === listing.provider)!;
  let delivery_km: number | null = null;
  if (spec.fulfillment === "delivery") {
    const area = spec.area ?? ADDRESS[spec.renter]?.[1] ?? PEOPLE.find((p) => p.key === spec.renter)!.neighbourhood;
    delivery_km = +distanceKm(providerLatLng(prov.neighbourhood), neighbourhoodLatLng(area)).toFixed(1);
  }
  const extras = (spec.extras ?? []).map((k) => {
    const x = listing.extras!.find((e) => e.key === k)!;
    return { extra: { id: X(listing.key, x.key), name: x.name, price_cents: Math.round(x.price * 100), per: x.per, is_damage_waiver: !!x.waiver } };
  });
  const quote = quoteBooking(
    {
      pricing: {
        day_cents: Math.round(listing.day * 100), weekend_cents: listing.weekend != null ? Math.round(listing.weekend * 100) : null, week_cents: listing.week != null ? Math.round(listing.week * 100) : null, month_cents: listing.month != null ? Math.round(listing.month * 100) : null,
        hold_cents: Math.round(listing.hold * 100), hold_with_waiver_cents: listing.hold_waiver != null ? Math.round(listing.hold_waiver * 100) : null,
        late_fee_cents_per_hour: Math.round((listing.late_per_hour ?? 0) * 100), late_grace_minutes: listing.grace ?? 60, cleaning_fee_cents: Math.round((listing.cleaning ?? 0) * 100), min_days: listing.min_days ?? 1, max_days: listing.max_days ?? 60,
      },
      delivery: { enabled: !!listing.delivery, radius_km: listing.delivery?.radius ?? 0, base_cents: Math.round((listing.delivery?.base ?? 0) * 100), base_km: listing.delivery?.base_km ?? 5, per_km_cents: Math.round((listing.delivery?.per_km ?? 0) * 100) },
    },
    { start: spec.start, end: spec.end, qty: spec.qty ?? 1, fulfillment: spec.fulfillment, delivery_km: delivery_km ?? undefined, extras, tz: TZ, delivery_area: spec.area ?? ADDRESS[spec.renter]?.[1] },
    CONFIG,
  );
  return { quote, listing, delivery_km };
}

// ------------------------------------------------------------------ the demo bookings
export const BOOKINGS: BookingSpec[] = [
  { ref: "FR-7KQ2-M9", renter: "priya", listing: "dewalt-dwe7491", units: [2], start: day(6, "09:00"), end: day(8, "17:00"), fulfillment: "delivery", drop: ["08:00", "10:00"], collect: ["16:00", "18:00"], van: "Van 1", extras: ["blade60", "waiver"], status: "confirmed", instant: true, created_at: day(-1, "18:14"), prep_note: "blade swap to 60T", ledger: null, payment: "priya-visa" },
  { ref: "FR-3W8C-K1", renter: "priya", listing: "honda-eu2200i", units: [3], start: day(0, "08:00"), end: day(1, "10:00"), fulfillment: "delivery", drop: ["08:00", "10:00"], collect: ["10:00", "12:00"], van: "Van 1", extras: [], status: "active", instant: true, created_at: day(-3, "11:20"), handoff_at: day(0, "08:40"), ledger: "pending", handoff_photos: 6, fuel: "¾", extension: { extra_days: 1, new_end: day(2, "10:00"), status: "requested" }, payment: "priya-visa" },
  { ref: "FR-8MZE-Q4", renter: "priya", listing: "chiavari-gold", qty: 4, start: day(14, "10:00"), end: day(15, "18:00"), fulfillment: "pickup", extras: [], status: "requested", created_at: addMinutes(NOW, -52), ledger: null, payment: "priya-visa" },
  { ref: "FR-5TNV-08", renter: "harbourline", listing: "genie-gs1930", start: day(9, "07:00"), end: day(13, "17:00"), fulfillment: "delivery", drop: ["07:00", "09:00"], collect: ["16:00", "18:00"], van: "Flatbed", extras: ["harness"], status: "requested", created_at: addHours(NOW, -3), ledger: null, payment: "harbourline-amex" },
  { ref: "FR-2QRX-77", renter: "marcus", listing: "karcher-hd512", units: [1], start: day(0, "09:30"), end: day(1, "17:00"), fulfillment: "pickup", extras: ["surface"], status: "ready_for_pickup", instant: true, created_at: day(-2, "20:05"), ledger: null, payment: "marcus-visa" },
  { ref: "FR-6HHT-31", renter: "elena", listing: "bosch-gll3", units: [1], start: day(0, "11:00"), end: day(2, "11:00"), fulfillment: "pickup", extras: ["receiver"], status: "confirmed", instant: false, created_at: day(-1, "13:40"), ledger: null, payment: "elena-mc" },
  { ref: "FR-1PAL-K6", renter: "millbrook-owner", listing: "honda-eu2200i", units: [1, 2], qty: 2, start: day(-1, "15:00"), end: day(0, "16:00"), fulfillment: "delivery", area: "Kestrel Park", drop: ["14:00", "16:00"], collect: ["16:00", "18:00"], van: "Van 1", extras: ["fuel"], status: "active", instant: true, created_at: day(-6, "09:30"), handoff_at: day(-1, "15:20"), ledger: "pending", handoff_photos: 6, fuel: "full", payment: "millbrook-visa" },
  { ref: "FR-9DLA-P2", renter: "jonas", listing: "hilti-te70", units: [1], start: day(-3, "08:00"), end: day(-1, "12:00"), fulfillment: "pickup", extras: [], status: "disputed", instant: true, created_at: day(-5, "19:10"), handoff_at: day(-3, "08:05"), returned_at: day(-1, "14:10"), ledger: "held_claim", adjustment: { cents: 19500, label: "claim" }, handoff_photos: 6, payment: "jonas-visa" },
  { ref: "FR-4CWE-19", renter: "tomas", listing: "werner-28", units: [2], start: day(-4, "09:00"), end: day(-1, "17:00"), fulfillment: "pickup", extras: [], status: "inspecting", instant: true, created_at: day(-7, "12:00"), handoff_at: day(-4, "09:05"), returned_at: day(-1, "17:05"), ledger: "inspecting", handoff_photos: 4, payment: "tomas-visa" },
  { ref: "FR-2Z7K-40", renter: "ridgeway-builders", listing: "husqvarna-k770", units: [1], start: day(-2, "08:00"), end: day(0, "08:00"), fulfillment: "pickup", extras: [], status: "overdue", instant: true, created_at: day(-4, "16:45"), handoff_at: day(-2, "08:10"), ledger: "pending", handoff_photos: 5, payment: "ridgeway-mc" },
  // completed / historical (renter screens, ledger, reviews)
  { ref: "FR-KAY8-22", renter: "priya", listing: "tandem-kayak", units: [1], start: day(-14, "09:00"), end: day(-12, "17:00"), fulfillment: "pickup", extras: [], status: "completed", instant: true, created_at: day(-20, "10:00"), handoff_at: day(-14, "09:10"), returned_at: day(-12, "16:50"), completed_at: day(-12, "17:00"), ledger: "paid", payout: "saltway-1sep", handoff_photos: 4, payment: "priya-visa" },
  { ref: "FR-KAR9-01", renter: "priya", listing: "karcher-hd512", units: [2], start: day(-27, "09:00"), end: day(-27, "17:00"), fulfillment: "pickup", extras: [], status: "completed", instant: true, created_at: day(-30, "08:00"), handoff_at: day(-27, "09:05"), returned_at: day(-27, "16:40"), completed_at: day(-27, "17:00"), ledger: "paid", payout: "northlands-11aug", handoff_photos: 4, payment: "priya-visa" },
  { ref: "FR-7GHM-52", renter: "amara", listing: "karcher-hd512", units: [1], start: day(-3, "09:00"), end: day(-2, "17:00"), fulfillment: "pickup", extras: [], status: "completed", instant: true, created_at: day(-6, "14:00"), handoff_at: day(-3, "09:00"), returned_at: day(-2, "16:30"), completed_at: day(-2, "16:45"), ledger: "available", handoff_photos: 4, payment: "amara-visa" },
  { ref: "FR-0KLD-63", renter: "ridgeway-builders", listing: "bosch-gll3", units: [1], start: day(-5, "08:00"), end: day(-4, "17:00"), fulfillment: "pickup", extras: [], status: "completed", instant: true, created_at: day(-8, "11:00"), handoff_at: day(-5, "08:05"), returned_at: day(-4, "12:30"), completed_at: day(-4, "12:45"), ledger: "available", adjustment: { cents: -2000, label: "refund" }, handoff_photos: 4, payment: "ridgeway-mc" },
  { ref: "FR-OWN1-33", renter: "owen", listing: "dewalt-dwe7491", units: [1], start: day(-21, "09:00"), end: day(-19, "17:00"), fulfillment: "delivery", drop: ["08:00", "10:00"], collect: ["16:00", "18:00"], van: "Van 1", extras: ["waiver"], status: "completed", instant: true, created_at: day(-26, "10:00"), handoff_at: day(-21, "08:50"), returned_at: day(-19, "17:00"), completed_at: day(-19, "17:10"), ledger: "paid", payout: "northlands-18aug", handoff_photos: 6, payment: "owen-visa" },
  { ref: "FR-MAY2-71", renter: "maya", listing: "dewalt-dwe7491", units: [2], start: day(-50, "09:00"), end: day(-50, "18:00"), fulfillment: "pickup", extras: [], status: "completed", instant: true, created_at: day(-52, "10:00"), handoff_at: day(-50, "09:20"), returned_at: day(-50, "17:40"), completed_at: day(-50, "18:00"), ledger: "paid", payout: "northlands-21jul", handoff_photos: 6, payment: "maya-mc" },
  // upcoming confirmed used by the provider calendar (week Mon 7 – Sun 13)
  { ref: "FR-OC12-88", renter: "owen", listing: "dewalt-dwe7491", units: [1], start: day(14, "09:00"), end: day(15, "17:00"), fulfillment: "pickup", extras: [], status: "confirmed", instant: true, created_at: day(-1, "09:00"), ledger: null, payment: "owen-visa" },
  { ref: "FR-DFC3-10", renter: "docks-fitout", listing: "dewalt-dwe7491", units: [3], start: day(4, "08:00"), end: day(5, "17:00"), fulfillment: "pickup", extras: [], status: "confirmed", instant: true, created_at: day(-2, "15:00"), ledger: null, payment: "docksfitout-mc" },
  { ref: "FR-SRC4-09", renter: "saltmarsh-rowing", listing: "honda-eu2200i", units: [1], start: day(4, "09:00"), end: day(5, "17:00"), fulfillment: "delivery", area: "Saltway", drop: ["08:00", "10:00"], collect: ["16:00", "18:00"], van: "Van 1", extras: [], status: "confirmed", instant: true, created_at: day(-3, "17:00"), ledger: null, payment: "saltmarsh-visa" },
  { ref: "FR-MBK5-44", renter: "millbrook-owner", listing: "honda-eu2200i", units: [2], start: day(6, "12:00"), end: day(8, "18:00"), fulfillment: "delivery", area: "Kestrel Park", drop: ["10:00", "12:00"], collect: ["16:00", "18:00"], van: "Van 1", extras: ["fuel"], status: "confirmed", instant: true, created_at: day(-2, "09:00"), ledger: null, payment: "millbrook-visa" },
  { ref: "FR-RGB6-27", renter: "ridgeway-builders", listing: "hilti-te70", units: [1], start: day(5, "08:00"), end: day(7, "17:00"), fulfillment: "pickup", extras: [], status: "confirmed", instant: true, created_at: day(-1, "08:30"), ledger: null, payment: "ridgeway-mc" },
  // other providers' disputes
  { ref: "FR-EPS7-05", renter: "kestrel-pta", listing: "epson-pu1007", units: [1], start: day(-7, "16:00"), end: day(-6, "12:00"), fulfillment: "pickup", extras: ["screen"], status: "disputed", instant: true, created_at: day(-12, "10:00"), handoff_at: day(-7, "16:05"), returned_at: day(-6, "11:50"), ledger: "held_claim", handoff_photos: 4, payment: "kestrelpta-visa" },
  { ref: "FR-ADA8-03", renter: "ada", listing: "frame-tent-20x20", units: [1], start: day(-7, "10:00"), end: day(-6, "10:00"), fulfillment: "delivery", area: "Millbrook", drop: ["08:00", "11:00"], collect: ["09:00", "12:00"], van: "Van A", extras: [], status: "cancelled", instant: false, created_at: day(-20, "09:00"), cancelled_at: day(-7, "10:45"), cancelled_by: "provider", ledger: null, payment: "ada-visa" },
  { ref: "FR-DFM9-99", renter: "docks-fitout", listing: "docks-mixer", units: [1], start: day(-16, "07:00"), end: day(-14, "17:00"), fulfillment: "pickup", extras: [], status: "completed", instant: true, created_at: day(-20, "10:00"), handoff_at: day(-16, "07:05"), returned_at: day(-14, "16:50"), completed_at: day(0, "08:50"), ledger: "available", adjustment: { cents: 7200, label: "claim" }, handoff_photos: 4, payment: "docksfitout-mc" },
  { ref: "FR-SOF1-01", renter: "sofia", listing: "sw-sup", units: [1], start: day(-6, "09:00"), end: day(-5, "18:00"), fulfillment: "pickup", extras: [], status: "disputed", instant: true, created_at: day(-9, "10:00"), handoff_at: day(-6, "09:05"), returned_at: day(-5, "17:50"), ledger: "held_claim", handoff_photos: 4, payment: "sofia-visa" },
  { ref: "FR-DEV5-05", renter: "devon", listing: "tr-router", units: [1], start: day(-5, "17:30"), end: day(-4, "17:30"), fulfillment: "pickup", extras: [], status: "disputed", instant: true, created_at: day(-8, "10:00"), handoff_at: day(-5, "17:35"), returned_at: day(-4, "17:20"), ledger: "held_claim", handoff_photos: 4, payment: "devon-visa" },
  { ref: "FR-LIN8-08", renter: "lin", listing: "sony-a7iv", units: [1], start: day(-4, "10:00"), end: day(-3, "18:00"), fulfillment: "pickup", extras: [], status: "disputed", instant: true, created_at: day(-9, "10:00"), handoff_at: day(-4, "10:05"), returned_at: day(-3, "17:45"), ledger: "held_claim", handoff_photos: 4, payment: "lin-mc" },
  { ref: "FR-OWC0-10", renter: "owen", listing: "chiavari-gold", units: [1, 2], qty: 2, start: day(-3, "10:00"), end: day(-2, "18:00"), fulfillment: "pickup", extras: [], status: "disputed", instant: false, created_at: day(-9, "10:00"), handoff_at: day(-3, "10:10"), returned_at: day(-2, "17:30"), ledger: "held_claim", handoff_photos: 4, payment: "owen-visa" },
  { ref: "FR-ROW2-02", renter: "rowan", listing: "sw-ebike", units: [1], start: day(-10, "09:00"), end: day(-9, "18:00"), fulfillment: "pickup", extras: [], status: "cancelled", instant: false, created_at: day(-13, "10:00"), cancelled_at: day(-12, "07:30"), cancelled_by: "provider", ledger: null, payment: "rowan-visa" },
  // Jonas history (7 rentals, 2 late)
  { ref: "FR-JON1-11", renter: "jonas", listing: "milwaukee-m18", units: [1], start: day(-40, "08:00"), end: day(-39, "17:00"), fulfillment: "pickup", extras: [], status: "completed", instant: true, created_at: day(-44, "10:00"), handoff_at: day(-40, "08:05"), returned_at: day(-39, "18:30"), completed_at: day(-39, "18:40"), ledger: "paid", payout: "northlands-4aug", handoff_photos: 4, payment: "jonas-visa" },
  { ref: "FR-JON2-12", renter: "jonas", listing: "bosch-gsh11", units: [1], start: day(-60, "08:00"), end: day(-58, "17:00"), fulfillment: "pickup", extras: [], status: "completed", instant: true, created_at: day(-65, "10:00"), handoff_at: day(-60, "08:05"), returned_at: day(-58, "19:10"), completed_at: day(-58, "19:20"), ledger: "paid", payout: "northlands-14jul", handoff_photos: 4, payment: "jonas-visa" },
  // Marcus history
  { ref: "FR-MAR1-01", renter: "marcus", listing: "nl-nailer", units: [1], start: day(-33, "09:00"), end: day(-32, "17:00"), fulfillment: "pickup", extras: [], status: "completed", instant: true, created_at: day(-36, "10:00"), handoff_at: day(-33, "09:05"), returned_at: day(-32, "16:00"), completed_at: day(-32, "16:10"), ledger: "paid", payout: "northlands-11aug", handoff_photos: 4, payment: "marcus-visa" },
];

/** Historical completed Northlands rentals to fill the 12-week earnings chart and the payout history. */
const HISTORY_RENTERS = ["owen", "maya", "amara", "sofia", "devon", "lin", "ridgeway-builders", "docks-fitout", "saltmarsh-rowing", "millbrook-owner", "marcus", "jonas"];
const HISTORY_LISTINGS = ["dewalt-dwe7491", "honda-eu2200i", "karcher-hd512", "bosch-gll3", "hilti-te70", "werner-28", "makita-ls1019l", "festool-ts75", "milwaukee-m18", "husqvarna-k770", "bosch-gsh11", "nl-floor-sander", "nl-dehumidifier", "nl-nailer", "dewalt-tile-saw", "bosch-gcm12sd", "stihl-br600", "wacker-bs60"];

export function payoutDates(): Array<{ key: string; date: Date }> {
  // Tuesdays before the anchor: 1 Sep, 25 Aug, ... 12 of them
  const tuesdays: Array<{ key: string; date: Date }> = [];
  let d = day(-4, "06:00"); // Tue 1 Sep
  for (let i = 0; i < 12; i++) {
    const label = d.toISOString();
    tuesdays.push({ key: `northlands-${label}`, date: d });
    d = addHours(d, -24 * 7);
  }
  return tuesdays;
}

export const HISTORY: BookingSpec[] = [];
{
  let n = 0;
  for (let daysAgo = 84; daysAgo >= 5; daysAgo -= 1) {
    const r = rand(`hist:${daysAgo}`);
    if (r < 0.42) continue;
    n++;
    const renter = HISTORY_RENTERS[Math.floor(rand(`hr:${daysAgo}`) * HISTORY_RENTERS.length)]!;
    const listingKey = HISTORY_LISTINGS[Math.floor(rand(`hl:${daysAgo}`) * HISTORY_LISTINGS.length)]!;
    const listing = listingBy(listingKey);
    const days = 1 + Math.floor(rand(`hd:${daysAgo}`) * 3);
    const delivery = !!listing.delivery && rand(`hf:${daysAgo}`) > 0.6 && ADDRESS[renter] !== undefined;
    const ref = `FR-H${String(n).padStart(3, "0")}-${String.fromCharCode(65 + (n % 26))}${n % 10}`;
    const start = day(-daysAgo, "09:00");
    const end = day(-daysAgo + days, "17:00");
    // paid in the first Tuesday payout after the end date
    const payout = payoutDates().slice().reverse().find((p) => p.date > end);
    HISTORY.push({
      ref, renter, listing: listingKey, units: [1 + (n % Math.max(1, listing.units.length))], start, end, fulfillment: delivery ? "delivery" : "pickup", extras: listing.extras?.some((x) => x.waiver) && rand(`hw:${daysAgo}`) > 0.5 ? ["waiver"] : [],
      status: "completed", instant: true, created_at: addHours(start, -48), handoff_at: addMinutes(start, 5), returned_at: addMinutes(end, -20), completed_at: end,
      ledger: payout ? "paid" : "available", payout: payout?.key, handoff_photos: 4, payment: DEFAULT_PM[renter]!, skipEvents: true,
    });
  }
}

// ------------------------------------------------------------------ emit
interface Emitted {
  spec: BookingSpec;
  quote: Quote;
  listing: ListingSeed;
}

export interface BookingsResult {
  emitted: Emitted[];
  ledgerRows: Array<Record<string, SqlValue>>;
}

export function emitBookings(sql: Sql): BookingsResult {
  const all = [...BOOKINGS, ...HISTORY];
  const emitted: Emitted[] = [];
  const bookingRows: Array<Record<string, SqlValue>> = [];
  const extraRows: Array<Record<string, SqlValue>> = [];
  const eventRows: Array<Record<string, SqlValue>> = [];
  const conditionRows: Array<Record<string, SqlValue>> = [];
  const ledgerRows: Array<Record<string, SqlValue>> = [];

  for (const spec of all) {
    const { quote, listing, delivery_km } = quoteFor(spec);
    emitted.push({ spec, quote, listing });
    const policy = POLICIES.find((p) => p.id === (listing.policy ?? "flexible"))!;
    const units = (spec.units ?? []).map((n) => U(listing.key, n));
    const pmKey = spec.payment ?? DEFAULT_PM[spec.renter]!;
    const holdPlaced = !!spec.handoff_at;
    const returned = spec.returned_at;
    const holdStatus =
      !holdPlaced ? "none"
      : spec.status === "completed" ? (spec.adjustment && spec.adjustment.cents > 0 && spec.adjustment.label === "claim" ? "partially_captured" : "released")
      : "placed";
    const cancellation = spec.status === "cancelled"
      ? spec.cancelled_by === "provider"
        ? { by: "provider", refunded_cents: quote.charged_cents, credit_cents: policy.provider_cancel_credit_pct != null ? Math.round((quote.rental_cents * policy.provider_cancel_credit_pct) / 100) : policy.provider_cancel_credit_cents, keep_pct: 0 }
        : { by: "renter", keep_pct: 50, kept_rental_cents: Math.round(quote.rental_cents / 2), refunded_cents: quote.charged_cents - Math.round(quote.rental_cents / 2) }
      : null;

    bookingRows.push({
      id: B(spec.ref), ref: spec.ref, renter_id: P(spec.renter), provider_id: PR(listing.provider), listing_id: L(listing.key),
      unit_id: units[0] ?? null, unit_ids: uuidArray(units), qty: spec.qty ?? 1, start_at: spec.start, end_at: spec.end, billed_days: quote.billed_days,
      fulfillment: spec.fulfillment,
      delivery_address: spec.fulfillment === "delivery" ? (spec.address ?? ADDRESS[spec.renter]?.[0] ?? `${PEOPLE.find((p) => p.key === spec.renter)!.neighbourhood}`) : null,
      delivery_lat: spec.fulfillment === "delivery" ? neighbourhoodLatLng(spec.area ?? ADDRESS[spec.renter]?.[1] ?? PEOPLE.find((p) => p.key === spec.renter)!.neighbourhood).lat : null,
      delivery_lng: spec.fulfillment === "delivery" ? neighbourhoodLatLng(spec.area ?? ADDRESS[spec.renter]?.[1] ?? PEOPLE.find((p) => p.key === spec.renter)!.neighbourhood).lng : null,
      delivery_km, delivery_area: spec.fulfillment === "delivery" ? (spec.area ?? ADDRESS[spec.renter]?.[1] ?? null) : null,
      drop_window: spec.drop ? { start: spec.drop[0], end: spec.drop[1] } : null,
      collect_window: spec.collect ? { start: spec.collect[0], end: spec.collect[1] } : null,
      van: spec.van ?? null,
      status: spec.status, instant: spec.instant ?? false,
      price_snapshot: quote as unknown as Record<string, unknown>,
      charged_cents: quote.charged_cents, hold_cents: quote.hold_cents, hold_status: holdStatus,
      hold_placed_at: holdPlaced ? spec.handoff_at! : null,
      hold_released_at: holdStatus === "released" ? addBusinessDays(returned ?? spec.end, 3, TZ) : null,
      hold_expires_at: holdPlaced && holdStatus === "placed" ? addHours(spec.handoff_at!, 24 * 7) : null,
      hold_captured_cents: holdStatus === "partially_captured" ? spec.adjustment!.cents : 0,
      payment_method_id: PM(pmKey), payment_method_label: PM_LABEL[pmKey]!,
      payment_refs: { charge: `mock_ch_${spec.ref}`, hold: holdPlaced ? `mock_auth_${spec.ref}` : null },
      cancellation_policy_snapshot: policy,
      free_cancel_until: freeCancelUntil(policy, spec.start),
      return_due_at: spec.end, returned_at: returned ?? null,
      prep_note: spec.prep_note ?? null,
      settings_version: spec.settings_version ?? 41,
      cancelled_at: spec.cancelled_at ?? null, cancelled_by: spec.cancelled_by ?? null, cancellation_snapshot: cancellation,
      completed_at: spec.completed_at ?? null,
      created_at: spec.created_at, updated_at: spec.created_at,
    });

    for (const line of quote.lines.filter((l) => l.kind === "extra" || l.kind === "waiver")) {
      const x = listing.extras!.find((e) => X(listing.key, e.key) === line.ref)!;
      extraRows.push({
        id: uid(`bextra:${spec.ref}:${x.key}`), booking_id: B(spec.ref), extra_id: line.ref!, name: x.name, per: x.per, qty: x.waiver ? (spec.qty ?? 1) : 1, days: quote.billed_days,
        unit_cents: Math.round(x.price * 100), amount_cents: line.cents, is_damage_waiver: !!x.waiver,
      });
    }

    // events
    const renterName = PEOPLE.find((p) => p.key === spec.renter)!.name;
    const providerName = PROVIDERS.find((p) => p.key === listing.provider)!.name;
    const ev = (type: string, at: Date, actor_role: string, payload: Record<string, unknown> = {}, from?: string, to?: string, actor_name?: string) =>
      eventRows.push({ id: uid(`event:${spec.ref}:${type}:${at.toISOString()}`), booking_id: B(spec.ref), type, actor_role, actor_id: actor_role === "renter" ? P(spec.renter) : null, actor_name: actor_name ?? (actor_role === "renter" ? renterName : actor_role === "provider" ? providerName : "fab.rent"), from_status: from ?? null, to_status: to ?? null, payload, occurred_at: at });
    if (!spec.skipEvents) {
      ev("booking_created", spec.created_at, "renter", { instant: spec.instant ?? false });
      ev("payment_charged", addMinutes(spec.created_at, 1), "system", { cents: quote.charged_cents, method: PM_LABEL[pmKey] });
      if (spec.instant) ev("instant_confirm", addMinutes(spec.created_at, 1), "system", {}, "requested", "confirmed");
      else if (spec.status !== "requested" && spec.status !== "cancelled") ev("provider_approve", addMinutes(spec.created_at, 55), "provider", {}, "requested", "confirmed");
      if (spec.status === "ready_for_pickup") ev("mark_prepared", addHours(spec.start, -2), "provider", { bay: "bay 2" }, "confirmed", "ready_for_pickup");
      if (spec.handoff_at) {
        if (spec.fulfillment === "delivery") ev("dispatch", addMinutes(spec.handoff_at, -50), "provider", { van: spec.van ?? "Van 1" }, "confirmed", "out_for_delivery");
        else ev("mark_prepared", addHours(spec.start, -3), "provider", {}, "confirmed", "ready_for_pickup");
        ev("handoff_complete", spec.handoff_at, "provider", { photos: spec.handoff_photos ?? 4, fuel: spec.fuel ?? null, hold_cents: quote.hold_cents }, spec.fulfillment === "delivery" ? "out_for_delivery" : "ready_for_pickup", "active");
        ev("hold_placed", addMinutes(spec.handoff_at, 1), "system", { cents: quote.hold_cents, method: PM_LABEL[pmKey] });
      }
      if (spec.status === "overdue") { ev("return_window_open", addHours(spec.end, -24), "system", {}, "active", "return_due"); ev("grace_elapsed", addMinutes(spec.end, listing.grace ?? 60), "system", {}, "return_due", "overdue"); }
      if (spec.returned_at) {
        ev("return_checkin_start", spec.returned_at, "provider", {}, spec.status === "disputed" && spec.ref === "FR-9DLA-P2" ? "overdue" : "active", "inspecting");
        if (spec.status === "completed") {
          ev("return_no_claim", addMinutes(spec.returned_at, 10), "provider", {}, "inspecting", "completed");
          ev("hold_released", addBusinessDays(spec.returned_at, 3, TZ), "system", { cents: quote.hold_cents });
        }
      }
      if (spec.status === "cancelled") ev(spec.cancelled_by === "provider" ? "provider_cancel" : "renter_cancel", spec.cancelled_at!, spec.cancelled_by === "provider" ? "provider" : "renter", cancellation ?? {}, "confirmed", "cancelled");
      if (spec.extension) {
        const q = quoteExtension(spec.extension.extra_days, Math.round(listing.day * 100), spec.qty ?? 1, CONFIG);
        ev("extension_requested", addMinutes(NOW, -25), "renter", { extra_days: spec.extension.extra_days, new_end_at: spec.extension.new_end.toISOString(), cents: q.charged_cents });
      }
    }

    // condition records
    if (spec.handoff_at) {
      const labels = listing.key === "dewalt-dwe7491" ? ["Front", "Table & fence", "Blade", "Stand", "Accessories", "Existing marks"]
        : listing.key === "hilti-te70" ? ["Body", "Chuck & tool holder", "Handle & cord", "Case & bits", "Depth gauge", "Existing marks"]
        : listing.key === "honda-eu2200i" ? ["Front", "Control panel", "Fuel gauge", "Parallel port", "Frame", "Existing marks"]
        : ["Front", "Back", "Accessories", "Serial plate"];
      const n = spec.handoff_photos ?? 4;
      const prov = PROVIDERS.find((p) => p.key === listing.provider)!;
      const geo = spec.fulfillment === "delivery" ? neighbourhoodLatLng(spec.area ?? ADDRESS[spec.renter]?.[1] ?? "Old Harbour") : providerLatLng(prov.neighbourhood);
      const where = spec.fulfillment === "delivery" ? (spec.address ?? ADDRESS[spec.renter]?.[0] ?? "delivery address") : prov.address;
      const unitSerial = listing.units[(spec.units?.[0] ?? 1) - 1]?.serial ?? null;
      conditionRows.push({
        id: uid(`cond:${spec.ref}:handoff`), booking_id: B(spec.ref), kind: "handoff", unit_id: units[0] ?? null, serial_scanned: unitSerial, serial_matches: true, id_matched: true, id_checked_at: addMinutes(spec.handoff_at, -2),
        photos: json(Array.from({ length: n }, (_, i) => ({ label: labels[i] ?? `Photo ${i + 1}`, path: null, taken_at: addMinutes(spec.handoff_at!, i).toISOString(), lat: geo.lat, lng: geo.lng }))),
        checklist: json((listing.included ?? []).map((item) => ({ item, ok: true })).concat((spec.extras ?? []).filter((k) => k !== "waiver").map((k) => ({ item: `Extra: ${listing.extras!.find((e) => e.key === k)!.name}`, ok: true })))),
        notes: listing.key === "dewalt-dwe7491" ? "Small scuff on the left table edge, pre-existing (photo 6). Renter shown the riving knife lock." : listing.key === "hilti-te70" ? "Collar and chuck intact, light grime. Renter shown the ATC reset." : null,
        fuel_level: spec.fuel ?? null, renter_signature_path: `condition-photos/${spec.ref}/handoff-signature.png`, provider_member_id: P(prov.owner), geotag: geo, location_label: where,
        started_at: addMinutes(spec.handoff_at, -8), completed_at: spec.handoff_at,
      });
      if (spec.returned_at) {
        const issue = spec.ref === "FR-9DLA-P2";
        const returnLabels = listing.key === "hilti-te70" ? ["Body", "Chuck & tool holder", "Handle & cord", "Case & bits", "Depth gauge", "Bits", "Cord end", "Collar close-up"] : labels;
        const rn = issue ? 8 : n;
        conditionRows.push({
          id: uid(`cond:${spec.ref}:return`), booking_id: B(spec.ref), kind: "return", unit_id: units[0] ?? null, serial_scanned: unitSerial, serial_matches: true, id_matched: null,
          photos: json(Array.from({ length: rn }, (_, i) => ({ label: returnLabels[i] ?? `Photo ${i + 1}`, path: null, taken_at: addMinutes(spec.returned_at!, 2 + i).toISOString(), lat: providerLatLng(prov.neighbourhood).lat, lng: providerLatLng(prov.neighbourhood).lng, issue: issue && i === 1 }))),
          checklist: json(issue
            ? [{ item: "Body, handle, cord", ok: true }, { item: "Chuck & tool holder", ok: false, description: "Chip out of the TE-Y chuck collar, ~12 mm. Not present at handoff (photo 2). Tool still functions.", repair_estimate_cents: 18000, out_of_service_days: 2 }, { item: "Accessories: case, depth gauge, 3 bits", ok: true }, { item: "Cleanliness", ok: true }]
            : [{ item: "Body & housing", ok: true }, { item: "Accessories", ok: true }, { item: "Cleanliness", ok: true }]),
          notes: null, fuel_level: spec.fuel ?? null, renter_signature_path: null, provider_member_id: P(prov.owner), geotag: providerLatLng(prov.neighbourhood), location_label: prov.address,
          started_at: spec.returned_at, completed_at: spec.status === "inspecting" ? null : addMinutes(spec.returned_at, 8),
        });
      }
    }

    // ledger
    if (spec.ledger && spec.handoff_at) {
      const gross = quote.provider.gross_cents;
      const commission = quote.provider.commission_cents;
      const adj = spec.adjustment?.cents ?? 0;
      const includeAdj = spec.adjustment && spec.adjustment.label !== "claim"; // open claims aren't in net yet
      const net = gross - commission + (includeAdj ? adj : 0) + (spec.status === "completed" && spec.adjustment?.label === "claim" ? adj : 0);
      ledgerRows.push({
        id: uid(`ledger:${spec.ref}`), provider_id: PR(listing.provider), booking_id: B(spec.ref), payout_id: spec.payout ? uid(`payout:${spec.payout}`) : null,
        entry_date: dateOnly(spec.start), type: "rental",
        description: `${listing.title.split(" ").slice(0, 3).join(" ")} · ${renterName}${spec.fulfillment === "delivery" ? " · delivery" : ""}`,
        gross_cents: gross, commission_cents: -commission, adjustment_cents: adj, adjustment_label: spec.adjustment ? `${spec.adjustment.cents > 0 ? "+" : "−"}$${(Math.abs(spec.adjustment.cents) / 100).toFixed(2)} ${spec.adjustment.label}` : null,
        net_cents: net, status: spec.ledger, created_at: spec.start,
      });
    }
  }

  sql.comment("bookings");
  sql.insert("public.bookings", bookingRows);
  sql.insert("public.booking_extras", extraRows);
  sql.insert("public.booking_events", eventRows);
  sql.insert("public.condition_records", conditionRows);
  return { emitted, ledgerRows };
}

export function emitAfterBookings(sql: Sql, result: BookingsResult) {
  const { emitted, ledgerRows } = result;
  const byRef = (ref: string) => emitted.find((e) => e.spec.ref === ref)!;

  // ---------------------------------------------------------------- claims & disputes
  sql.comment("claims");
  const hilti = byRef("FR-9DLA-P2");
  const late = lateFee(hilti.spec.end, hilti.spec.returned_at!, 1500, 60);
  sql.insert("public.claims", [
    { id: uid("claim:hilti-late"), booking_id: B("FR-9DLA-P2"), condition_record_id: uid("cond:FR-9DLA-P2:return"), type: "late", area: null, description: `Returned ${late.late_minutes} min late · 1 h grace · $15/h`, amount_cents: late.fee_cents, status: "settled", settled_cents: late.fee_cents, settled_at: addMinutes(hilti.spec.returned_at!, 8), renter_respond_by: null, created_at: addMinutes(hilti.spec.returned_at!, 8) },
    { id: uid("claim:hilti-damage"), booking_id: B("FR-9DLA-P2"), condition_record_id: uid("cond:FR-9DLA-P2:return"), type: "damage", area: "Chuck & tool holder", description: "Chip out of the TE-Y chuck collar, ~12 mm. Not present at handoff (photo 2). Tool still functions.", amount_cents: 18000, repair_estimate_cents: 18000, out_of_service_days: 2, evidence: json([{ name: "Hilti quote.pdf", path: null }, { name: "Service log", path: null }]), status: "disputed", renter_respond_by: addHours(hilti.spec.returned_at!, 48), created_at: addMinutes(hilti.spec.returned_at!, 8) },
    { id: uid("claim:epson"), booking_id: B("FR-EPS7-05"), condition_record_id: null, type: "damage", area: "Panel", description: "Renter reports dead pixels in the lower-right quadrant; requests a $140 partial refund.", amount_cents: 14000, status: "disputed", renter_respond_by: null, created_at: day(-6, "13:00") },
    { id: uid("claim:mixer"), booking_id: B("FR-DFM9-99"), condition_record_id: uid("cond:FR-DFM9-99:return"), type: "damage", area: "Drum", description: "Cured concrete left in the drum; 2 h labour to chip out.", amount_cents: 12000, repair_estimate_cents: 12000, out_of_service_days: 1, status: "settled", settled_cents: 7200, settled_at: day(0, "08:50"), renter_respond_by: day(-12, "17:00"), created_at: day(-14, "17:00") },
    { id: uid("claim:sup"), booking_id: B("FR-SOF1-01"), condition_record_id: uid("cond:FR-SOF1-01:return"), type: "damage", area: "Fin box", description: "Cracked fin box, likely from beaching fin-first.", amount_cents: 4500, repair_estimate_cents: 4500, out_of_service_days: 1, status: "disputed", renter_respond_by: day(-3, "18:00"), created_at: day(-5, "18:00") },
    { id: uid("claim:router"), booking_id: B("FR-DEV5-05"), condition_record_id: uid("cond:FR-DEV5-05:return"), type: "missing", area: "Bit set", description: "Four bits missing from the 12-piece set.", amount_cents: 6000, status: "disputed", renter_respond_by: day(-2, "17:30"), created_at: day(-4, "17:30") },
    { id: uid("claim:lens"), booking_id: B("FR-LIN8-08"), condition_record_id: uid("cond:FR-LIN8-08:return"), type: "damage", area: "Front element", description: "Scratch on the front element of the 24-105, ~4 mm.", amount_cents: 22000, repair_estimate_cents: 22000, out_of_service_days: 5, status: "disputed", renter_respond_by: day(-1, "18:00"), created_at: day(-3, "18:00") },
    { id: uid("claim:chairs"), booking_id: B("FR-OWC0-10"), condition_record_id: uid("cond:FR-OWC0-10:return"), type: "cleaning", area: "Cushions", description: "Red wine on four cushions — professional cleaning.", amount_cents: 4000, status: "disputed", renter_respond_by: day(0, "17:30"), created_at: day(-2, "17:40") },
  ]);

  sql.comment("disputes");
  const disputes: Array<Record<string, SqlValue>> = [
    {
      id: uid("dispute:D-0912"), code: "D-0912", claim_id: uid("claim:hilti-damage"), booking_id: B("FR-9DLA-P2"), claimant_provider_id: PR("northlands"), respondent_profile_id: P("jonas"),
      summary: "Damage claim · Hilti TE 70 chuck · $180 + $15 late",
      statements: json([
        { side: "provider", author: "Dana O.", at: addMinutes(hilti.spec.returned_at!, 8).toISOString(), body: "Chip of ~12 mm out of the TE-Y chuck collar, not present at handoff (photo 2 shows the collar intact). Hilti quote for collar replacement $164 + 1 h labour $16 = $180. Tool is usable but the collar seal is compromised.", attachments: [{ name: "Hilti quote.pdf" }, { name: "Service log" }] },
        { side: "renter", author: "Jonas K.", at: addMinutes(hilti.spec.returned_at!, 30).toISOString(), body: "I used it for two days of concrete drilling as the listing allows and never dropped it. I noticed the chip when packing up Thursday evening — I think it was already there under grime at handoff; photo 2 is taken from the other side. Happy to pay something toward it but not the whole collar.", attachments: [{ name: "2 photos · Thu 18:22", count: 2 }] },
      ]),
      assignee_staff_id: null, opened_at: addMinutes(hilti.spec.returned_at!, 30), decision_due_at: addHours(addMinutes(hilti.spec.returned_at!, 30), 48), status: "awaiting_decision",
      internal_notes: json([{ author: "Ola R.", at: day(-1, "16:05").toISOString(), body: "Handoff photo 2 shows the collar from the same angle as the return photo — chip is not visible, grime is light. Renter's Thursday-evening photos predate return and show the chip, consistent with damage during rental. Wear-and-tear allowance for a 3-year-old tool: apply 20%." }]),
      evidence_areas: json([{ area: "Chuck", handoff_index: 1, return_index: 1, matched_angle: true }, { area: "Body", handoff_index: 0, return_index: 0, matched_angle: true }, { area: "Accessories", handoff_index: 3, return_index: 3, matched_angle: false }]),
      last_event: "Renter disputed", last_event_at: addMinutes(hilti.spec.returned_at!, 30),
    },
    {
      id: uid("dispute:D-0907"), code: "D-0907", claim_id: uid("claim:epson"), booking_id: B("FR-EPS7-05"), claimant_profile_id: P("kestrel-pta"), respondent_provider_id: PR("vesper"),
      summary: "Item not as described · Epson projector, dead pixels",
      statements: json([
        { side: "renter", author: "Kestrel Park PTA", at: day(-6, "13:00").toISOString(), body: "A cluster of dead pixels in the lower right was visible on every slide at our quiz night. We are asking for $140 back on the $85/day rate.", attachments: [{ name: "3 photos", count: 3 }] },
        { side: "provider", author: "Theo M.", at: day(-3, "11:20").toISOString(), body: "The panel was checked before pickup; the marks in the photos look like dust on the lens rather than dead pixels. Happy to offer a $40 goodwill credit.", attachments: [{ name: "Pre-rental test pattern.jpg" }] },
      ]),
      assignee_staff_id: uid("staff:ines"), opened_at: day(-2, "04:00"), decision_due_at: addHours(NOW, -6), status: "awaiting_decision", internal_notes: json([]), evidence_areas: json([{ area: "Panel", handoff_index: 0, return_index: 0, matched_angle: false }]),
      last_event: "Provider replied Thu", last_event_at: day(-2, "11:20"),
    },
    {
      id: uid("dispute:D-0903"), code: "D-0903", claim_id: null, booking_id: B("FR-ADA8-03"), claimant_profile_id: P("ada"), respondent_provider_id: PR("millbrook"),
      summary: "No-show at pickup · frame tent · cancellation fee contested",
      statements: json([
        { side: "provider", author: "Millbrook Event Co.", at: day(-7, "11:00").toISOString(), body: "Crew arrived at 41 Mill Lane in the 08:00–11:00 window, no answer at the door or phone for 45 minutes. Cancelled as a no-show; 50% of the rental ($170) applies under the Strict policy.", attachments: [{ name: "Crew GPS log" }] },
        { side: "renter", author: "Ada B.", at: day(-7, "14:30").toISOString(), body: "I messaged on Friday to move the setup to the afternoon and never heard back. I was at work in the morning. I don't think I should pay the fee.", attachments: [{ name: "Screenshot of message" }] },
      ]),
      assignee_staff_id: uid("staff:ola"), opened_at: day(-3, "15:00"), decision_due_at: addHours(NOW, -19), status: "awaiting_decision", internal_notes: json([{ author: "Ola R.", at: day(-1, "09:00").toISOString(), body: "Message thread shows the renter asked to move the window on Fri 17:40; provider read it Sat 07:30 and did not reply before dispatch." }]), evidence_areas: json([]),
      last_event: "Evidence complete", last_event_at: day(-1, "09:00"),
    },
    { id: uid("dispute:D-0899"), code: "D-0899", claim_id: uid("claim:mixer"), booking_id: B("FR-DFM9-99"), claimant_provider_id: PR("docks"), respondent_profile_id: P("docks-fitout"), summary: "Cleaning claim · concrete mixer drum · $120", statements: json([]), assignee_staff_id: uid("staff:ola"), opened_at: day(-12, "17:00"), decision_due_at: day(-10, "17:00"), status: "resolved", decision: "uphold_partial", charged_cents: 7200, released_cents: 12800, paid_to_provider_cents: 7200, reasoning: "Split 60/40 — the drum was returned unwashed but the provider's cleaning-fee terms were not shown on the listing at the time of booking.", resolved_at: day(0, "08:50"), appeal_by: day(7, "08:50"), internal_notes: json([]), evidence_areas: json([]), last_event: "Resolved · split 60/40", last_event_at: day(0, "08:50") },
    { id: uid("dispute:D-0901"), code: "D-0901", claim_id: uid("claim:sup"), booking_id: B("FR-SOF1-01"), claimant_provider_id: PR("saltway"), respondent_profile_id: P("sofia"), summary: "Damage claim · SUP fin box · $45", statements: json([{ side: "provider", author: "Femi A.", at: day(-5, "18:10").toISOString(), body: "Fin box cracked along the rear edge — consistent with beaching fin-first.", attachments: [] }, { side: "renter", author: "Sofia M.", at: day(-4, "09:00").toISOString(), body: "The crack was there when I picked it up; I did not notice until inflating.", attachments: [] }]), assignee_staff_id: null, opened_at: day(-4, "09:00"), decision_due_at: day(-2, "09:00"), status: "more_evidence", internal_notes: json([]), evidence_areas: json([{ area: "Fin box", handoff_index: 1, return_index: 1, matched_angle: false }]), last_event: "Asked renter for pickup photos", last_event_at: day(-2, "10:00") },
    { id: uid("dispute:D-0905"), code: "D-0905", claim_id: uid("claim:router"), booking_id: B("FR-DEV5-05"), claimant_provider_id: PR("tomas"), respondent_profile_id: P("devon"), summary: "Missing items · router bit set · $60", statements: json([{ side: "provider", author: "Tomas R.", at: day(-4, "17:40").toISOString(), body: "Four bits missing from the 12-piece set.", attachments: [] }, { side: "renter", author: "Devon A.", at: day(-3, "08:00").toISOString(), body: "The set only had eight bits when I collected it.", attachments: [] }]), assignee_staff_id: null, opened_at: day(-3, "08:00"), decision_due_at: day(-1, "08:00"), status: "awaiting_decision", internal_notes: json([]), evidence_areas: json([{ area: "Bit set", handoff_index: 2, return_index: 2, matched_angle: true }]), last_event: "Renter disputed", last_event_at: day(-3, "08:00") },
    { id: uid("dispute:D-0908"), code: "D-0908", claim_id: uid("claim:lens"), booking_id: B("FR-LIN8-08"), claimant_provider_id: PR("vesper"), respondent_profile_id: P("lin"), summary: "Damage claim · 24-105 front element scratch · $220", statements: json([{ side: "provider", author: "Theo M.", at: day(-3, "18:00").toISOString(), body: "4 mm scratch on the front element, visible in the return photo and not at handoff.", attachments: [{ name: "Canon repair estimate.pdf" }] }, { side: "renter", author: "Lin H.", at: day(-2, "12:00").toISOString(), body: "I kept the hood on the whole time and used the case. I'd like an independent look.", attachments: [] }]), assignee_staff_id: uid("staff:ola"), opened_at: day(-2, "12:00"), decision_due_at: day(0, "12:00"), status: "awaiting_decision", internal_notes: json([]), evidence_areas: json([{ area: "Front element", handoff_index: 0, return_index: 0, matched_angle: true }]), last_event: "Renter disputed", last_event_at: day(-2, "12:00") },
    { id: uid("dispute:D-0910"), code: "D-0910", claim_id: uid("claim:chairs"), booking_id: B("FR-OWC0-10"), claimant_provider_id: PR("millbrook"), respondent_profile_id: P("owen"), summary: "Cleaning claim · chiavari cushions · $40", statements: json([{ side: "provider", author: "Millbrook Event Co.", at: day(-2, "17:45").toISOString(), body: "Red wine on four cushions; professional cleaning at $10 each.", attachments: [] }, { side: "renter", author: "Owen C.", at: day(-1, "20:00").toISOString(), body: "Fair enough for two of them — the other two marks were there at pickup.", attachments: [] }]), assignee_staff_id: null, opened_at: day(-1, "20:00"), decision_due_at: day(1, "20:00"), status: "awaiting_decision", internal_notes: json([]), evidence_areas: json([{ area: "Cushions", handoff_index: 1, return_index: 1, matched_angle: false }]), last_event: "Renter disputed", last_event_at: day(-1, "20:00") },
  ];
  sql.insert("public.disputes", disputes);
  sql.rawSql("select setval('public.dispute_code_seq', 913, false);");

  // ---------------------------------------------------------------- extension request
  sql.comment("extension request (Honda +1 day)");
  const honda = byRef("FR-3W8C-K1");
  const ext = quoteExtension(1, 4500, 1, CONFIG);
  sql.insert("public.extension_requests", [
    { id: uid("ext:FR-3W8C-K1"), booking_id: B("FR-3W8C-K1"), new_end_at: honda.spec.extension!.new_end, extra_days: 1, amount_cents: ext.charged_cents, quote: ext as unknown as Record<string, unknown>, status: "requested", created_at: addMinutes(NOW, -25) },
  ]);

  // ---------------------------------------------------------------- conversations
  sql.comment("conversations & messages");
  sql.insert("public.conversations", [
    { id: uid("conv:FR-3W8C-K1"), booking_id: B("FR-3W8C-K1"), listing_id: L("honda-eu2200i"), provider_id: PR("northlands"), renter_id: P("priya"), last_message_at: day(0, "09:12"), last_message_preview: "Perfect, thank you!", renter_unread: 0, provider_unread: 1, created_at: day(-3, "11:25") },
    { id: uid("conv:FR-7KQ2-M9"), booking_id: B("FR-7KQ2-M9"), listing_id: L("dewalt-dwe7491"), provider_id: PR("northlands"), renter_id: P("priya"), last_message_at: day(-1, "18:16"), last_message_preview: "Delivery window confirmed · Fri 08:00–10:00", renter_unread: 0, provider_unread: 0, created_at: day(-1, "18:16") },
    { id: uid("conv:FR-9DLA-P2"), booking_id: B("FR-9DLA-P2"), listing_id: L("hilti-te70"), provider_id: PR("northlands"), renter_id: P("jonas"), last_message_at: day(-1, "14:42"), last_message_preview: "I've disputed the claim — the chip was under grime at handoff.", renter_unread: 0, provider_unread: 1, created_at: day(-5, "19:12") },
    { id: uid("conv:FR-5TNV-08"), booking_id: B("FR-5TNV-08"), listing_id: L("genie-gs1930"), provider_id: PR("northlands"), renter_id: P("harbourline"), last_message_at: addHours(NOW, -3), last_message_preview: "Site has a loading bay at Berth 4 — flatbed access is fine.", renter_unread: 0, provider_unread: 0, created_at: addHours(NOW, -3) },
    { id: uid("conv:FR-KAY8-22"), booking_id: B("FR-KAY8-22"), listing_id: L("tandem-kayak"), provider_id: PR("saltway"), renter_id: P("priya"), last_message_at: day(-12, "17:05"), last_message_preview: "Thanks Priya — hold releases within 3 business days.", renter_unread: 0, provider_unread: 0, created_at: day(-14, "08:30") },
  ]);
  const msg = (conv: string, i: number, side: "renter" | "provider" | "system", at: Date, body: string, kind: "text" | "system" | "photo" = "text", sender?: string) => ({
    id: uid(`msg:${conv}:${i}`), conversation_id: uid(`conv:${conv}`), sender_id: sender ? P(sender) : null, sender_side: side, kind, body, read_at: side === "renter" ? at : side === "provider" ? addMinutes(at, 3) : null, created_at: at,
  });
  sql.insert("public.messages", [
    msg("FR-3W8C-K1", 1, "renter", day(0, "09:02"), "Hi — would it be OK to return around 11 tomorrow instead of 10? Family brunch is running long.", "text", "priya"),
    msg("FR-3W8C-K1", 2, "provider", day(0, "09:09"), "Morning brunch wins. 11:00 is fine, Priya — no late fee. I've moved the collection window; you'll get a confirmation.", "text", "dana"),
    msg("FR-3W8C-K1", 3, "system", day(0, "09:10"), "Collection window updated · Sun 11:00–13:00", "system"),
    msg("FR-3W8C-K1", 4, "renter", day(0, "09:12"), "Perfect, thank you!", "text", "priya"),
    msg("FR-7KQ2-M9", 1, "system", day(-1, "18:16"), "Delivery window confirmed · Fri 08:00–10:00", "system"),
    msg("FR-9DLA-P2", 1, "provider", day(-1, "14:20"), "Hi Jonas — we found a chip in the chuck collar at check-in and have sent a claim for the repair. Photos are attached to the booking.", "text", "dana"),
    msg("FR-9DLA-P2", 2, "renter", day(-1, "14:42"), "I've disputed the claim — the chip was under grime at handoff.", "text", "jonas"),
    msg("FR-5TNV-08", 1, "renter", addHours(NOW, -3), "Site has a loading bay at Berth 4 — flatbed access is fine.", "text", "harbourline"),
    msg("FR-KAY8-22", 1, "provider", day(-12, "17:05"), "Thanks Priya — hold releases within 3 business days.", "text", "femi"),
  ]);
  // disable the trigger-driven unread counters from double counting (they ran on insert) — reset to the seeded intent
  sql.rawSql(`update public.conversations set renter_unread = 0, provider_unread = case when id in ('${uid("conv:FR-3W8C-K1")}','${uid("conv:FR-9DLA-P2")}') then 1 else 0 end, last_message_at = last_message_at;`);

  // ---------------------------------------------------------------- reviews
  sql.comment("reviews");
  const rev = (key: string, booking: string, author: string, side: "renter" | "provider", fields: Record<string, SqlValue>) => ({ id: uid(`review:${key}`), booking_id: B(booking), author_id: P(author), author_side: side, ...fields });
  sql.insert("public.reviews", [
    rev("owen-dewalt", "FR-OWN1-33", "owen", "renter", { target: "listing", listing_id: L("dewalt-dwe7491"), provider_id: PR("northlands"), item_stars: 5, provider_stars: 5, tags: textArray(["As described", "Clean & ready", "Fair on return"]), body: "Fence was square, blade sharp. Driver walked me through the serial check and photos at drop-off — felt very fair.", submitted_at: day(-18, "10:00"), published_at: day(-17, "10:00") }),
    rev("northlands-owen", "FR-OWN1-33", "dana", "provider", { target: "renter", renter_id: P("owen"), provider_id: PR("northlands"), renter_stars: 5, tags: textArray(["On time", "Clean return"]), body: "Returned spotless and on time.", submitted_at: day(-18, "12:00"), published_at: day(-17, "10:00") }),
    rev("maya-dewalt", "FR-MAY2-71", "maya", "renter", { target: "listing", listing_id: L("dewalt-dwe7491"), provider_id: PR("northlands"), item_stars: 4, provider_stars: 4, tags: textArray(["As described"]), body: "Great saw. Saturday pickup queue was slow, ~15 minutes.", submitted_at: day(-48, "10:00"), published_at: day(-47, "10:00") }),
    rev("northlands-maya", "FR-MAY2-71", "dana", "provider", { target: "renter", renter_id: P("maya"), provider_id: PR("northlands"), renter_stars: 5, tags: textArray(["On time"]), body: "Easy handoff.", submitted_at: day(-48, "12:00"), published_at: day(-47, "10:00") }),
    rev("priya-karcher", "FR-KAR9-01", "priya", "renter", { target: "listing", listing_id: L("karcher-hd512"), provider_id: PR("northlands"), item_stars: 5, provider_stars: 5, tags: textArray(["As described", "Easy handoff"]), body: "Patio looks new. Quick counter pickup and the surface cleaner was worth it.", submitted_at: day(-25, "10:00"), published_at: day(-24, "10:00") }),
    rev("northlands-priya-karcher", "FR-KAR9-01", "dana", "provider", { target: "renter", renter_id: P("priya"), provider_id: PR("northlands"), renter_stars: 5, tags: textArray(["On time", "Clean return"]), body: "Perfect renter.", submitted_at: day(-25, "12:00"), published_at: day(-24, "10:00") }),
    rev("saltway-priya-kayak", "FR-KAY8-22", "femi", "provider", { target: "renter", renter_id: P("priya"), provider_id: PR("saltway"), renter_stars: 5, tags: textArray(["On time", "Clean return"]), body: "Rinsed and back on time — welcome back any weekend.", submitted_at: day(-11, "10:00"), published_at: null }),
    rev("amara-karcher", "FR-7GHM-52", "amara", "renter", { target: "listing", listing_id: L("karcher-hd512"), provider_id: PR("northlands"), item_stars: 5, provider_stars: 5, tags: textArray(["Clean & ready", "Easy handoff"]), body: "Powerful and the hose is long enough for the whole drive.", submitted_at: day(-2, "18:00"), published_at: null }),
    rev("jonas-milwaukee", "FR-JON1-11", "jonas", "renter", { target: "listing", listing_id: L("milwaukee-m18"), provider_id: PR("northlands"), item_stars: 5, provider_stars: 4, tags: textArray(["As described"]), body: "Batteries lasted the whole job.", submitted_at: day(-38, "10:00"), published_at: day(-37, "10:00") }),
    rev("northlands-jonas-1", "FR-JON1-11", "dana", "provider", { target: "renter", renter_id: P("jonas"), provider_id: PR("northlands"), renter_stars: 4, tags: textArray(["Messaged ahead"]), body: "An hour late but messaged ahead — no problem.", submitted_at: day(-38, "12:00"), published_at: day(-37, "10:00") }),
    rev("northlands-jonas-2", "FR-JON2-12", "dana", "provider", { target: "renter", renter_id: P("jonas"), provider_id: PR("northlands"), renter_stars: 4, tags: textArray(["Messaged ahead"]), body: "Late again, but communicated. Tool came back clean.", submitted_at: day(-56, "12:00"), published_at: day(-55, "10:00") }),
  ]);

  // ---------------------------------------------------------------- payouts
  sql.comment("payouts");
  const northlandsPayouts = payoutDates();
  const payoutRows: Array<Record<string, SqlValue>> = northlandsPayouts.map((p, i) => ({
    id: uid(`payout:${p.key}`), provider_id: PR("northlands"), amount_cents: 0, scheduled_for: dateOnly(p.date), paid_at: addHours(p.date, 3), status: "paid", account_masked: "Maren Bank •••• 8812", rental_count: 0, created_at: addHours(p.date, -24 * 6 + i * 0), payout_provider: "mock",
  }));
  payoutRows.push(
    { payout_provider: "mock", id: uid("payout:northlands-4aug"), provider_id: PR("northlands"), amount_cents: 0, scheduled_for: dateOnly(day(-32)), paid_at: day(-32, "09:00"), status: "paid", account_masked: "Maren Bank •••• 8812", rental_count: 0, created_at: day(-38) },
    { payout_provider: "mock", id: uid("payout:northlands-11aug"), provider_id: PR("northlands"), amount_cents: 0, scheduled_for: dateOnly(day(-25)), paid_at: day(-25, "09:00"), status: "paid", account_masked: "Maren Bank •••• 8812", rental_count: 0, created_at: day(-31) },
    { payout_provider: "mock", id: uid("payout:northlands-18aug"), provider_id: PR("northlands"), amount_cents: 0, scheduled_for: dateOnly(day(-18)), paid_at: day(-18, "09:00"), status: "paid", account_masked: "Maren Bank •••• 8812", rental_count: 0, created_at: day(-24) },
    { payout_provider: "mock", id: uid("payout:northlands-21jul"), provider_id: PR("northlands"), amount_cents: 0, scheduled_for: dateOnly(day(-46)), paid_at: day(-46, "09:00"), status: "paid", account_masked: "Maren Bank •••• 8812", rental_count: 0, created_at: day(-52) },
    { payout_provider: "mock", id: uid("payout:northlands-14jul"), provider_id: PR("northlands"), amount_cents: 0, scheduled_for: dateOnly(day(-53)), paid_at: day(-53, "09:00"), status: "paid", account_masked: "Maren Bank •••• 8812", rental_count: 0, created_at: day(-59) },
    { payout_provider: "mock", id: uid("payout:saltway-1sep"), provider_id: PR("saltway"), amount_cents: 0, scheduled_for: dateOnly(day(-4)), paid_at: day(-4, "09:00"), status: "paid", account_masked: "Maren Bank •••• 6650", rental_count: 0, created_at: day(-10) },
    // exceptions
    // Phase 7: two transfer attempts refused because the bank account failed verification at the payout provider
    { id: uid("payout:docks-exception"), provider_id: PR("docks"), amount_cents: 642000, scheduled_for: dateOnly(day(-4)), paid_at: null, status: "failed", account_masked: "Dockside Mutual •••• 0193", rental_count: 31, exception: "Bank account verification failed", exception_detail: "retry 2", created_at: day(-10), payout_provider: "mock", transfer_attempts: 2, last_attempt_at: day(-3, "09:15") },
    { id: uid("payout:tomas-exception"), provider_id: PR("tomas"), amount_cents: 41230, scheduled_for: dateOnly(day(-4)), paid_at: null, status: "paused", account_masked: "Maren Bank •••• 3318", rental_count: 6, exception: "Tax ID missing", exception_detail: "payout paused since 1 Sep", created_at: day(-10), payout_provider: "mock" },
    // next scheduled
    { id: uid("payout:northlands-next"), provider_id: PR("northlands"), amount_cents: 0, scheduled_for: dateOnly(day(3)), paid_at: null, status: "scheduled", account_masked: "Maren Bank •••• 8812", rental_count: 0, created_at: day(0), payout_provider: "mock" },
  );
  sql.insert("public.payouts", payoutRows);
  sql.comment("ledger entries");
  sql.insert("public.ledger_entries", ledgerRows);
  // roll up paid payout amounts from their ledger entries, and add PAYOUT ledger rows
  sql.rawSql(`update public.payouts p set amount_cents = s.total, rental_count = s.n from (select payout_id, sum(net_cents) as total, count(*) as n from public.ledger_entries where payout_id is not null group by payout_id) s where s.payout_id = p.id;`);
  sql.rawSql(`insert into public.ledger_entries (id, provider_id, booking_id, payout_id, entry_date, type, description, gross_cents, commission_cents, adjustment_cents, net_cents, status, created_at)
    select gen_random_uuid(), p.provider_id, null, p.id, p.scheduled_for, 'payout', 'Weekly payout · ' || p.rental_count || ' rentals · ' || p.account_masked, 0, 0, 0, p.amount_cents, 'paid', p.paid_at from public.payouts p where p.status = 'paid' and p.amount_cents > 0;`);
  sql.rawSql(`update public.payouts p set amount_cents = coalesce((select sum(net_cents) from public.ledger_entries l where l.provider_id = p.provider_id and l.status = 'available' and l.type <> 'payout'), 0), rental_count = coalesce((select count(*) from public.ledger_entries l where l.provider_id = p.provider_id and l.status = 'available' and l.type <> 'payout'), 0) where p.id = '${uid("payout:northlands-next")}';`);

  // ---------------------------------------------------------------- saved listings & credits
  sql.comment("saved listings");
  sql.insert("public.saved_listings", ["dewalt-dwe7491", "honda-eu2200i", "sony-fx3", "tandem-kayak"].map((k) => ({ id: uid(`saved:priya:${k}`), profile_id: P("priya"), listing_id: L(k), created_at: day(-10) })));
  sql.insert("public.renter_credits", [{ id: uid("credit:ada"), profile_id: P("ada"), booking_id: B("FR-ADA8-03"), amount_cents: 3400, reason: "Provider cancellation · 10% credit (Strict)", created_at: day(-7, "10:45") }]);

  // ---------------------------------------------------------------- reports
  sql.insert("public.reports", [{ id: uid("report:macbook"), listing_id: L("macbook-pro"), reporter_id: P("lin"), kind: "listing", body: "Photos are stock images and the serial is hidden — looks like a scam listing.", status: "open", created_at: addHours(NOW, -1) }]);
}
