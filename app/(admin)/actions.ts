"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, withActor, type Actor } from "@/lib/auth";
import { asSystem, sql, type Trx } from "@/lib/db";
import { now } from "@/lib/time";
import { getLiveSettings } from "@/lib/settings/live";
import { marketplaceConfigSchema } from "@/lib/settings/schema";
import { transitionBooking, recordBookingEvent } from "@/lib/booking-state/transition";
import { previewDecision, type DisputeDecision } from "@/lib/pricing/claims";
import { formatMoney } from "@/lib/format";
import type { ActionResult } from "@/app/(renter)/actions";
import { diffConfigs } from "@/lib/settings/diff";
import { extendHold } from "@/lib/jobs";
import { markPayoutPaid } from "@/lib/payouts";
import { notifyListingReviewed, notifyPayoutReminder } from "@/lib/notifications/events";

type Staff = Actor & { staff: NonNullable<Actor["staff"]> };
const shortName = (n: string) => { const [f, ...rest] = n.split(" "); return rest.length ? `${f} ${rest[rest.length - 1]![0]}.` : f!; };

async function log(trx: Trx, actor: Staff, action: string, target: { type: string; id?: string | null; label?: string | null }) {
  await trx.insertInto("admin_actions").values({ actor_id: actor.userId, actor_name: shortName(actor.profile?.name ?? "Staff"), action, target_type: target.type, target_id: target.id ?? null, target_label: target.label ?? null }).execute();
}
async function systemMessage(trx: Trx, bookingId: string, body: string) {
  const c = await trx.selectFrom("conversations").select("id").where("booking_id", "=", bookingId).executeTakeFirst();
  if (c) await trx.insertInto("messages").values({ conversation_id: c.id, sender_side: "system", kind: "system", body }).execute();
}
function can(actor: Staff, perm: string) {
  return actor.staff.permissions.includes(perm) || actor.staff.permissions.includes("all");
}

/* ------------------------------------------------------------ disputes */

export async function assignDispute(code: string, staffId?: string | null): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!can(actor, "disputes")) return { ok: false, error: "Disputes permission required" };
  await withActor(async (trx) => {
    const d = await trx.selectFrom("disputes").select(["id"]).where("code", "=", code).executeTakeFirstOrThrow();
    await trx.updateTable("disputes").set({ assignee_staff_id: staffId === undefined ? actor.staff.id : staffId, last_event: staffId === null ? "Unassigned" : `Assigned to ${shortName(actor.profile?.name ?? "staff")}`, last_event_at: now() }).where("id", "=", d.id).execute();
    await log(trx, actor, `assigned ${code}`, { type: "dispute", id: d.id, label: code });
  });
  revalidatePath(`/admin/disputes/${code}`);
  revalidatePath("/admin/disputes");
  return { ok: true, data: undefined };
}

/** Re-authorise a lapsing hold while a dispute is undecided (A04: "extend if undecided"). */
export async function extendDisputeHold(code: string): Promise<ActionResult<{ expires_at: string }>> {
  const actor = await requireStaff();
  if (!can(actor, "disputes")) return { ok: false, error: "Disputes permission required" };
  const r = await withActor(async (trx) => {
    const d = await trx.selectFrom("disputes").select(["id", "booking_id"]).where("code", "=", code).executeTakeFirstOrThrow();
    const res = await asSystem(trx, (t) => extendHold(t, d.booking_id));
    if (res.ok) {
      await trx.updateTable("disputes").set({ last_event: "Hold extended", last_event_at: now() }).where("id", "=", d.id).execute();
      await log(trx, actor, `extended hold on ${code}`, { type: "dispute", id: d.id, label: code });
    }
    return res;
  });
  if (!r.ok || !r.expires_at) return { ok: false, error: r.error ?? "Couldn't extend the hold" };
  revalidatePath(`/admin/disputes/${code}`);
  return { ok: true, data: { expires_at: r.expires_at.toISOString() } };
}

export async function requestMoreEvidence(code: string, side: "renter" | "provider", message: string): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!can(actor, "disputes")) return { ok: false, error: "Disputes permission required" };
  const text = message.trim();
  if (text.length < 5) return { ok: false, error: "Say what you need" };
  await withActor(async (trx) => {
    const d = await trx.selectFrom("disputes").selectAll().where("code", "=", code).executeTakeFirstOrThrow();
    const statements = ((d.statements as unknown as Array<Record<string, unknown>>) ?? []).concat([{ at: now().toISOString(), side: "staff", author: shortName(actor.profile?.name ?? "fab.rent"), body: `Asked the ${side} for more evidence: ${text}` }]);
    await trx.updateTable("disputes").set({ status: "more_evidence", statements: JSON.stringify(statements), last_event: `Asked ${side} for more evidence`, last_event_at: now() }).where("id", "=", d.id).execute();
    await systemMessage(trx, d.booking_id, `fab.rent support asked the ${side} for more evidence on ${code}: ${text}`);
    await log(trx, actor, `asked for more evidence on ${code}`, { type: "dispute", id: d.id, label: code });
  });
  revalidatePath(`/admin/disputes/${code}`);
  revalidatePath("/admin/disputes");
  return { ok: true, data: undefined };
}

const resolveSchema = z.object({ decision: z.enum(["uphold_full", "uphold_partial", "dismiss", "goodwill_credit"]), partial_cents: z.number().int().min(0).optional(), reasoning: z.string().trim().min(10).max(2000), send_reasoning: z.boolean() });

/** One decision, both parties notified: capture from the hold, pay the provider (no commission), release the rest. */
export async function resolveDispute(code: string, input: z.input<typeof resolveSchema>): Promise<ActionResult<{ charged_cents: number; released_cents: number }>> {
  const actor = await requireStaff();
  if (!can(actor, "disputes")) return { ok: false, error: "Disputes permission required" };
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the decision" };
  const settings = await getLiveSettings();
  const r = await withActor(async (trx) => {
    const d = await trx.selectFrom("disputes").selectAll().where("code", "=", code).executeTakeFirstOrThrow();
    if (d.status === "resolved") return { ok: false as const, error: "Already resolved" };
    const b = await trx.selectFrom("bookings").selectAll().where("id", "=", d.booking_id).executeTakeFirstOrThrow();
    const claims = await trx.selectFrom("claims").selectAll().where("booking_id", "=", b.id).where("type", "!=", "late").where("status", "in", ["disputed", "open"]).execute();
    const claimCents = d.claim_id ? (claims.find((c) => c.id === d.claim_id)?.amount_cents ?? claims.reduce((s, c) => s + c.amount_cents, 0)) : claims.reduce((s, c) => s + c.amount_cents, 0);
    const preview = previewDecision(parsed.data.decision as DisputeDecision, claimCents, b.hold_cents, parsed.data.partial_cents);
    const who = { role: "staff" as const, id: actor.userId, name: actor.profile?.name ?? "fab.rent support" };
    try {
      if (b.status === "disputed") await transitionBooking(trx, b.id, "admin_decision", who, { captureCents: preview.charged_to_renter_cents, payload: { dispute: code, decision: parsed.data.decision, claim_cents: claimCents, reasoning: parsed.data.send_reasoning ? parsed.data.reasoning : null } });
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
    const claimStatus = parsed.data.decision === "dismiss" ? "dismissed" : "settled";
    for (const c of claims) await trx.updateTable("claims").set({ status: claimStatus, settled_at: now(), settled_cents: parsed.data.decision === "dismiss" ? 0 : Math.round((preview.paid_to_provider_cents * c.amount_cents) / Math.max(1, claimCents)) }).where("id", "=", c.id).execute();
    if (parsed.data.decision === "goodwill_credit" && preview.platform_pays_cents > 0) {
      await asSystem(trx, (sys) => sys.insertInto("ledger_entries").values({ provider_id: b.provider_id, booking_id: b.id, entry_date: sql`(now() at time zone ${settings.config.market.timezone})::date`, type: "claim", description: `Goodwill settlement · ${code}`, gross_cents: preview.platform_pays_cents, commission_cents: 0, net_cents: preview.platform_pays_cents, status: "available" }).execute());
    }
    await trx.updateTable("disputes").set({ status: "resolved", decision: parsed.data.decision, reasoning: parsed.data.reasoning, send_reasoning: parsed.data.send_reasoning, resolved_at: now(), charged_cents: preview.charged_to_renter_cents, paid_to_provider_cents: preview.paid_to_provider_cents, released_cents: preview.released_to_renter_cents, appeal_by: new Date(Date.now() + settings.config.holds.appeal_days * 86_400_000), last_event: `Resolved · ${label(parsed.data.decision)}`, last_event_at: now(), assignee_staff_id: d.assignee_staff_id ?? actor.staff.id }).where("id", "=", d.id).execute();
    await trx.updateTable("profiles").set({ status: "active" }).where("id", "=", b.renter_id).where("status", "=", "in_dispute").execute();
    await trx.updateTable("staff").set({ resolved_count: sql`resolved_count + 1` }).where("id", "=", actor.staff.id).execute();
    await recordBookingEvent(trx, b.id, "dispute_resolved", who, { dispute: code, decision: parsed.data.decision, charged_cents: preview.charged_to_renter_cents, released_cents: preview.released_to_renter_cents });
    await systemMessage(trx, b.id, `fab.rent support decided ${code}: ${label(parsed.data.decision)}. ${preview.charged_to_renter_cents ? `${formatMoney(preview.charged_to_renter_cents)} charged from the hold` : "Nothing charged"}${preview.released_to_renter_cents ? ` · ${formatMoney(preview.released_to_renter_cents)} released` : ""}.${parsed.data.send_reasoning ? ` Reasoning: ${parsed.data.reasoning}` : ""} Either party can appeal once within ${settings.config.holds.appeal_days} days.`);
    await log(trx, actor, `resolved ${code} — ${label(parsed.data.decision)}${parsed.data.decision === "uphold_partial" ? ` (${formatMoney(preview.charged_to_renter_cents)})` : ""}`, { type: "dispute", id: d.id, label: code });
    return { ok: true as const, data: { charged_cents: preview.charged_to_renter_cents, released_cents: preview.released_to_renter_cents } };
  });
  revalidatePath(`/admin/disputes/${code}`);
  revalidatePath("/admin/disputes");
  revalidatePath("/admin");
  return r;
}
function label(d: string) {
  return d === "uphold_full" ? "claim upheld in full" : d === "uphold_partial" ? "claim upheld partially" : d === "dismiss" ? "claim dismissed" : "goodwill credit from fab.rent";
}

/* ------------------------------------------------------------ notes / users */

export async function addInternalNote(targetType: "profile" | "provider" | "dispute" | "listing", targetId: string, body: string): Promise<ActionResult> {
  const actor = await requireStaff();
  const text = body.trim();
  if (text.length < 2) return { ok: false, error: "Write a note" };
  await withActor(async (trx) => {
    await trx.insertInto("internal_notes").values({ target_type: targetType, target_id: targetId, author_id: actor.userId, author_name: shortName(actor.profile?.name ?? "Staff"), body: text }).execute();
    if (targetType === "dispute") {
      const d = await trx.selectFrom("disputes").select(["internal_notes", "code"]).where("id", "=", targetId).executeTakeFirst();
      if (d) await trx.updateTable("disputes").set({ internal_notes: JSON.stringify(((d.internal_notes as unknown as unknown[]) ?? []).concat([{ at: now().toISOString(), author: shortName(actor.profile?.name ?? "Staff"), body: text }])) }).where("id", "=", targetId).execute();
    }
    const who = await trx.selectFrom("profiles").select("name").where("id", "=", targetId).executeTakeFirst();
    await log(trx, actor, `added a note${who ? ` on ${who.name}` : ""}`, { type: targetType, id: targetId, label: who?.name ?? null });
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/disputes");
  return { ok: true, data: undefined };
}

export async function setUserStatus(profileId: string, status: "active" | "suspended", reason?: string): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!can(actor, "users")) return { ok: false, error: "Users permission required" };
  await withActor(async (trx) => {
    const p = await trx.selectFrom("profiles").select(["name", "flags"]).where("id", "=", profileId).executeTakeFirstOrThrow();
    await trx.updateTable("profiles").set({ status }).where("id", "=", profileId).execute();
    if (reason) await trx.insertInto("internal_notes").values({ target_type: "profile", target_id: profileId, author_id: actor.userId, author_name: shortName(actor.profile?.name ?? "Staff"), body: `${status === "suspended" ? "Suspended" : "Reinstated"}: ${reason}` }).execute();
    await log(trx, actor, `${status === "suspended" ? "suspended" : "reinstated"} ${p.name}`, { type: "profile", id: profileId, label: p.name });
  });
  revalidatePath("/admin/users");
  return { ok: true, data: undefined };
}

export async function clearUserFlag(profileId: string, flag: string): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!can(actor, "users")) return { ok: false, error: "Users permission required" };
  await withActor(async (trx) => {
    const p = await trx.selectFrom("profiles").select(["name", "flags"]).where("id", "=", profileId).executeTakeFirstOrThrow();
    await trx.updateTable("profiles").set({ flags: p.flags.filter((f) => f !== flag) }).where("id", "=", profileId).execute();
    await log(trx, actor, `cleared flag ${flag} on ${p.name}`, { type: "profile", id: profileId, label: p.name });
  });
  revalidatePath("/admin/users");
  return { ok: true, data: undefined };
}

/* ------------------------------------------------------------ listing review */

const decideSchema = z.object({ decision: z.enum(["approve", "request_changes", "reject"]), message: z.string().trim().max(2000).optional(), checklist: z.array(z.string().trim().min(1).max(200)).max(10).optional(), reject_reason: z.string().trim().max(200).optional() });

export async function decideListingReview(reviewId: string, input: z.input<typeof decideSchema>): Promise<ActionResult<{ status: string }>> {
  const actor = await requireStaff();
  if (!can(actor, "listings")) return { ok: false, error: "Listings permission required" };
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the decision" };
  const d = parsed.data;
  const r = await withActor(async (trx) => {
    const review = await trx.selectFrom("listing_reviews").selectAll().where("id", "=", reviewId).executeTakeFirstOrThrow();
    if (review.decision) return { ok: false as const, error: "Already decided" };
    const l = await trx.selectFrom("listings").select(["id", "title", "published_at", "status"]).where("id", "=", review.listing_id).executeTakeFirstOrThrow();
    let status: "published" | "changes_requested" | "rejected";
    if (d.decision === "approve") {
      status = "published";
      await trx.updateTable("listings").set({ status: "published", published_at: l.published_at ?? now() }).where("id", "=", l.id).execute();
    } else if (d.decision === "request_changes") {
      if (!d.checklist?.length && !d.message) return { ok: false as const, error: "Add at least one change or a message" };
      status = "changes_requested";
      await trx.updateTable("listings").set({ status: "changes_requested" }).where("id", "=", l.id).execute();
    } else {
      status = "rejected";
      await trx.updateTable("listings").set({ status: "rejected" }).where("id", "=", l.id).execute();
    }
    await trx.updateTable("listing_reviews").set({ decision: d.decision, decided_at: now(), decided_by: actor.userId, message_to_provider: d.message ?? null, change_request: d.checklist ? JSON.stringify(d.checklist) : null, reject_reason: d.reject_reason ?? null, sla_paused: d.decision === "request_changes", sla_paused_at: d.decision === "request_changes" ? now() : null, assignee_staff_id: review.assignee_staff_id ?? actor.staff.id }).where("id", "=", review.id).execute();
    if (review.kind === "reported") await trx.updateTable("reports").set({ status: "resolved" }).where("listing_id", "=", l.id).where("status", "=", "open").execute();
    await notifyListingReviewed(trx, review.id);
    await log(trx, actor, `${d.decision === "approve" ? "approved" : d.decision === "reject" ? "rejected" : "requested changes on"} ${l.title}`, { type: "listing_review", id: review.id, label: l.title });
    return { ok: true as const, data: { status } };
  });
  revalidatePath("/admin/listing-review");
  revalidatePath("/admin");
  revalidatePath("/provider/listings");
  return r;
}

/* ------------------------------------------------------------ settings */

/** Saves the draft version (creates it as live+1 if needed) from a full config; changes are the diff vs live. */
export async function saveSettingsDraft(config: unknown): Promise<ActionResult<{ version: number; changes: number }>> {
  const actor = await requireStaff();
  if (!can(actor, "settings")) return { ok: false, error: "Settings permission required" };
  const parsed = marketplaceConfigSchema.safeParse(config);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0] ? `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}` : "Invalid config" };
  const live = await getLiveSettings();
  const changes = diffConfigs(live.config, parsed.data);
  const r = await withActor(async (trx) => {
    const draft = await trx.selectFrom("marketplace_settings_versions").select(["id", "version"]).where("status", "=", "draft").executeTakeFirst();
    if (draft) {
      await trx.updateTable("marketplace_settings_versions").set({ config: JSON.stringify(parsed.data), changes: JSON.stringify(changes) }).where("id", "=", draft.id).execute();
      return { ok: true as const, data: { version: draft.version, changes: changes.length } };
    }
    const row = await trx.insertInto("marketplace_settings_versions").values({ version: live.version + 1, config: JSON.stringify(parsed.data), changes: JSON.stringify(changes), status: "draft", created_by: actor.userId }).returning("version").executeTakeFirstOrThrow();
    return { ok: true as const, data: { version: row.version, changes: changes.length } };
  });
  revalidatePath("/admin/settings");
  return r;
}

export async function discardSettingsDraft(): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!can(actor, "settings")) return { ok: false, error: "Settings permission required" };
  await withActor(async (trx) => {
    const d = await trx.selectFrom("marketplace_settings_versions").select(["id", "version"]).where("status", "=", "draft").executeTakeFirst();
    if (!d) return;
    await trx.deleteFrom("marketplace_settings_versions").where("id", "=", d.id).execute();
    await log(trx, actor, `discarded settings draft v${d.version}`, { type: "settings", label: `v${d.version}` });
  });
  revalidatePath("/admin/settings");
  return { ok: true, data: undefined };
}

/** Publish the draft: live → archived, draft → live; cancellation policies mirrored to their table. */
export async function publishSettingsDraft(summary: string, notifyProvidersDays?: number): Promise<ActionResult<{ version: number }>> {
  const actor = await requireStaff();
  if (!can(actor, "settings")) return { ok: false, error: "Settings permission required" };
  const r = await withActor(async (trx) => {
    const draft = await trx.selectFrom("marketplace_settings_versions").selectAll().where("status", "=", "draft").executeTakeFirst();
    if (!draft) return { ok: false as const, error: "No draft to publish" };
    const parsed = marketplaceConfigSchema.safeParse(draft.config);
    if (!parsed.success) return { ok: false as const, error: "Draft config is invalid" };
    const changes = (draft.changes as unknown as Array<{ label?: string; path: string; from: unknown; to: unknown }>) ?? [];
    await trx.updateTable("marketplace_settings_versions").set({ status: "archived" }).where("status", "=", "live").execute();
    await trx.updateTable("marketplace_settings_versions").set({ status: "live", published_at: now(), published_by: actor.userId, change_summary: summary.trim() || changes.map((c) => `${c.label ?? c.path} ${String(c.from)} → ${String(c.to)}`).join(" · ") || "Published" }).where("id", "=", draft.id).execute();
    for (const p of parsed.data.cancellation.policies) {
      await trx.insertInto("cancellation_policies").values({ id: p.id, name: p.name, short_label: p.short_label ?? null, free_until_hours: p.free_until_hours, tiers: JSON.stringify(p.tiers), provider_cancel_credit_cents: p.provider_cancel_credit_cents, provider_cancel_credit_pct: p.provider_cancel_credit_pct, is_default: p.is_default }).onConflict((oc) => oc.column("id").doUpdateSet({ name: p.name, short_label: p.short_label ?? null, free_until_hours: p.free_until_hours, tiers: JSON.stringify(p.tiers), provider_cancel_credit_cents: p.provider_cancel_credit_cents, provider_cancel_credit_pct: p.provider_cancel_credit_pct, is_default: p.is_default })).execute();
    }
    await log(trx, actor, `published settings v${draft.version}${notifyProvidersDays ? ` · providers notified ${notifyProvidersDays} days ahead` : ""}`, { type: "settings", id: draft.id, label: `v${draft.version}` });
    return { ok: true as const, data: { version: draft.version } };
  });
  revalidatePath("/", "layout");
  return r;
}

export async function rollbackSettings(version: number): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!can(actor, "settings")) return { ok: false, error: "Settings permission required" };
  const r = await withActor(async (trx) => {
    const target = await trx.selectFrom("marketplace_settings_versions").selectAll().where("version", "=", version).executeTakeFirst();
    if (!target || target.status !== "archived") return { ok: false as const, error: "Only archived versions can be restored" };
    const live = await trx.selectFrom("marketplace_settings_versions").select(["version"]).where("status", "=", "live").executeTakeFirstOrThrow();
    const maxV = await trx.selectFrom("marketplace_settings_versions").select((eb) => eb.fn.max("version").as("m")).executeTakeFirstOrThrow();
    await trx.updateTable("marketplace_settings_versions").set({ status: "archived" }).where("status", "=", "live").execute();
    await trx.insertInto("marketplace_settings_versions").values({ version: Number(maxV.m) + 1, config: JSON.stringify(target.config), changes: JSON.stringify([{ path: "rollback", label: "Rollback", from: `v${live.version}`, to: `v${version}` }]), status: "live", published_at: now(), published_by: actor.userId, created_by: actor.userId, change_summary: `Rolled back to v${version}` }).execute();
    await log(trx, actor, `rolled settings back to v${version}`, { type: "settings", label: `v${version}` });
    return { ok: true as const, data: undefined };
  });
  revalidatePath("/", "layout");
  return r;
}

/* ------------------------------------------------------------ payouts / reports */

/**
 * Ops actions on a payout row. No money moves in Phase 6: retry/release change the row's status,
 * "remind" emails the provider what is blocking the payout, and "mark_paid" records an off-platform
 * payout (ledger entries → paid) and tells the provider. Phase 7 replaces mark_paid with the transfer result.
 */
export async function payoutAction(payoutId: string, action: "retry" | "remind" | "release" | "mark_paid"): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!can(actor, "payouts")) return { ok: false, error: "Payouts permission required" };
  const r = await withActor(async (trx) => {
    const p = await trx.selectFrom("payouts as po").innerJoin("providers as pv", "pv.id", "po.provider_id").select(["po.id", "po.provider_id", "pv.name", "po.amount_cents"]).where("po.id", "=", payoutId).executeTakeFirstOrThrow();
    if (action === "retry") await trx.updateTable("payouts").set({ status: "scheduled", exception: null, exception_detail: "retry scheduled by ops", scheduled_for: new Date(Date.now() + 86_400_000) }).where("id", "=", p.id).execute();
    if (action === "release") {
      await trx.updateTable("payouts").set({ status: "scheduled", exception: null, exception_detail: null }).where("id", "=", p.id).execute();
      await trx.updateTable("providers").set({ payouts_paused: false, payouts_paused_reason: null }).where("id", "=", p.provider_id).execute();
    }
    let note: string;
    if (action === "remind") {
      const sent = await notifyPayoutReminder(trx, p.id);
      if (sent?.status === "deduped") return { ok: false as const, error: "Already reminded today" };
      if (sent?.status === "skipped") return { ok: false as const, error: `Couldn't send: ${sent.reason === "no_email" ? "the owner has no email address" : "opted out"}` };
      note = `Reminder sent about the paused payout (${formatMoney(p.amount_cents)}).`;
    } else if (action === "mark_paid") {
      const paid = await asSystem(trx, (sys) => markPayoutPaid(sys, p.id));
      if (!paid.ok) return { ok: false as const, error: paid.error };
      note = `Payout ${formatMoney(paid.amount_cents)} marked paid by ops (${paid.rental_count} ${paid.rental_count === 1 ? "rental" : "rentals"}); provider notified.`;
    } else {
      note = action === "retry" ? `Payout ${formatMoney(p.amount_cents)} re-queued.` : `Payout hold released manually.`;
    }
    await trx.insertInto("internal_notes").values({ target_type: "provider", target_id: p.provider_id, author_id: actor.userId, author_name: shortName(actor.profile?.name ?? "Staff"), body: note }).execute();
    await log(trx, actor, `${action === "remind" ? "reminded" : action === "retry" ? "retried payout for" : action === "mark_paid" ? "marked payout paid for" : "released payout for"} ${p.name}`, { type: "payout", id: p.id, label: p.name });
    return { ok: true as const, data: undefined };
  });
  revalidatePath("/admin/payouts");
  revalidatePath("/admin");
  revalidatePath("/provider/earnings");
  return r;
}

export async function resolveReport(reportId: string, status: "resolved" | "dismissed"): Promise<ActionResult> {
  const actor = await requireStaff();
  await withActor(async (trx) => {
    await trx.updateTable("reports").set({ status }).where("id", "=", reportId).execute();
    await log(trx, actor, `${status} a report`, { type: "report", id: reportId });
  });
  revalidatePath("/admin/reports");
  return { ok: true, data: undefined };
}
