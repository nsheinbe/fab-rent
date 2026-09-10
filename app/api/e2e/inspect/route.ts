import { NextResponse } from "next/server";
import { e2eInspectEnabled } from "@/lib/payments/hermetic";
import { getPaymentProvider } from "@/lib/payments";
import { runAsSystem, sql, type Trx } from "@/lib/db";
import { now } from "@/lib/time";
import { e2eNotificationsInspectable } from "@/lib/notifications/hermetic";
import { notifyBookingTransition } from "@/lib/notifications/events";
import { transitionBooking } from "@/lib/booking-state/transition";
import { BOOKING_EVENTS, type BookingEvent } from "@/lib/booking-state/machine";
import type { BookingStatus } from "@/lib/booking-state/status";
import { runJob, type JobName } from "@/lib/jobs";
import { getPayoutProvider, e2ePayoutsInspectable, type PayoutErrorCode } from "@/lib/payouts";

export const dynamic = "force-dynamic";

/**
 * Money-path and notification e2e inspection. Fail-closed: 404 unless E2E_INSPECT=1, payments and
 * payouts are the mocks and notifications are the console adapter. Never enabled beside live providers.
 *
 *   GET  ?ref=FR-… | ?draftId=… | ?email=… | ?otp=<email> | ?provider=<slug>   (provider: payout account, payouts, ledger, payout calls)
 *   POST { action: "seed_open_claim", ref, amount_cents, type? }
 *        { action: "reset_calls" }                                     payments + payouts call logs
 *        { action: "transition", ref, event, captureCents?, at? }      runs transitionBooking as staff/system
 *        { action: "replay_notifications", ref, event }                re-runs the notification hook for the last such event
 *        { action: "run_job", job, at? }
 *        { action: "payouts_fail_next", reason?, code? }               the mock's next transfer fails (exception + retry path)
 */
function denied() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function enabled() {
  return e2eInspectEnabled() && e2eNotificationsInspectable() && e2ePayoutsInspectable();
}

async function deliveriesFor(trx: Trx, where: { booking_id?: string; email?: string }) {
  let q = trx.selectFrom("notification_deliveries").select(["id", "template", "party", "status", "reason", "provider", "recipient_email", "subject", "attempts", "booking_id", "created_at"]).orderBy("created_at");
  if (where.booking_id) q = q.where("booking_id", "=", where.booking_id);
  if (where.email) q = q.where("recipient_email", "=", where.email.toLowerCase());
  return q.execute();
}

function ledgerBalances(row: { gross_cents: number; commission_cents: number; adjustment_cents: number; net_cents: number }) {
  return row.net_cents === row.gross_cents + row.commission_cents + row.adjustment_cents;
}

export async function GET(req: Request) {
  if (!enabled()) return denied();
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  const draftId = url.searchParams.get("draftId");
  const email = url.searchParams.get("email");
  const otp = url.searchParams.get("otp");
  const providerSlug = url.searchParams.get("provider");
  const payments = await getPaymentProvider();
  const payouts = await getPayoutProvider();
  const calls = payments.recordedCalls?.() ?? [];
  const payout_calls = payouts.recordedCalls?.() ?? [];

  const data = await runAsSystem(async (trx) => {
    if (providerSlug) {
      const provider = await trx.selectFrom("providers").select(["id", "slug", "name", "payout_schedule", "payouts_paused", "payouts_paused_reason", "payouts_paused_since", "payout_account_masked", "payout_account_verified", "tax_id_verified", "owner_profile_id"]).where("slug", "=", providerSlug).executeTakeFirst();
      if (!provider) return { provider: null, payout_calls };
      const connect = await trx.selectFrom("connect_accounts").selectAll().where("provider_id", "=", provider.id).executeTakeFirst();
      const payoutRows = await trx.selectFrom("payouts").selectAll().where("provider_id", "=", provider.id).orderBy("scheduled_for", "desc").orderBy("created_at", "desc").execute();
      const ledger = await trx
        .selectFrom("ledger_entries as l")
        .leftJoin("bookings as b", "b.id", "l.booking_id")
        .select(["l.id", "l.type", "l.status", "l.gross_cents", "l.commission_cents", "l.adjustment_cents", "l.net_cents", "l.payout_id", "l.booking_id", "l.description", "b.ref", "b.price_snapshot"])
        .where("l.provider_id", "=", provider.id)
        .orderBy("l.created_at")
        .execute();
      const owner = await trx.selectFrom("profiles").select("email").where("id", "=", provider.owner_profile_id).executeTakeFirst();
      const deliveries = owner?.email ? await deliveriesFor(trx, { email: owner.email }) : [];
      const account_balance = connect ? await payouts.accountBalance(connect.account_ref) : null;
      return {
        provider,
        connect: connect ?? null,
        payouts: payoutRows.map((p) => ({ ...p, amount_cents: Number(p.amount_cents), rental_count: Number(p.rental_count), transfer_attempts: Number(p.transfer_attempts) })),
        ledger: ledger.map((l) => ({ ...l, gross_cents: Number(l.gross_cents), commission_cents: Number(l.commission_cents), adjustment_cents: Number(l.adjustment_cents), net_cents: Number(l.net_cents), provider_payout_cents: (l.price_snapshot as { provider?: { payout_cents?: number } } | null)?.provider?.payout_cents ?? null, price_snapshot: undefined })),
        deliveries,
        account_balance,
        payout_calls,
      };
    }
    if (otp) {
      const row = await trx.selectFrom("otp_codes").select(["code", "expires_at"]).where("identifier", "=", otp.toLowerCase()).where("consumed_at", "is", null).where("expires_at", ">", new Date()).orderBy("created_at", "desc").executeTakeFirst();
      const deliveries = await deliveriesFor(trx, { email: otp });
      return { code: row?.code ?? null, deliveries };
    }
    if (ref) {
      const booking = await trx
        .selectFrom("bookings")
        .select(["id", "ref", "status", "renter_id", "charged_cents", "hold_cents", "hold_status", "hold_captured_cents", "payment_refs", "price_snapshot", "cancellation_snapshot", "cancellation_policy_snapshot", "start_at", "settings_version"])
        .where("ref", "=", ref)
        .executeTakeFirst();
      if (!booking) return { booking: null, ledger: [], claims: [], calls };
      const holdRef = (booking.payment_refs as { hold?: string } | null)?.hold;
      if (holdRef && payments.rememberAuthorization) payments.rememberAuthorization(holdRef, booking.hold_cents);
      const ledger = await trx.selectFrom("ledger_entries").selectAll().where("booking_id", "=", booking.id).orderBy("created_at").execute();
      const claims = await trx.selectFrom("claims").select(["id", "type", "status", "amount_cents", "settled_cents"]).where("booking_id", "=", booking.id).execute();
      const deliveries = await deliveriesFor(trx, { booking_id: booking.id });
      return {
        deliveries,
        booking: {
          ...booking,
          charged_cents: Number(booking.charged_cents),
          hold_cents: Number(booking.hold_cents),
          hold_captured_cents: Number(booking.hold_captured_cents),
        },
        ledger: ledger.map((r) => ({
          ...r,
          gross_cents: Number(r.gross_cents),
          commission_cents: Number(r.commission_cents),
          adjustment_cents: Number(r.adjustment_cents),
          net_cents: Number(r.net_cents),
          balances: ledgerBalances({
            gross_cents: Number(r.gross_cents),
            commission_cents: Number(r.commission_cents),
            adjustment_cents: Number(r.adjustment_cents),
            net_cents: Number(r.net_cents),
          }),
        })),
        claims,
        calls,
      };
    }
    if (draftId) {
      const draft = await trx.selectFrom("booking_drafts").select(["id", "profile_id"]).where("id", "=", draftId).executeTakeFirst();
      return { draft: draft ?? null, booking: null, ledger: [], calls };
    }
    if (email) {
      const profile = await trx.selectFrom("profiles").select(["id", "notification_prefs"]).where("email", "=", email).executeTakeFirst();
      const deliveries = await deliveriesFor(trx, { email });
      if (!profile) return { bookings: [], ledger: [], calls, deliveries, profile: null };
      const bookings = await trx.selectFrom("bookings").select(["id", "ref", "status", "hold_status", "charged_cents"]).where("renter_id", "=", profile.id).execute();
      const ids = bookings.map((b) => b.id);
      const ledger = ids.length
        ? await trx.selectFrom("ledger_entries").select(["id", "booking_id", "type", "gross_cents", "commission_cents", "adjustment_cents", "net_cents", "status"]).where("booking_id", "in", ids).execute()
        : [];
      return { bookings, ledger, calls, deliveries, profile: { notification_prefs: profile.notification_prefs } };
    }
    return { calls };
  });

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  if (!enabled()) return denied();
  const body = (await req.json().catch(() => null)) as { action?: string; ref?: string; amount_cents?: number; type?: "damage" | "cleaning" | "missing"; event?: string; captureCents?: number; at?: string; job?: string; reason?: string; code?: PayoutErrorCode } | null;
  if (body?.action === "reset_calls") {
    const payments = await getPaymentProvider();
    payments.clearRecordedCalls?.();
    (await getPayoutProvider()).clearRecordedCalls?.();
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "payouts_fail_next") {
    const payouts = await getPayoutProvider();
    if (!payouts.failNextTransfer) return NextResponse.json({ error: "Only the mock payout provider can script a failure" }, { status: 400 });
    payouts.failNextTransfer(body.reason ?? "Simulated transfer failure", body.code ?? "provider_error");
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "transition" || body?.action === "replay_notifications") {
    if (!body.ref || !body.event || !(BOOKING_EVENTS as readonly string[]).includes(body.event)) return NextResponse.json({ error: "ref and a known event are required" }, { status: 400 });
    const event = body.event as BookingEvent;
    const at = body.at ? new Date(body.at) : now();
    try {
      const result = await runAsSystem(async (trx) => {
        const b = await trx.selectFrom("bookings").select(["id", "status"]).where("ref", "=", body.ref!).executeTakeFirst();
        if (!b) return { error: "Booking not found" };
        if (body.action === "transition") {
          const role = event === "instant_confirm" || event === "return_window_open" || event === "grace_elapsed" ? ("system" as const) : ("staff" as const);
          const t = await transitionBooking(trx, b.id, event, { role, id: null, name: "e2e" }, { at, captureCents: body.captureCents });
          return { booking_id: b.id, from: t.from, to: t.to };
        }
        const ev = await trx.selectFrom("booking_events").select(["from_status", "to_status", "payload", "occurred_at"]).where("booking_id", "=", b.id).where("type", "=", event).orderBy("occurred_at", "desc").executeTakeFirst();
        if (!ev) return { error: "No such event on this booking" };
        const results = await notifyBookingTransition(trx, { bookingId: b.id, event, from: ev.from_status as BookingStatus, to: ev.to_status as BookingStatus, payload: (ev.payload as Record<string, unknown>) ?? {}, at: ev.occurred_at });
        return { booking_id: b.id, results };
      });
      if ("error" in result) return NextResponse.json(result, { status: 404 });
      // deliveries are dispatched after the transaction above committed — read them afterwards, as the product does
      const deliveries = await runAsSystem((trx) => deliveriesFor(trx, { booking_id: result.booking_id }));
      return NextResponse.json({ ...result, deliveries });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 409 });
    }
  }
  if (body?.action === "run_job") {
    const job = body.job as JobName | undefined;
    if (!job) return NextResponse.json({ error: "job is required" }, { status: 400 });
    const at = body.at ? new Date(body.at) : now();
    const result = await runAsSystem((trx) => runJob(trx, job, at));
    return NextResponse.json({ job, at: at.toISOString(), ...result });
  }
  if (body?.action !== "seed_open_claim" || !body.ref || !body.amount_cents || body.amount_cents <= 0) {
    return NextResponse.json({ error: "Invalid seed_open_claim" }, { status: 400 });
  }
  const amount = Math.floor(body.amount_cents);
  const type = body.type ?? "damage";
  const payments = await getPaymentProvider();

  const seeded = await runAsSystem(async (trx) => {
    const b = await trx.selectFrom("bookings").select(["id", "hold_cents", "hold_status", "payment_refs", "status"]).where("ref", "=", body.ref!).executeTakeFirst();
    if (!b) return { ok: false as const, error: "Booking not found" };
    const holdRef = (b.payment_refs as { hold?: string } | null)?.hold;
    if (holdRef && payments.rememberAuthorization) payments.rememberAuthorization(holdRef, b.hold_cents);
    const existing = await trx.selectFrom("claims").select("id").where("booking_id", "=", b.id).where("status", "=", "open").executeTakeFirst();
    if (existing) return { ok: true as const, claim_id: existing.id, booking_id: b.id };
    const cond = await trx.selectFrom("condition_records").select("id").where("booking_id", "=", b.id).where("kind", "=", "return").executeTakeFirst();
    const respondBy = new Date(now().getTime() + 48 * 3_600_000);
    const row = await trx
      .insertInto("claims")
      .values({
        booking_id: b.id,
        condition_record_id: cond?.id ?? null,
        type,
        area: "Working parts",
        description: "E2E damage claim against the hold",
        amount_cents: amount,
        repair_estimate_cents: amount,
        status: "open",
        renter_respond_by: respondBy,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    if (b.status !== "inspecting") {
      await trx.updateTable("bookings").set({ status: "inspecting" }).where("id", "=", b.id).execute();
    }
    await sql`update public.ledger_entries set status = 'inspecting' where booking_id = ${b.id}::uuid and type = 'rental'`.execute(trx);
    return { ok: true as const, claim_id: row.id, booking_id: b.id };
  });

  if (!seeded.ok) return NextResponse.json(seeded, { status: 404 });
  return NextResponse.json(seeded);
}
