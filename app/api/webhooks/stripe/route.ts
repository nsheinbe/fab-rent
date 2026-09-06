import { NextResponse } from "next/server";
import { runAsSystem, sql } from "@/lib/db";
import { getLiveConfig } from "@/lib/settings/live";
import { recordBookingEvent } from "@/lib/booking-state/transition";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook: hold authorisations that lapse, failed off-session charges and chargebacks.
 * Signature-verified with STRIPE_WEBHOOK_SECRET; idempotent by design (each handler is a state check).
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) return NextResponse.json({ error: "Stripe webhooks not configured" }, { status: 400 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key);
  let event: import("stripe").Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 });
  }
  const system = { role: "system" as const, id: null, name: "fab.rent" };
  switch (event.type) {
    case "payment_intent.canceled": {
      // an authorisation that lapsed (or was cancelled outside our release path) → hold expired
      const pi = event.data.object;
      await runAsSystem(async (trx) => {
        const b = await trx.selectFrom("bookings").select(["id", "hold_status"]).where(sql<string>`payment_refs->>'hold'`, "=", pi.id).executeTakeFirst();
        if (b && b.hold_status === "placed") {
          await trx.updateTable("bookings").set({ hold_status: "expired" }).where("id", "=", b.id).execute();
          await recordBookingEvent(trx, b.id, "hold_expired", system, { stripe: pi.id });
        }
      });
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      await runAsSystem(async (trx) => {
        const b = await trx.selectFrom("bookings").select("id").where(sql<string>`payment_refs->>'charge'`, "=", pi.id).executeTakeFirst();
        if (b) await recordBookingEvent(trx, b.id, "payment_failed", system, { stripe: pi.id, reason: pi.last_payment_error?.message ?? null });
      });
      break;
    }
    case "charge.dispute.created": {
      // chargeback → flag the renter; auto-suspend when the marketplace setting says so
      const dispute = event.data.object;
      const config = await getLiveConfig();
      const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
      if (!piId) break;
      await runAsSystem(async (trx) => {
        const b = await trx.selectFrom("bookings").select(["id", "ref", "renter_id"]).where(sql<string>`payment_refs->>'charge'`, "=", piId).executeTakeFirst();
        if (!b) return;
        const p = await trx.selectFrom("profiles").select(["flags", "name", "public_id"]).where("id", "=", b.renter_id).executeTakeFirstOrThrow();
        await trx.updateTable("profiles").set({ flags: [...new Set([...p.flags, "chargeback"])], ...(config.verification.auto_suspend_on_chargeback ? { status: "suspended" as const } : {}) }).where("id", "=", b.renter_id).execute();
        await trx.insertInto("internal_notes").values({ target_type: "profile", target_id: b.renter_id, author_id: null, author_name: "System", body: `Chargeback received (${dispute.id}) on ${b.ref}. ${config.verification.auto_suspend_on_chargeback ? "Auto-suspended pending review." : "Flagged for review."}` }).execute();
        await trx.insertInto("admin_actions").values({ actor_id: null, actor_name: "System", action: `${config.verification.auto_suspend_on_chargeback ? "suspended" : "flagged"} user #${p.public_id} after chargeback`, target_type: "profile", target_id: b.renter_id, target_label: `#${p.public_id}` }).execute();
        await recordBookingEvent(trx, b.id, "chargeback_received", system, { stripe: dispute.id, amount_cents: dispute.amount });
      });
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ received: true });
}
