import "server-only";
import { addDays, differenceInMinutes } from "date-fns";
import { sql, type Trx } from "@/lib/db";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import { runListingChecks, ruleFor, type ListingCheck, type ListingForChecks } from "@/lib/listing-checks";
import { photoUrl } from "@/lib/storage";
import type { Quote } from "@/lib/pricing";

/* ------------------------------------------------------------------ overview */

export async function adminOverview(trx: Trx, now: Date) {
  const d30 = addDays(now, -30);
  const d60 = addDays(now, -60);
  const [gmv, gmvPrev, disputes, reviews, flagged, payoutEx, health, actions, todayHandoffs] = await Promise.all([
    trx.selectFrom("bookings").select((eb) => [eb.fn.coalesce(eb.fn.sum<number>("charged_cents"), sql<number>`0`).as("gmv"), eb.fn.countAll<number>().as("n"), eb.fn.avg<number>("billed_days").as("days"), sql<number>`coalesce(sum((price_snapshot->>'service_fee_cents')::int + (price_snapshot->'provider'->>'commission_cents')::int),0)::int`.as("net")]).where("created_at", ">=", d30).where("status", "!=", "cancelled").executeTakeFirst(),
    trx.selectFrom("bookings").select((eb) => [eb.fn.coalesce(eb.fn.sum<number>("charged_cents"), sql<number>`0`).as("gmv"), eb.fn.countAll<number>().as("n")]).where("created_at", ">=", d60).where("created_at", "<", d30).where("status", "!=", "cancelled").executeTakeFirst(),
    trx.selectFrom("disputes as d").innerJoin("bookings as b", "b.id", "d.booking_id").leftJoin("providers as cp", "cp.id", "d.claimant_provider_id").leftJoin("profiles as rp", "rp.id", "d.respondent_profile_id").leftJoin("profiles as cr", "cr.id", "d.claimant_profile_id").leftJoin("providers as rpv", "rpv.id", "d.respondent_provider_id").select(["d.id", "d.code", "d.status", "d.summary", "d.last_event", "d.last_event_at", "d.decision_due_at", "d.opened_at", "d.charged_cents", "d.assignee_staff_id", "b.ref", "cp.name as claimant_provider", "rp.name as respondent_profile", "cr.name as claimant_profile", "rpv.name as respondent_provider"]).where("d.status", "in", ["awaiting_decision", "more_evidence", "appealed"]).orderBy("d.decision_due_at").execute(),
    trx.selectFrom("listing_reviews as r").innerJoin("listings as l", "l.id", "r.listing_id").innerJoin("providers as p", "p.id", "l.provider_id").select(["r.id", "r.kind", "r.reasons", "r.checks", "r.submitted_at", "r.sla_paused", "l.title", "p.name as provider", "p.completed_count"]).where("r.decision", "is", null).orderBy("r.submitted_at").execute(),
    trx.selectFrom("profiles").select(["id", "name", "flags", "status"]).where((eb) => eb.or([eb("status", "!=", "active"), sql<boolean>`cardinality(flags) > 0`])).execute(),
    trx.selectFrom("payouts as po").innerJoin("providers as p", "p.id", "po.provider_id").select(["po.id", "po.status", "po.amount_cents", "po.exception", "po.exception_detail", "po.scheduled_for", "p.name as provider", "p.id as provider_id"]).where("po.status", "in", ["failed", "paused"]).orderBy("po.scheduled_for").execute(),
    sql<{ handoffs: number; on_time: number; released: number; released_fast: number; ended: number; claimed: number; total: number; renter_cancel: number; provider_cancel: number }>`
      select count(*) filter (where hold_placed_at is not null)::int as handoffs,
             count(*) filter (where hold_placed_at is not null and hold_placed_at <= start_at + interval '30 minutes')::int as on_time,
             count(*) filter (where hold_released_at is not null)::int as released,
             count(*) filter (where hold_released_at is not null and returned_at is not null and hold_released_at <= returned_at + interval '5 days')::int as released_fast,
             count(*) filter (where status in ('completed','inspecting','disputed'))::int as ended,
             count(*) filter (where status in ('completed','inspecting','disputed') and exists (select 1 from public.claims c where c.booking_id = b.id and c.type <> 'late'))::int as claimed,
             count(*)::int as total,
             count(*) filter (where status = 'cancelled' and cancelled_by = 'renter')::int as renter_cancel,
             count(*) filter (where status = 'cancelled' and cancelled_by = 'provider')::int as provider_cancel
      from public.bookings b where b.created_at >= ${d30.toISOString()}::timestamptz`.execute(trx),
    trx.selectFrom("admin_actions").selectAll().orderBy("occurred_at", "desc").limit(6).execute(),
    trx.selectFrom("bookings").select((eb) => [eb.fn.countAll<number>().as("n"), sql<number>`count(distinct provider_id)::int`.as("providers")]).where("start_at", ">=", startOfDayUtc(now)).where("start_at", "<", addDays(startOfDayUtc(now), 1)).where("status", "!=", "cancelled").executeTakeFirst(),
  ]);
  const h = health.rows[0]!;
  const gmvNow = Number(gmv?.gmv ?? 0);
  const gmvBefore = Number(gmvPrev?.gmv ?? 0);
  return {
    gmv_cents: gmvNow,
    gmv_delta_pct: gmvBefore > 0 ? Math.round(((gmvNow - gmvBefore) / gmvBefore) * 100) : null,
    bookings: Number(gmv?.n ?? 0),
    avg_booking_cents: Number(gmv?.n ?? 0) ? Math.round(gmvNow / Number(gmv!.n)) : 0,
    avg_days: Number(gmv?.days ?? 0),
    net_revenue_cents: Number(gmv?.net ?? 0),
    take_rate_pct: gmvNow ? Math.round((Number(gmv?.net ?? 0) / gmvNow) * 1000) / 10 : 0,
    disputes: disputes.map((d) => ({ ...d, sla_minutes_left: differenceInMinutes(d.decision_due_at, now), parties: `${d.claimant_provider ?? d.claimant_profile ?? "—"} ↔ ${d.respondent_profile ?? d.respondent_provider ?? "—"}` })),
    disputes_past_sla: disputes.filter((d) => d.status === "awaiting_decision" && d.decision_due_at < now).length,
    reviews: reviews.map((r) => ({ ...r, waiting_hours: Math.max(0, Math.round(differenceInMinutes(now, r.submitted_at) / 60)), summary: reviewSummary(r.reasons, (r.checks as unknown as ListingCheck[]) ?? [], r.completed_count) })),
    reviews_over_24h: reviews.filter((r) => differenceInMinutes(now, r.submitted_at) > 24 * 60).length,
    flagged: flagged,
    flagged_chargebacks: flagged.filter((f) => f.flags.includes("chargeback")).length,
    flagged_id: flagged.filter((f) => f.flags.includes("id_mismatch")).length,
    payout_exceptions: payoutEx,
    health: {
      on_time_pct: h.handoffs ? Math.round((h.on_time / h.handoffs) * 1000) / 10 : null,
      released_fast_pct: h.released ? Math.round((h.released_fast / h.released) * 1000) / 10 : null,
      claim_pct: h.ended ? Math.round((h.claimed / h.ended) * 1000) / 10 : null,
      renter_cancel_pct: h.total ? Math.round((h.renter_cancel / h.total) * 1000) / 10 : null,
      provider_cancel_pct: h.total ? Math.round((h.provider_cancel / h.total) * 1000) / 10 : null,
    },
    actions,
    today_handoffs: Number(todayHandoffs?.n ?? 0),
    today_providers: Number(todayHandoffs?.providers ?? 0),
  };
}

function startOfDayUtc(d: Date) {
  const m = new Date(d);
  m.setUTCHours(4, 0, 0, 0); // 00:00 market time (UTC−4)
  if (m > d) m.setUTCDate(m.getUTCDate() - 1);
  return m;
}

export function reviewSummary(reasons: string[], checks: ListingCheck[], completed: number) {
  const required = checks.filter((c) => c.status === "required");
  const warnings = checks.filter((c) => c.status === "warning");
  if (required.length) return required[0]!.message.length > 60 ? `${required[0]!.key === "documents" ? "Insurance / certificate missing" : required[0]!.key === "photos" ? "Stock photos · serial hidden" : required[0]!.key === "duplicate" ? "Possible duplicate" : "Check required"}` : required[0]!.message;
  const price = reasons.find((r) => r.startsWith("Price changed"));
  if (price) return price;
  if (warnings.length) return `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`;
  if (completed < 5) return "New provider";
  return "All checks passed · ready to approve";
}

/* ------------------------------------------------------------------ users */

export type UserTab = "all" | "renters" | "providers" | "staff" | "flagged" | "pending" | "suspended";

export async function adminUsers(trx: Trx, opts: { tab: UserTab; q?: string }) {
  const rows = await trx
    .selectFrom("profiles as pr")
    .leftJoin("providers as pv", "pv.owner_profile_id", "pr.id")
    .leftJoin("staff as st", "st.profile_id", "pr.id")
    .select((eb) => [
      "pr.id", "pr.public_id", "pr.name", "pr.email", "pr.phone", "pr.neighbourhood", "pr.role", "pr.status", "pr.flags", "pr.id_verified", "pr.id_verified_method", "pr.is_business", "pr.rating_from_providers", "pr.rating_count", "pr.completed_count", "pr.late_return_count", "pr.joined_at",
      "pv.id as provider_id", "pv.name as provider_name", "pv.kind as provider_kind", "pv.verified as provider_verified", "pv.rating as provider_rating", "pv.completed_count as provider_completed", "pv.insurance_valid_until", "pv.tax_id_verified", "pv.payouts_paused", "pv.payout_account_verified",
      "st.role as staff_role", "st.resolved_count", "st.two_factor",
      eb.selectFrom("units as u").innerJoin("listings as l", "l.id", "u.listing_id").select(eb.fn.countAll<number>().as("n")).whereRef("l.provider_id", "=", "pv.id").as("units"),
      eb.selectFrom("provider_members as m").select(eb.fn.countAll<number>().as("n")).whereRef("m.provider_id", "=", "pv.id").as("members"),
      eb.selectFrom("claims as c").innerJoin("bookings as b", "b.id", "c.booking_id").select(eb.fn.countAll<number>().as("n")).whereRef("b.renter_id", "=", "pr.id").where("c.status", "in", ["open", "disputed"]).as("open_claims"),
      eb.selectFrom("disputes as d").select(eb.fn.countAll<number>().as("n")).where((e2) => e2.or([e2("d.respondent_profile_id", "=", e2.ref("pr.id")), e2("d.claimant_profile_id", "=", e2.ref("pr.id"))])).where("d.status", "!=", "resolved").as("open_disputes"),
    ])
    .orderBy("pr.name")
    .execute();
  const q = opts.q?.trim().toLowerCase();
  const mapped = rows.map((r) => {
    const isProvider = !!r.provider_id;
    const isStaff = !!r.staff_role;
    const roleLabel = isStaff ? "Staff" : isProvider ? "Provider" : "Renter";
    const verification = isStaff
      ? { label: r.two_factor ? "2FA on" : "2FA off", tone: r.two_factor ? "ok" : "warn" }
      : isProvider
        ? !r.tax_id_verified ? { label: "Tax ID missing", tone: "warn" } : r.insurance_valid_until && r.insurance_valid_until < addDays(new Date(), 45) ? { label: "Insurance expiring", tone: "warn" } : r.provider_verified ? { label: r.provider_kind === "business" ? "Business" : "ID verified", tone: "ok" } : { label: "Pending", tone: "warn" }
        : r.flags.includes("id_mismatch") ? { label: "ID mismatch", tone: "error" } : r.id_verified ? { label: "ID verified", tone: "ok" } : { label: "Pending ID", tone: "warn" };
    const status = r.status === "suspended" ? { label: "Suspended", tone: "error" } : r.status === "in_dispute" ? { label: "In dispute", tone: "warn" } : isProvider && r.payouts_paused ? { label: "Payouts paused", tone: "warn" } : Number(r.open_claims ?? 0) > 0 ? { label: "Open claim", tone: "warn" } : { label: "Active", tone: "ok" };
    return {
      ...r,
      roleLabel,
      display_name: isProvider ? r.provider_name! : r.name,
      sub: isProvider ? `${r.name} · ${Number(r.members ?? 1)} staff · ${r.neighbourhood ?? ""}` : isStaff ? `${r.staff_role === "trust_safety" ? "Trust & safety · disputes" : "Marketplace ops"}` : `${r.email ?? ""}${r.neighbourhood ? ` · ${r.neighbourhood}` : ""}`,
      activity: isStaff ? `${r.resolved_count ?? 0} resolved` : isProvider ? `${Number(r.units ?? 0)} units · ${r.provider_completed ?? 0}` : `${r.completed_count} ${r.completed_count === 1 ? "rental" : "rentals"}${r.late_return_count ? ` · ${r.late_return_count} late` : ""}`,
      rating: isStaff ? null : isProvider ? (r.provider_rating == null ? null : Number(r.provider_rating)) : r.rating_from_providers == null ? null : Number(r.rating_from_providers),
      verification: verification as { label: string; tone: "ok" | "warn" | "error" },
      statusPill: status as { label: string; tone: "ok" | "warn" | "error" },
      flaggedUser: r.status !== "active" || r.flags.length > 0,
      pendingVerification: !isStaff && !isProvider && !r.id_verified,
    };
  });
  const counts = { all: mapped.length, renters: mapped.filter((m) => m.roleLabel === "Renter").length, providers: mapped.filter((m) => m.roleLabel === "Provider").length, staff: mapped.filter((m) => m.roleLabel === "Staff").length, flagged: mapped.filter((m) => m.flaggedUser).length, pending: mapped.filter((m) => m.pendingVerification).length, suspended: mapped.filter((m) => m.status === "suspended").length };
  const filtered = mapped
    .filter((m) => opts.tab === "all" || (opts.tab === "renters" && m.roleLabel === "Renter") || (opts.tab === "providers" && m.roleLabel === "Provider") || (opts.tab === "staff" && m.roleLabel === "Staff") || (opts.tab === "flagged" && m.flaggedUser) || (opts.tab === "pending" && m.pendingVerification) || (opts.tab === "suspended" && m.status === "suspended"))
    .filter((m) => !q || [m.display_name, m.name, m.email ?? "", m.phone ?? "", String(m.public_id)].some((s) => s.toLowerCase().includes(q)));
  return { rows: filtered, counts };
}

export async function adminUserDetail(trx: Trx, id: string) {
  const u = (await adminUsers(trx, { tab: "all" })).rows.find((r) => r.id === id);
  if (!u) return null;
  const [spent, claims, disputes, notes, methods, bookings] = await Promise.all([
    trx.selectFrom("bookings").select((eb) => [eb.fn.coalesce(eb.fn.sum<number>("charged_cents"), sql<number>`0`).as("n")]).where("renter_id", "=", id).where("status", "!=", "cancelled").executeTakeFirst(),
    trx.selectFrom("claims as c").innerJoin("bookings as b", "b.id", "c.booking_id").select(["c.status"]).where("b.renter_id", "=", id).execute(),
    trx.selectFrom("disputes as d").innerJoin("bookings as b", "b.id", "d.booking_id").select(["d.code", "d.status", "d.summary", "d.last_event", "d.last_event_at", "b.hold_cents", "b.hold_status"]).where((eb) => eb.or([eb("d.respondent_profile_id", "=", id), eb("d.claimant_profile_id", "=", id)])).orderBy("d.opened_at", "desc").limit(5).execute(),
    trx.selectFrom("internal_notes").selectAll().where("target_type", "in", ["profile", "provider"]).where("target_id", "in", [id, u.provider_id ?? id]).orderBy("created_at", "desc").execute(),
    trx.selectFrom("payment_methods").select(["brand", "last4", "is_default"]).where("profile_id", "=", id).orderBy("is_default", "desc").execute(),
    trx.selectFrom("bookings").select((eb) => eb.fn.countAll<number>().as("n")).where("renter_id", "=", id).executeTakeFirst(),
  ]);
  return { ...u, spent_cents: Number(spent?.n ?? 0), claims_open: claims.filter((c) => c.status === "open" || c.status === "disputed").length, claims_upheld: claims.filter((c) => c.status === "accepted" || c.status === "settled").length, disputes, notes, methods, bookings_total: Number(bookings?.n ?? 0) };
}

/* ------------------------------------------------------------------ listing review */

export async function adminReviewQueue(trx: Trx, now: Date) {
  const rows = await trx
    .selectFrom("listing_reviews as r")
    .innerJoin("listings as l", "l.id", "r.listing_id")
    .innerJoin("providers as p", "p.id", "l.provider_id")
    .innerJoin("categories as c", "c.id", "l.category_id")
    .leftJoin("categories as pc", "pc.id", "c.parent_id")
    .select(["r.id", "r.kind", "r.reasons", "r.checks", "r.submitted_at", "r.sla_paused", "r.decision", "l.id as listing_id", "l.title", "l.day_cents", "p.name as provider", "p.completed_count", "p.kind as provider_kind", "c.name as category", "pc.name as parent"])
    .where("r.decision", "is", null)
    .orderBy("r.submitted_at")
    .execute();
  return rows.map((r) => ({ ...r, waiting_hours: Math.max(0, Math.round(differenceInMinutes(now, r.submitted_at) / 60)), summary: reviewSummary(r.reasons, (r.checks as unknown as ListingCheck[]) ?? [], r.completed_count), checks: (r.checks as unknown as ListingCheck[]) ?? [] }));
}

export async function adminReviewDetail(trx: Trx, reviewId: string, config: MarketplaceConfig, now: Date) {
  const r = await trx.selectFrom("listing_reviews").selectAll().where("id", "=", reviewId).executeTakeFirst();
  if (!r) return null;
  const l = await trx.selectFrom("listings").selectAll().where("id", "=", r.listing_id).executeTakeFirstOrThrow();
  const [provider, owner, photos, docs, units, cat, extras, history, median, knownSerials, knownHashes, reports] = await Promise.all([
    trx.selectFrom("providers").selectAll().where("id", "=", l.provider_id).executeTakeFirstOrThrow(),
    trx.selectFrom("providers as p").innerJoin("profiles as o", "o.id", "p.owner_profile_id").select(["o.name", "o.email"]).where("p.id", "=", l.provider_id).executeTakeFirstOrThrow(),
    trx.selectFrom("listing_photos").selectAll().where("listing_id", "=", l.id).orderBy("is_cover", "desc").orderBy("sort").execute(),
    trx.selectFrom("listing_documents").selectAll().where("listing_id", "=", l.id).execute(),
    trx.selectFrom("units").select("serial").where("listing_id", "=", l.id).execute(),
    trx.selectFrom("categories as c").leftJoin("categories as p", "p.id", "c.parent_id").select(["c.slug", "c.name", "p.slug as parent_slug", "p.name as parent_name"]).where("c.id", "=", l.category_id).executeTakeFirstOrThrow(),
    trx.selectFrom("listing_extras").selectAll().where("listing_id", "=", l.id).execute(),
    trx.selectFrom("listing_reviews as h").innerJoin("listings as hl", "hl.id", "h.listing_id").select(["h.decision", "h.decided_at", "h.submitted_at", "h.kind"]).where("hl.provider_id", "=", l.provider_id).where("h.id", "!=", r.id).execute(),
    sql<{ m: number | null }>`select percentile_cont(0.5) within group (order by day_cents)::int as m from public.listings where category_id = ${l.category_id}::uuid and status = 'published' and id <> ${l.id}::uuid`.execute(trx),
    trx.selectFrom("units as u").innerJoin("listings as x", "x.id", "u.listing_id").select("u.serial").where("x.id", "!=", l.id).execute(),
    trx.selectFrom("listing_photos").select("photo_hash").where("listing_id", "!=", l.id).where("photo_hash", "is not", null).execute(),
    trx.selectFrom("reports").selectAll().where("listing_id", "=", l.id).execute(),
  ]);
  const forChecks: ListingForChecks = { title: l.title, description: l.description, day_cents: l.day_cents, hold_cents: l.hold_cents, photos: photos.map((p) => ({ has_serial_plate: p.has_serial_plate, is_stock: p.is_stock, hash: p.photo_hash })), documents: docs, unit_serials: units.map((u) => u.serial), category_slug: cat.slug, parent_category_slug: cat.parent_slug };
  const ctx = { category_median_day_cents: median.rows[0]?.m ?? null, known_serials: new Set(knownSerials.map((s) => s.serial)), known_photo_hashes: new Set(knownHashes.map((h) => h.photo_hash!)), provider: { completed_count: provider.completed_count, verified: provider.verified, insurance_valid_until: provider.insurance_valid_until, kind: provider.kind }, now };
  const checks = runListingChecks(forChecks, ctx, config);
  const listingsCount = await trx.selectFrom("listings").select((eb) => eb.fn.countAll<number>().as("n")).where("provider_id", "=", l.provider_id).where("status", "in", ["published", "hidden"]).executeTakeFirst();
  const firstInCategory = !(await trx.selectFrom("listings").select("id").where("provider_id", "=", l.provider_id).where("category_id", "=", l.category_id).where("id", "!=", l.id).where("status", "in", ["published", "hidden"]).executeTakeFirst());
  return {
    review: r,
    listing: l,
    photos: await Promise.all(photos.map(async (p) => ({ ...p, url: await photoUrl("listing-photos", p.storage_path) }))),
    documents: docs,
    extras,
    category: cat,
    rule: ruleFor(config, forChecks),
    provider: { ...provider, owner_name: owner.name, owner_email: owner.email, listings: Number(listingsCount?.n ?? 0), approved: history.filter((h) => h.decision === "approve").length, rejected: history.filter((h) => h.decision === "reject").length, change_requests: history.filter((h) => h.decision === "request_changes").length },
    checks,
    median_day_cents: median.rows[0]?.m ?? null,
    first_in_category: firstInCategory,
    reports,
  };
}

/* ------------------------------------------------------------------ disputes */

export async function adminDisputes(trx: Trx, now: Date) {
  const rows = await trx
    .selectFrom("disputes as d")
    .innerJoin("bookings as b", "b.id", "d.booking_id")
    .innerJoin("listings as l", "l.id", "b.listing_id")
    .leftJoin("providers as cp", "cp.id", "d.claimant_provider_id")
    .leftJoin("profiles as rp", "rp.id", "d.respondent_profile_id")
    .leftJoin("profiles as cr", "cr.id", "d.claimant_profile_id")
    .leftJoin("providers as rpv", "rpv.id", "d.respondent_provider_id")
    .leftJoin("staff as s", "s.id", "d.assignee_staff_id")
    .leftJoin("profiles as sp", "sp.id", "s.profile_id")
    .select(["d.id", "d.code", "d.status", "d.decision", "d.summary", "d.last_event", "d.last_event_at", "d.decision_due_at", "d.opened_at", "d.resolved_at", "d.charged_cents", "d.paid_to_provider_cents", "d.released_cents", "b.ref", "b.hold_cents", "l.title", "cp.name as claimant_provider", "rp.name as respondent_profile", "cr.name as claimant_profile", "rpv.name as respondent_provider", "sp.name as assignee"])
    .orderBy(sql`case d.status when 'awaiting_decision' then 0 when 'appealed' then 1 when 'more_evidence' then 2 else 3 end`)
    .orderBy("d.decision_due_at")
    .execute();
  return rows.map((d) => ({ ...d, sla_minutes_left: differenceInMinutes(d.decision_due_at, now), parties: `${d.claimant_provider ?? d.claimant_profile ?? "—"} ↔ ${d.respondent_profile ?? d.respondent_provider ?? "—"}` }));
}

export interface DisputeStatement { at: string; body: string; side: "provider" | "renter" | "staff"; author: string; attachments?: Array<{ name: string; count?: number }> }
export interface EvidenceArea { area: string; handoff_index: number | null; return_index: number | null; matched_angle: boolean }

export async function adminDisputeDetail(trx: Trx, code: string, config: MarketplaceConfig) {
  const d = await trx.selectFrom("disputes").selectAll().where("code", "=", code).executeTakeFirst();
  if (!d) return null;
  const b = await trx.selectFrom("bookings as b").innerJoin("listings as l", "l.id", "b.listing_id").innerJoin("providers as p", "p.id", "b.provider_id").innerJoin("profiles as r", "r.id", "b.renter_id").select(["b.id", "b.ref", "b.status", "b.start_at", "b.end_at", "b.return_due_at", "b.returned_at", "b.billed_days", "b.charged_cents", "b.hold_cents", "b.hold_status", "b.hold_placed_at", "b.hold_expires_at", "b.hold_captured_cents", "b.price_snapshot", "b.fulfillment", "l.title", "l.age_years", "l.id as listing_id", "p.id as provider_id", "p.name as provider_name", "p.rating as provider_rating", "r.id as renter_id", "r.name as renter_name", "r.rating_from_providers as renter_rating"]).where("b.id", "=", d.booking_id).executeTakeFirstOrThrow();
  const [claims, records, events, providerClaims, renterClaims, notes, assignee, staffList] = await Promise.all([
    trx.selectFrom("claims").selectAll().where("booking_id", "=", b.id).orderBy("created_at").execute(),
    trx.selectFrom("condition_records").selectAll().where("booking_id", "=", b.id).execute(),
    trx.selectFrom("booking_events").selectAll().where("booking_id", "=", b.id).orderBy("occurred_at").execute(),
    trx.selectFrom("claims as c").innerJoin("bookings as bb", "bb.id", "c.booking_id").select(["c.status"]).where("bb.provider_id", "=", b.provider_id).where("c.type", "!=", "late").where("bb.id", "!=", b.id).execute(),
    trx.selectFrom("claims as c").innerJoin("bookings as bb", "bb.id", "c.booking_id").select(["c.status"]).where("bb.renter_id", "=", b.renter_id).where("c.type", "!=", "late").where("bb.id", "!=", b.id).execute(),
    trx.selectFrom("internal_notes").selectAll().where("target_type", "=", "dispute").where("target_id", "=", d.id).orderBy("created_at").execute(),
    d.assignee_staff_id ? trx.selectFrom("staff as s").innerJoin("profiles as p", "p.id", "s.profile_id").select(["s.id", "p.name"]).where("s.id", "=", d.assignee_staff_id).executeTakeFirst() : Promise.resolve(null),
    trx.selectFrom("staff as s").innerJoin("profiles as p", "p.id", "s.profile_id").select(["s.id", "p.name", "s.role"]).execute(),
  ]);
  const withUrls = async (c: (typeof records)[number]) => ({ id: c.id, kind: c.kind, completed_at: c.completed_at, location_label: c.location_label, geotag: c.geotag as { lat: number; lng: number } | null, photos: await Promise.all(((c.photos as Array<{ label: string; path: string | null; taken_at: string }>) ?? []).map(async (p) => ({ ...p, url: await photoUrl("condition-photos", p.path) }))), checklist: (c.checklist as Array<{ item: string; ok: boolean; description?: string }>) ?? [] });
  const handoff = records.find((r) => r.kind === "handoff");
  const ret = records.find((r) => r.kind === "return");
  const mainClaim = claims.find((c) => c.type !== "late" && (c.status === "disputed" || c.status === "open")) ?? claims.find((c) => c.type !== "late") ?? null;
  const lateClaim = claims.find((c) => c.type === "late") ?? null;
  return {
    dispute: { ...d, statements: (d.statements as unknown as DisputeStatement[]) ?? [], evidence_areas: (d.evidence_areas as unknown as EvidenceArea[]) ?? [], internal_notes: (d.internal_notes as Array<{ at: string; body: string; author: string }>) ?? [] },
    booking: { ...b, price_snapshot: b.price_snapshot as unknown as Quote, age_years: b.age_years == null ? null : Number(b.age_years) },
    claim: mainClaim,
    lateClaim,
    claims,
    handoff: handoff ? await withUrls(handoff) : null,
    ret: ret ? await withUrls(ret) : null,
    events,
    provider_prior: { total: providerClaims.length, upheld: providerClaims.filter((c) => c.status === "accepted" || c.status === "settled").length },
    renter_prior: { total: renterClaims.length },
    notes,
    assignee,
    staff: staffList,
    policy: { hold_expiry_days: config.holds.hold_expiry_days, wear_pct: config.holds.wear_allowance_pct, wear_min_age: config.holds.wear_allowance_min_age_years, appeal_days: config.holds.appeal_days, sla_hours: config.holds.admin_decision_sla_hours, renter_hours: config.holds.renter_response_hours },
  };
}

/* ------------------------------------------------------------------ settings */

export async function settingsVersions(trx: Trx) {
  const rows = await trx.selectFrom("marketplace_settings_versions as v").leftJoin("profiles as p", "p.id", "v.published_by").leftJoin("profiles as c", "c.id", "v.created_by").select(["v.id", "v.version", "v.status", "v.config", "v.published_at", "v.change_summary", "v.changes", "v.created_at", "p.name as published_by_name", "c.name as created_by_name"]).orderBy("v.version", "desc").execute();
  const live = rows.find((r) => r.status === "live") ?? null;
  const draft = rows.find((r) => r.status === "draft") ?? null;
  const [policyUse, categoryUse] = await Promise.all([
    trx.selectFrom("listings").select((eb) => ["cancellation_policy_id", eb.fn.countAll<number>().as("n")]).groupBy("cancellation_policy_id").execute(),
    trx.selectFrom("listings as l").innerJoin("categories as c", "c.id", "l.category_id").leftJoin("categories as p", "p.id", "c.parent_id").select((eb) => [sql<string>`coalesce(p.slug, c.slug)`.as("parent_slug"), "c.slug as slug", eb.fn.countAll<number>().as("n")]).groupBy(["parent_slug", "c.slug"]).execute(),
  ]);
  return { versions: rows, live, draft, policy_use: Object.fromEntries(policyUse.map((p) => [p.cancellation_policy_id, Number(p.n)])), category_use: categoryUse.map((c) => ({ parent_slug: c.parent_slug, slug: c.slug, n: Number(c.n) })) };
}

/* ------------------------------------------------------------------ thin pages */

export async function adminBookings(trx: Trx, q?: string) {
  let query = trx.selectFrom("bookings as b").innerJoin("listings as l", "l.id", "b.listing_id").innerJoin("providers as p", "p.id", "b.provider_id").innerJoin("profiles as r", "r.id", "b.renter_id").select(["b.ref", "b.status", "b.start_at", "b.end_at", "b.charged_cents", "b.hold_cents", "b.hold_status", "b.fulfillment", "b.created_at", "l.title", "p.name as provider", "r.name as renter"]).orderBy("b.created_at", "desc").limit(200);
  const term = q?.trim();
  if (term) query = query.where((eb) => eb.or([eb("b.ref", "ilike", `%${term}%`), eb("r.name", "ilike", `%${term}%`), eb("p.name", "ilike", `%${term}%`), eb("l.title", "ilike", `%${term}%`)]));
  return query.execute();
}

export async function adminPayouts(trx: Trx) {
  return trx.selectFrom("payouts as po").innerJoin("providers as p", "p.id", "po.provider_id").select(["po.id", "po.status", "po.amount_cents", "po.rental_count", "po.scheduled_for", "po.paid_at", "po.exception", "po.exception_detail", "po.account_masked", "p.name as provider", "p.id as provider_id", "p.payouts_paused", "p.tax_id_verified", "p.payout_account_verified"]).orderBy(sql`case po.status when 'failed' then 0 when 'paused' then 1 when 'scheduled' then 2 else 3 end`).orderBy("po.scheduled_for", "desc").limit(120).execute();
}

export async function adminReports(trx: Trx) {
  return trx.selectFrom("reports as r").leftJoin("profiles as p", "p.id", "r.reporter_id").leftJoin("listings as l", "l.id", "r.listing_id").leftJoin("bookings as b", "b.id", "r.booking_id").select(["r.id", "r.kind", "r.status", "r.body", "r.created_at", "p.name as reporter", "l.title as listing_title", "l.id as listing_id", "b.ref"]).orderBy("r.created_at", "desc").execute();
}
