import "server-only";
import { addBusinessDays, addHours, now } from "@/lib/time";
import { asSystem, sql, type Trx } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { getConfigForVersion } from "@/lib/settings/live";
import { providerCancellation, renterCancellation } from "@/lib/pricing";
import type { CancellationPolicy } from "@/lib/settings/schema";
import { nextStatus, TransitionError, type ActorRole, type BookingEvent } from "./machine";
import type { BookingStatus } from "./status";

export interface TransitionActor {
  role: ActorRole;
  id: string | null;
  name: string;
}

export interface TransitionOptions {
  /** free-form payload stored on the event (photos count, claim ids, decision…) */
  payload?: Record<string, unknown>;
  /** for handoff_complete: the condition record that was just completed */
  conditionRecordId?: string;
  /** for admin_decision / claim_accepted: how much of the hold to capture */
  captureCents?: number;
  /** when the event is driven by a job at a specific time */
  at?: Date;
}

export interface TransitionResult {
  from: BookingStatus;
  to: BookingStatus;
  bookingId: string;
  eventId: string;
}

/**
 * The only way a booking's status changes. Validates against the machine, applies the money side
 * effects (refund on cancel, hold placement at handoff, hold release/capture on completion),
 * writes the row and a `booking_events` entry, all inside the caller's RLS-scoped transaction.
 */
export async function transitionBooking(trx: Trx, bookingId: string, event: BookingEvent, actor: TransitionActor, opts: TransitionOptions = {}): Promise<TransitionResult> {
  const b = await trx.selectFrom("bookings").selectAll().where("id", "=", bookingId).forUpdate().executeTakeFirst();
  if (!b) throw new TransitionError("requested", event, "invalid_transition");
  const from = b.status as BookingStatus;
  const to = nextStatus(from, event, actor.role);
  const at = opts.at ?? now();
  const payments = await getPaymentProvider();
  const config = await getConfigForVersion(b.settings_version);
  const patch: Record<string, unknown> = { status: to };
  const payload: Record<string, unknown> = { ...(opts.payload ?? {}) };
  const refs = (b.payment_refs ?? {}) as Record<string, string | null>;

  switch (event) {
    case "renter_cancel":
    case "provider_cancel":
    case "provider_decline": {
      const snap = b.price_snapshot as { rental_cents: number; delivery_cents: number; extras_cents: number; service_fee_cents: number; tax_cents: number; charged_cents: number };
      const policy = b.cancellation_policy_snapshot as CancellationPolicy;
      const input = { policy, start: b.start_at, cancelledAt: at, rental_cents: snap.rental_cents, delivery_cents: snap.delivery_cents, extras_cents: snap.extras_cents, service_fee_cents: snap.service_fee_cents, tax_cents: snap.tax_cents, charged_cents: snap.charged_cents };
      const result = event === "renter_cancel" ? renterCancellation(input, config) : providerCancellation(input);
      if (result.refunded_cents > 0 && refs.charge) {
        const r = await payments.refund({ charge_ref: refs.charge, amount_cents: result.refunded_cents, reason: event });
        refs.refund = r.ref;
      }
      if (result.credit_cents > 0) {
        // credits are system-owned: neither party may write them directly
        await asSystem(trx, (sys) => sys.insertInto("renter_credits").values({ profile_id: b.renter_id, booking_id: b.id, amount_cents: result.credit_cents, reason: `Provider cancellation · ${policy.name} policy credit` }).execute());
      }
      Object.assign(patch, { cancelled_at: at, cancelled_by: event === "renter_cancel" ? "renter" : "provider", cancellation_snapshot: result, payment_refs: refs, hold_status: "none" });
      Object.assign(payload, { refunded_cents: result.refunded_cents, kept_rental_cents: result.kept_rental_cents, credit_cents: result.credit_cents, keep_pct: result.keep_pct });
      break;
    }
    case "handoff_complete": {
      // the hold is placed here — after the condition record — never before
      if (b.hold_cents > 0) {
        const method = b.payment_method_id ? await trx.selectFrom("payment_methods").select(["id", "provider_ref", "brand", "last4"]).where("id", "=", b.payment_method_id).executeTakeFirst() : null;
        const auth = await payments.authorize({
          amount_cents: b.hold_cents,
          method: { id: method?.id ?? "unknown", provider_ref: method?.provider_ref ?? null, label: b.payment_method_label ?? (method ? `${method.brand} •••• ${method.last4}` : "card") },
          description: `fab.rent hold · ${b.ref}`,
          idempotency_key: `hold:${b.id}`,
          metadata: { booking: b.ref, kind: "hold" },
        });
        refs.hold = auth.ref;
        Object.assign(patch, { hold_status: "placed", hold_placed_at: at, hold_expires_at: auth.expires_at, payment_refs: refs });
        payload.hold_cents = b.hold_cents;
      }
      if (opts.conditionRecordId) payload.condition_record_id = opts.conditionRecordId;
      patch.return_due_at = b.end_at;
      break;
    }
    case "return_checkin_start": {
      patch.returned_at = at;
      break;
    }
    case "return_no_claim": {
      if (refs.hold && b.hold_status === "placed") {
        await payments.release({ authorization_ref: refs.hold });
        Object.assign(patch, { hold_status: "released", hold_released_at: at });
        payload.released_cents = b.hold_cents;
      }
      Object.assign(patch, { completed_at: at, returned_at: b.returned_at ?? at });
      await clearLedger(trx, b.id, at);
      break;
    }
    case "claim_accepted":
    case "admin_decision": {
      const capture = Math.max(0, Math.min(opts.captureCents ?? 0, b.hold_cents));
      if (refs.hold && b.hold_status === "placed") {
        if (capture > 0) {
          const c = await payments.capture({ authorization_ref: refs.hold, amount_cents: capture });
          refs.capture = c.ref;
          Object.assign(patch, { hold_status: capture >= b.hold_cents ? "captured" : "partially_captured", hold_captured_cents: capture, hold_released_at: at, payment_refs: refs });
        } else {
          await payments.release({ authorization_ref: refs.hold });
          Object.assign(patch, { hold_status: "released", hold_released_at: at });
        }
      }
      Object.assign(payload, { captured_cents: capture, released_cents: b.hold_cents - capture });
      patch.completed_at = at;
      await clearLedger(trx, b.id, at, capture);
      break;
    }
    case "claim_disputed": {
      // the ledger is system-owned (neither party can write it)
      await asSystem(trx, (sys) => sys.updateTable("ledger_entries").set({ status: "held_claim" }).where("booking_id", "=", b.id).where("type", "=", "rental").execute());
      break;
    }
    default:
      break;
  }

  await trx.updateTable("bookings").set(patch).where("id", "=", b.id).execute();
  const ev = await trx
    .insertInto("booking_events")
    .values({ booking_id: b.id, type: event, actor_role: actor.role, actor_id: actor.id, actor_name: actor.name, from_status: from, to_status: to, payload: JSON.stringify(payload), occurred_at: at })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { from, to, bookingId: b.id, eventId: ev.id };
}

/** Funds clear at return check-in: rental ledger entry → available (plus any captured claim, no commission). */
async function clearLedger(trx: Trx, bookingId: string, at: Date, claimCents = 0) {
  // system-owned: providers/renters trigger this transition but may not touch the ledger themselves
  return asSystem(trx, (sys) => clearLedgerAsSystem(sys, bookingId, at, claimCents));
}

async function clearLedgerAsSystem(trx: Trx, bookingId: string, at: Date, claimCents = 0) {
  const entry = await trx.selectFrom("ledger_entries").selectAll().where("booking_id", "=", bookingId).where("type", "=", "rental").executeTakeFirst();
  if (!entry) return;
  const adjustment = claimCents > 0 ? claimCents : entry.adjustment_cents;
  await trx
    .updateTable("ledger_entries")
    .set({ status: "available", adjustment_cents: adjustment, adjustment_label: claimCents > 0 ? `+$${(claimCents / 100).toFixed(2)} claim` : entry.adjustment_label, net_cents: entry.gross_cents + entry.commission_cents + (claimCents > 0 ? claimCents : entry.adjustment_label?.includes("claim") ? 0 : entry.adjustment_cents) })
    .where("id", "=", entry.id)
    .execute();
  void at;
}

/** Appends a non-status event to the timeline (message-driven system events, hold released by job, etc.). */
export async function recordBookingEvent(trx: Trx, bookingId: string, type: string, actor: TransitionActor, payload: Record<string, unknown> = {}, at: Date = now()) {
  await trx.insertInto("booking_events").values({ booking_id: bookingId, type, actor_role: actor.role, actor_id: actor.id, actor_name: actor.name, payload: JSON.stringify(payload), occurred_at: at }).execute();
}

/** Scheduled job: active → return_due (within 24 h of end), return_due → overdue (past end + grace). */
export async function runReturnJobs(trx: Trx, at: Date = now()): Promise<{ return_due: number; overdue: number }> {
  const system: TransitionActor = { role: "system", id: null, name: "fab.rent" };
  const dueSoon = await trx.selectFrom("bookings").select("id").where("status", "=", "active").where("end_at", "<=", addHours(at, 24)).execute();
  for (const b of dueSoon) await transitionBooking(trx, b.id, "return_window_open", system, { at });
  const late = await sql<{ id: string }>`
    select b.id from public.bookings b join public.listings l on l.id = b.listing_id
    where b.status in ('return_due','active') and b.end_at + make_interval(mins => l.late_grace_minutes) < ${at.toISOString()}::timestamptz`.execute(trx);
  for (const b of late.rows) await transitionBooking(trx, b.id, "grace_elapsed", system, { at });
  return { return_due: dueSoon.length, overdue: late.rows.length };
}

/** Scheduled job: release holds 3 business days after return check-in when no claim is open. */
export async function runHoldReleaseJob(trx: Trx, at: Date = now()): Promise<number> {
  const payments = await getPaymentProvider();
  const rows = await sql<{ id: string; ref: string; hold_cents: number; payment_refs: Record<string, string | null>; returned_at: Date; business_days: number }>`
    select b.id, b.ref, b.hold_cents, b.payment_refs, b.returned_at, (select (public.live_config() -> 'holds' ->> 'auto_release_business_days')::int) as business_days
    from public.bookings b
    where b.status = 'completed' and b.hold_status = 'placed' and b.returned_at is not null
      and not exists (select 1 from public.claims c where c.booking_id = b.id and c.status in ('open','disputed'))`.execute(trx);
  let released = 0;
  for (const b of rows.rows) {
    if (addBusinessDays(new Date(b.returned_at), b.business_days ?? 3) > at) continue;
    if (b.payment_refs?.hold) await payments.release({ authorization_ref: b.payment_refs.hold });
    await trx.updateTable("bookings").set({ hold_status: "released", hold_released_at: at }).where("id", "=", b.id).execute();
    await recordBookingEvent(trx, b.id, "hold_released", { role: "system", id: null, name: "fab.rent" }, { cents: b.hold_cents }, at);
    released++;
  }
  return released;
}
