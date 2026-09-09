import { NextResponse } from "next/server";
import { e2eInspectEnabled } from "@/lib/payments/hermetic";
import { getPaymentProvider } from "@/lib/payments";
import { runAsSystem, sql } from "@/lib/db";
import { now } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Money-path e2e inspection. Fail-closed: 404 unless E2E_INSPECT=1 and payments are the mock.
 * Never enabled beside PAYMENTS_PROVIDER=stripe.
 *
 *   GET  ?ref=FR-… | ?draftId=… | ?email=…
 *   POST { action: "seed_open_claim", ref, amount_cents, type? }
 */
function denied() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function ledgerBalances(row: { gross_cents: number; commission_cents: number; adjustment_cents: number; net_cents: number }) {
  return row.net_cents === row.gross_cents + row.commission_cents + row.adjustment_cents;
}

export async function GET(req: Request) {
  if (!e2eInspectEnabled()) return denied();
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  const draftId = url.searchParams.get("draftId");
  const email = url.searchParams.get("email");
  const payments = await getPaymentProvider();
  const calls = payments.recordedCalls?.() ?? [];

  const data = await runAsSystem(async (trx) => {
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
      return {
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
      const profile = await trx.selectFrom("profiles").select("id").where("email", "=", email).executeTakeFirst();
      if (!profile) return { bookings: [], ledger: [], calls };
      const bookings = await trx.selectFrom("bookings").select(["id", "ref", "status", "hold_status", "charged_cents"]).where("renter_id", "=", profile.id).execute();
      const ids = bookings.map((b) => b.id);
      const ledger = ids.length
        ? await trx.selectFrom("ledger_entries").select(["id", "booking_id", "type", "gross_cents", "commission_cents", "adjustment_cents", "net_cents", "status"]).where("booking_id", "in", ids).execute()
        : [];
      return { bookings, ledger, calls };
    }
    return { calls };
  });

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  if (!e2eInspectEnabled()) return denied();
  const body = (await req.json().catch(() => null)) as { action?: string; ref?: string; amount_cents?: number; type?: "damage" | "cleaning" | "missing" } | null;
  if (body?.action === "reset_calls") {
    const payments = await getPaymentProvider();
    payments.clearRecordedCalls?.();
    return NextResponse.json({ ok: true });
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
