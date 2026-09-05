import { NEIGHBOURHOODS } from "@/lib/settings/defaults";
import { Sql, day, textArray, uid, ymd, raw, json, type SqlValue } from "./lib";

export interface Person {
  key: string;
  name: string;
  email: string;
  phone?: string;
  neighbourhood: string;
  role?: "renter" | "provider" | "staff";
  id_verified?: boolean;
  id_verified_method?: string;
  rating?: number | null;
  rating_count?: number;
  completed?: number;
  late?: number;
  flags?: string[];
  status?: "active" | "suspended" | "in_dispute";
  is_business?: boolean;
  joined: [number, number, number];
  public_id?: number;
}

export const PEOPLE: Person[] = [
  { key: "priya", name: "Priya Nair", email: "priya.nair@example.com", phone: "+1 555 014 2290", neighbourhood: "Vesper Hill", id_verified: true, id_verified_method: "driver's licence", rating: 4.9, rating_count: 11, completed: 12, joined: [2024, 2, 9] },
  { key: "jonas", name: "Jonas Kellner", email: "jonas.k@example.com", phone: "+1 555 018 7731", neighbourhood: "Ridgeway", id_verified: true, id_verified_method: "driver's licence", rating: 4.6, rating_count: 7, completed: 7, late: 2, joined: [2025, 3, 14], public_id: 31877 },
  { key: "marcus", name: "Marcus Lindqvist", email: "marcus.l@example.com", phone: "+1 555 021 4402", neighbourhood: "Old Harbour", id_verified: true, id_verified_method: "passport", rating: 5.0, rating_count: 4, completed: 4, joined: [2025, 6, 2] },
  { key: "elena", name: "Elena Vasquez", email: "elena.v@example.com", phone: "+1 555 030 9981", neighbourhood: "Northlands", id_verified: true, id_verified_method: "driver's licence", rating: null, completed: 0, joined: [2026, 8, 28] },
  { key: "rowan", name: "Rowan Blake", email: "rowan.b@example.com", phone: "+1 555 044 1207", neighbourhood: "The Docks", id_verified: false, rating: null, completed: 1, flags: ["id_mismatch"], status: "suspended", joined: [2026, 8, 12], public_id: 48211 },
  { key: "ada", name: "Ada Brenner", email: "ada.b@example.com", phone: "+1 555 051 3320", neighbourhood: "Millbrook", id_verified: true, id_verified_method: "passport", rating: 5.0, rating_count: 2, completed: 2, status: "in_dispute", joined: [2026, 7, 19] },
  { key: "harbourline", name: "Harbourline Fit-outs Ltd", email: "ops@harbourline.example.com", phone: "+1 555 060 2210", neighbourhood: "The Docks", id_verified: true, id_verified_method: "business registration", rating: null, completed: 0, is_business: true, joined: [2026, 9, 1] },
  { key: "owen", name: "Owen Castellane", email: "owen.c@example.com", neighbourhood: "Old Harbour", id_verified: true, id_verified_method: "driver's licence", rating: 4.8, rating_count: 6, completed: 6, joined: [2024, 11, 3] },
  { key: "maya", name: "Maya Thornton", email: "maya.t@example.com", neighbourhood: "Kestrel Park", id_verified: true, id_verified_method: "driver's licence", rating: 4.7, rating_count: 3, completed: 3, joined: [2025, 5, 22] },
  { key: "amara", name: "Amara Osei", email: "amara.o@example.com", neighbourhood: "Saltway", id_verified: true, id_verified_method: "passport", rating: 4.9, rating_count: 5, completed: 5, joined: [2025, 1, 30] },
  { key: "ridgeway-builders", name: "Ridgeway Builders", email: "site@ridgewaybuilders.example.com", phone: "+1 555 071 8800", neighbourhood: "Ridgeway", id_verified: true, id_verified_method: "business registration", rating: 4.8, rating_count: 14, completed: 16, late: 1, is_business: true, joined: [2023, 4, 11] },
  { key: "saltmarsh-rowing", name: "Saltmarsh Rowing Club", email: "captain@saltmarshrowing.example.com", neighbourhood: "Saltway", id_verified: true, id_verified_method: "business registration", rating: 5.0, rating_count: 3, completed: 3, is_business: true, joined: [2025, 9, 5] },
  { key: "docks-fitout", name: "Docks Fit-out Crew", email: "crew@docksfitout.example.com", neighbourhood: "The Docks", id_verified: true, id_verified_method: "business registration", rating: 4.5, rating_count: 8, completed: 9, is_business: true, joined: [2024, 6, 18] },
  { key: "kestrel-pta", name: "Kestrel Park PTA", email: "events@kestrelparkpta.example.com", neighbourhood: "Kestrel Park", id_verified: true, id_verified_method: "business registration", rating: 4.9, rating_count: 2, completed: 2, is_business: true, joined: [2026, 3, 8] },
  { key: "sofia", name: "Sofia Marin", email: "sofia.m@example.com", neighbourhood: "Vesper Hill", id_verified: true, id_verified_method: "driver's licence", rating: 4.9, rating_count: 9, completed: 9, joined: [2024, 8, 20] },
  { key: "devon", name: "Devon Achebe", email: "devon.a@example.com", neighbourhood: "Northlands", id_verified: true, id_verified_method: "driver's licence", rating: 4.7, rating_count: 4, completed: 4, joined: [2025, 10, 2] },
  { key: "lin", name: "Lin Haverford", email: "lin.h@example.com", neighbourhood: "Old Harbour", id_verified: true, id_verified_method: "passport", rating: 5.0, rating_count: 2, completed: 2, joined: [2026, 4, 14] },
  // provider owners / staff (profiles)
  { key: "dana", name: "Dana Okafor", email: "dana@northlandstoolhire.example.com", phone: "+1 555 090 4210", neighbourhood: "Northlands", role: "provider", id_verified: true, id_verified_method: "business registration", joined: [2018, 6, 4] },
  { key: "sam", name: "Sam Whitfield", email: "sam@northlandstoolhire.example.com", neighbourhood: "Northlands", role: "provider", id_verified: true, joined: [2021, 3, 1] },
  { key: "lena", name: "Lena Marsh", email: "lena@northlandstoolhire.example.com", neighbourhood: "Northlands", role: "provider", id_verified: true, joined: [2023, 9, 12] },
  { key: "millbrook-owner", name: "Millbrook Event Co.", email: "hello@millbrookevents.example.com", phone: "+1 555 100 2200", neighbourhood: "Millbrook", role: "provider", id_verified: true, id_verified_method: "business registration", rating: 4.9, rating_count: 31, completed: 38, is_business: true, joined: [2020, 2, 17] },
  { key: "theo", name: "Theo Marchetti", email: "theo@vespercamera.example.com", neighbourhood: "Vesper Hill", role: "provider", id_verified: true, id_verified_method: "business registration", joined: [2021, 11, 9] },
  { key: "ruth", name: "Ruth Kavanagh", email: "ruth@docksdepot.example.com", neighbourhood: "The Docks", role: "provider", id_verified: true, id_verified_method: "business registration", joined: [2019, 8, 26] },
  { key: "femi", name: "Femi Adeyemi", email: "femi@saltwaymarine.example.com", phone: "+1 555 120 7781", neighbourhood: "Saltway", role: "provider", id_verified: true, id_verified_method: "business registration", joined: [2022, 4, 5] },
  { key: "tomas", name: "Tomas Reinholt", email: "tomas.r@example.com", phone: "+1 555 130 5541", neighbourhood: "Ridgeway", role: "provider", id_verified: true, id_verified_method: "driver's licence", rating: 4.8, rating_count: 19, completed: 21, joined: [2023, 11, 20] },
  { key: "bea", name: "Bea Okonkwo", email: "bea@kestrelpartyhire.example.com", neighbourhood: "Kestrel Park", role: "provider", id_verified: false, joined: [2026, 8, 30] },
  { key: "leo", name: "Leo Stamm", email: "leo.s@example.com", neighbourhood: "Old Harbour", role: "provider", id_verified: false, joined: [2026, 9, 2] },
  // staff
  { key: "ines", name: "Ines Varga", email: "ines@fab.rent", neighbourhood: "Old Harbour", role: "staff", id_verified: true, joined: [2022, 1, 10] },
  { key: "ola", name: "Ola Rasmussen", email: "ola@fab.rent", neighbourhood: "Vesper Hill", role: "staff", id_verified: true, joined: [2025, 1, 6] },
];

export const P = (key: string) => uid(`profile:${key}`);

export interface ProviderSeed {
  key: string;
  kind: "business" | "individual";
  name: string;
  slug: string;
  owner: string;
  staff?: string[];
  address: string;
  neighbourhood: string;
  hours_label: string;
  opening_hours: Record<string, [string, string] | null>;
  verified: boolean;
  insurance_valid_until: SqlValue;
  tax_id: string | null;
  tax_id_verified: boolean;
  payout_account_masked: string | null;
  payout_account_verified: boolean;
  payouts_paused?: string;
  vans?: string[];
  rating: number | null;
  rating_count: number;
  response_minutes: number | null;
  on_time_pct: number | null;
  completed: number;
  years: number;
  about?: string;
  accepting?: boolean;
}

const HOURS_MON_SAT: Record<string, [string, string] | null> = { mon: ["07:00", "18:00"], tue: ["07:00", "18:00"], wed: ["07:00", "18:00"], thu: ["07:00", "18:00"], fri: ["07:00", "18:00"], sat: ["07:00", "18:00"], sun: null };
const HOURS_WEEKDAYS_9_6: Record<string, [string, string] | null> = { mon: ["09:00", "18:00"], tue: ["09:00", "18:00"], wed: ["09:00", "18:00"], thu: ["09:00", "18:00"], fri: ["09:00", "18:00"], sat: ["10:00", "16:00"], sun: null };
const HOURS_7DAYS: Record<string, [string, string] | null> = { mon: ["08:00", "20:00"], tue: ["08:00", "20:00"], wed: ["08:00", "20:00"], thu: ["08:00", "20:00"], fri: ["08:00", "20:00"], sat: ["08:00", "20:00"], sun: ["09:00", "17:00"] };

export const PROVIDERS: ProviderSeed[] = [
  { key: "northlands", kind: "business", name: "Northlands Tool & Hire", slug: "northlands-tool-hire", owner: "dana", staff: ["sam", "lena"], address: "42 Foundry Rd, Northlands", neighbourhood: "Northlands", hours_label: "Mon–Sat 07:00–18:00", opening_hours: HOURS_MON_SAT, verified: true, insurance_valid_until: ymd(2027, 3, 31), tax_id: "PM-88-241-903", tax_id_verified: true, payout_account_masked: "Maren Bank •••• 8812", payout_account_verified: true, vans: ["Van 1"], rating: 4.9, rating_count: 612, response_minutes: 10, on_time_pct: 98, completed: 4120, years: 8, about: "Family-run tool and equipment hire in Northlands since 2018. Every unit is serial-tracked and serviced on a logged schedule." },
  { key: "millbrook", kind: "business", name: "Millbrook Event Co.", slug: "millbrook-event-co", owner: "millbrook-owner", address: "7 Orchard Lane, Millbrook", neighbourhood: "Millbrook", hours_label: "Mon–Sat 09:00–18:00", opening_hours: HOURS_WEEKDAYS_9_6, verified: true, insurance_valid_until: ymd(2027, 1, 15), tax_id: "PM-73-118-220", tax_id_verified: true, payout_account_masked: "Harbour Credit •••• 2201", payout_account_verified: true, vans: ["Van A", "Van B"], rating: 4.8, rating_count: 233, response_minutes: 25, on_time_pct: 96, completed: 1180, years: 6, about: "Tents, seating, lighting and dance floors for weddings and festivals across Port Maren. Delivery and setup included on most items." },
  { key: "vesper", kind: "business", name: "Vesper Camera Collective", slug: "vesper-camera-collective", owner: "theo", address: "12 Lantern St, Vesper Hill", neighbourhood: "Vesper Hill", hours_label: "Tue–Sat 10:00–19:00", opening_hours: { mon: null, tue: ["10:00", "19:00"], wed: ["10:00", "19:00"], thu: ["10:00", "19:00"], fri: ["10:00", "19:00"], sat: ["10:00", "19:00"], sun: null }, verified: true, insurance_valid_until: ymd(2027, 5, 1), tax_id: "PM-91-402-118", tax_id_verified: true, payout_account_masked: "Maren Bank •••• 4470", payout_account_verified: true, rating: 5.0, rating_count: 148, response_minutes: 40, on_time_pct: 99, completed: 720, years: 4, about: "A co-op of working camera operators renting out the kit we use ourselves. Everything is sensor-checked between rentals." },
  { key: "docks", kind: "business", name: "Docks Equipment Depot", slug: "docks-equipment-depot", owner: "ruth", address: "Unit 3, Pier Rd, The Docks", neighbourhood: "The Docks", hours_label: "Mon–Fri 06:30–17:00", opening_hours: { mon: ["06:30", "17:00"], tue: ["06:30", "17:00"], wed: ["06:30", "17:00"], thu: ["06:30", "17:00"], fri: ["06:30", "17:00"], sat: ["08:00", "12:00"], sun: null }, verified: true, insurance_valid_until: ymd(2026, 12, 31), tax_id: "PM-64-009-771", tax_id_verified: true, payout_account_masked: "Dockside Mutual •••• 0193", payout_account_verified: false, payouts_paused: "Bank account verification failed · retry 2", vans: ["Flatbed 1"], rating: 4.7, rating_count: 41, response_minutes: 55, on_time_pct: 93, completed: 860, years: 7, about: "Heavy and site equipment for contractors. Flatbed delivery across the harbour." },
  { key: "saltway", kind: "business", name: "Saltway Marine & Outdoor", slug: "saltway-marine-outdoor", owner: "femi", address: "Saltway Boathouse, 3 Quay Walk, Saltway", neighbourhood: "Saltway", hours_label: "Daily 08:00–20:00", opening_hours: HOURS_7DAYS, verified: true, insurance_valid_until: ymd(2026, 10, 12), tax_id: "PM-55-317-004", tax_id_verified: true, payout_account_masked: "Maren Bank •••• 6650", payout_account_verified: true, rating: 4.7, rating_count: 190, response_minutes: 30, on_time_pct: 95, completed: 612, years: 4, about: "Kayaks, boards, camping and garden kit from the Saltway boathouse." },
  { key: "tomas", kind: "individual", name: "Tomas Reinholt", slug: "tomas-reinholt", owner: "tomas", address: "88 Ridgeway Ave, Ridgeway", neighbourhood: "Ridgeway", hours_label: "Evenings & weekends", opening_hours: { mon: ["17:00", "20:00"], tue: ["17:00", "20:00"], wed: ["17:00", "20:00"], thu: ["17:00", "20:00"], fri: ["17:00", "20:00"], sat: ["09:00", "18:00"], sun: ["09:00", "18:00"] }, verified: true, insurance_valid_until: null, tax_id: null, tax_id_verified: false, payout_account_masked: "Maren Bank •••• 3318", payout_account_verified: true, payouts_paused: "Tax ID missing · payout paused since 1 Sep", rating: 4.9, rating_count: 58, response_minutes: 45, on_time_pct: 97, completed: 214, years: 3, about: "Woodworker renting out my own well-kept tools when I'm not using them." },
  { key: "kestrel", kind: "business", name: "Kestrel Party Hire", slug: "kestrel-party-hire", owner: "bea", address: "5 Meadow Rd, Kestrel Park", neighbourhood: "Kestrel Park", hours_label: "Mon–Sun 09:00–18:00", opening_hours: HOURS_7DAYS, verified: false, insurance_valid_until: null, tax_id: null, tax_id_verified: false, payout_account_masked: null, payout_account_verified: false, rating: null, rating_count: 0, response_minutes: null, on_time_pct: null, completed: 0, years: 0, about: "New to fab.rent — inflatables and party kit for Kestrel Park families.", accepting: true },
  { key: "leo", kind: "individual", name: "Leo Stamm", slug: "leo-stamm", owner: "leo", address: "19 Harbour View, Old Harbour", neighbourhood: "Old Harbour", hours_label: "By arrangement", opening_hours: {}, verified: false, insurance_valid_until: null, tax_id: null, tax_id_verified: false, payout_account_masked: null, payout_account_verified: false, rating: null, rating_count: 0, response_minutes: null, on_time_pct: null, completed: 0, years: 0 },
];

export const PR = (key: string) => uid(`provider:${key}`);

export function providerLatLng(neighbourhood: string) {
  const n = NEIGHBOURHOODS.find((x) => x.name === neighbourhood)!;
  return { lat: n.lat, lng: n.lng };
}

export function emitPeople(sql: Sql) {
  sql.comment("auth.users + profiles");
  sql.insert(
    "auth.users",
    PEOPLE.map((p) => ({
      id: P(p.key),
      email: p.email,
      raw_user_meta_data: { name: p.name, demo: true },
      created_at: raw(`'${p.joined[0]}-${String(p.joined[1]).padStart(2, "0")}-${String(p.joined[2]).padStart(2, "0")}T10:00:00-04:00'::timestamptz`),
      updated_at: day(0, "00:00"),
    })),
    "on conflict (id) do nothing",
  );
  sql.insert(
    "public.profiles",
    PEOPLE.map((p) => {
      const row: Record<string, SqlValue> = {
        id: P(p.key),
        name: p.name,
        email: p.email,
        phone: p.phone ?? null,
        neighbourhood: p.neighbourhood,
        role: p.role ?? "renter",
        id_verified: p.id_verified ?? false,
        id_verified_method: p.id_verified ? p.id_verified_method ?? "driver's licence" : null,
        id_verified_at: p.id_verified ? raw(`'${p.joined[0]}-${String(p.joined[1]).padStart(2, "0")}-${String(p.joined[2]).padStart(2, "0")}T11:00:00-04:00'::timestamptz`) : null,
        rating_from_providers: p.rating ?? null,
        rating_count: p.rating_count ?? 0,
        completed_count: p.completed ?? 0,
        late_return_count: p.late ?? 0,
        flags: textArray(p.flags ?? []),
        status: p.status ?? "active",
        is_business: p.is_business ?? false,
        joined_at: raw(`'${p.joined[0]}-${String(p.joined[1]).padStart(2, "0")}-${String(p.joined[2]).padStart(2, "0")}T10:00:00-04:00'::timestamptz`),
      };
      if (p.public_id) row.public_id = p.public_id;
      return row;
    }),
  );
  sql.rawSql("select setval('public.profiles_public_id_seq', 48300, true);");

  sql.comment("payment methods (masked only — never card data)");
  sql.insert("public.payment_methods", [
    { id: uid("pm:priya-visa"), profile_id: P("priya"), kind: "card", brand: "Visa", last4: "4421", exp_month: 8, exp_year: 2028, is_default: true, provider_ref: "mock_pm_priya_visa" },
    { id: uid("pm:priya-mc"), profile_id: P("priya"), kind: "card", brand: "Mastercard", last4: "9930", exp_month: 2, exp_year: 2027, is_default: false, provider_ref: "mock_pm_priya_mc" },
    { id: uid("pm:jonas-visa"), profile_id: P("jonas"), kind: "card", brand: "Visa", last4: "8813", exp_month: 11, exp_year: 2027, is_default: true, provider_ref: "mock_pm_jonas_visa" },
    { id: uid("pm:marcus-visa"), profile_id: P("marcus"), kind: "card", brand: "Visa", last4: "2210", exp_month: 5, exp_year: 2029, is_default: true, provider_ref: "mock_pm_marcus" },
    { id: uid("pm:elena-mc"), profile_id: P("elena"), kind: "card", brand: "Mastercard", last4: "7702", exp_month: 3, exp_year: 2028, is_default: true, provider_ref: "mock_pm_elena" },
    { id: uid("pm:ada-visa"), profile_id: P("ada"), kind: "card", brand: "Visa", last4: "1188", exp_month: 9, exp_year: 2027, is_default: true, provider_ref: "mock_pm_ada" },
    { id: uid("pm:harbourline-amex"), profile_id: P("harbourline"), kind: "card", brand: "Amex", last4: "3009", exp_month: 1, exp_year: 2029, is_default: true, provider_ref: "mock_pm_harbourline" },
    { id: uid("pm:millbrook-visa"), profile_id: P("millbrook-owner"), kind: "card", brand: "Visa", last4: "5520", exp_month: 6, exp_year: 2028, is_default: true, provider_ref: "mock_pm_millbrook" },
    { id: uid("pm:ridgeway-mc"), profile_id: P("ridgeway-builders"), kind: "card", brand: "Mastercard", last4: "6641", exp_month: 4, exp_year: 2028, is_default: true, provider_ref: "mock_pm_ridgeway" },
    { id: uid("pm:tomas-visa"), profile_id: P("tomas"), kind: "card", brand: "Visa", last4: "9017", exp_month: 10, exp_year: 2027, is_default: true, provider_ref: "mock_pm_tomas" },
    { id: uid("pm:owen-visa"), profile_id: P("owen"), kind: "card", brand: "Visa", last4: "0042", exp_month: 7, exp_year: 2028, is_default: true, provider_ref: "mock_pm_owen" },
    { id: uid("pm:maya-mc"), profile_id: P("maya"), kind: "card", brand: "Mastercard", last4: "3391", exp_month: 12, exp_year: 2026, is_default: true, provider_ref: "mock_pm_maya" },
    { id: uid("pm:amara-visa"), profile_id: P("amara"), kind: "card", brand: "Visa", last4: "7264", exp_month: 2, exp_year: 2028, is_default: true, provider_ref: "mock_pm_amara" },
    { id: uid("pm:kestrelpta-visa"), profile_id: P("kestrel-pta"), kind: "card", brand: "Visa", last4: "8125", exp_month: 5, exp_year: 2027, is_default: true, provider_ref: "mock_pm_kpta" },
    { id: uid("pm:saltmarsh-visa"), profile_id: P("saltmarsh-rowing"), kind: "card", brand: "Visa", last4: "4478", exp_month: 8, exp_year: 2027, is_default: true, provider_ref: "mock_pm_saltmarsh" },
    { id: uid("pm:docksfitout-mc"), profile_id: P("docks-fitout"), kind: "card", brand: "Mastercard", last4: "9902", exp_month: 3, exp_year: 2028, is_default: true, provider_ref: "mock_pm_dfc" },
    { id: uid("pm:sofia-visa"), profile_id: P("sofia"), kind: "card", brand: "Visa", last4: "1133", exp_month: 6, exp_year: 2028, is_default: true, provider_ref: "mock_pm_sofia" },
    { id: uid("pm:devon-visa"), profile_id: P("devon"), kind: "card", brand: "Visa", last4: "5561", exp_month: 4, exp_year: 2027, is_default: true, provider_ref: "mock_pm_devon" },
    { id: uid("pm:lin-mc"), profile_id: P("lin"), kind: "card", brand: "Mastercard", last4: "2087", exp_month: 9, exp_year: 2028, is_default: true, provider_ref: "mock_pm_lin" },
    { id: uid("pm:rowan-visa"), profile_id: P("rowan"), kind: "card", brand: "Visa", last4: "6109", exp_month: 1, exp_year: 2027, is_default: true, provider_ref: "mock_pm_rowan" },
  ]);

  sql.comment("providers");
  sql.insert(
    "public.providers",
    PROVIDERS.map((p) => ({
      id: PR(p.key),
      kind: p.kind,
      name: p.name,
      slug: p.slug,
      owner_profile_id: P(p.owner),
      address: p.address,
      lat: providerLatLng(p.neighbourhood).lat,
      lng: providerLatLng(p.neighbourhood).lng,
      neighbourhood: p.neighbourhood,
      opening_hours: { label: p.hours_label, days: p.opening_hours },
      accepting_bookings: p.accepting ?? true,
      verified: p.verified,
      insurance_valid_until: p.insurance_valid_until,
      tax_id: p.tax_id,
      tax_id_verified: p.tax_id_verified,
      payout_account_masked: p.payout_account_masked,
      payout_account_verified: p.payout_account_verified,
      payout_schedule: "weekly_tue",
      payouts_paused: !!p.payouts_paused,
      payouts_paused_reason: p.payouts_paused ?? null,
      delivery_vans: json(p.vans ?? []),
      rating: p.rating,
      rating_count: p.rating_count,
      response_minutes: p.response_minutes,
      on_time_pct: p.on_time_pct,
      completed_count: p.completed,
      years_on_platform: p.years,
      about: p.about ?? null,
      created_at: day(-365 * Math.max(p.years, 0) - 40),
    })),
  );
  sql.insert(
    "public.provider_members",
    PROVIDERS.flatMap((p) => [
      { id: uid(`member:${p.key}:${p.owner}`), provider_id: PR(p.key), profile_id: P(p.owner), role: "owner" },
      ...(p.staff ?? []).map((s) => ({ id: uid(`member:${p.key}:${s}`), provider_id: PR(p.key), profile_id: P(s), role: "staff" })),
    ]),
  );

  sql.comment("staff");
  sql.insert("public.staff", [
    { id: uid("staff:ines"), profile_id: P("ines"), role: "marketplace_ops", permissions: textArray(["listings", "users", "settings", "disputes", "payouts"]), two_factor: true, resolved_count: 184 },
    { id: uid("staff:ola"), profile_id: P("ola"), role: "trust_safety", permissions: textArray(["disputes", "users"]), two_factor: true, resolved_count: 312 },
  ]);
}
