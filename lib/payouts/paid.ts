import "server-only";
import { sql, type Trx } from "@/lib/db";
import { now } from "@/lib/time";
import { notifyPayoutSent } from "@/lib/notifications/events";

export interface MarkPaidOptions {
  /** the transfer that moved the money (Phase 7); absent for an off-platform payout recorded by ops */
  transfer?: { ref: string; livemode: boolean; provider: "mock" | "stripe" } | null;
  /** exactly which cleared entries this payout covers (the run chose them before transferring); default: every cleared, unattached entry of the provider */
  entry_ids?: string[] | null;
}

/**
 * Records that a payout reached the provider's account and tells them. Called from the payout run
 * with the transfer result (Phase 7), or from ops for a payout made off-platform. Ledger entries move
 * to `paid`, a `payout` ledger row is written and the provider is told once (the outbox dedupes).
 * Runs as the system inside the caller's transaction (payouts and the ledger are system-owned).
 */
export async function markPayoutPaid(trx: Trx, payoutId: string, at: Date = now(), opts: MarkPaidOptions = {}): Promise<{ ok: true; amount_cents: number; rental_count: number } | { ok: false; error: string }> {
  const p = await trx.selectFrom("payouts").selectAll().where("id", "=", payoutId).forUpdate().executeTakeFirst();
  if (!p) return { ok: false, error: "Payout not found" };
  if (p.status === "paid") return { ok: false, error: "Already paid" };
  if (p.status !== "scheduled" && !opts.transfer) return { ok: false, error: `A ${p.status} payout can't be marked paid — release or retry it first` };
  let q = trx.updateTable("ledger_entries").set({ status: "paid", payout_id: p.id }).where("provider_id", "=", p.provider_id).where("status", "=", "available").where("type", "!=", "payout").where("payout_id", "is", null);
  if (opts.entry_ids) q = opts.entry_ids.length ? q.where("id", "in", opts.entry_ids) : q.where(sql<boolean>`false`);
  const attached = await q.returning(["net_cents"]).execute();
  const fromEntries = attached.reduce((s, e) => s + Number(e.net_cents), 0);
  const amount = attached.length ? fromEntries : Number(p.amount_cents);
  const rentals = attached.length ? attached.length : Number(p.rental_count);
  await trx
    .updateTable("payouts")
    .set({
      status: "paid",
      paid_at: at,
      amount_cents: amount,
      rental_count: rentals,
      exception: null,
      exception_detail: null,
      ...(opts.transfer ? { transfer_ref: opts.transfer.ref, livemode: opts.transfer.livemode, payout_provider: opts.transfer.provider, reconciled_at: at } : {}),
    })
    .where("id", "=", p.id)
    .execute();
  if (amount > 0) {
    await trx
      .insertInto("ledger_entries")
      .values({ provider_id: p.provider_id, booking_id: null, payout_id: p.id, entry_date: sql`(${at.toISOString()}::timestamptz)::date`, type: "payout", description: `Weekly payout · ${rentals} ${rentals === 1 ? "rental" : "rentals"} · ${p.account_masked ?? ""}`.trim(), gross_cents: 0, commission_cents: 0, adjustment_cents: 0, net_cents: amount, status: "paid" })
      .execute();
  }
  await notifyPayoutSent(trx, p.id);
  return { ok: true, amount_cents: amount, rental_count: rentals };
}
