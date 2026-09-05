import { describe, expect, it } from "vitest";
import { listingQuality, routeForReview, runListingChecks, summarizeChecks, type CheckContext, type ListingForChecks } from "@/lib/listing-checks";
import { CONFIG_BRIEF } from "@/lib/settings/defaults";

const now = new Date("2026-09-05T14:00:00Z");
const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({
  category_median_day_cents: 5700,
  known_serials: new Set(["HI-TE70-0412"]),
  known_photo_hashes: new Set(["abc"]),
  provider: { completed_count: 612, verified: true, insurance_valid_until: new Date("2026-10-12T00:00:00Z"), kind: "business" },
  now,
  ...over,
});
const chainsaw: ListingForChecks = {
  title: "Stihl MS 271 Farm Boss Chainsaw, 20-in bar",
  description:
    "Farm Boss with a 20-in bar and fresh chain, 50.2 cc, serviced this month. Comes with scabbard, 1 L pre-mix fuel, chain file and chaps (M/L). Renter must show they've used a saw before or book the 20-minute intro at pickup.",
  day_cents: 7900,
  hold_cents: 40000,
  photos: Array.from({ length: 7 }, (_, i) => ({ has_serial_plate: i === 2 })),
  documents: [],
  unit_serials: ["ST-271-0088"],
  category_slug: "garden-chainsaws",
  parent_category_slug: "garden",
};

describe("automated listing checks (A03)", () => {
  const checks = runListingChecks(chainsaw, ctx(), CONFIG_BRIEF);
  it("passes photos, description and duplicates", () => {
    expect(checks.find((c) => c.key === "photos")).toMatchObject({ status: "pass", message: "Photos: 7 originals, serial plate visible, no stock imagery" });
    expect(checks.find((c) => c.key === "description")?.status).toBe("pass");
    expect(checks.find((c) => c.key === "duplicate")?.status).toBe("pass");
  });
  it("flags the +38% price and the missing chain-brake certificate", () => {
    expect(checks.find((c) => c.key === "price")).toMatchObject({ status: "warning" });
    expect(checks.find((c) => c.key === "price")?.message).toContain("+38%");
    expect(checks.find((c) => c.key === "documents")).toMatchObject({ status: "required" });
    expect(checks.find((c) => c.key === "documents")?.message).toContain("Chain-brake safety check certificate");
    expect(summarizeChecks(checks)).toEqual({ label: "1 required", tone: "error" });
  });
  it("routes to manual review for the chainsaw category", () => {
    const route = routeForReview(chainsaw, { kind: "new", checks, day_cents: 7900 }, ctx(), CONFIG_BRIEF);
    expect(route.mode).toBe("manual");
    if (route.mode === "manual") expect(route.reasons).toContain("Category requires manual review");
  });
  it("auto-publishes a clean power-tool listing from a verified, experienced provider", () => {
    const saw: ListingForChecks = { ...chainsaw, category_slug: "power-tools-table-saws", parent_category_slug: "power-tools", day_cents: 5800 };
    const c = runListingChecks(saw, ctx({ category_median_day_cents: 5500 }), CONFIG_BRIEF);
    expect(c.every((x) => x.status === "pass")).toBe(true);
    expect(routeForReview(saw, { kind: "new", checks: c, day_cents: 5800 }, ctx(), CONFIG_BRIEF)).toEqual({ mode: "auto_publish" });
    expect(summarizeChecks(c)).toEqual({ label: "All checks passed", tone: "ok" });
  });
  it("always reviews new providers and big price edits", () => {
    const saw: ListingForChecks = { ...chainsaw, category_slug: "power-tools-table-saws", parent_category_slug: "power-tools", day_cents: 5800 };
    const c = runListingChecks(saw, ctx({ category_median_day_cents: 5500 }), CONFIG_BRIEF);
    const newbie = routeForReview(saw, { kind: "new", checks: c, day_cents: 5800 }, ctx({ provider: { completed_count: 2, verified: true, insurance_valid_until: new Date("2027-01-01"), kind: "individual" } }), CONFIG_BRIEF);
    expect(newbie.mode).toBe("manual");
    const edited = routeForReview(saw, { kind: "edited", checks: c, day_cents: 8200, previous_day_cents: 5800 }, ctx(), CONFIG_BRIEF);
    expect(edited.mode).toBe("manual");
    if (edited.mode === "manual") expect(edited.reasons[0]).toBe("Price changed +41%");
    const small = routeForReview(saw, { kind: "edited", checks: c, day_cents: 6000, previous_day_cents: 5800 }, ctx(), CONFIG_BRIEF);
    expect(small.mode).toBe("auto_publish");
  });
  it("requires insurance for a business without it and flags stock photos", () => {
    const bounce: ListingForChecks = { ...chainsaw, title: "Bounce House 15×15 ft with blower", category_slug: "events-inflatables", parent_category_slug: "events-party", photos: [{ has_serial_plate: false, is_stock: true }, { has_serial_plate: false }] };
    const c = runListingChecks(bounce, ctx({ provider: { completed_count: 0, verified: false, insurance_valid_until: null, kind: "business" }, category_median_day_cents: null }), CONFIG_BRIEF);
    expect(c.find((x) => x.key === "insurance")).toMatchObject({ status: "required", message: "Business insurance not uploaded" });
    expect(c.find((x) => x.key === "photos")?.status).toBe("required");
    expect(c.find((x) => x.key === "documents")?.message).toContain("Public liability insurance");
  });
  it("catches off-platform contact details and duplicate serials", () => {
    const shady: ListingForChecks = { ...chainsaw, description: "Great saw, text me on whatsapp +1 555 010 2233 for a cash only deal, cheaper than here.", unit_serials: ["HI-TE70-0412"] };
    const c = runListingChecks(shady, ctx(), CONFIG_BRIEF);
    expect(c.find((x) => x.key === "description")?.status).toBe("required");
    expect(c.find((x) => x.key === "duplicate")?.status).toBe("required");
  });
});

describe("listing quality", () => {
  it("scores the DeWalt editor example at 96%", () => {
    const q = listingQuality({ photo_count: 6, has_serial_plate_photo: true, specs_count: 6, accessories_count: 6, rules_count: 4, prep_hours: 4, description_length: 300 });
    expect(q.score).toBe(96);
    expect(q.items.filter((i) => !i.done).map((i) => i.label)).toEqual(["Add a 30-second video walkthrough"]);
  });
});
