import "server-only";
import { sql, type Trx } from "@/lib/db";
import { now, addBusinessDays, addHours } from "@/lib/time";
import { getLiveConfig } from "@/lib/settings/live";
import { runHoldReleaseJob, runReturnJobs, recordBookingEvent } from "@/lib/booking-state/transition";
import { getPaymentProvider } from "@/lib/payments";
import { notifyHandoffReminder } from "@/lib/notifications/events";
import { runNotificationRetryJob } from "@/lib/notifications/outbox";

export { runHoldReleaseJob, runReturnJobs };

const system = { role: "system" as const, id: null, name: "fab.rent" };

/** Open claims past the renter's response window escalate to ops as a dispute (design: "then admin review"). */
export async function runClaimEscalationJob(trx: Trx, at: Date = now()): Promise<number> {
  const config = await getLiveConfig();
  const rows = await trx
    .selectFrom("claims as c")
    .innerJoin("bookings as b", "b.id", "c.booking_id")
    .select(["c.id", "c.booking_id", "c.type", "c.amount_cents", "c.description", "b.provider_id", "b.renter_id", "b.status", "b.ref"])
    .where("c.status", "=", "open")
    .where("c.renter_respond_by", "is not", null)
    .where("c.renter_respond_by", "<", at)
    .execute();
  let n = 0;
  for (const c of rows) {
    await trx.updateTable("claims").set({ status: "disputed" }).where("id", "=", c.id).execute();
    if (c.status === "inspecting") await trx.updateTable("bookings").set({ status: "disputed" }).where("id", "=", c.booking_id).execute();
    const existing = await trx.selectFrom("disputes").select("id").where("booking_id", "=", c.booking_id).where("status", "!=", "resolved").executeTakeFirst();
    if (!existing) {
      await trx.insertInto("disputes").values({ booking_id: c.booking_id, claim_id: c.id, claimant_provider_id: c.provider_id, respondent_profile_id: c.renter_id, summary: `${c.type === "damage" ? "Damage claim" : c.type === "cleaning" ? "Cleaning claim" : "Missing items"} · ${c.description ?? c.ref} · $${(c.amount_cents / 100).toFixed(0)}`, decision_due_at: new Date(at.getTime() + config.holds.admin_decision_sla_hours * 3_600_000), last_event: "Renter did not respond · escalated", last_event_at: at, statements: JSON.stringify([]), evidence_areas: JSON.stringify([]) }).execute();
    }
    await recordBookingEvent(trx, c.booking_id, "claim_escalated", system, { claim_id: c.id, reason: "no renter response" }, at);
    n++;
  }
  return n;
}

/** Double-blind reviews publish after N days even if the other side never reviewed. */
export async function runReviewPublishJob(trx: Trx, at: Date = now()): Promise<number> {
  const config = await getLiveConfig();
  const cutoff = new Date(at.getTime() - config.verification.review_auto_publish_days * 86_400_000);
  const r = await trx.updateTable("reviews").set({ published_at: at }).where("published_at", "is", null).where("submitted_at", "<", cutoff).returning("id").execute();
  return r.length;
}

/** Card authorisations lapse after ~7 days: mark expired holds so ops sees them (the dispute view offers "extend"). */
export async function runHoldExpiryJob(trx: Trx, at: Date = now()): Promise<number> {
  const rows = await trx.selectFrom("bookings").select(["id", "ref", "hold_expires_at"]).where("hold_status", "=", "placed").where("hold_expires_at", "is not", null).where("hold_expires_at", "<", at).execute();
  for (const b of rows) {
    await trx.updateTable("bookings").set({ hold_status: "expired" }).where("id", "=", b.id).execute();
    await recordBookingEvent(trx, b.id, "hold_expired", system, { expired_at: b.hold_expires_at?.toISOString() }, at);
    await trx.insertInto("admin_actions").values({ actor_id: null, actor_name: "System", action: `hold expired on ${b.ref}`, target_type: "booking", target_id: b.id, target_label: b.ref }).execute();
  }
  return rows.length;
}

/** Re-authorise a hold that is about to lapse (admin dispute view → "extend"). */
export async function extendHold(trx: Trx, bookingId: string, at: Date = now()): Promise<{ ok: boolean; expires_at?: Date; error?: string }> {
  const payments = await getPaymentProvider();
  const b = await trx.selectFrom("bookings").selectAll().where("id", "=", bookingId).executeTakeFirstOrThrow();
  const refs = (b.payment_refs ?? {}) as Record<string, string | null>;
  if (!refs.hold || !["placed", "expired"].includes(b.hold_status)) return { ok: false, error: "No hold to extend" };
  if (!payments.extendAuthorization) return { ok: false, error: "This payment provider can't extend authorisations" };
  const method = b.payment_method_id ? await trx.selectFrom("payment_methods").select(["id", "provider_ref", "brand", "last4"]).where("id", "=", b.payment_method_id).executeTakeFirst() : null;
  const auth = await payments.extendAuthorization({ authorization_ref: refs.hold, method: { id: method?.id ?? "unknown", provider_ref: method?.provider_ref ?? null, label: b.payment_method_label ?? "card" }, amount_cents: b.hold_cents });
  await trx.updateTable("bookings").set({ hold_status: "placed", hold_expires_at: auth.expires_at, payment_refs: JSON.stringify({ ...refs, hold: auth.ref, previous_hold: refs.hold }) }).where("id", "=", b.id).execute();
  await recordBookingEvent(trx, b.id, "hold_extended", system, { expires_at: auth.expires_at.toISOString() }, at);
  return { ok: true, expires_at: auth.expires_at };
}

/** Handoff reminders the day before a pickup or delivery. Idempotent: the outbox keeps one per booking per party. */
export async function runHandoffReminderJob(trx: Trx, at: Date = now()): Promise<number> {
  const rows = await trx.selectFrom("bookings").select("id").where("status", "in", ["confirmed", "ready_for_pickup", "out_for_delivery"]).where("start_at", ">", at).where("start_at", "<=", addHours(at, 24)).orderBy("start_at").execute();
  let reminded = 0;
  for (const b of rows) {
    const r = await notifyHandoffReminder(trx, b.id);
    if (r.some((x) => x.status === "queued")) reminded++;
  }
  return reminded;
}

export type JobName = "returns" | "holds" | "claims" | "reviews" | "hold-expiry" | "reminders" | "notifications" | "all";

export async function runJob(trx: Trx, job: JobName, at: Date = now()): Promise<Record<string, number>> {
  switch (job) {
    case "returns": {
      const r = await runReturnJobs(trx, at);
      return { return_due: r.return_due, overdue: r.overdue };
    }
    case "holds":
      return { released: await runHoldReleaseJob(trx, at) };
    case "claims":
      return { escalated: await runClaimEscalationJob(trx, at) };
    case "reviews":
      return { published: await runReviewPublishJob(trx, at) };
    case "hold-expiry":
      return { expired: await runHoldExpiryJob(trx, at) };
    case "reminders":
      return { reminded: await runHandoffReminderJob(trx, at) };
    case "notifications":
      return { retried: (await runNotificationRetryJob(trx, at)).retried };
    case "all": {
      const r = await runReturnJobs(trx, at);
      return { return_due: r.return_due, overdue: r.overdue, released: await runHoldReleaseJob(trx, at), escalated: await runClaimEscalationJob(trx, at), published: await runReviewPublishJob(trx, at), expired: await runHoldExpiryJob(trx, at), reminded: await runHandoffReminderJob(trx, at), retried: (await runNotificationRetryJob(trx, at)).retried };
    }
  }
}

/** Business-day helper re-exported for tests of the release rule. */
export { addBusinessDays, sql };
