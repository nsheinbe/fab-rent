import { Sql, day, dateOnly, slugify, textArray, uid, ymd, cents, raw, rand, json, type SqlValue } from "./lib";
import { PR, PROVIDERS, providerLatLng } from "./people";
import { CATEGORY_RULES } from "@/lib/settings/defaults";

export interface CategorySeed {
  slug: string;
  name: string;
  parent?: string;
  icon?: string;
  count?: number;
}

export const CATEGORIES: CategorySeed[] = [
  { slug: "power-tools", name: "Power tools", icon: "drill", count: 1240 },
  { slug: "construction", name: "Construction", icon: "construction", count: 618 },
  { slug: "garden", name: "Garden", icon: "leaf", count: 402 },
  { slug: "events-party", name: "Events & party", icon: "tent", count: 955 },
  { slug: "cameras-av", name: "Cameras & AV", icon: "camera", count: 377 },
  { slug: "outdoor", name: "Outdoor", icon: "mountain", count: 289 },
  { slug: "cleaning", name: "Cleaning", icon: "drop", count: 164 },
  { slug: "moving", name: "Moving", icon: "truck", count: 120 },
  { slug: "electronics", name: "Electronics", icon: "laptop", count: 96 },
  { slug: "kitchen-catering", name: "Kitchen & catering", icon: "chef", count: 143 },
  { slug: "sports-fitness", name: "Sports & fitness", icon: "bike", count: 88 },
  { slug: "music-stage", name: "Music & stage", icon: "speaker", count: 71 },
  { slug: "baby-family", name: "Baby & family", icon: "stroller", count: 54 },
  { slug: "vehicles-trailers", name: "Vehicles & trailers", icon: "trailer", count: 39 },
  // subcategories
  { slug: "power-tools-table-saws-jobsite", name: "Jobsite table saws", parent: "power-tools" },
  { slug: "power-tools-table-saws-contractor", name: "Contractor saws", parent: "power-tools" },
  { slug: "power-tools-track-saws", name: "Track saws", parent: "power-tools" },
  { slug: "power-tools-mitre-saws", name: "Mitre saws", parent: "power-tools" },
  { slug: "power-tools-drills", name: "Drills & drivers", parent: "power-tools" },
  { slug: "power-tools-combihammers", name: "Combihammers & breakers", parent: "power-tools" },
  { slug: "power-tools-laser-levels", name: "Laser levels", parent: "power-tools" },
  { slug: "power-tools-sanders", name: "Sanders & routers", parent: "power-tools" },
  { slug: "power-tools-nailers", name: "Nailers & compressors", parent: "power-tools" },
  { slug: "construction-lifts-access", name: "Lifts & access", parent: "construction" },
  { slug: "construction-generators", name: "Generators", parent: "construction" },
  { slug: "construction-compactors", name: "Compactors & concrete", parent: "construction" },
  { slug: "construction-ladders", name: "Ladders & scaffolding", parent: "construction" },
  { slug: "garden-chainsaws", name: "Chainsaws", parent: "garden" },
  { slug: "garden-mowers", name: "Mowers & trimmers", parent: "garden" },
  { slug: "garden-blowers", name: "Blowers & shredders", parent: "garden" },
  { slug: "events-tents", name: "Tents & marquees", parent: "events-party" },
  { slug: "events-seating", name: "Chairs & tables", parent: "events-party" },
  { slug: "events-inflatables", name: "Inflatables", parent: "events-party" },
  { slug: "events-lighting", name: "Lighting & décor", parent: "events-party" },
  { slug: "cameras-bodies", name: "Camera bodies", parent: "cameras-av" },
  { slug: "cameras-lenses", name: "Lenses", parent: "cameras-av" },
  { slug: "cameras-projectors", name: "Projectors & screens", parent: "cameras-av" },
  { slug: "cameras-audio-lighting", name: "Audio & lighting", parent: "cameras-av" },
  { slug: "outdoor-paddle", name: "Kayaks & boards", parent: "outdoor" },
  { slug: "outdoor-camping", name: "Camping", parent: "outdoor" },
  { slug: "outdoor-bikes", name: "Bikes & e-bikes", parent: "outdoor" },
  { slug: "cleaning-pressure-washers", name: "Pressure washers", parent: "cleaning" },
  { slug: "cleaning-floor", name: "Floor & carpet", parent: "cleaning" },
  { slug: "moving-dollies", name: "Dollies & trolleys", parent: "moving" },
  { slug: "moving-boxes", name: "Crates & blankets", parent: "moving" },
  { slug: "electronics-computers", name: "Computers", parent: "electronics" },
  { slug: "electronics-gaming", name: "Gaming & VR", parent: "electronics" },
  { slug: "kitchen-appliances", name: "Appliances", parent: "kitchen-catering" },
  { slug: "sports-fitness-gear", name: "Fitness gear", parent: "sports-fitness" },
  { slug: "music-pa", name: "PA & instruments", parent: "music-stage" },
  { slug: "baby-travel", name: "Travel & sleep", parent: "baby-family" },
  { slug: "vehicles-utility-trailers", name: "Utility trailers", parent: "vehicles-trailers" },
];

export const C = (slug: string) => uid(`category:${slug}`);

export interface UnitSeed {
  serial: string;
  acquired: [number, number];
  hours?: number;
  next_service?: SqlValue;
  status?: "rentable" | "service_due" | "in_maintenance" | "retired";
}
export interface ExtraSeed {
  key: string;
  name: string;
  description?: string;
  price: number;
  per: "rental" | "day";
  waiver?: boolean;
  covers?: number;
}
export interface BlockSeed {
  unit?: number; // 1-based, undefined = all units
  start: Date;
  end: Date;
  reason: "off_platform" | "service" | "inspection" | "other";
  note: string;
}
export interface ListingSeed {
  key: string;
  provider: string;
  category: string;
  title: string;
  brand?: string;
  model?: string;
  condition?: string;
  age_years?: number;
  last_serviced?: SqlValue;
  description: string;
  specs?: Array<[string, string]>;
  included?: string[];
  day: number;
  weekend?: number | null;
  week?: number | null;
  month?: number | null;
  hold: number;
  hold_waiver?: number | null;
  late_per_hour?: number;
  grace?: number;
  cleaning?: number;
  min_days?: number;
  max_days?: number;
  prep_hours?: number;
  cutoff?: number;
  instant?: boolean;
  pickup?: boolean;
  pickup_instructions?: string;
  delivery?: { radius: number; window: number; base: number; base_km: number; per_km: number; notes?: string } | null;
  rules?: string[];
  policy?: "flexible" | "moderate" | "strict";
  status?: "draft" | "pending_review" | "changes_requested" | "published" | "hidden" | "rejected";
  quality?: number;
  rating?: number | null;
  rating_count?: number;
  units: UnitSeed[];
  extras?: ExtraSeed[];
  blocks?: BlockSeed[];
  photos?: Array<{ label: string; serial_plate?: boolean; stock?: boolean }>;
  listing_code?: string;
  published_days_ago?: number;
  unit_label?: string;
  id_required?: boolean;
  min_age?: number;
}

export const L = (key: string) => uid(`listing:${key}`);
export const U = (listingKey: string, n: number) => uid(`unit:${listingKey}:${n}`);
export const X = (listingKey: string, extraKey: string) => uid(`extra:${listingKey}:${extraKey}`);

const WAIVER = (price: number, covers = 1500): ExtraSeed => ({ key: "waiver", name: "Damage waiver", description: `Covers accidental damage up to $${covers.toLocaleString()}`, price, per: "day", waiver: true, covers });
const NL_DELIVERY = { radius: 15, window: 2, base: 25, base_km: 5, per_km: 1.5, notes: "Price shown to renters includes collection. Delivery slots come from Van 1's calendar; Sunday collections only 16:00–18:00." };
const NL_PICKUP = "Drive through the gate to bay 2. Bring photo ID. We load the saw and stand into your vehicle — a hatchback or larger is needed.";
const NL_RULES = ["Renter must be 18+ and show photo ID at handoff", "No wet cutting, masonry or metal", "Return clean with all accessories — $25 cleaning fee otherwise", "Late return $15/hour after a 1-hour grace period"];

export const LISTINGS: ListingSeed[] = [
  // ------------------------------------------------------------- Northlands
  {
    key: "dewalt-dwe7491", provider: "northlands", category: "power-tools-table-saws-jobsite",
    title: "DeWalt DWE7491 10-in Jobsite Table Saw with Rolling Stand", brand: "DeWalt", model: "DWE7491RS", condition: "Excellent", age_years: 3, last_serviced: ymd(2026, 8, 21),
    description: "Contractor-grade 10-inch jobsite saw with the rack-and-pinion fence that keeps rip cuts parallel, mounted on DeWalt's rolling stand so one person can move and set it up. Comes with a fresh 24T framing blade fitted; a 60T fine-finish blade is available as an extra. Serviced monthly — belts, arbor and fence alignment are checked and logged.",
    specs: [["Blade", "10 in · 24T fitted"], ["Rip capacity", "32½ in right · 22 in left"], ["Motor", "15 A · 4,800 rpm"], ["Max cut depth", "3⅛ in at 90° · 2¼ in at 45°"], ["Weight", "41 kg with stand"], ["Power", "120 V · dedicated 15 A outlet"]],
    included: ["Rolling stand", "Rip fence", "Mitre gauge", "Push stick", "Blade wrenches ×2", "2½ in dust port adapter"],
    day: 58, weekend: 150, week: 210, month: 640, hold: 300, hold_waiver: 100, late_per_hour: 15, grace: 60, cleaning: 25, min_days: 1, max_days: 30, prep_hours: 4, cutoff: 120, instant: true,
    pickup: true, pickup_instructions: NL_PICKUP, delivery: NL_DELIVERY, rules: NL_RULES, policy: "flexible", status: "published", quality: 96, rating: 4.9, rating_count: 87,
    units: [
      { serial: "DW-7491-0118", acquired: [2023, 3], hours: 612, next_service: ymd(2026, 10, 15) },
      { serial: "DW-7491-0223", acquired: [2023, 11], hours: 488, next_service: ymd(2026, 11, 20) },
      { serial: "DW-7491-0301", acquired: [2025, 2], hours: 301, next_service: dateOnly(day(3)), status: "service_due" },
    ],
    extras: [
      { key: "blade60", name: "Diablo 60T fine-finish blade", description: "Fitted before handoff", price: 12, per: "rental" },
      WAIVER(8),
      { key: "cord", name: "15 m 12-gauge extension cord", price: 5, per: "day" },
    ],
    blocks: [
      { unit: 1, start: day(2, "07:00"), end: day(4, "18:00"), reason: "off_platform", note: "Off-platform hire · Millbrook Event Co." },
      { unit: 3, start: day(3, "07:00"), end: day(3, "18:00"), reason: "service", note: "Scheduled service · arbor bearing, fence alignment" },
      { start: day(16, "07:00"), end: day(17, "18:00"), reason: "inspection", note: "Annual inspection · shows as unavailable to renters" },
    ],
    photos: [{ label: "Cover · saw on stand" }, { label: "Fence & table" }, { label: "Blade guard" }, { label: "Stand folded" }, { label: "Accessories" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 900,
  },
  {
    key: "sawstop-jss", provider: "northlands", category: "power-tools-table-saws-jobsite",
    title: "SawStop JSS-120A60 Jobsite Saw Pro", brand: "SawStop", model: "JSS-120A60", condition: "Excellent", age_years: 1.5, last_serviced: ymd(2026, 8, 30),
    description: "Jobsite saw with SawStop's flesh-detecting brake and a 25½ in rip capacity on a fold-and-roll cart. Ideal for site work where a safe saw matters. One spare brake cartridge is included; if it fires, the cartridge is billed at cost.",
    specs: [["Blade", "10 in · 40T fitted"], ["Rip capacity", "25½ in"], ["Motor", "15 A · 4,000 rpm"], ["Max cut depth", "3⅛ in"], ["Weight", "37 kg"], ["Power", "120 V · 15 A"]],
    included: ["Fold-and-roll cart", "Rip fence", "Mitre gauge", "Push stick", "Spare brake cartridge", "Dust port adapter"],
    day: 79, weekend: 200, week: 290, month: 880, hold: 400, hold_waiver: 130, late_per_hour: 15, grace: 60, cleaning: 25, prep_hours: 3, instant: true, pickup: true, pickup_instructions: NL_PICKUP, delivery: NL_DELIVERY, rules: NL_RULES, policy: "flexible", status: "published", quality: 92, rating: 5.0, rating_count: 12,
    units: [{ serial: "SS-JSS-0410", acquired: [2025, 3], hours: 188, next_service: ymd(2026, 12, 1) }, { serial: "SS-JSS-0411", acquired: [2025, 3], hours: 164, next_service: ymd(2026, 12, 1) }],
    extras: [WAIVER(10), { key: "blade80", name: "80T plywood blade", price: 14, per: "rental" }],
    photos: [{ label: "Cover · saw on cart" }, { label: "Brake cartridge" }, { label: "Fence" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 500,
  },
  {
    key: "honda-eu2200i", provider: "northlands", category: "construction-generators",
    title: "Honda EU2200i Inverter Generator", brand: "Honda", model: "EU2200i", condition: "Excellent", age_years: 2, last_serviced: ymd(2026, 8, 12),
    description: "Quiet 2,200 W inverter generator — runs a fridge, lights and a sound system for a garden party, or power tools on a site without mains. Oil checked and fuel at ¾ at every handoff. Two units can be paralleled with the included cable for 4,400 W.",
    specs: [["Output", "2,200 W peak · 1,800 W rated"], ["Noise", "48–57 dBA"], ["Run time", "up to 8.1 h at ¼ load"], ["Fuel", "0.95 gal tank · unleaded"], ["Weight", "21 kg"], ["Outlets", "2 × 120 V 20 A · 12 V DC"]],
    included: ["Parallel cable", "Fuel cap", "Manual", "12 V charging leads"],
    day: 45, weekend: 120, week: 200, month: 620, hold: 250, hold_waiver: 80, late_per_hour: 12, grace: 60, cleaning: 20, prep_hours: 2, instant: true, pickup: true, pickup_instructions: "Collect from bay 1. We start it with you and show the eco-throttle switch.", delivery: NL_DELIVERY,
    rules: ["Outdoor use only — never inside or near openings", "Fuel is billed at cost if returned below ¾", "Return with fuel cap and parallel cable", "Late return $12/hour after a 1-hour grace period"], policy: "flexible", status: "published", quality: 94, rating: 4.9, rating_count: 64,
    units: [{ serial: "HO-2200-0045", acquired: [2024, 5], hours: 980, next_service: ymd(2026, 10, 1) }, { serial: "HO-2200-0046", acquired: [2024, 5], hours: 1010, next_service: ymd(2026, 10, 1) }, { serial: "HO-2200-0047", acquired: [2025, 6], hours: 420, next_service: ymd(2027, 1, 10) }],
    extras: [WAIVER(6, 1200), { key: "fuel", name: "Full tank at handoff", price: 9, per: "rental" }, { key: "cord50", name: "50 ft outdoor extension cord", price: 4, per: "day" }],
    photos: [{ label: "Cover · generator" }, { label: "Control panel" }, { label: "Parallel cable" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 800,
  },
  {
    key: "karcher-hd512", provider: "northlands", category: "cleaning-pressure-washers",
    title: "Kärcher HD 5/12 C Pressure Washer", brand: "Kärcher", model: "HD 5/12 C", condition: "Very good", age_years: 3, last_serviced: ymd(2026, 7, 28),
    description: "Professional cold-water pressure washer for patios, decking, vehicles and render. 120 bar with a Dirtblaster rotary nozzle for stubborn moss. 10 m hose and a surface cleaner attachment available as an extra.",
    specs: [["Pressure", "120 bar"], ["Flow", "500 l/h"], ["Hose", "10 m"], ["Power", "120 V · 2.3 kW"], ["Weight", "22 kg"], ["Noise", "77 dBA"]],
    included: ["Vario lance", "Dirtblaster nozzle", "10 m hose", "Detergent bottle"],
    day: 49, weekend: 110, week: 180, month: 520, hold: 200, hold_waiver: 60, late_per_hour: 10, grace: 60, cleaning: 15, prep_hours: 2, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Do not run dry — connect water before switching on", "Frost: drain the pump before returning in winter", "Late return $10/hour after a 1-hour grace period"], policy: "flexible", status: "published", quality: 90, rating: 4.8, rating_count: 51,
    units: [{ serial: "KA-512-0091", acquired: [2023, 6], hours: 740, next_service: ymd(2026, 11, 5) }, { serial: "KA-512-0092", acquired: [2023, 6], hours: 702, next_service: ymd(2026, 11, 5) }],
    extras: [WAIVER(5, 800), { key: "surface", name: "Surface cleaner attachment", price: 8, per: "rental" }],
    photos: [{ label: "Cover · washer" }, { label: "Lance & nozzles" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 700,
  },
  {
    key: "bosch-gll3", provider: "northlands", category: "power-tools-laser-levels",
    title: "Bosch GLL3-330CG 360° Green-Beam Laser Level", brand: "Bosch", model: "GLL3-330CG", condition: "Excellent", age_years: 1, last_serviced: ymd(2026, 8, 2),
    description: "Three-plane 360° green laser for tiling, kitchens and partitions. Bluetooth-controlled via the Bosch app. Comes with the BM1 wall mount, tripod and target plate in a hard case.",
    specs: [["Planes", "3 × 360°"], ["Range", "40 m · 100 m with receiver"], ["Accuracy", "±3 mm at 30 m"], ["Battery", "12 V Li-ion · 6 h"]],
    included: ["BM1 wall mount", "Tripod", "Target plate", "Hard case", "Charger"],
    day: 30, weekend: 75, week: 110, month: 320, hold: 250, hold_waiver: 80, late_per_hour: 8, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Do not look into the beam", "Return in the hard case with all mounts"], policy: "flexible", status: "published", quality: 88, rating: 4.7, rating_count: 22,
    units: [{ serial: "BO-330-0007", acquired: [2025, 8], hours: 96, next_service: ymd(2027, 2, 1) }],
    extras: [WAIVER(4, 800), { key: "receiver", name: "LR 8 laser receiver", price: 6, per: "day" }],
    photos: [{ label: "Cover · laser in case" }, { label: "Wall mount" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 380,
  },
  {
    key: "hilti-te70", provider: "northlands", category: "power-tools-combihammers",
    title: "Hilti TE 70-ATC/AVR Combihammer", brand: "Hilti", model: "TE 70-ATC/AVR", condition: "Very good", age_years: 3, last_serviced: ymd(2026, 8, 5),
    description: "Heavy-duty SDS-max combihammer for concrete drilling and chiselling. Active torque control stops the tool if the bit jams; AVR keeps vibration low. Three bits and a depth gauge are in the case.",
    specs: [["Chuck", "TE-Y (SDS-max)"], ["Impact energy", "11.5 J"], ["Drilling range", "12–40 mm · up to 150 mm with core bits"], ["Weight", "8.3 kg"], ["Power", "120 V · 1,800 W"]],
    included: ["Case", "Depth gauge", "3 SDS-max bits", "Grease"],
    day: 72, weekend: 180, week: 260, month: 780, hold: 250, hold_waiver: 85, late_per_hour: 15, grace: 60, cleaning: 20, prep_hours: 2, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Hearing and eye protection required", "Concrete and masonry only", "Grease the bit shank before use", "Late return $15/hour after a 1-hour grace period"], policy: "flexible", status: "published", quality: 90, rating: 4.8, rating_count: 33,
    units: [{ serial: "HI-TE70-0412", acquired: [2023, 5], hours: 530, next_service: ymd(2026, 10, 20) }],
    extras: [WAIVER(9), { key: "corebit", name: "80 mm core bit", price: 18, per: "rental" }],
    blocks: [{ unit: 1, start: day(2, "07:00"), end: day(4, "07:00"), reason: "inspection", note: "Inspection · chuck damage claim" }],
    photos: [{ label: "Cover · combihammer" }, { label: "Chuck & tool holder" }, { label: "Case & bits" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 800,
  },
  {
    key: "genie-gs1930", provider: "northlands", category: "construction-lifts-access",
    title: "Genie GS-1930 Electric Scissor Lift", brand: "Genie", model: "GS-1930", condition: "Very good", age_years: 4, last_serviced: ymd(2026, 8, 18),
    description: "19 ft platform-height electric scissor lift for indoor fit-outs, ceilings and signage. Non-marking tyres, 227 kg platform capacity. Delivered on the flatbed and positioned where you need it. Operator must hold a current licence.",
    specs: [["Platform height", "5.8 m (19 ft)"], ["Working height", "7.8 m"], ["Capacity", "227 kg"], ["Width", "0.76 m"], ["Power", "24 V battery · charger included"]],
    included: ["Onboard charger", "Operator manual", "Guardrail extension"],
    day: 240, weekend: null, week: 960, month: 2800, hold: 1500, hold_waiver: 500, late_per_hour: 40, grace: 60, cleaning: 60, min_days: 1, max_days: 60, prep_hours: 6, cutoff: 240, instant: false, pickup: false, delivery: { radius: 20, window: 2, base: 45, base_km: 5, per_km: 2.5, notes: "Flatbed delivery only. Site must have a level, hard surface and a clear 1 m access path." },
    rules: ["Renter must present a valid MEWP operator licence at handoff", "Indoor and level hard surfaces only", "Do not exceed platform capacity", "Late return $40/hour after a 1-hour grace period"], policy: "strict", status: "published", quality: 91, rating: 4.9, rating_count: 18,
    units: [{ serial: "GE-1930-0002", acquired: [2022, 9], hours: 1420, next_service: ymd(2026, 12, 12) }],
    extras: [WAIVER(28, 4000), { key: "harness", name: "Safety harness & lanyard", price: 15, per: "rental" }],
    photos: [{ label: "Cover · lift" }, { label: "Platform controls" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 1200,
  },
  {
    key: "werner-28", provider: "northlands", category: "construction-ladders",
    title: "Werner 28 ft Fibreglass Extension Ladder", brand: "Werner", model: "D6228-2", condition: "Good", age_years: 5, last_serviced: ymd(2026, 6, 10),
    description: "Type IA fibreglass extension ladder, 28 ft, 136 kg rating. Non-conductive rails for work near power. Fits on a roof rack — straps supplied.",
    specs: [["Length", "28 ft extended · 14 ft closed"], ["Rating", "Type IA · 136 kg"], ["Material", "Fibreglass rails"], ["Weight", "27 kg"]],
    included: ["Roof-rack straps ×2", "Stabiliser bar"],
    day: 22, weekend: 55, week: 85, month: 240, hold: 120, hold_waiver: 40, late_per_hour: 6, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Three points of contact at all times", "Not for use on wet or uneven ground"], policy: "flexible", status: "published", quality: 84, rating: 4.7, rating_count: 29,
    units: [{ serial: "WE-28-0032", acquired: [2021, 4], next_service: ymd(2027, 4, 1) }, { serial: "WE-28-0033", acquired: [2021, 4], next_service: ymd(2027, 4, 1) }],
    extras: [WAIVER(3, 500)],
    photos: [{ label: "Cover · ladder" }, { label: "Feet & stabiliser" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 1500,
  },
  { key: "husqvarna-k770", provider: "northlands", category: "construction-compactors", title: "Husqvarna K 770 14-in Cut-off Saw", brand: "Husqvarna", model: "K 770", condition: "Very good", age_years: 2, last_serviced: ymd(2026, 8, 25), description: "Petrol cut-off saw for concrete, kerbs and paving. Wet-cutting kit fitted; diamond blade included with wear billed by the millimetre. Fuel at ¾ at handoff.", specs: [["Blade", "14 in diamond"], ["Cut depth", "125 mm"], ["Engine", "74 cc · 5 hp"], ["Weight", "10 kg"]], included: ["Wet kit", "Diamond blade", "Fuel can (1 L pre-mix)"], day: 65, weekend: 160, week: 240, hold: 300, hold_waiver: 100, late_per_hour: 15, grace: 60, cleaning: 25, prep_hours: 2, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Full PPE required", "Wet cutting only for concrete", "Late return $15/hour after a 1-hour grace period"], policy: "flexible", status: "published", quality: 89, rating: 4.8, rating_count: 15, units: [{ serial: "HU-K770-0021", acquired: [2024, 3], hours: 210, next_service: ymd(2026, 11, 30) }], extras: [WAIVER(9)], photos: [{ label: "Cover · cut-off saw" }, { label: "Blade" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 600 },
  { key: "bosch-gsh11", provider: "northlands", category: "power-tools-combihammers", title: "Bosch GSH 11 E Demolition Hammer", brand: "Bosch", model: "GSH 11 E", condition: "Good", age_years: 4, last_serviced: ymd(2026, 7, 14), description: "11 kg SDS-max demolition hammer for breaking slabs and removing tile beds. Anti-vibration handle, two chisels in the case.", specs: [["Impact energy", "16.8 J"], ["Weight", "11.1 kg"], ["Power", "120 V · 1,500 W"]], included: ["Case", "Point chisel", "Flat chisel"], day: 55, weekend: 140, week: 210, hold: 250, hold_waiver: 85, late_per_hour: 12, grace: 60, cleaning: 20, prep_hours: 2, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Hearing protection required", "Late return $12/hour after a 1-hour grace period"], policy: "flexible", status: "published", quality: 86, rating: 4.6, rating_count: 19, units: [{ serial: "BO-GSH11-0004", acquired: [2022, 8], hours: 610, next_service: ymd(2026, 10, 8) }], extras: [WAIVER(7)], photos: [{ label: "Cover · hammer" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 1000 },
  { key: "makita-ls1019l", provider: "northlands", category: "power-tools-mitre-saws", title: "Makita LS1019L 10-in Sliding Compound Mitre Saw", brand: "Makita", model: "LS1019L", condition: "Excellent", age_years: 2, last_serviced: ymd(2026, 8, 19), description: "Dual-bevel sliding mitre saw with laser line and rail-forward design so it sits flush against a wall. 60T blade fitted for clean trim cuts.", specs: [["Blade", "10 in · 60T"], ["Crosscut", "312 mm at 90°"], ["Bevel", "0–48° both ways"], ["Weight", "26 kg"]], included: ["Dust bag", "Hold-down clamp", "Blade wrench"], day: 42, weekend: 105, week: 150, hold: 250, hold_waiver: 80, late_per_hour: 10, grace: 60, cleaning: 15, prep_hours: 2, instant: true, pickup: true, delivery: NL_DELIVERY, rules: NL_RULES, policy: "flexible", status: "published", quality: 90, rating: 4.9, rating_count: 27, units: [{ serial: "MK-1019-0102", acquired: [2024, 4], hours: 320, next_service: ymd(2026, 12, 3) }, { serial: "MK-1019-0103", acquired: [2024, 4], hours: 280, next_service: ymd(2026, 12, 3) }], extras: [WAIVER(6)], photos: [{ label: "Cover · mitre saw" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 700 },
  { key: "festool-ts75", provider: "northlands", category: "power-tools-track-saws", title: "Festool TS 75 Track Saw with 1,400 mm Rail", brand: "Festool", model: "TS 75 EQ", condition: "Excellent", age_years: 2, last_serviced: ymd(2026, 8, 1), description: "Plunge-cut track saw for breaking down sheet goods and doors. 75 mm depth handles worktops. Two rails and connectors included for 2.8 m cuts.", specs: [["Blade", "210 mm · 36T"], ["Cut depth", "75 mm"], ["Rails", "2 × 1,400 mm"], ["Power", "120 V · 1,600 W"]], included: ["2 × 1,400 mm rails", "Rail connectors", "Systainer", "Splinter guard"], day: 55, weekend: 140, week: 200, hold: 300, hold_waiver: 100, late_per_hour: 12, grace: 60, cleaning: 15, prep_hours: 2, instant: true, pickup: true, delivery: NL_DELIVERY, rules: NL_RULES, policy: "flexible", status: "published", quality: 92, rating: 5.0, rating_count: 9, units: [{ serial: "FE-TS75-0016", acquired: [2024, 9], hours: 140, next_service: ymd(2027, 3, 1) }], extras: [WAIVER(8)], photos: [{ label: "Cover · track saw" }, { label: "Rails" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 400 },
  { key: "milwaukee-m18", provider: "northlands", category: "power-tools-drills", title: "Milwaukee M18 FUEL Drill & Impact Driver Kit", brand: "Milwaukee", model: "2997-22", condition: "Excellent", age_years: 1, last_serviced: ymd(2026, 8, 20), description: "Brushless hammer drill and impact driver with two 5.0 Ah batteries and a rapid charger. Bit set included.", specs: [["Batteries", "2 × 5.0 Ah"], ["Torque", "1,400 in-lb drill · 2,000 in-lb impact"], ["Charger", "Rapid · 60 min"]], included: ["2 batteries", "Charger", "40-piece bit set", "Bag"], day: 18, weekend: 45, week: 70, hold: 150, hold_waiver: 50, late_per_hour: 5, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Return with both batteries charged where possible"], policy: "flexible", status: "published", quality: 88, rating: 4.9, rating_count: 41, units: [{ serial: "MW-M18-0201", acquired: [2025, 9] }, { serial: "MW-M18-0202", acquired: [2025, 9] }, { serial: "MW-M18-0203", acquired: [2025, 9] }], extras: [WAIVER(3, 600)], photos: [{ label: "Cover · kit" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 300 },
  { key: "wacker-bs60", provider: "northlands", category: "construction-compactors", title: "Wacker Neuson BS 60-4 Trench Rammer", brand: "Wacker Neuson", model: "BS 60-4", condition: "Good", age_years: 3, last_serviced: ymd(2026, 7, 30), description: "Four-stroke jumping jack for compacting trench backfill and footings. 280 mm shoe.", specs: [["Shoe", "280 mm"], ["Impact force", "17 kN"], ["Engine", "Honda GXR120 · 4-stroke"], ["Weight", "66 kg"]], included: ["Transport wheels", "Fuel can (1 L)"], day: 85, weekend: 210, week: 310, hold: 400, hold_waiver: 130, late_per_hour: 18, grace: 60, cleaning: 30, prep_hours: 3, instant: false, pickup: true, delivery: NL_DELIVERY, rules: ["Hearing protection and steel-toe boots required", "Two-person lift"], policy: "moderate", status: "published", quality: 85, rating: 4.7, rating_count: 11, units: [{ serial: "WN-BS60-0007", acquired: [2023, 7], hours: 390, next_service: ymd(2026, 11, 11) }], extras: [WAIVER(12, 2000)], photos: [{ label: "Cover · rammer" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 900 },
  { key: "stihl-br600", provider: "northlands", category: "garden-blowers", title: "Stihl BR 600 Backpack Blower", brand: "Stihl", model: "BR 600", condition: "Very good", age_years: 2, last_serviced: ymd(2026, 8, 28), description: "Professional backpack blower for leaf clearing on large gardens and car parks. Fuel at ¾ at handoff.", specs: [["Air volume", "1,380 m³/h"], ["Engine", "64.8 cc"], ["Weight", "9.8 kg"]], included: ["Harness", "Fuel can (1 L pre-mix)"], day: 25, weekend: 60, week: 95, hold: 150, hold_waiver: 50, late_per_hour: 6, grace: 60, cleaning: 10, prep_hours: 1, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Hearing protection required", "Not before 08:00 in residential areas"], policy: "flexible", status: "published", quality: 86, rating: 4.8, rating_count: 17, units: [{ serial: "ST-BR600-0033", acquired: [2024, 10], hours: 160 }], extras: [WAIVER(3, 600)], photos: [{ label: "Cover · blower" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 550 },
  { key: "dewalt-tile-saw", provider: "northlands", category: "power-tools-table-saws-jobsite", title: "DeWalt D24000 10-in Wet Tile Saw with Stand", brand: "DeWalt", model: "D24000S", condition: "Very good", age_years: 3, last_serviced: ymd(2026, 8, 10), description: "Cantilevered rail wet tile saw for porcelain and stone up to 24 in rip. Water pan and stand included; diamond blade fitted.", specs: [["Blade", "10 in diamond"], ["Rip capacity", "24 in"], ["Diagonal", "18 in tile"], ["Weight", "31 kg"]], included: ["Stand", "Water pan", "Diamond blade", "Side extension"], day: 60, weekend: 150, week: 220, hold: 300, hold_waiver: 100, late_per_hour: 12, grace: 60, cleaning: 25, prep_hours: 3, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Wet cutting only", "Rinse the pan before return — $25 cleaning fee otherwise"], policy: "flexible", status: "published", quality: 88, rating: 4.8, rating_count: 23, units: [{ serial: "DW-24000-0012", acquired: [2023, 9], hours: 410, next_service: ymd(2026, 11, 2) }], extras: [WAIVER(8)], photos: [{ label: "Cover · tile saw" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 800 },
  { key: "dewalt-dcs7485", provider: "northlands", category: "power-tools-table-saws-jobsite", title: "DeWalt DCS7485 FlexVolt 8¼-in Cordless Table Saw", brand: "DeWalt", model: "DCS7485T1", condition: "Excellent", age_years: 1, last_serviced: ymd(2026, 8, 26), description: "Cordless jobsite saw for sites without power. Two FlexVolt 6.0 Ah batteries give a full day of trim cuts.", specs: [["Blade", "8¼ in · 24T"], ["Rip capacity", "24 in"], ["Batteries", "2 × 60 V FlexVolt"], ["Weight", "22 kg"]], included: ["2 batteries", "Charger", "Rip fence", "Push stick"], day: 52, weekend: 130, week: 190, hold: 300, hold_waiver: 100, late_per_hour: 12, grace: 60, cleaning: 20, prep_hours: 2, instant: true, pickup: true, delivery: NL_DELIVERY, rules: NL_RULES, policy: "flexible", status: "published", quality: 90, rating: 4.8, rating_count: 14, units: [{ serial: "DW-7485-0301", acquired: [2025, 9], hours: 88 }], extras: [WAIVER(7)], photos: [{ label: "Cover · cordless saw" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 300 },
  { key: "bosch-gcm12sd", provider: "northlands", category: "power-tools-mitre-saws", title: "Bosch GCM12SD 12-in Axial-Glide Mitre Saw", brand: "Bosch", model: "GCM12SD", condition: "Very good", age_years: 3, last_serviced: ymd(2026, 7, 22), description: "12-inch dual-bevel glide mitre saw for wide crown and decking boards. Compact glide arm needs no rear clearance.", specs: [["Blade", "12 in · 60T"], ["Crosscut", "356 mm"], ["Weight", "29 kg"]], included: ["Dust bag", "Clamp", "Wrench"], day: 48, weekend: 120, week: 175, hold: 250, hold_waiver: 80, late_per_hour: 10, grace: 60, cleaning: 15, prep_hours: 2, instant: true, pickup: true, delivery: NL_DELIVERY, rules: NL_RULES, policy: "flexible", status: "published", quality: 87, rating: 4.7, rating_count: 20, units: [{ serial: "BO-GCM12-0044", acquired: [2023, 5], hours: 450, next_service: ymd(2026, 10, 30) }], extras: [WAIVER(6)], photos: [{ label: "Cover · mitre saw" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 900 },
  { key: "nl-scaffold-tower", provider: "northlands", category: "construction-ladders", title: "BoSS Aluminium Scaffold Tower · 4.2 m Platform", brand: "BoSS", model: "Clima", condition: "Good", age_years: 5, last_serviced: ymd(2026, 6, 2), description: "Mobile aluminium tower with a 4.2 m platform height for gutters, soffits and render. Assembled by two people in 20 minutes; toe boards and guardrails included.", specs: [["Platform height", "4.2 m"], ["Working height", "6.2 m"], ["Load", "275 kg per platform"]], included: ["Guardrails", "Toe boards", "Stabilisers", "Trapdoor platform"], day: 70, weekend: 170, week: 260, hold: 400, hold_waiver: 130, late_per_hour: 15, grace: 60, cleaning: 0, prep_hours: 4, instant: false, pickup: true, delivery: NL_DELIVERY, rules: ["Two-person assembly", "Not to be used in winds above 28 km/h"], policy: "moderate", status: "published", quality: 82, rating: 4.6, rating_count: 12, units: [{ serial: "BS-CLIMA-0002", acquired: [2021, 6] }], extras: [WAIVER(9, 2000)], photos: [{ label: "Cover · tower" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 1500 },
  { key: "nl-floor-sander", provider: "northlands", category: "cleaning-floor", title: "Bona Belt 8-in Floor Sander", brand: "Bona", model: "Belt UX", condition: "Good", age_years: 4, last_serviced: ymd(2026, 7, 5), description: "Belt floor sander for stripping and levelling timber floors. Abrasive belts billed per used belt; dust bag included.", specs: [["Belt", "200 × 750 mm"], ["Motor", "2.2 kW"], ["Weight", "78 kg"]], included: ["Dust bag", "Starter belts ×3", "Ramp"], day: 75, weekend: 180, week: 270, hold: 300, hold_waiver: 100, late_per_hour: 15, grace: 60, cleaning: 30, prep_hours: 3, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Two-person lift", "Empty the dust bag before return"], policy: "flexible", status: "published", quality: 84, rating: 4.7, rating_count: 16, units: [{ serial: "BN-BELT-0009", acquired: [2022, 4], hours: 690, next_service: ymd(2026, 10, 5) }], extras: [WAIVER(9), { key: "belts", name: "Extra belt pack ×5", price: 30, per: "rental" }], photos: [{ label: "Cover · sander" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 1100 },
  { key: "nl-dehumidifier", provider: "northlands", category: "cleaning-floor", title: "Dri-Eaz LGR 3500i Dehumidifier", brand: "Dri-Eaz", model: "LGR 3500i", condition: "Very good", age_years: 2, last_serviced: ymd(2026, 8, 3), description: "Commercial low-grain refrigerant dehumidifier for drying out after leaks or new plaster. Pump-out hose included.", specs: [["Extraction", "up to 70 l/day"], ["Airflow", "400 m³/h"], ["Weight", "48 kg"]], included: ["Pump-out hose", "Casters"], day: 35, weekend: 85, week: 130, month: 380, hold: 200, hold_waiver: 60, late_per_hour: 8, grace: 60, cleaning: 10, prep_hours: 1, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Indoor use only"], policy: "flexible", status: "published", quality: 86, rating: 4.8, rating_count: 13, units: [{ serial: "DE-LGR-0015", acquired: [2024, 2], hours: 2200 }, { serial: "DE-LGR-0016", acquired: [2024, 2], hours: 1900 }], extras: [WAIVER(5, 800)], photos: [{ label: "Cover · dehumidifier" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 600 },
  { key: "nl-nailer", provider: "northlands", category: "power-tools-nailers", title: "Paslode IM360Ci Cordless Framing Nailer", brand: "Paslode", model: "IM360Ci", condition: "Very good", age_years: 2, last_serviced: ymd(2026, 8, 8), description: "Gas-powered framing nailer — no compressor or hose. Two batteries and a fuel cell included; nails billed per strip.", specs: [["Nails", "50–90 mm"], ["Rate", "up to 3 nails/s"], ["Weight", "3.5 kg"]], included: ["2 batteries", "Charger", "Fuel cell", "Case"], day: 28, weekend: 70, week: 105, hold: 200, hold_waiver: 60, late_per_hour: 6, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: NL_DELIVERY, rules: ["Eye protection required", "Return in the case"], policy: "flexible", status: "published", quality: 85, rating: 4.7, rating_count: 18, units: [{ serial: "PA-360-0021", acquired: [2024, 6] }, { serial: "PA-360-0022", acquired: [2024, 6] }], extras: [WAIVER(4, 800)], photos: [{ label: "Cover · nailer" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 650 },
  // ------------------------------------------------------------- Millbrook Event Co.
  {
    key: "frame-tent-20x20", provider: "millbrook", category: "events-tents",
    title: "20×20 ft Frame Tent with Sidewalls", brand: "Anchor", model: "Fiesta 20×20", condition: "Excellent", age_years: 2, last_serviced: ymd(2026, 8, 24),
    description: "Clear-span frame tent seating 40 for dinner or 60 standing. White top with four removable sidewalls, cathedral windows on request. Delivered, staked or weighted, and set up by our crew — setup takes about 90 minutes.",
    specs: [["Footprint", "20 × 20 ft (6.1 × 6.1 m)"], ["Seats", "40 dinner · 60 standing"], ["Height", "2.4 m sides · 3.9 m peak"], ["Anchoring", "Stakes or 250 kg weights"]],
    included: ["4 sidewalls", "Stakes & weights", "Setup and takedown", "Lighting harness"],
    day: 340, weekend: null, week: 1200, hold: 800, hold_waiver: 250, late_per_hour: 50, grace: 120, cleaning: 80, min_days: 1, max_days: 14, prep_hours: 8, cutoff: 480, instant: false, pickup: false,
    delivery: { radius: 25, window: 3, base: 120, base_km: 8, per_km: 3, notes: "Delivery includes setup and takedown by two crew. We need a 24 × 24 ft level area and vehicle access within 30 m." },
    rules: ["No open flames or heaters inside the tent", "Nothing attached to the frame without our crew", "Sidewalls must be down in winds above 40 km/h"], policy: "strict", status: "published", quality: 93, rating: 4.8, rating_count: 46,
    units: [{ serial: "MB-TENT-2020-01", acquired: [2024, 4] }],
    extras: [WAIVER(20, 3000), { key: "windows", name: "Cathedral window sidewalls", price: 60, per: "rental" }, { key: "lighting", name: "Perimeter string lighting", price: 45, per: "rental" }, { key: "heater", name: "Patio heater (outside the tent)", price: 35, per: "day" }],
    blocks: [{ start: day(9, "00:00"), end: day(13, "23:59"), reason: "off_platform", note: "Millbrook Harvest Fair" }],
    photos: [{ label: "Cover · tent at dusk" }, { label: "Interior" }, { label: "Sidewalls" }, { label: "Frame tag", serial_plate: true }],
    published_days_ago: 700,
  },
  {
    key: "chiavari-gold", provider: "millbrook", category: "events-seating",
    title: "Chiavari Chairs, gold · sets of 10", brand: "Chiavari", condition: "Excellent", age_years: 1, last_serviced: ymd(2026, 8, 20),
    description: "Gold resin chiavari chairs with ivory cushions, rented in sets of 10. Stack six high; delivery or pickup from Millbrook. Wipe down before return — a $2 per chair cleaning fee applies otherwise.",
    specs: [["Set", "10 chairs · 10 cushions"], ["Material", "Resin · steel core"], ["Weight", "4 kg per chair"], ["Colour", "Gold with ivory cushion"]],
    included: ["10 ivory cushions per set", "Dolly for 2+ sets"],
    day: 32, weekend: 60, week: 110, hold: 100, hold_waiver: 30, late_per_hour: 8, grace: 120, cleaning: 20, min_days: 1, max_days: 10, prep_hours: 3, cutoff: 240, instant: false, pickup: true, pickup_instructions: "Pickup from the Millbrook warehouse, 7 Orchard Lane — bring a van or trailer for 3+ sets.", delivery: { radius: 25, window: 2, base: 60, base_km: 8, per_km: 2.5 },
    rules: ["Indoor or covered use only", "No standing on chairs", "Return stacked with cushions bagged"], policy: "moderate", status: "published", quality: 88, rating: 4.9, rating_count: 38, unit_label: "set",
    units: Array.from({ length: 12 }, (_, i) => ({ serial: `MB-CHV-${String(i + 1).padStart(3, "0")}`, acquired: [2025, 5] as [number, number] })),
    extras: [WAIVER(2, 400), { key: "sashes", name: "Chair sashes (10)", price: 15, per: "rental" }],
    photos: [{ label: "Cover · chairs in a row" }, { label: "Cushion detail" }, { label: "Stacked sets" }],
    published_days_ago: 480,
  },
  { key: "mb-dance-floor", provider: "millbrook", category: "events-lighting", title: "12×12 ft Portable Dance Floor · oak", brand: "SnapLock", condition: "Very good", age_years: 3, description: "Interlocking oak-look dance floor with aluminium edging, laid by our crew on grass, decking or concrete. 144 sq ft fits about 60 dancers.", specs: [["Size", "12 × 12 ft"], ["Panels", "36 × 2 × 2 ft"], ["Surface", "Oak laminate · non-slip"]], included: ["Edging", "Setup and takedown"], day: 280, week: 900, hold: 500, hold_waiver: 160, late_per_hour: 40, grace: 120, cleaning: 60, prep_hours: 6, instant: false, pickup: false, delivery: { radius: 25, window: 3, base: 90, base_km: 8, per_km: 3 }, rules: ["No stiletto heels on grass installs", "Keep dry — cover if rain is forecast"], policy: "strict", status: "published", quality: 86, rating: 4.8, rating_count: 21, units: [{ serial: "MB-DF-1212-01", acquired: [2023, 6] }], extras: [WAIVER(16, 2500)], photos: [{ label: "Cover · dance floor" }, { label: "Edging" }], published_days_ago: 900 },
  { key: "mb-tables-6ft", provider: "millbrook", category: "events-seating", title: "6 ft Folding Banquet Tables · sets of 4", brand: "Lifetime", condition: "Good", age_years: 3, description: "Heavy-duty 6 ft folding tables seating 6–8 each, in sets of four. Linens available as an extra.", specs: [["Size", "72 × 30 in"], ["Seats", "6–8 per table"], ["Weight", "16 kg each"]], included: ["4 tables per set"], day: 24, weekend: 45, week: 80, hold: 80, hold_waiver: 25, late_per_hour: 6, grace: 120, cleaning: 15, prep_hours: 2, instant: true, pickup: true, delivery: { radius: 25, window: 2, base: 60, base_km: 8, per_km: 2.5 }, rules: ["Wipe clean before return"], policy: "moderate", status: "published", quality: 82, rating: 4.7, rating_count: 33, unit_label: "set", units: Array.from({ length: 6 }, (_, i) => ({ serial: `MB-TBL6-${String(i + 1).padStart(3, "0")}`, acquired: [2023, 5] as [number, number] })), extras: [{ key: "linens", name: "White linens (4)", price: 24, per: "rental" }], photos: [{ label: "Cover · tables" }], published_days_ago: 800 },
  { key: "mb-string-lights", provider: "millbrook", category: "events-lighting", title: "Festoon String Lights · 100 m warm white", brand: "Lumiere", condition: "Excellent", age_years: 1, description: "Commercial festoon lighting, 100 m with warm-white LED bulbs and weatherproof connectors. Includes poles, guy lines and a dimmer.", specs: [["Length", "100 m · 4 × 25 m"], ["Bulbs", "200 × warm white LED"], ["Power", "120 V · 300 W total"]], included: ["6 poles", "Guy lines", "Dimmer", "Spare bulbs ×10"], day: 65, weekend: 150, week: 220, hold: 200, hold_waiver: 60, late_per_hour: 10, grace: 120, cleaning: 20, prep_hours: 2, instant: true, pickup: true, delivery: { radius: 25, window: 2, base: 60, base_km: 8, per_km: 2.5 }, rules: ["Outdoor-rated connectors only", "Return coiled on the reels"], policy: "moderate", status: "published", quality: 90, rating: 4.9, rating_count: 27, units: [{ serial: "MB-LGT-100-01", acquired: [2025, 4] }, { serial: "MB-LGT-100-02", acquired: [2025, 4] }], extras: [WAIVER(4, 800)], photos: [{ label: "Cover · festoon at night" }, { label: "Connector detail" }], published_days_ago: 450 },
  { key: "mb-patio-heater", provider: "millbrook", category: "events-lighting", title: "Stainless Patio Heater · propane", brand: "Fire Sense", condition: "Good", age_years: 3, description: "46,000 BTU mushroom patio heater with a full propane cylinder. Heats a 3 m circle.", specs: [["Output", "46,000 BTU"], ["Height", "2.2 m"], ["Fuel", "20 lb propane · included"]], included: ["Full cylinder", "Wheel kit"], day: 35, weekend: 80, week: 120, hold: 150, hold_waiver: 50, late_per_hour: 6, grace: 120, cleaning: 10, prep_hours: 1, instant: true, pickup: true, delivery: { radius: 25, window: 2, base: 60, base_km: 8, per_km: 2.5 }, rules: ["Outdoor use only", "Return with cylinder — refills billed at cost"], policy: "moderate", status: "published", quality: 80, rating: 4.6, rating_count: 15, units: [{ serial: "MB-HTR-0001", acquired: [2023, 10] }, { serial: "MB-HTR-0002", acquired: [2023, 10] }, { serial: "MB-HTR-0003", acquired: [2024, 10] }], extras: [WAIVER(3, 600)], photos: [{ label: "Cover · heater" }], published_days_ago: 1000 },
  { key: "mb-pa-system", provider: "millbrook", category: "music-pa", title: "Bose L1 Pro16 PA with Sub & Wireless Mics", brand: "Bose", model: "L1 Pro16", condition: "Excellent", age_years: 1, description: "Portable line-array PA for speeches and DJ sets up to 150 guests. Two wireless handheld mics, mixer built in, Bluetooth streaming.", specs: [["Coverage", "up to 150 guests"], ["Inputs", "3 ch + Bluetooth"], ["Mics", "2 × Shure wireless"], ["Weight", "26 kg total"]], included: ["Sub", "2 wireless mics", "Cables", "Stands"], day: 95, weekend: 230, week: 340, hold: 500, hold_waiver: 160, late_per_hour: 15, grace: 120, cleaning: 0, prep_hours: 2, instant: true, pickup: true, delivery: { radius: 25, window: 2, base: 60, base_km: 8, per_km: 2.5 }, rules: ["Indoor or covered outdoor use", "Return cables coiled"], policy: "moderate", status: "published", quality: 92, rating: 4.9, rating_count: 19, units: [{ serial: "BO-L1P16-0004", acquired: [2025, 6], hours: 120 }], extras: [WAIVER(8, 2000)], photos: [{ label: "Cover · PA" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 400 },
  // ------------------------------------------------------------- Vesper Camera Collective
  {
    key: "sony-fx3", provider: "vesper", category: "cameras-bodies",
    title: "Sony FX3 Cinema Camera Body", brand: "Sony", model: "ILME-FX3", condition: "Excellent", age_years: 2, last_serviced: ymd(2026, 8, 29),
    description: "Full-frame cinema camera body with the XLR top handle, four NP-FZ100 batteries, dual charger and two 160 GB CFexpress Type A cards. Sensor cleaned and firmware updated between every rental. Lens not included — pair with one of our RF/E-mount lenses.",
    specs: [["Sensor", "12.1 MP full-frame"], ["Video", "4K 120p · S-Cinetone · S-Log3"], ["Media", "2 × 160 GB CFexpress A"], ["Batteries", "4 × NP-FZ100"], ["Mount", "Sony E"]],
    included: ["XLR top handle", "4 batteries", "Dual charger", "2 × 160 GB cards", "Card reader", "Pelican case"],
    day: 120, weekend: 300, week: 450, month: 1400, hold: 1500, hold_waiver: 500, late_per_hour: 20, grace: 60, cleaning: 0, prep_hours: 2, cutoff: 120, instant: true, pickup: true, pickup_instructions: "Pickup from the studio at 12 Lantern St, Tue–Sat 10:00–19:00. We check the sensor with you.", delivery: null,
    rules: ["No rain or salt-spray use without a rain cover", "Cards must be returned — footage is wiped after 7 days", "Late return $20/hour after a 1-hour grace period"], policy: "moderate", status: "published", quality: 95, rating: 5.0, rating_count: 41,
    units: [{ serial: "SO-FX3-3312", acquired: [2024, 8], hours: 640 }],
    extras: [WAIVER(18, 4000), { key: "monitor", name: "Atomos Ninja V monitor", price: 25, per: "day" }, { key: "cards", name: "Extra 160 GB card", price: 10, per: "rental" }],
    photos: [{ label: "Cover · FX3 with handle" }, { label: "Ports" }, { label: "Kit in case" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 600,
  },
  { key: "canon-rf70200", provider: "vesper", category: "cameras-lenses", title: "Canon RF 70-200mm f/2.8 L IS USM", brand: "Canon", model: "RF 70-200mm f/2.8L", condition: "Excellent", age_years: 0.5, description: "Compact fast telephoto zoom for RF-mount bodies. Optically checked, hood and pouch included. New to the collective this month.", specs: [["Mount", "Canon RF"], ["Aperture", "f/2.8 constant"], ["Stabilisation", "5 stops"], ["Weight", "1,070 g"]], included: ["Hood", "Pouch", "Front & rear caps"], day: 55, weekend: 140, week: 200, hold: 1200, hold_waiver: 400, late_per_hour: 12, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Do not remove the mount adapter", "Late return $12/hour after a 1-hour grace period"], policy: "moderate", status: "pending_review", quality: 91, rating: null, rating_count: 0, units: [{ serial: "CA-RF70200-0091", acquired: [2026, 8] }], extras: [WAIVER(8, 3000)], photos: [{ label: "Cover · lens" }, { label: "Mount" }, { label: "Hood & pouch" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 0 },
  { key: "epson-pu1007", provider: "vesper", category: "cameras-projectors", title: "Epson EB-PU1007 7,000-lumen Laser Projector", brand: "Epson", model: "EB-PU1007", condition: "Very good", age_years: 3, last_serviced: ymd(2026, 7, 8), description: "WUXGA laser projector bright enough for a school hall or a daylight-shaded marquee. Standard lens fitted; 16:10 fast-fold screen available as an extra.", specs: [["Brightness", "7,000 lm"], ["Resolution", "WUXGA 1920×1200"], ["Lens", "1.35–2.20 standard"], ["Weight", "20 kg"]], included: ["Remote", "HDMI 10 m", "Flight case"], day: 85, weekend: 210, week: 320, hold: 800, hold_waiver: 260, late_per_hour: 15, grace: 60, cleaning: 0, prep_hours: 2, instant: true, pickup: true, delivery: { radius: 15, window: 2, base: 35, base_km: 5, per_km: 2 }, rules: ["Do not block the vents", "Power down and cool for 5 minutes before packing"], policy: "moderate", status: "published", quality: 89, rating: 4.7, rating_count: 24, units: [{ serial: "EP-PU1007-0012", acquired: [2023, 8], hours: 1900 }], extras: [WAIVER(12, 2500), { key: "screen", name: "Fast-fold 16:10 screen 12 ft", price: 40, per: "rental" }], photos: [{ label: "Cover · projector" }, { label: "Lens" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 900 },
  { key: "sony-a7iv", provider: "vesper", category: "cameras-bodies", title: "Sony A7 IV Body with 24-105 f/4", brand: "Sony", model: "ILCE-7M4", condition: "Excellent", age_years: 2, description: "Hybrid full-frame body with the versatile 24-105 f/4 G zoom. Two batteries, charger, two 128 GB SD cards.", specs: [["Sensor", "33 MP full-frame"], ["Video", "4K 60p"], ["Lens", "FE 24-105 f/4 G"], ["Media", "2 × 128 GB SD"]], included: ["24-105 lens", "2 batteries", "Charger", "2 × 128 GB cards", "Strap", "Case"], day: 75, weekend: 190, week: 280, hold: 900, hold_waiver: 300, late_per_hour: 15, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Cards must be returned", "Late return $15/hour after a 1-hour grace period"], policy: "moderate", status: "published", quality: 92, rating: 4.9, rating_count: 36, units: [{ serial: "SO-A7M4-1188", acquired: [2024, 5] }, { serial: "SO-A7M4-1190", acquired: [2024, 11] }], extras: [WAIVER(11, 3000)], photos: [{ label: "Cover · A7 IV" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 700 },
  { key: "aputure-600d", provider: "vesper", category: "cameras-audio-lighting", title: "Aputure LS 600d Pro Daylight LED", brand: "Aputure", model: "LS 600d Pro", condition: "Very good", age_years: 2, description: "600 W daylight COB with the Light Dome II softbox and a C-stand. Runs on mains or V-mount (batteries not included).", specs: [["Output", "600 W · 5600 K"], ["Bowens mount", "yes"], ["Control", "Sidus Link app"], ["Weight", "13 kg with ballast"]], included: ["Light Dome II", "C-stand", "Reflector", "Case"], day: 60, weekend: 150, week: 220, hold: 600, hold_waiver: 200, late_per_hour: 12, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Sandbag the stand", "Let the COB cool before packing"], policy: "moderate", status: "published", quality: 88, rating: 4.9, rating_count: 17, units: [{ serial: "AP-600D-0231", acquired: [2024, 3], hours: 800 }], extras: [WAIVER(8, 2000)], photos: [{ label: "Cover · light" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 650 },
  { key: "dji-rs3pro", provider: "vesper", category: "cameras-audio-lighting", title: "DJI RS 3 Pro Gimbal", brand: "DJI", model: "RS 3 Pro", condition: "Excellent", age_years: 1, description: "Carbon-fibre 3-axis gimbal rated to 4.5 kg — balances an FX3 with a cine lens. Ronin image transmitter included.", specs: [["Payload", "4.5 kg"], ["Battery", "12 h"], ["Transmission", "Ronin 1080p"], ["Weight", "1.5 kg"]], included: ["Image transmitter", "Quick-release plate", "Case"], day: 40, weekend: 100, week: 150, hold: 500, hold_waiver: 160, late_per_hour: 10, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Balance before powering on"], policy: "moderate", status: "published", quality: 90, rating: 5.0, rating_count: 14, units: [{ serial: "DJ-RS3P-0410", acquired: [2025, 4] }], extras: [WAIVER(6, 1500)], photos: [{ label: "Cover · gimbal" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 400 },
  { key: "sennheiser-ew", provider: "vesper", category: "cameras-audio-lighting", title: "Sennheiser EW 112P G4 Wireless Lav Kit ×2", brand: "Sennheiser", model: "EW 112P G4", condition: "Very good", age_years: 3, description: "Two channels of wireless lavalier audio for interviews. Fresh AA batteries at handoff, XLR and 3.5 mm outputs.", specs: [["Channels", "2"], ["Range", "100 m"], ["Battery", "8 h on AA"]], included: ["2 transmitters", "2 receivers", "2 ME 2 lavs", "Cables", "Case"], day: 35, weekend: 90, week: 130, hold: 400, hold_waiver: 130, late_per_hour: 8, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Return lav clips and windshields"], policy: "moderate", status: "published", quality: 86, rating: 4.8, rating_count: 22, units: [{ serial: "SE-EW112-0077", acquired: [2023, 9] }], extras: [WAIVER(4, 1000)], photos: [{ label: "Cover · lav kit" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 850 },
  { key: "blackmagic-6kpro", provider: "vesper", category: "cameras-bodies", title: "Blackmagic Pocket Cinema Camera 6K Pro", brand: "Blackmagic", model: "BMPCC 6K Pro", condition: "Very good", age_years: 3, description: "Super 35 6K cinema camera with built-in ND filters, EF mount, two batteries and a 1 TB SSD via the grip.", specs: [["Sensor", "Super 35 6K"], ["Mount", "Canon EF"], ["ND", "2/4/6 stop built in"], ["Media", "1 TB USB-C SSD"]], included: ["Battery grip", "2 batteries", "1 TB SSD", "Charger", "Case"], day: 95, weekend: 240, week: 350, hold: 1200, hold_waiver: 400, late_per_hour: 15, grace: 60, cleaning: 0, prep_hours: 2, instant: true, pickup: true, delivery: null, rules: ["SSD must be returned", "Late return $15/hour after a 1-hour grace period"], policy: "moderate", status: "published", quality: 90, rating: 4.9, rating_count: 20, units: [{ serial: "BM-6KP-0509", acquired: [2023, 6], hours: 900 }], extras: [WAIVER(14, 3500)], photos: [{ label: "Cover · 6K Pro" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 850 },
  // ------------------------------------------------------------- Docks Equipment Depot
  {
    key: "bosch-gts10xc", provider: "docks", category: "power-tools-table-saws-jobsite",
    title: "Bosch GTS 10 XC Table Saw", brand: "Bosch", model: "GTS 10 XC", condition: "Very good", age_years: 3, last_serviced: ymd(2026, 8, 6),
    description: "10-inch jobsite table saw with a 635 mm rip capacity and soft-start. Sliding table for accurate crosscuts. Stand included; flatbed delivery across the harbour.",
    specs: [["Blade", "254 mm · 40T"], ["Rip capacity", "635 mm"], ["Motor", "2,100 W"], ["Weight", "35 kg"]],
    included: ["Stand", "Rip fence", "Sliding table", "Push stick"],
    day: 52, weekend: 130, week: 190, hold: 300, hold_waiver: 100, late_per_hour: 12, grace: 60, cleaning: 20, prep_hours: 2, instant: true, pickup: true, pickup_instructions: "Pier Rd, Unit 3 — ring the bell at the roller door.", delivery: { radius: 15, window: 2, base: 32, base_km: 5, per_km: 2 },
    rules: ["Renter must be 18+ and show photo ID at handoff", "No metal cutting", "Late return $12/hour after a 1-hour grace period"], policy: "flexible", status: "published", quality: 87, rating: 4.7, rating_count: 41,
    units: [{ serial: "BO-GTS10-0140", acquired: [2023, 4], hours: 520, next_service: ymd(2026, 10, 18) }, { serial: "BO-GTS10-0141", acquired: [2023, 4], hours: 498, next_service: ymd(2026, 10, 18) }],
    extras: [WAIVER(7), { key: "blade60", name: "60T fine blade", price: 10, per: "rental" }],
    photos: [{ label: "Cover · saw" }, { label: "Sliding table" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 800,
  },
  { key: "wacker-wp1550", provider: "docks", category: "construction-compactors", title: "Wacker Neuson WP1550 Plate Compactor", brand: "Wacker Neuson", model: "WP1550AW", condition: "Good", age_years: 4, last_serviced: ymd(2026, 7, 19), description: "Forward plate compactor with water tank for asphalt and paving base. 500 mm plate, Honda engine. Recently re-priced to reflect the new plate and wheel kit.", specs: [["Plate", "500 × 585 mm"], ["Force", "15 kN"], ["Engine", "Honda GX160"], ["Weight", "88 kg"]], included: ["Wheel kit", "Water tank", "Paving pad"], day: 85, weekend: 210, week: 300, hold: 400, hold_waiver: 130, late_per_hour: 15, grace: 60, cleaning: 30, prep_hours: 2, instant: false, pickup: true, delivery: { radius: 15, window: 2, base: 32, base_km: 5, per_km: 2 }, rules: ["Two-person lift", "Steel-toe boots required"], policy: "moderate", status: "pending_review", quality: 84, rating: 4.6, rating_count: 12, units: [{ serial: "WN-WP1550-0019", acquired: [2022, 5], hours: 610 }], extras: [WAIVER(12, 2000)], photos: [{ label: "Cover · compactor" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 1100 },
  { key: "docks-mixer", provider: "docks", category: "construction-compactors", title: "Belle Minimix 150 Concrete Mixer", brand: "Belle", model: "Minimix 150", condition: "Good", age_years: 5, description: "Electric tip-up mixer for footings and small slabs — about 90 l per mix. Stand included.", specs: [["Drum", "130 l · 90 l mix"], ["Power", "120 V · 550 W"], ["Weight", "55 kg"]], included: ["Stand", "Extension lead 10 m"], day: 45, weekend: 110, week: 160, hold: 200, hold_waiver: 60, late_per_hour: 10, grace: 60, cleaning: 40, prep_hours: 2, instant: true, pickup: true, delivery: { radius: 15, window: 2, base: 32, base_km: 5, per_km: 2 }, rules: ["Return washed out — $40 cleaning fee otherwise"], policy: "flexible", status: "published", quality: 80, rating: 4.5, rating_count: 26, units: [{ serial: "BE-MM150-0008", acquired: [2021, 3] }, { serial: "BE-MM150-0009", acquired: [2021, 3] }], extras: [WAIVER(5, 800)], photos: [{ label: "Cover · mixer" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 1400 },
  { key: "docks-jackhammer", provider: "docks", category: "power-tools-combihammers", title: "Makita HM1812 70 lb Breaker", brand: "Makita", model: "HM1812", condition: "Good", age_years: 4, description: "Heavy electric breaker with trolley for slabs and foundations. Two chisels, hearing protection required.", specs: [["Impact energy", "72 J"], ["Weight", "32 kg"], ["Power", "120 V · 2,000 W"]], included: ["Trolley", "Point & flat chisels"], day: 80, weekend: 200, week: 290, hold: 350, hold_waiver: 120, late_per_hour: 15, grace: 60, cleaning: 20, prep_hours: 2, instant: true, pickup: true, delivery: { radius: 15, window: 2, base: 32, base_km: 5, per_km: 2 }, rules: ["Full PPE required", "Late return $15/hour after a 1-hour grace period"], policy: "flexible", status: "published", quality: 82, rating: 4.6, rating_count: 14, units: [{ serial: "MK-HM1812-0003", acquired: [2022, 7], hours: 700 }], extras: [WAIVER(11, 2500)], photos: [{ label: "Cover · breaker" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 1200 },
  { key: "docks-pallet-jack", provider: "docks", category: "moving-dollies", title: "Manual Pallet Jack · 2,500 kg", brand: "Crown", model: "PTH50", condition: "Good", age_years: 6, description: "Standard pallet truck for warehouse moves and deliveries. 1,150 mm forks.", specs: [["Capacity", "2,500 kg"], ["Forks", "1,150 × 540 mm"]], included: [], day: 25, weekend: 55, week: 85, hold: 150, hold_waiver: 50, late_per_hour: 5, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: { radius: 15, window: 2, base: 32, base_km: 5, per_km: 2 }, rules: ["Hard, level floors only"], policy: "flexible", status: "published", quality: 76, rating: 4.7, rating_count: 31, units: [{ serial: "CR-PTH50-0101", acquired: [2020, 2] }, { serial: "CR-PTH50-0102", acquired: [2020, 2] }], extras: [], photos: [{ label: "Cover · pallet jack" }], published_days_ago: 1600 },
  { key: "docks-appliance-dolly", provider: "docks", category: "moving-dollies", title: "Appliance Dolly with Straps · 350 kg", brand: "Magliner", condition: "Good", age_years: 4, description: "Stair-climbing appliance dolly with auto-rewind strap and skid plates — for fridges, washers and safes.", specs: [["Capacity", "350 kg"], ["Strap", "auto-rewind 1.8 m"]], included: ["Skid plates", "Moving blankets ×2"], day: 15, weekend: 35, week: 55, hold: 80, hold_waiver: 25, late_per_hour: 4, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: { radius: 15, window: 2, base: 32, base_km: 5, per_km: 2 }, rules: ["Two people for stairs"], policy: "flexible", status: "published", quality: 78, rating: 4.8, rating_count: 44, units: [{ serial: "MG-APP-0031", acquired: [2022, 9] }, { serial: "MG-APP-0032", acquired: [2022, 9] }, { serial: "MG-APP-0033", acquired: [2023, 9] }], extras: [], photos: [{ label: "Cover · dolly" }], published_days_ago: 1200 },
  { key: "docks-utility-trailer", provider: "docks", category: "vehicles-utility-trailers", title: "6×12 ft Utility Trailer with Ramp Gate", brand: "Carry-On", model: "6X12GW", condition: "Good", age_years: 3, description: "Single-axle open trailer with a fold-down ramp, 2-inch ball. Renter's tow vehicle must have working brake lights and a 7-pin connector.", specs: [["Deck", "6 × 12 ft"], ["Payload", "1,250 kg"], ["Hitch", "2 in ball · 7-pin"]], included: ["Ratchet straps ×4", "Spare wheel"], day: 55, weekend: 130, week: 200, hold: 600, hold_waiver: 200, late_per_hour: 12, grace: 60, cleaning: 25, prep_hours: 2, instant: false, pickup: true, delivery: null, rules: ["Valid driving licence and tow-rated vehicle required", "Max 80 km/h"], policy: "moderate", status: "published", quality: 84, rating: 4.7, rating_count: 18, units: [{ serial: "CO-6X12-0002", acquired: [2023, 4] }], extras: [WAIVER(8, 2500)], photos: [{ label: "Cover · trailer" }, { label: "VIN plate", serial_plate: true }], published_days_ago: 900 },
  { key: "docks-scaffold", provider: "docks", category: "construction-ladders", title: "Steel Scaffold Tower · 6 m Platform", brand: "Layher", condition: "Good", age_years: 6, description: "Heavy-duty steel tower for façade and gutter work, delivered flat and assembled by our crew on request.", specs: [["Platform height", "6 m"], ["Load", "300 kg"], ["Base", "1.4 × 2.5 m"]], included: ["Guardrails", "Toe boards", "Stabilisers"], day: 60, weekend: 150, week: 220, hold: 400, hold_waiver: 130, late_per_hour: 12, grace: 60, cleaning: 0, prep_hours: 4, instant: false, pickup: false, delivery: { radius: 15, window: 3, base: 60, base_km: 5, per_km: 2.5 }, rules: ["Assembled by certified crew only"], policy: "moderate", status: "published", quality: 80, rating: 4.5, rating_count: 9, units: [{ serial: "LY-TWR-0011", acquired: [2020, 6] }], extras: [WAIVER(9, 2500), { key: "assembly", name: "Crew assembly & dismantle", price: 120, per: "rental" }], photos: [{ label: "Cover · tower" }], published_days_ago: 1500 },
  // ------------------------------------------------------------- Saltway Marine & Outdoor
  {
    key: "tandem-kayak", provider: "saltway", category: "outdoor-paddle",
    title: "Tandem Sea Kayak with paddles & PFDs", brand: "Wilderness Systems", model: "Pamlico 135T", condition: "Very good", age_years: 3, last_serviced: ymd(2026, 8, 15),
    description: "Stable 13½ ft tandem sit-in kayak for harbour and estuary paddling. Two adjustable paddles, two PFDs, spray skirts and a bilge pump. Launch straight from the boathouse slipway or take it on a roof rack with the foam blocks provided.",
    specs: [["Length", "4.1 m (13½ ft)"], ["Capacity", "227 kg · 2 adults"], ["Weight", "34 kg"], ["Hull", "Polyethylene"]],
    included: ["2 paddles", "2 PFDs", "Spray skirts", "Bilge pump", "Roof-rack foam blocks & straps"],
    day: 65, weekend: 160, week: 240, hold: 200, hold_waiver: 60, late_per_hour: 10, grace: 60, cleaning: 15, min_days: 1, max_days: 14, prep_hours: 1, cutoff: 60, instant: true, pickup: true, pickup_instructions: "Pickup from the Saltway boathouse slipway. Staff help you carry it to the water or your car.", delivery: null,
    rules: ["PFDs must be worn on the water", "Stay inside the harbour breakwater unless experienced", "Rinse with fresh water before return"], policy: "flexible", status: "published", quality: 90, rating: 4.9, rating_count: 58,
    units: [{ serial: "WS-P135T-0301", acquired: [2023, 5] }, { serial: "WS-P135T-0302", acquired: [2023, 5] }, { serial: "WS-P135T-0303", acquired: [2024, 5] }],
    extras: [WAIVER(4, 800), { key: "drybag", name: "30 l dry bag", price: 3, per: "day" }, { key: "wetsuits", name: "Wetsuits ×2", price: 15, per: "rental" }],
    photos: [{ label: "Cover · kayak at the slipway" }, { label: "Cockpits" }, { label: "PFDs & paddles" }, { label: "Hull ID", serial_plate: true }],
    published_days_ago: 1100,
  },
  { key: "stihl-ms271", provider: "saltway", category: "garden-chainsaws", title: "Stihl MS 271 Farm Boss Chainsaw, 20-in bar", brand: "Stihl", model: "MS 271", condition: "Excellent", age_years: 1, last_serviced: ymd(2026, 8, 30), description: "Farm Boss with a 20-in bar and fresh chain, 50.2 cc, serviced this month. Comes with scabbard, 1 L pre-mix fuel, chain file and chaps (M/L). Renter must show they've used a saw before or book the 20-minute intro at pickup.", specs: [["Bar", "20 in"], ["Engine", "50.2 cc · 2.6 kW"], ["Weight", "5.6 kg"], ["Chain", "Rapid Micro · fresh"]], included: ["Scabbard", "1 L pre-mix fuel", "Chain file", "Chaps (M/L)"], day: 79, weekend: null, week: 290, hold: 400, hold_waiver: 130, late_per_hour: 15, grace: 60, cleaning: 20, prep_hours: 2, instant: false, pickup: true, pickup_instructions: "Saltway boathouse, ask for Femi. 20-minute intro available at pickup.", delivery: null, rules: ["Renter must be 18+", "PPE (chaps, eye and hearing protection) required", "No rentals to first-time chainsaw users without the intro"], policy: "moderate", status: "pending_review", quality: 84, rating: null, rating_count: 0, units: [{ serial: "ST-MS271-0088", acquired: [2025, 9], hours: 40 }], extras: [WAIVER(10, 2000), { key: "chain", name: "Spare chain", price: 18, per: "rental" }], photos: [{ label: "Cover · chainsaw" }, { label: "Bar & chain" }, { label: "Chain brake" }, { label: "Chaps" }, { label: "Scabbard" }, { label: "Fuel & file" }, { label: "Serial plate", serial_plate: true }], listing_code: "L-88213", published_days_ago: 0 },
  { key: "sw-sup", provider: "saltway", category: "outdoor-paddle", title: "Inflatable SUP Board 10'6\" with Pump & Leash", brand: "Red Paddle", model: "Ride 10'6", condition: "Very good", age_years: 2, description: "All-round inflatable paddleboard with a carbon paddle, leash, pump and backpack. Rolls into a car boot.", specs: [["Length", "10 ft 6 in"], ["Rider weight", "up to 110 kg"], ["Pack weight", "12 kg"]], included: ["Carbon paddle", "Leash", "Pump", "Backpack", "PFD"], day: 35, weekend: 85, week: 130, hold: 150, hold_waiver: 50, late_per_hour: 6, grace: 60, cleaning: 10, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["PFD must be worn", "Rinse before return"], policy: "flexible", status: "published", quality: 88, rating: 4.8, rating_count: 47, units: [{ serial: "RP-RIDE-0101", acquired: [2024, 4] }, { serial: "RP-RIDE-0102", acquired: [2024, 4] }, { serial: "RP-RIDE-0103", acquired: [2024, 4] }, { serial: "RP-RIDE-0104", acquired: [2025, 4] }], extras: [WAIVER(3, 600)], photos: [{ label: "Cover · SUP" }], published_days_ago: 800 },
  { key: "sw-tent-6p", provider: "saltway", category: "outdoor-camping", title: "6-person Family Tent with Porch", brand: "Vango", model: "Odyssey Air 600", condition: "Very good", age_years: 2, description: "Inflatable-beam family tent, pitched in 10 minutes with the included pump. Two bedrooms and a covered porch; footprint and pegs included.", specs: [["Sleeps", "6"], ["Pack size", "78 × 42 cm"], ["Weight", "23 kg"]], included: ["Pump", "Footprint", "Pegs & mallet", "Repair kit"], day: 40, weekend: 95, week: 150, hold: 200, hold_waiver: 60, late_per_hour: 6, grace: 60, cleaning: 25, prep_hours: 2, instant: true, pickup: true, delivery: null, rules: ["Return dry — $25 cleaning fee for wet or muddy tents"], policy: "flexible", status: "published", quality: 86, rating: 4.7, rating_count: 29, units: [{ serial: "VA-ODY600-0004", acquired: [2024, 6] }, { serial: "VA-ODY600-0005", acquired: [2024, 6] }], extras: [WAIVER(4, 800), { key: "carpet", name: "Tent carpet", price: 8, per: "rental" }], photos: [{ label: "Cover · tent" }], published_days_ago: 750 },
  { key: "sw-cooler", provider: "saltway", category: "outdoor-camping", title: "Yeti Tundra 65 Cooler", brand: "Yeti", model: "Tundra 65", condition: "Good", age_years: 3, description: "Rotomoulded cooler that holds ice for days. Fits 40 cans with ice.", specs: [["Capacity", "65 qt"], ["Weight", "13 kg empty"]], included: ["Dry-goods basket"], day: 12, weekend: 28, week: 45, hold: 80, hold_waiver: 25, late_per_hour: 3, grace: 60, cleaning: 10, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Return rinsed and dry"], policy: "flexible", status: "published", quality: 78, rating: 4.9, rating_count: 61, units: [{ serial: "YE-T65-0201", acquired: [2023, 6] }, { serial: "YE-T65-0202", acquired: [2023, 6] }], extras: [], photos: [{ label: "Cover · cooler" }], published_days_ago: 1000 },
  { key: "sw-ebike", provider: "saltway", category: "outdoor-bikes", title: "Trek Allant+ 7 E-bike · medium", brand: "Trek", model: "Allant+ 7", condition: "Very good", age_years: 2, description: "Bosch-motor commuter e-bike with rack, lights and a lock. 100 km range. Helmet included.", specs: [["Motor", "Bosch Performance CX"], ["Battery", "625 Wh · ~100 km"], ["Frame", "Medium · 170–185 cm"]], included: ["Helmet", "Lock", "Charger", "Rack bag"], day: 45, weekend: 110, week: 170, hold: 600, hold_waiver: 200, late_per_hour: 10, grace: 60, cleaning: 10, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Helmet must be worn", "Lock the bike whenever unattended"], policy: "flexible", status: "published", quality: 88, rating: 4.8, rating_count: 34, units: [{ serial: "TR-ALL7-0044", acquired: [2024, 5] }, { serial: "TR-ALL7-0045", acquired: [2024, 5] }], extras: [WAIVER(7, 2500), { key: "childseat", name: "Child seat", price: 5, per: "day" }], photos: [{ label: "Cover · e-bike" }, { label: "Frame number", serial_plate: true }], published_days_ago: 700 },
  { key: "sw-mower", provider: "saltway", category: "garden-mowers", title: "Honda HRX217 Self-propelled Mower", brand: "Honda", model: "HRX217VKA", condition: "Very good", age_years: 2, description: "21-in self-propelled mulching mower with the Versamow system. Fuel at ¾ at handoff.", specs: [["Cut", "21 in"], ["Engine", "GCV200"], ["Drive", "Select Drive"]], included: ["Bag", "Fuel can (1 L)"], day: 30, weekend: 70, week: 110, hold: 150, hold_waiver: 50, late_per_hour: 6, grace: 60, cleaning: 15, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Return with the deck hosed off"], policy: "flexible", status: "published", quality: 84, rating: 4.7, rating_count: 22, units: [{ serial: "HO-HRX217-0031", acquired: [2024, 4], hours: 210 }], extras: [WAIVER(4, 800)], photos: [{ label: "Cover · mower" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 700 },
  { key: "sw-bbq", provider: "saltway", category: "kitchen-appliances", title: "Weber Q 2200 Portable Gas BBQ", brand: "Weber", model: "Q 2200", condition: "Good", age_years: 3, description: "Portable gas grill with stand and a full gas cylinder — feeds 10 easily at the beach or a picnic.", specs: [["Grill area", "1,806 cm²"], ["Fuel", "Propane · included"]], included: ["Stand", "Full cylinder", "Tongs & brush"], day: 22, weekend: 50, week: 80, hold: 100, hold_waiver: 30, late_per_hour: 4, grace: 60, cleaning: 15, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Return cool and brushed clean"], policy: "flexible", status: "published", quality: 80, rating: 4.8, rating_count: 39, units: [{ serial: "WE-Q2200-0011", acquired: [2023, 7] }, { serial: "WE-Q2200-0012", acquired: [2023, 7] }], extras: [], photos: [{ label: "Cover · BBQ" }], published_days_ago: 1000 },
  // ------------------------------------------------------------- Tomas Reinholt (individual)
  {
    key: "makita-2705x1", provider: "tomas", category: "power-tools-table-saws-contractor",
    title: "Makita 2705X1 Contractor Table Saw + Stand", brand: "Makita", model: "2705X1", condition: "Very good", age_years: 4, last_serviced: ymd(2026, 8, 9),
    description: "My own 10-inch contractor saw on the folding stand — the fence is dead square and the blade is a fresh 40T combination. Pickup only from Ridgeway; I'll help you load it and show you the riving knife.",
    specs: [["Blade", "10 in · 40T"], ["Rip capacity", "25 in"], ["Motor", "15 A · 4,800 rpm"], ["Weight", "33 kg + stand"]],
    included: ["Folding stand", "Rip fence", "Mitre gauge", "Push stick", "Wrenches"],
    day: 45, weekend: 110, week: 170, hold: 250, hold_waiver: 80, late_per_hour: 10, grace: 60, cleaning: 15, prep_hours: 1, cutoff: 60, instant: true, pickup: true, pickup_instructions: "88 Ridgeway Ave — side gate, evenings after 17:00 or weekends.", delivery: null,
    rules: ["No masonry or metal", "Return clean", "Late return $10/hour after a 1-hour grace period"], policy: "flexible", status: "published", quality: 86, rating: 4.9, rating_count: 58,
    units: [{ serial: "MK-2705-0777", acquired: [2022, 6], hours: 380 }],
    extras: [WAIVER(6, 1200), { key: "blade80", name: "80T plywood blade", price: 10, per: "rental" }],
    photos: [{ label: "Cover · saw on stand" }, { label: "Fence" }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 1000,
  },
  { key: "tr-router", provider: "tomas", category: "power-tools-sanders", title: "Bosch 1617EVSPK Router Kit with Table", brand: "Bosch", model: "1617EVSPK", condition: "Very good", age_years: 3, description: "Fixed and plunge bases plus my router table and a 12-piece bit set.", specs: [["Power", "2.25 hp"], ["Collets", "¼ and ½ in"]], included: ["Both bases", "Router table", "12-piece bit set", "Case"], day: 20, weekend: 48, week: 75, hold: 150, hold_waiver: 50, late_per_hour: 5, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Return bits clean"], policy: "flexible", status: "published", quality: 82, rating: 4.9, rating_count: 21, units: [{ serial: "BO-1617-0202", acquired: [2023, 3] }], extras: [WAIVER(3, 600)], photos: [{ label: "Cover · router" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 800 },
  { key: "tr-sander", provider: "tomas", category: "power-tools-sanders", title: "Festool ETS EC 150/5 Sander with Extractor", brand: "Festool", model: "ETS EC 150/5", condition: "Excellent", age_years: 2, description: "Brushless random-orbit sander paired with the CT 15 dust extractor. Practically dust-free finishing. Abrasives included for the first day.", specs: [["Pad", "150 mm"], ["Stroke", "5 mm"], ["Extractor", "CT 15 E"]], included: ["CT 15 extractor", "Hose", "Starter abrasives", "Systainer"], day: 25, weekend: 60, week: 90, hold: 200, hold_waiver: 60, late_per_hour: 6, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Empty the extractor bag before return"], policy: "flexible", status: "published", quality: 88, rating: 5.0, rating_count: 17, units: [{ serial: "FE-ETS150-0033", acquired: [2024, 8] }], extras: [WAIVER(4, 800)], photos: [{ label: "Cover · sander" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 500 },
  { key: "tr-cordless-kit", provider: "tomas", category: "power-tools-drills", title: "Makita 18V LXT 4-tool Combo Kit", brand: "Makita", model: "XT449T", condition: "Very good", age_years: 3, description: "Drill, impact driver, circular saw and recip saw with two 5.0 Ah batteries and a charger in a bag.", specs: [["Batteries", "2 × 5.0 Ah"], ["Tools", "4"]], included: ["2 batteries", "Charger", "Bag"], day: 30, weekend: 70, week: 110, hold: 200, hold_waiver: 60, late_per_hour: 6, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Charge batteries before return where possible"], policy: "flexible", status: "published", quality: 84, rating: 4.8, rating_count: 26, units: [{ serial: "MK-XT449-0012", acquired: [2023, 6] }], extras: [WAIVER(4, 1000)], photos: [{ label: "Cover · kit" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 900 },
  { key: "tr-tile-cutter", provider: "tomas", category: "power-tools-sanders", title: "Rubi TX-900N Manual Tile Cutter", brand: "Rubi", model: "TX-900N", condition: "Good", age_years: 4, description: "Manual cutter for porcelain up to 93 cm. Two scoring wheels.", specs: [["Cut length", "93 cm"], ["Thickness", "6–20 mm"]], included: ["2 scoring wheels", "Case"], day: 18, weekend: 42, week: 65, hold: 100, hold_waiver: 30, late_per_hour: 4, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Wipe the rails before return"], policy: "flexible", status: "published", quality: 78, rating: 4.8, rating_count: 12, units: [{ serial: "RU-TX900-0007", acquired: [2022, 4] }], extras: [], photos: [{ label: "Cover · tile cutter" }], published_days_ago: 1100 },
  { key: "tr-stepladder", provider: "tomas", category: "construction-ladders", title: "Little Giant 6 ft Fibreglass Stepladder", brand: "Little Giant", condition: "Good", age_years: 5, description: "Sturdy 6 ft stepladder with a tool tray. Fits in most estates.", specs: [["Height", "6 ft"], ["Rating", "136 kg"]], included: [], day: 10, weekend: 22, week: 35, hold: 60, hold_waiver: 20, late_per_hour: 3, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: [], policy: "flexible", status: "published", quality: 70, rating: 4.9, rating_count: 15, units: [{ serial: "LG-6FT-0001", acquired: [2021, 8] }], extras: [], photos: [{ label: "Cover · stepladder" }], published_days_ago: 1400 },
  { key: "tr-dremel", provider: "tomas", category: "power-tools-sanders", title: "Dremel 4300 Rotary Tool Kit · 45 pieces", brand: "Dremel", model: "4300-5/40", condition: "Very good", age_years: 2, description: "Rotary tool with flex shaft and 45 accessories for detail sanding, engraving and cutting.", specs: [["Speed", "5,000–35,000 rpm"], ["Accessories", "45"]], included: ["Flex shaft", "45 accessories", "Case"], day: 12, weekend: 28, week: 45, hold: 60, hold_waiver: 20, late_per_hour: 3, grace: 60, cleaning: 0, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: [], policy: "flexible", status: "published", quality: 76, rating: 4.7, rating_count: 9, units: [{ serial: "DR-4300-0555", acquired: [2024, 7] }], extras: [], photos: [{ label: "Cover · Dremel" }], published_days_ago: 600 },
  { key: "tr-planer", provider: "tomas", category: "power-tools-sanders", title: "DeWalt DW735X 13-in Thickness Planer", brand: "DeWalt", model: "DW735X", condition: "Very good", age_years: 3, description: "Two-speed benchtop planer with fresh knives and the in/outfeed tables. Chip ejection fan — bring a bin or connect a vac.", specs: [["Width", "13 in"], ["Depth", "⅛ in per pass"], ["Motor", "15 A"]], included: ["Infeed/outfeed tables", "Spare knives", "Dust hood"], day: 35, weekend: 85, week: 130, hold: 250, hold_waiver: 80, late_per_hour: 8, grace: 60, cleaning: 15, prep_hours: 1, instant: true, pickup: true, delivery: null, rules: ["Dry timber only", "Two-person lift — 42 kg"], policy: "flexible", status: "published", quality: 86, rating: 4.9, rating_count: 14, units: [{ serial: "DW-735X-0088", acquired: [2023, 9], hours: 150 }], extras: [WAIVER(5, 1200)], photos: [{ label: "Cover · planer" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 850 },
  // ------------------------------------------------------------- Kestrel Party Hire (new)
  { key: "bounce-house", provider: "kestrel", category: "events-inflatables", title: "Bounce House 15×15 ft with blower", brand: "Happy Jump", condition: "New", age_years: 0, description: "Brand-new 15 × 15 ft castle bounce house with a 1.5 hp blower, stakes and tarp. We deliver, inflate and anchor it; supervision by an adult at all times.", specs: [["Size", "15 × 15 × 14 ft"], ["Capacity", "8 kids"], ["Blower", "1.5 hp · 120 V"]], included: ["Blower", "Stakes", "Tarp", "Setup"], day: 180, weekend: null, week: 600, hold: 500, hold_waiver: 160, late_per_hour: 25, grace: 120, cleaning: 60, prep_hours: 4, instant: false, pickup: false, delivery: { radius: 15, window: 2, base: 40, base_km: 5, per_km: 2 }, rules: ["Adult supervision at all times", "No shoes, food or sharp objects inside", "Deflate in winds above 25 km/h"], policy: "strict", status: "pending_review", quality: 72, rating: null, rating_count: 0, units: [{ serial: "HJ-1515-0001", acquired: [2026, 8] }], extras: [WAIVER(12, 2000), { key: "generator", name: "Generator if no outlet within 30 m", price: 40, per: "rental" }], photos: [{ label: "Cover · bounce house", stock: true }, { label: "Blower" }], published_days_ago: 0 },
  { key: "kp-popcorn", provider: "kestrel", category: "kitchen-appliances", title: "Popcorn Machine · 8 oz with cart", brand: "Great Northern", condition: "New", age_years: 0, description: "Cinema-style popcorn machine on a red cart. Kernels, oil and 50 bags included.", specs: [["Kettle", "8 oz"], ["Output", "3 gal / batch"]], included: ["Cart", "Kernels & oil for 50 servings", "50 bags"], day: 45, weekend: 100, week: 160, hold: 150, hold_waiver: 50, late_per_hour: 6, grace: 120, cleaning: 25, prep_hours: 2, instant: false, pickup: true, delivery: { radius: 15, window: 2, base: 40, base_km: 5, per_km: 2 }, rules: ["Wipe the kettle before return — $25 cleaning fee otherwise"], policy: "moderate", status: "draft", quality: 60, rating: null, rating_count: 0, units: [{ serial: "GN-POP8-0001", acquired: [2026, 8] }], extras: [], photos: [{ label: "Cover · popcorn cart" }], published_days_ago: 0 },
  { key: "kp-kids-tables", provider: "kestrel", category: "events-seating", title: "Kids Party Tables & Chairs · seats 12", brand: "Kidkraft", condition: "New", age_years: 0, description: "Two low tables and twelve colourful chairs for children's parties.", specs: [["Seats", "12"], ["Table height", "50 cm"]], included: ["2 tables", "12 chairs"], day: 30, weekend: 65, week: 100, hold: 80, hold_waiver: 25, late_per_hour: 4, grace: 120, cleaning: 15, prep_hours: 1, instant: false, pickup: true, delivery: { radius: 15, window: 2, base: 40, base_km: 5, per_km: 2 }, rules: ["Wipe clean before return"], policy: "moderate", status: "draft", quality: 55, rating: null, rating_count: 0, units: [{ serial: "KK-SET12-0001", acquired: [2026, 8] }], extras: [], photos: [], published_days_ago: 0 },
  // ------------------------------------------------------------- Leo Stamm (individual, new) — reported listing
  { key: "macbook-pro", provider: "leo", category: "electronics-computers", title: "\"Like-new\" MacBook Pro 16 M4 Max", brand: "Apple", model: "MacBook Pro 16 (M4 Max)", condition: "Like new", age_years: 0.5, description: "Like-new MacBook Pro 16 with the M4 Max, 64 GB and 2 TB. Perfect for editing on location. Message me for a better price.", specs: [["Chip", "M4 Max"], ["Memory", "64 GB"], ["Storage", "2 TB"]], included: ["Charger"], day: 90, weekend: 220, week: 350, hold: 2500, hold_waiver: null, late_per_hour: 20, grace: 60, cleaning: 0, prep_hours: 1, instant: false, pickup: true, delivery: null, rules: ["No software installs without asking"], policy: "moderate", status: "pending_review", quality: 40, rating: null, rating_count: 0, units: [{ serial: "AP-MBP16-XXXX", acquired: [2026, 3] }], extras: [], photos: [{ label: "Stock photo · front", stock: true }, { label: "Stock photo · side", stock: true }], published_days_ago: 0 },
];

/** Long-tail listings generated with plausible names and prices so search results feel real. */
const TAIL: Array<[string, string, string, number, number]> = [
  // [key, provider, category, day, hold]
  ["nl-angle-grinder", "northlands", "power-tools-drills", 16, 100],
  ["nl-reciprocating-saw", "northlands", "power-tools-drills", 20, 120],
  ["nl-post-hole-auger", "northlands", "garden-mowers", 60, 300],
  ["nl-hedge-trimmer", "northlands", "garden-mowers", 22, 120],
  ["nl-log-splitter", "northlands", "garden-mowers", 75, 400],
  ["nl-wet-vac", "northlands", "cleaning-floor", 25, 100],
  ["nl-carpet-cleaner", "northlands", "cleaning-floor", 38, 150],
  ["nl-moving-blankets", "northlands", "moving-boxes", 12, 60],
  ["nl-hand-truck", "northlands", "moving-dollies", 14, 80],
  ["mb-cocktail-tables", "millbrook", "events-seating", 18, 60],
  ["mb-uplighters", "millbrook", "events-lighting", 55, 200],
  ["mb-marquee-10x10", "millbrook", "events-tents", 140, 400],
  ["vs-tripod-sachtler", "vesper", "cameras-audio-lighting", 30, 400],
  ["vs-drone-mavic3", "vesper", "cameras-bodies", 70, 1000],
  ["vs-projector-4k", "vesper", "cameras-projectors", 60, 500],
  ["dk-plate-compactor-small", "docks", "construction-compactors", 55, 250],
  ["dk-generator-7kw", "docks", "construction-generators", 95, 500],
  ["dk-tile-saw", "docks", "power-tools-table-saws-jobsite", 62, 300],
  ["sw-fishing-kit", "saltway", "outdoor-camping", 20, 80],
  ["sw-bike-rack", "saltway", "outdoor-bikes", 18, 100],
  ["sw-camp-stove", "saltway", "outdoor-camping", 10, 50],
  ["sw-strimmer", "saltway", "garden-mowers", 18, 100],
  ["sw-stroller-double", "saltway", "baby-travel", 15, 100],
  ["sw-spin-bike", "saltway", "sports-fitness-gear", 20, 200],
  ["vs-ps5-vr", "vesper", "electronics-gaming", 35, 400],
];
const TAIL_TITLES: Record<string, [string, string]> = {
  "nl-angle-grinder": ["Metabo 5-in Angle Grinder", "Metabo"],
  "nl-reciprocating-saw": ["Milwaukee Sawzall M18 FUEL", "Milwaukee"],
  "nl-post-hole-auger": ["Stihl BT 131 One-person Earth Auger", "Stihl"],
  "nl-hedge-trimmer": ["Stihl HSA 94 Cordless Hedge Trimmer", "Stihl"],
  "nl-log-splitter": ["Champion 25-ton Log Splitter", "Champion"],
  "nl-wet-vac": ["Kärcher NT 30/1 Wet & Dry Vacuum", "Kärcher"],
  "nl-carpet-cleaner": ["Rug Doctor Pro Carpet Cleaner", "Rug Doctor"],
  "nl-moving-blankets": ["Moving Blankets ×12 with Straps", "US Cargo"],
  "nl-hand-truck": ["Convertible Hand Truck · 350 kg", "Harper"],
  "mb-cocktail-tables": ["Cocktail Tables with Spandex Covers · sets of 4", "Lifetime"],
  "mb-uplighters": ["Wireless LED Uplighters ×8", "Chauvet"],
  "mb-marquee-10x10": ["10×10 ft Pop-up Marquee with Walls", "Ez-Up"],
  "vs-tripod-sachtler": ["Sachtler Ace XL Fluid Head Tripod", "Sachtler"],
  "vs-drone-mavic3": ["DJI Mavic 3 Pro with Fly More Kit", "DJI"],
  "vs-projector-4k": ["BenQ TK850i 4K Projector", "BenQ"],
  "dk-plate-compactor-small": ["Belle PCX 400 Plate Compactor", "Belle"],
  "dk-generator-7kw": ["Honda EU7000iS Generator", "Honda"],
  "dk-tile-saw": ["Rubi DC-250 Wet Tile Saw", "Rubi"],
  "sw-fishing-kit": ["Harbour Fishing Kit · 2 rods & tackle", "Shimano"],
  "sw-bike-rack": ["Thule 2-bike Towbar Rack", "Thule"],
  "sw-camp-stove": ["Coleman 2-burner Camp Stove", "Coleman"],
  "sw-strimmer": ["Husqvarna 525L Petrol Strimmer", "Husqvarna"],
  "sw-stroller-double": ["Thule Urban Glide 2 Double Stroller", "Thule"],
  "sw-spin-bike": ["Keiser M3i Indoor Bike", "Keiser"],
  "vs-ps5-vr": ["PlayStation 5 with PSVR2 and 6 games", "Sony"],
};

for (const [key, provider, category, dayRate, hold] of TAIL) {
  const [title, brand] = TAIL_TITLES[key]!;
  const r = rand(key);
  LISTINGS.push({
    key,
    provider,
    category,
    title,
    brand,
    condition: pick(key + "c", ["Excellent", "Very good", "Good"]),
    age_years: 1 + Math.round(r * 4),
    description: `${title} from ${PROVIDERS.find((p) => p.key === provider)!.name}. Checked and cleaned between every rental; serial and condition photos are recorded with you at handoff and return. Ask us about longer hires — weekly rates apply from 5 days.`,
    specs: [["Condition", "Serviced and tested"], ["Handoff", "Photo ID required"]],
    included: ["Case or bag where applicable"],
    day: dayRate,
    weekend: Math.round(dayRate * 2.4),
    week: Math.round(dayRate * 3.6),
    hold,
    hold_waiver: Math.round(hold / 3),
    late_per_hour: Math.max(3, Math.round(dayRate / 5)),
    grace: 60,
    cleaning: dayRate > 30 ? 15 : 0,
    prep_hours: 1,
    instant: r > 0.3,
    pickup: true,
    delivery: provider === "northlands" ? NL_DELIVERY : provider === "docks" ? { radius: 15, window: 2, base: 32, base_km: 5, per_km: 2 } : provider === "millbrook" ? { radius: 25, window: 2, base: 60, base_km: 8, per_km: 2.5 } : null,
    rules: ["Return clean and with all accessories"],
    policy: "flexible",
    status: "published",
    quality: 70 + Math.round(r * 20),
    rating: +(4.5 + r * 0.5).toFixed(1),
    rating_count: 3 + Math.round(r * 30),
    units: Array.from({ length: 1 + Math.round(r * 2) }, (_, i) => ({ serial: `${key.toUpperCase().slice(0, 12)}-${String(i + 1).padStart(3, "0")}`, acquired: [2023 + Math.round(r * 2), 1 + Math.round(r * 11)] as [number, number] })),
    extras: hold >= 100 ? [WAIVER(Math.max(3, Math.round(dayRate * 0.12)), hold * 4)] : [],
    photos: [{ label: `Cover · ${title.split(" ").slice(0, 3).join(" ")}` }, { label: "Serial plate", serial_plate: true }],
    published_days_ago: 200 + Math.round(r * 900),
  });
}

function pick<T>(key: string, arr: readonly T[]): T {
  return arr[Math.floor(rand(key) * arr.length)]!;
}

export const listingBy = (key: string) => LISTINGS.find((l) => l.key === key)!;
export const policyId = (l: ListingSeed) => l.policy ?? "flexible";

export function emitCatalog(sql: Sql) {
  sql.comment("categories");
  sql.insert(
    "public.categories",
    CATEGORIES.map((c, i) => {
      const rule = CATEGORY_RULES.find((r) => r.category_slug === c.slug) ?? (c.parent ? CATEGORY_RULES.find((r) => r.category_slug === c.parent) : undefined);
      return {
        id: C(c.slug),
        parent_id: c.parent ? C(c.parent) : null,
        name: c.name,
        slug: c.slug,
        icon: c.icon ?? null,
        sort: i,
        review_mode: rule?.review_mode ?? "auto_publish_verified",
        price_alert_pct: rule?.price_alert_pct ?? 35,
        required_documents: json(rule?.required_documents ?? []),
        renter_requirements: textArray(rule?.renter_requirements ?? []),
        listing_count_display: c.count ?? null,
      };
    }),
  );

  sql.comment("listings");
  sql.insert(
    "public.listings",
    LISTINGS.map((l) => {
      const prov = PROVIDERS.find((p) => p.key === l.provider)!;
      const { lat, lng } = providerLatLng(prov.neighbourhood);
      const row: Record<string, SqlValue> = {
        id: L(l.key),
        provider_id: PR(l.provider),
        category_id: C(l.category),
        title: l.title,
        slug: slugify(`${l.title}-${prov.slug.split("-")[0]}`),
        brand: l.brand ?? null,
        model: l.model ?? null,
        condition: l.condition ?? null,
        age_years: l.age_years ?? null,
        last_serviced_at: l.last_serviced ?? null,
        description: l.description,
        specs: json((l.specs ?? []).map(([k, v]) => ({ key: k, value: v }))),
        included_accessories: textArray(l.included ?? []),
        day_cents: cents(l.day),
        weekend_cents: l.weekend != null ? cents(l.weekend) : null,
        week_cents: l.week != null ? cents(l.week) : null,
        month_cents: l.month != null ? cents(l.month) : null,
        hold_cents: cents(l.hold),
        hold_with_waiver_cents: l.hold_waiver != null ? cents(l.hold_waiver) : null,
        late_fee_cents_per_hour: cents(l.late_per_hour ?? 0),
        late_grace_minutes: l.grace ?? 60,
        cleaning_fee_cents: cents(l.cleaning ?? 0),
        min_days: l.min_days ?? 1,
        max_days: l.max_days ?? 30,
        prep_hours: l.prep_hours ?? 2,
        same_day_cutoff_minutes: l.cutoff ?? 120,
        instant_book: l.instant ?? false,
        pickup_enabled: l.pickup ?? true,
        pickup_address: (l.pickup ?? true) ? prov.address : null,
        pickup_lat: lat,
        pickup_lng: lng,
        pickup_hours: { label: prov.hours_label, days: prov.opening_hours },
        pickup_hours_label: prov.hours_label,
        pickup_instructions: l.pickup_instructions ?? null,
        delivery_enabled: !!l.delivery,
        delivery_radius_km: l.delivery?.radius ?? 15,
        delivery_window_hours: l.delivery?.window ?? 2,
        delivery_base_cents: cents(l.delivery?.base ?? 0),
        delivery_base_km: l.delivery?.base_km ?? 5,
        delivery_per_km_cents: cents(l.delivery?.per_km ?? 0),
        delivery_notes: l.delivery?.notes ?? null,
        rules: textArray(l.rules ?? []),
        id_required: l.id_required ?? true,
        min_renter_age: l.min_age ?? 18,
        cancellation_policy_id: policyId(l),
        status: l.status ?? "published",
        quality_score: l.quality ?? null,
        rating: l.rating ?? null,
        rating_count: l.rating_count ?? 0,
        published_at: (l.status ?? "published") === "published" ? day(-(l.published_days_ago ?? 100)) : null,
        created_at: day(-(l.published_days_ago ?? 100) - 2),
      };
      if (l.listing_code) row.listing_code = l.listing_code;
      return row;
    }),
  );
  sql.rawSql("select setval('public.listing_code_seq', 88300, true);");

  sql.comment("listing photos (drop slots — storage_path null until a real photo is uploaded)");
  sql.insert(
    "public.listing_photos",
    LISTINGS.flatMap((l) =>
      (l.photos ?? []).map((p, i) => ({
        id: uid(`photo:${l.key}:${i}`),
        listing_id: L(l.key),
        storage_path: null,
        label: p.label,
        sort: i,
        is_cover: i === 0,
        has_serial_plate: !!p.serial_plate,
        is_stock: !!p.stock,
        photo_hash: p.stock ? `stock-${slugify(p.label)}` : null,
      })),
    ),
  );

  sql.comment("listing extras");
  sql.insert(
    "public.listing_extras",
    LISTINGS.flatMap((l) =>
      (l.extras ?? []).map((x, i) => ({
        id: X(l.key, x.key),
        listing_id: L(l.key),
        name: x.name,
        description: x.description ?? null,
        price_cents: cents(x.price),
        per: x.per,
        is_damage_waiver: !!x.waiver,
        waiver_covers_cents: x.waiver ? cents(x.covers ?? 1500) : null,
        sort: i,
      })),
    ),
  );

  sql.comment("units");
  sql.insert(
    "public.units",
    LISTINGS.flatMap((l) =>
      l.units.map((u, i) => ({
        id: U(l.key, i + 1),
        listing_id: L(l.key),
        unit_number: i + 1,
        serial: u.serial,
        acquired_at: ymd(u.acquired[0], u.acquired[1], 1),
        hours: u.hours ?? null,
        next_service_at: u.next_service ?? null,
        status: u.status ?? "rentable",
      })),
    ),
  );

  sql.comment("availability blocks");
  sql.insert(
    "public.availability_blocks",
    LISTINGS.flatMap((l) =>
      (l.blocks ?? []).map((b, i) => ({
        id: uid(`block:${l.key}:${i}`),
        listing_id: L(l.key),
        unit_id: b.unit ? U(l.key, b.unit) : null,
        start_at: b.start,
        end_at: b.end,
        reason: b.reason,
        note: b.note,
      })),
    ),
  );

  sql.comment("listing documents");
  sql.insert("public.listing_documents", [
    { id: uid("doc:genie-inspection"), listing_id: L("genie-gs1930"), key: "inspection_cert", label: "Inspection certificate", storage_path: null, issued_at: ymd(2026, 6, 14) },
    { id: uid("doc:trailer-reg"), listing_id: L("docks-utility-trailer"), key: "registration", label: "Registration & insurance", storage_path: null, issued_at: ymd(2026, 2, 1) },
  ]);
}

export { raw };
