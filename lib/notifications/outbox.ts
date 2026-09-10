import "server-only";
import type { Insertable } from "kysely";
import { asSystem, onCommit, runAsSystem, sql, type DB, type Trx } from "@/lib/db";
import { now } from "@/lib/time";
import { isOptedOut, parsePrefs, type Party, type TemplateKey } from "./catalogue";
import { notificationProviderName } from "./hermetic";
import { getNotificationProvider } from "./index";
import { toHtml } from "./templates";

/**
 * Transactional outbox. Every message is first a `notification_deliveries` row written inside the
 * caller's transaction (system-owned, like the ledger); it is sent only after that transaction
 * commits, so a state change that rolls back never emails anyone. The row's unique `dedupe_key`
 * makes replays inert: a second enqueue for the same message inserts nothing and sends nothing.
 *
 * Skips (opted out, no email address) are recorded too, so ops can see why someone wasn't told.
 */

export interface DeliveryRecipient {
  profile_id: string | null;
  email: string | null;
  name?: string | null;
  /** profiles.notification_prefs */
  prefs?: unknown;
}

export interface EnqueueInput {
  template: TemplateKey;
  party: Party;
  dedupe_key: string;
  recipient: DeliveryRecipient;
  booking_id?: string | null;
  subject: string;
  text: string;
  payload?: Record<string, unknown>;
}

export type EnqueueResult = { id: string; status: "queued" | "skipped"; reason?: "opted_out" | "no_email" } | { id: null; status: "deduped" };

export async function enqueueNotification(trx: Trx, input: EnqueueInput): Promise<EnqueueResult> {
  const email = input.recipient.email?.trim().toLowerCase() || null;
  const reason: "opted_out" | "no_email" | null = !email ? "no_email" : isOptedOut(parsePrefs(input.recipient.prefs), input.template) ? "opted_out" : null;
  const row = await asSystem(trx, (sys) =>
    sys
      .insertInto("notification_deliveries")
      .values({
        dedupe_key: input.dedupe_key,
        template: input.template,
        party: input.party,
        recipient_profile_id: input.recipient.profile_id,
        recipient_email: email,
        booking_id: input.booking_id ?? null,
        provider: notificationProviderName(),
        status: reason ? "skipped" : "queued",
        reason,
        subject: input.subject,
        body_text: input.text,
        payload: JSON.stringify({ ...(input.payload ?? {}), recipient_name: input.recipient.name ?? null }),
      })
      .onConflict((oc) => oc.column("dedupe_key").doNothing())
      .returning("id")
      .executeTakeFirst(),
  );
  if (!row) return { id: null, status: "deduped" };
  if (reason) return { id: row.id, status: "skipped", reason };
  onCommit(trx, async () => {
    await dispatchDelivery(row.id);
  });
  return { id: row.id, status: "queued" };
}

/** Claims a queued/failed row, sends it, and records the outcome. Safe to call twice: the claim is atomic. */
export async function dispatchDelivery(id: string): Promise<"sent" | "failed" | "skipped" | null> {
  const provider = await getNotificationProvider();
  const row = await runAsSystem((trx) =>
    trx
      .updateTable("notification_deliveries")
      .set({ status: "sending", attempts: sql<number>`attempts + 1`, last_attempt_at: new Date(), provider: provider.name })
      .where("id", "=", id)
      .where("status", "in", ["queued", "failed"])
      .returning(["id", "dedupe_key", "template", "recipient_email", "subject", "body_text", "payload", "booking_id"])
      .executeTakeFirst(),
  );
  if (!row) return null;
  if (!row.recipient_email || !row.subject || !row.body_text) {
    await runAsSystem((trx) => trx.updateTable("notification_deliveries").set({ status: "skipped", reason: "no_email" }).where("id", "=", id).execute());
    return "skipped";
  }
  try {
    const name = (row.payload as { recipient_name?: string | null } | null)?.recipient_name ?? null;
    const r = await provider.send({
      to: { email: row.recipient_email, name },
      subject: row.subject,
      text: row.body_text,
      html: toHtml(row.subject, row.body_text),
      idempotency_key: row.dedupe_key,
      metadata: { template: row.template, ...(row.booking_id ? { booking: row.booking_id } : {}) },
    });
    await runAsSystem((trx) => trx.updateTable("notification_deliveries").set({ status: "sent", provider_ref: r.ref, sent_at: r.sent_at, error: null }).where("id", "=", id).execute());
    return "sent";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await runAsSystem((trx) => trx.updateTable("notification_deliveries").set({ status: "failed", error: message.slice(0, 500) }).where("id", "=", id).execute());
    console.error(`[notify] delivery ${id} (${row.template}) failed: ${message}`);
    return "failed";
  }
}

/**
 * Send immediately and record the outcome (sign-in codes: the caller needs to know whether the code
 * went out, and the body is never stored). Returns the error message on failure.
 */
export async function sendAndRecord(input: Omit<EnqueueInput, "booking_id"> & { store_body?: boolean }): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const provider = await getNotificationProvider();
  const email = input.recipient.email?.trim().toLowerCase() || null;
  const base: Insertable<DB["notification_deliveries"]> = {
    dedupe_key: input.dedupe_key,
    template: input.template,
    party: input.party,
    recipient_profile_id: input.recipient.profile_id,
    recipient_email: email,
    booking_id: null,
    provider: provider.name,
    subject: input.store_body ? input.subject : null,
    body_text: input.store_body ? input.text : null,
    payload: JSON.stringify(input.payload ?? {}),
    attempts: 1,
    last_attempt_at: new Date(),
  };
  const record = (values: Partial<Insertable<DB["notification_deliveries"]>>) =>
    runAsSystem((trx) =>
      trx
        .insertInto("notification_deliveries")
        .values({ ...base, ...values })
        .onConflict((oc) => oc.column("dedupe_key").doNothing())
        .returning("id")
        .executeTakeFirst(),
    );
  if (!email) {
    await record({ status: "skipped", reason: "no_email" });
    return { ok: false, error: "No email address to send to" };
  }
  try {
    const r = await provider.send({ to: { email, name: input.recipient.name ?? null }, subject: input.subject, text: input.text, html: toHtml(input.subject, input.text), idempotency_key: input.dedupe_key, metadata: { template: input.template } });
    const row = await record({ status: "sent", provider_ref: r.ref, sent_at: r.sent_at });
    return { ok: true, id: row?.id ?? null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await record({ status: "failed", error: message.slice(0, 500) });
    console.error(`[notify] ${input.template} to ${email} failed: ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * Scheduled job: re-dispatch what the process didn't finish (queued rows older than two minutes, rows
 * abandoned mid-send, failed rows up to three attempts). Failures past that stay `failed` and visible.
 */
export async function runNotificationRetryJob(trx: Trx, at: Date = now()): Promise<{ retried: number }> {
  const stale = new Date(at.getTime() - 2 * 60_000);
  const stuck = new Date(at.getTime() - 10 * 60_000);
  await trx.updateTable("notification_deliveries").set({ status: "queued" }).where("status", "=", "sending").where("last_attempt_at", "<", stuck).execute();
  const rows = await trx
    .selectFrom("notification_deliveries")
    .select("id")
    .where((eb) =>
      eb.or([
        eb.and([eb("status", "=", "queued"), eb("created_at", "<", stale)]),
        eb.and([eb("status", "=", "failed"), eb("attempts", "<", 3), eb("last_attempt_at", "<", stuck)]),
      ]),
    )
    .orderBy("created_at")
    .limit(100)
    .execute();
  for (const r of rows) {
    onCommit(trx, async () => {
      await dispatchDelivery(r.id);
    });
  }
  return { retried: rows.length };
}
