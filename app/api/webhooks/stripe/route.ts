import { NextResponse } from "next/server";
import { runAsSystem, sql } from "@/lib/db";
import { getLiveConfig } from "@/lib/settings/live";
import { recordBookingEvent } from "@/lib/booking-state/transition";
import { payoutProviderName } from "@/lib/payouts/hermetic";
import { normaliseStripeAccount } from "@/lib/payouts/stripe";
import { syncConnectAccountByRef } from "@/lib/payouts/connect";
import { reversePayout } from "@/lib/payouts/run";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook: hold authorisations that lapse, failed off-session charges, chargebacks, and
 * (Phase 7) Connect account state, transfer reversals and failed bank payouts on connected accounts.
 * Signature-verified with STRIPE_WEBHOOK_SECRET (platform events) or STRIPE_CONNECT_WEBHOOK_SECRET
 * (the "connected accounts" endpoint); idempotent by design (each handler is a state check, and
 * account events carry their event id so a redelivery is inert).
 */
export async function POST(req: Request) {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((s): s is string => !!s);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secrets.length || !key) return NextResponse.json({ error: "Stripe webhooks not configured" }, { status: 400 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(key);
  const raw = await req.text();
  let event: import("stripe").Stripe.Event | null = null;
  let lastError = "";
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(raw, sig, secret);
      break;
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  if (!event) return NextResponse.json({ error: `Bad signature: ${lastError}` }, { status: 400 });
  const system = { role: "system" as const, id: null, name: "fab.rent" };
  const connectEnabled = payoutProviderName() === "stripe";
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
    case "account.updated": {
      // the connected account's requirement state changed → mirror it, derive the pause flags, tell the provider
      if (!connectEnabled) break;
      const acct = event.data.object;
      const eventId = event.id;
      await runAsSystem((trx) => syncConnectAccountByRef(trx, acct.id, { state: normaliseStripeAccount(acct, event.livemode), event_id: eventId }));
      break;
    }
    case "account.external_account.created":
    case "account.external_account.updated":
    case "account.external_account.deleted": {
      // bank details changed on a connected account → re-read the account (the event object is the bank account, not the account)
      const account = event.account;
      if (!connectEnabled || !account) break;
      const eventId = event.id;
      await runAsSystem((trx) => syncConnectAccountByRef(trx, account, { event_id: eventId }));
      break;
    }
    case "transfer.reversed": {
      // money came back to the platform → the payout lands in the exception state and its entries clear again
      const tr = event.data.object;
      await runAsSystem(async (trx) => {
        const p = await trx.selectFrom("payouts").select("id").where("transfer_ref", "=", tr.id).executeTakeFirst();
        if (p) await reversePayout(trx, p.id, `reversed at Stripe (${tr.amount_reversed} of ${tr.amount} ${tr.currency})`);
      });
      break;
    }
    case "payout.failed": {
      // a connected account's own bank payout failed: the transfer already succeeded, Stripe returned the funds to the
      // connected balance and will flag the bank account on the next account.updated; note it for ops meanwhile
      const account = event.account;
      if (!connectEnabled || !account) break;
      const po = event.data.object;
      const eventId = event.id;
      await runAsSystem(async (trx) => {
        const row = await trx.selectFrom("connect_accounts as c").innerJoin("providers as p", "p.id", "c.provider_id").select(["c.provider_id", "p.name"]).where("c.account_ref", "=", account).executeTakeFirst();
        if (!row) return;
        await trx.insertInto("internal_notes").values({ target_type: "provider", target_id: row.provider_id, author_id: null, author_name: "System", body: `Bank payout ${po.id} failed at the payout provider${po.failure_message ? `: ${po.failure_message}` : ""}. The funds are back on the connected account; the bank details need attention before the next payout.` }).execute();
        await trx.insertInto("admin_actions").values({ actor_id: null, actor_name: "System", action: `bank payout failed for ${row.name}`, target_type: "provider", target_id: row.provider_id, target_label: row.name }).execute();
        await syncConnectAccountByRef(trx, account, { event_id: eventId });
      });
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ received: true });
}
