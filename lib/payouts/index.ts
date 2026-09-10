import "server-only";
import { sql, type Trx } from "@/lib/db";
import { now } from "@/lib/time";
import { notifyPayoutSent } from "@/lib/notifications/events";

/**
 * Records that a scheduled payout reached the provider's account and tells them. No money moves
 * here: in the pilot ops pays off-platform and marks the row (admin → Payouts → "Mark paid");
 * Phase 7 calls the same function from the transfer result. Runs as the system inside the
 * caller's transaction (payouts and the ledger are system-owned).
 */
export async function markPayoutPaid(trx: Trx, payoutId: string, at: Date = now()): Promise<{ ok: true; amount_cents: number; rental_count: number } | { ok: false; error: string }> {
  const p = await trx.selectFrom("payouts").selectAll().where("id", "=", payoutId).forUpdate().executeTakeFirst();
  if (!p) return { ok: false, error: "Payout not found" };
  if (p.status === "paid") return { ok: false, error: "Already paid" };
  if (p.status !== "scheduled") return { ok: false, error: `A ${p.status} payout can't be marked paid — release or retry it first` };
  // cleared entries not yet attached to a payout go out with this one
  const attached = await trx
    .updateTable("ledger_entries")
    .set({ status: "paid", payout_id: p.id })
    .where("provider_id", "=", p.provider_id)
    .where("status", "=", "available")
    .where("type", "!=", "payout")
    .where("payout_id", "is", null)
    .returning(["net_cents"])
    .execute();
  const fromEntries = attached.reduce((s, e) => s + Number(e.net_cents), 0);
  const amount = attached.length ? fromEntries : Number(p.amount_cents);
  const rentals = attached.length ? attached.length : Number(p.rental_count);
  await trx.updateTable("payouts").set({ status: "paid", paid_at: at, amount_cents: amount, rental_count: rentals, exception: null, exception_detail: null }).where("id", "=", p.id).execute();
  if (amount > 0) {
    await trx
      .insertInto("ledger_entries")
      .values({ provider_id: p.provider_id, booking_id: null, payout_id: p.id, entry_date: sql`(${at.toISOString()}::timestamptz)::date`, type: "payout", description: `Weekly payout · ${rentals} ${rentals === 1 ? "rental" : "rentals"} · ${p.account_masked ?? ""}`.trim(), gross_cents: 0, commission_cents: 0, adjustment_cents: 0, net_cents: amount, status: "paid" })
      .execute();
  }
  await notifyPayoutSent(trx, p.id);
  return { ok: true, amount_cents: amount, rental_count: rentals };
}
