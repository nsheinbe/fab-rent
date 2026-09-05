import { CONFIG_V41, CONFIG_V42_DRAFT } from "@/lib/settings/defaults";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import { runListingChecks, routeForReview, type CheckContext } from "@/lib/listing-checks";
import { Sql, NOW, day, addHours, addMinutes, uid, rand, textArray, json, type SqlValue } from "./lib";
import { P, PR, PROVIDERS } from "./people";
import { L, LISTINGS, listingBy, type ListingSeed } from "./catalog";

/** Extra pending listings so the review queue holds 23 items (5 detailed + 18 generated). */
const REVIEW_TAIL: Array<{ key: string; provider: string; category: string; title: string; day: number; hold: number; kind: "new" | "edited" | "reported"; hours_ago: number; prev_day?: number; stock?: boolean }> = [
  { key: "rq-1", provider: "saltway", category: "garden-mowers", title: "Husqvarna Automower 315X Robot Mower", day: 40, hold: 400, kind: "new", hours_ago: 44 },
  { key: "rq-2", provider: "docks", category: "construction-generators", title: "Atlas Copco QAS 40 Site Generator", day: 220, hold: 1500, kind: "new", hours_ago: 38 },
  { key: "rq-3", provider: "millbrook", category: "events-inflatables", title: "Giant Connect Four & Garden Games Set", day: 45, hold: 150, kind: "new", hours_ago: 33 },
  { key: "rq-4", provider: "kestrel", category: "events-seating", title: "Folding Chairs · sets of 20", day: 30, hold: 100, kind: "new", hours_ago: 30 },
  { key: "rq-5", provider: "vesper", category: "cameras-lenses", title: "Sony FE 24-70mm f/2.8 GM II", day: 45, hold: 1000, kind: "new", hours_ago: 27 },
  { key: "rq-6", provider: "saltway", category: "outdoor-camping", title: "Rooftop Tent · fits most racks", day: 55, hold: 500, kind: "new", hours_ago: 25 },
  { key: "rq-7", provider: "leo", category: "electronics-gaming", title: "Meta Quest 3 · 512 GB", day: 20, hold: 300, kind: "new", hours_ago: 22 },
  { key: "rq-8", provider: "docks", category: "construction-lifts-access", title: "JLG 450AJ Boom Lift", day: 480, hold: 2500, kind: "new", hours_ago: 18 },
  { key: "rq-9", provider: "millbrook", category: "music-pa", title: "Yamaha Stagepas 1K mk2 Column PA", day: 70, hold: 400, kind: "new", hours_ago: 16 },
  { key: "rq-10", provider: "kestrel", category: "kitchen-appliances", title: "Chocolate Fountain · 4 tier", day: 35, hold: 100, kind: "new", hours_ago: 14 },
  { key: "rq-11", provider: "saltway", category: "outdoor-bikes", title: "Cargo E-bike · Tern GSD", day: 60, hold: 800, kind: "new", hours_ago: 12 },
  { key: "rq-12", provider: "tomas", category: "power-tools-sanders", title: "Festool Domino DF 500 Joiner", day: 35, hold: 400, kind: "new", hours_ago: 9 },
  { key: "rq-13", provider: "vesper", category: "cameras-audio-lighting", title: "Zoom F8n Pro Field Recorder", day: 40, hold: 500, kind: "new", hours_ago: 6 },
  { key: "rq-14", provider: "docks", category: "moving-dollies", title: "Stair-climbing Electric Dolly · 200 kg", day: 45, hold: 300, kind: "new", hours_ago: 4 },
  { key: "rq-15", provider: "northlands", category: "cleaning-floor", title: "Numatic TTB1840 Scrubber Dryer", day: 55, hold: 300, kind: "edited", hours_ago: 40, prev_day: 45 },
  { key: "rq-16", provider: "millbrook", category: "events-tents", title: "30×60 ft Pole Tent", day: 780, hold: 2000, kind: "edited", hours_ago: 21, prev_day: 560 },
  { key: "rq-17", provider: "saltway", category: "outdoor-paddle", title: "Sit-on-top Fishing Kayak", day: 45, hold: 200, kind: "edited", hours_ago: 7, prev_day: 30 },
  { key: "rq-18", provider: "leo", category: "electronics-computers", title: "Sony A7R V \"barely used\"", day: 60, hold: 1500, kind: "reported", hours_ago: 5, stock: true },
];

export function addReviewQueueListings() {
  for (const r of REVIEW_TAIL) {
    const prov = PROVIDERS.find((p) => p.key === r.provider)!;
    LISTINGS.push({
      key: r.key, provider: r.provider, category: r.category, title: r.title, brand: r.title.split(" ")[0]!, condition: "Very good", age_years: 1,
      description: `${r.title} from ${prov.name}. Checked between rentals; condition and serial recorded with you at handoff and return.`,
      specs: [["Condition", "Serviced"]], included: [], day: r.day, weekend: Math.round(r.day * 2.4), week: Math.round(r.day * 3.6), hold: r.hold, hold_waiver: Math.round(r.hold / 3), late_per_hour: Math.max(3, Math.round(r.day / 5)), grace: 60, prep_hours: 1,
      instant: false, pickup: true, delivery: null, rules: ["Return clean and with all accessories"], policy: "flexible", status: "pending_review", quality: 60 + Math.round(rand(r.key) * 25), rating: null, rating_count: 0,
      units: [{ serial: `${r.key.toUpperCase()}-0001`, acquired: [2025, 6] }], extras: [], photos: r.stock ? [{ label: "Stock photo", stock: true }] : [{ label: "Cover" }, { label: "Detail" }, { label: "Serial plate", serial_plate: true }], published_days_ago: 0,
    });
  }
}

const MEDIANS: Record<string, number> = {
  "garden-chainsaws": 5700, "events-inflatables": 15000, "cameras-lenses": 5000, "construction-compactors": 7000, "electronics-computers": 6000, "garden-mowers": 3200, "construction-generators": 9000, "events-seating": 2800, "outdoor-camping": 3500, "electronics-gaming": 2500,
  "construction-lifts-access": 30000, "music-pa": 8000, "kitchen-appliances": 3000, "outdoor-bikes": 4200, "power-tools-sanders": 2400, "cameras-audio-lighting": 4500, "moving-dollies": 2000, "cleaning-floor": 4800, "events-tents": 32000, "outdoor-paddle": 4800,
};

function checksFor(l: ListingSeed, kind: "new" | "edited" | "reported", prevDay?: number) {
  const prov = PROVIDERS.find((p) => p.key === l.provider)!;
  const ctx: CheckContext = {
    category_median_day_cents: MEDIANS[l.category] ?? Math.round(l.day * 100 * 0.9),
    known_serials: new Set<string>(),
    known_photo_hashes: new Set<string>(),
    provider: { completed_count: prov.completed, verified: prov.verified, insurance_valid_until: prov.insurance_valid_until && typeof prov.insurance_valid_until === "object" && "sql" in prov.insurance_valid_until ? new Date(String(prov.insurance_valid_until.sql).slice(1, 11)) : null, kind: prov.kind },
    now: NOW,
  };
  const checks = runListingChecks(
    { title: l.title, description: l.description, day_cents: Math.round(l.day * 100), hold_cents: Math.round(l.hold * 100), photos: (l.photos ?? []).map((p) => ({ has_serial_plate: !!p.serial_plate, is_stock: !!p.stock })), documents: [], unit_serials: l.units.map((u) => u.serial), category_slug: l.category, parent_category_slug: l.category.split("-")[0] === "power" ? "power-tools" : l.category.split("-")[0] },
    ctx,
    CONFIG_V41,
  );
  const route = routeForReview(
    { title: l.title, description: l.description, day_cents: Math.round(l.day * 100), hold_cents: Math.round(l.hold * 100), photos: (l.photos ?? []).map((p) => ({ has_serial_plate: !!p.serial_plate, is_stock: !!p.stock })), documents: [], unit_serials: l.units.map((u) => u.serial), category_slug: l.category },
    { kind, checks, day_cents: Math.round(l.day * 100), previous_day_cents: prevDay ? prevDay * 100 : null },
    ctx,
    CONFIG_V41,
  );
  return { checks, reasons: route.mode === "manual" ? route.reasons : [] };
}

export function emitConfig(sql: Sql) {
  // ---------------------------------------------------------------- cancellation policies
  sql.comment("cancellation policies (mirror of config.cancellation.policies)");
  sql.insert(
    "public.cancellation_policies",
    CONFIG_V41.cancellation.policies.map((p) => ({ id: p.id, name: p.name, short_label: p.short_label ?? null, free_until_hours: p.free_until_hours, tiers: json(p.tiers), provider_cancel_credit_cents: p.provider_cancel_credit_cents, provider_cancel_credit_pct: p.provider_cancel_credit_pct, is_default: p.is_default })),
  );

  // ---------------------------------------------------------------- settings versions
  sql.comment("marketplace settings versions");
  const v40: MarketplaceConfig = { ...CONFIG_V41, market: { ...CONFIG_V41.market, max_delivery_radius_km: 30 } };
  const v39: MarketplaceConfig = { ...v40, cancellation: { policies: v40.cancellation.policies.filter((p) => p.id !== "strict") } };
  sql.insert("public.marketplace_settings_versions", [
    { id: uid("settings:39"), version: 39, config: v39 as unknown as Record<string, unknown>, status: "archived", published_by: P("ines"), published_at: day(-16, "11:20"), change_summary: "Enabled the damage waiver for Cameras & AV", changes: json([{ path: "waiver.categories", from: "Power tools, Construction, Garden", to: "+ Cameras & AV" }]), created_by: P("ines"), created_at: day(-17) },
    { id: uid("settings:40"), version: 40, config: v40 as unknown as Record<string, unknown>, status: "archived", published_by: P("ola"), published_at: day(-8, "15:40"), change_summary: "Added the Strict · events cancellation policy", changes: json([{ path: "cancellation.policies", from: "Flexible, Moderate", to: "+ Strict · events" }]), created_by: P("ola"), created_at: day(-9) },
    { id: uid("settings:41"), version: 41, config: CONFIG_V41 as unknown as Record<string, unknown>, status: "live", published_by: P("ines"), published_at: day(-1, "17:05"), change_summary: "Raised the max delivery radius cap to 50 km", changes: json([{ path: "market.max_delivery_radius_km", from: 30, to: 50 }]), created_by: P("ines"), created_at: day(-2) },
    { id: uid("settings:42"), version: 42, config: CONFIG_V42_DRAFT as unknown as Record<string, unknown>, status: "draft", published_by: null, published_at: null, change_summary: null, changes: json([{ path: "fees.renter_fee_pct", from: 10, to: 11, label: "Renter service fee", note: "Affects every new booking" }, { path: "holds.max_hold_cents", from: 250000, to: 300000, label: "Max hold", note: "Unlocks 12 lift & camera listings currently capped" }]), created_by: P("ines"), created_at: day(0, "08:30") },
  ]);

}

export function emitAdmin(sql: Sql) {
  // ---------------------------------------------------------------- listing review queue (23)
  sql.comment("listing review queue");
  const detailed: Array<{ key: string; kind: "new" | "edited" | "reported"; hours_ago: number; prev_day?: number }> = [
    { key: "stihl-ms271", kind: "new", hours_ago: 26 },
    { key: "bounce-house", kind: "new", hours_ago: 20 },
    { key: "canon-rf70200", kind: "new", hours_ago: 3 },
    { key: "wacker-wp1550", kind: "edited", hours_ago: 2, prev_day: 70 },
    { key: "macbook-pro", kind: "reported", hours_ago: 1 },
  ];
  const queue = [...detailed, ...REVIEW_TAIL.map((r) => ({ key: r.key, kind: r.kind, hours_ago: r.hours_ago, prev_day: r.prev_day }))];
  sql.insert(
    "public.listing_reviews",
    queue.map((q) => {
      const l = listingBy(q.key);
      const { checks, reasons } = checksFor(l, q.kind, q.prev_day);
      const row: Record<string, SqlValue> = {
        id: uid(`lreview:${q.key}`), listing_id: L(q.key), submitted_at: addHours(NOW, -q.hours_ago), kind: q.kind, reasons: textArray(reasons.length ? reasons : ["Category requires manual review"]), checks: json(checks),
        submitted_snapshot: { title: l.title, day_cents: Math.round(l.day * 100), week_cents: l.week != null ? Math.round(l.week * 100) : null, hold_cents: Math.round(l.hold * 100), fulfillment: l.delivery ? (l.pickup ? "Pickup or delivery" : "Delivery only") : `Pickup only · ${PROVIDERS.find((p) => p.key === l.provider)!.address.split(",")[0]}`, rules: l.rules ?? [], description: l.description },
        previous_day_cents: q.prev_day ? q.prev_day * 100 : null, assignee_staff_id: q.key === "stihl-ms271" ? uid("staff:ines") : null, decision: null, sla_paused: false, created_at: addHours(NOW, -q.hours_ago),
      };
      return row;
    }),
  );

  // ---------------------------------------------------------------- admin actions & notes
  sql.comment("admin actions");
  sql.insert("public.admin_actions", [
    { id: uid("action:1"), actor_id: P("ines"), actor_name: "Ines V.", action: "approved 4 listings", target_type: "listing_review", target_id: null, target_label: "4 listings", occurred_at: day(0, "09:12") },
    { id: uid("action:2"), actor_id: P("ola"), actor_name: "Ola R.", action: "resolved D-0899 — split 60/40", target_type: "dispute", target_id: "D-0899", target_label: "D-0899", occurred_at: day(0, "08:50") },
    { id: uid("action:3"), actor_id: null, actor_name: "System", action: "suspended user #48211 after chargeback", target_type: "profile", target_id: P("rowan"), target_label: "#48211", occurred_at: day(0, "07:30") },
    { id: uid("action:4"), actor_id: P("ines"), actor_name: "Ines V.", action: "raised delivery radius cap to 50 km", target_type: "settings", target_id: "41", target_label: "v41", occurred_at: day(-1, "17:05") },
    { id: uid("action:5"), actor_id: P("ola"), actor_name: "Ola R.", action: "added a note on Jonas Kellner", target_type: "profile", target_id: P("jonas"), target_label: "Jonas Kellner", occurred_at: day(-3, "16:10") },
    { id: uid("action:6"), actor_id: P("ola"), actor_name: "Ola R.", action: "published settings v40", target_type: "settings", target_id: "40", target_label: "v40", occurred_at: day(-8, "15:40") },
  ]);
  sql.insert("public.internal_notes", [
    { id: uid("note:jonas"), target_type: "profile", target_id: P("jonas"), author_id: P("ola"), author_name: "Ola R.", body: "Late twice with Northlands; both times messaged ahead. No pattern of damage.", created_at: day(-3, "16:10") },
    { id: uid("note:rowan"), target_type: "profile", target_id: P("rowan"), author_id: null, author_name: "System", body: "Chargeback received on Visa •••• 6109 for FR-ROW2-02. Auto-suspended pending review.", created_at: day(0, "07:30") },
    { id: uid("note:saltway"), target_type: "provider", target_id: PR("saltway"), author_id: P("ines"), author_name: "Ines V.", body: "Insurance renewal reminder sent 1 Sep; Femi confirmed the broker is on it.", created_at: day(-4, "10:00") },
  ]);
  void addMinutes;
}
