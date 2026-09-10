import "server-only";
import { asSystem, sql, type Trx } from "@/lib/db";
import { fmt, nextPayoutDate, now } from "@/lib/time";
import { formatMoney } from "@/lib/format";
import { getLiveConfig } from "@/lib/settings/live";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import { notifyPayoutReminder } from "@/lib/notifications/events";
import { getPayoutProvider } from "./index";
import { markPayoutPaid } from "./paid";
import { getConnectAccount, syncConnectAccount } from "./connect";
import { isPayoutError, PayoutError, type PayoutErrorCode } from "./types";

/**
 * The payout run. Entries clear at return check-in (lib/booking-state); this module turns what has
 * cleared into transfers and reconciles the result back to `payouts`:
 *
 *   schedulePayouts   every provider with cleared, unattached entries gets one scheduled row for their next payout date
 *   attemptPayout     one payout: fresh account state → pause if it cannot be paid → ledger sum → balance check → transfer → paid
 *   runDuePayouts     every scheduled or paused row whose date has come (failed rows wait for ops)
 *   reconcilePayouts  re-reads recent transfers: a reversal puts the entries back and lands the row in the exception state
 *
 * Money moves only in `attemptPayout`, only for cleared ledger entries, and only for the amount the
 * ledger says. The idempotency key is (payout, attempt): a replay after a crash reuses the last key
 * and gets the same transfer back; a retry after a recorded failure gets a fresh key.
 */

export type AttemptOutcome =
  | { outcome: "paid"; amount_cents: number; rental_count: number; transfer_ref: string }
  | { outcome: "paused"; reason: string; detail: string | null }
  | { outcome: "failed"; reason: string; detail: string | null; code: PayoutErrorCode }
  | { outcome: "below_minimum"; amount_cents: number; next_scheduled_for: Date }
  | { outcome: "nothing_to_pay" }
  | { outcome: "already_paid" };

export interface AttemptOptions {
  at?: Date;
  trigger: "job" | "retry" | "release" | "pay_now";
  config?: MarketplaceConfig;
}

function failureCopy(code: PayoutErrorCode): string {
  switch (code) {
    case "insufficient_funds":
      return "Platform balance insufficient";
    case "account_restricted":
      return "Payout account restricted";
    case "not_found":
      return "Payout account not found";
    case "mode_mismatch":
    case "live_mode_refused":
      return "Mode mismatch";
    case "misconfigured":
      return "Payout provider misconfigured";
    case "invalid_amount":
      return "Nothing to transfer";
    default:
      return "Transfer failed";
  }
}

/** The market-local calendar date of an instant, as a SQL `date` (payouts.scheduled_for is a date column). */
function marketDate(at: Date, tz: string) {
  return sql<Date>`(${at.toISOString()}::timestamptz at time zone ${tz})::date`;
}

/** One scheduled row per provider with cleared money and no open payout; scheduled rows track the cleared total. */
export async function schedulePayouts(trx: Trx, at: Date = now(), config?: MarketplaceConfig): Promise<number> {
  const cfg = config ?? (await getLiveConfig());
  const tz = cfg.market.timezone;
  const payouts = await getPayoutProvider();
  return asSystem(trx, async (sys) => {
    const cleared = await sql<{ provider_id: string; schedule: string; account_masked: string | null; total: number; n: number; open_id: string | null; open_status: string | null }>`
      select p.id as provider_id, p.payout_schedule as schedule, p.payout_account_masked as account_masked,
             sum(l.net_cents)::int as total, count(*)::int as n,
             (select po.id from public.payouts po where po.provider_id = p.id and po.status in ('scheduled','paused','failed') order by po.scheduled_for limit 1) as open_id,
             (select po.status from public.payouts po where po.provider_id = p.id and po.status in ('scheduled','paused','failed') order by po.scheduled_for limit 1) as open_status
      from public.ledger_entries l join public.providers p on p.id = l.provider_id
      where l.status = 'available' and l.payout_id is null and l.type <> 'payout'
      group by 1, 2, 3`.execute(sys);
    let created = 0;
    for (const r of cleared.rows) {
      if (r.open_id) {
        if (r.open_status === "scheduled") await sys.updateTable("payouts").set({ amount_cents: r.total, rental_count: r.n }).where("id", "=", r.open_id).execute();
        continue;
      }
      const when = nextPayoutDate(at, r.schedule, tz);
      await sys.insertInto("payouts").values({ provider_id: r.provider_id, amount_cents: r.total, rental_count: r.n, scheduled_for: marketDate(when, tz), status: "scheduled", account_masked: r.account_masked, payout_provider: payouts.name, livemode: payouts.livemode }).execute();
      created++;
    }
    return created;
  });
}

/** Pays one payout row now, for exactly the cleared entries the ledger holds. */
export async function attemptPayout(trx: Trx, payoutId: string, opts: AttemptOptions): Promise<AttemptOutcome> {
  const at = opts.at ?? now();
  const cfg = opts.config ?? (await getLiveConfig());
  const tz = cfg.market.timezone;
  const payouts = await getPayoutProvider();
  return asSystem(trx, async (sys) => {
    const p = await sys.selectFrom("payouts").selectAll().where("id", "=", payoutId).forUpdate().executeTakeFirst();
    if (!p) throw new PayoutError("not_found", "Payout not found");
    if (p.status === "paid") return { outcome: "already_paid" };
    const provider = await sys.selectFrom("providers").select(["id", "name", "payout_schedule"]).where("id", "=", p.provider_id).executeTakeFirstOrThrow();

    // 1 · the account's real state, fresh from the payout provider
    const synced = await syncConnectAccount(sys, p.provider_id, { at });
    if (!synced || synced.derived.payouts_paused) {
      const reason = synced?.derived.reason ?? "Payout account not connected";
      const detail = synced?.derived.detail ?? null;
      await sys.updateTable("payouts").set({ status: "paused", exception: reason, exception_detail: detail, last_attempt_at: at, payout_provider: payouts.name }).where("id", "=", p.id).execute();
      // tell the provider once when a payout first pauses; ops "Remind" covers the follow-ups
      if (p.status !== "paused") await notifyPayoutReminder(sys, p.id, at);
      return { outcome: "paused", reason, detail };
    }
    const account = await getConnectAccount(sys, p.provider_id);
    if (!account || account.payout_provider !== payouts.name || account.livemode !== payouts.livemode) {
      const detail = account ? `account is ${account.payout_provider}/${account.livemode ? "live" : "test"}, this run is ${payouts.name}/${payouts.livemode ? "live" : "test"}` : "no payout account";
      await sys.updateTable("payouts").set({ status: "failed", exception: "Mode mismatch", exception_detail: detail, last_attempt_at: at }).where("id", "=", p.id).execute();
      return { outcome: "failed", reason: "Mode mismatch", detail, code: "mode_mismatch" };
    }

    // 2 · what has cleared: the transfer is exactly this sum, nothing else
    const entries = await sys.selectFrom("ledger_entries").select(["id", "net_cents"]).where("provider_id", "=", p.provider_id).where("status", "=", "available").where("type", "!=", "payout").where("payout_id", "is", null).orderBy("entry_date").execute();
    const amount = entries.reduce((s, e) => s + Number(e.net_cents), 0);
    const count = entries.length;
    if (count === 0 || amount <= 0) {
      await sys.updateTable("payouts").set({ last_attempt_at: at }).where("id", "=", p.id).execute();
      return { outcome: "nothing_to_pay" };
    }
    if (amount < cfg.payouts.min_payout_cents) {
      const next = nextPayoutDate(at, provider.payout_schedule, tz);
      await sys.updateTable("payouts").set({ status: "scheduled", amount_cents: amount, rental_count: count, scheduled_for: marketDate(next, tz), exception: null, exception_detail: `below the ${formatMoney(cfg.payouts.min_payout_cents)} minimum · rolls to ${fmt(next, "EEE d MMM", tz)}`, last_attempt_at: at }).where("id", "=", p.id).execute();
      return { outcome: "below_minimum", amount_cents: amount, next_scheduled_for: next };
    }

    // 3 · the money must be on the platform before it can be transferred
    const attempt = Number(p.transfer_attempts) + 1;
    const fail = async (reason: string, detail: string, code: PayoutErrorCode, transfer_ref?: string): Promise<AttemptOutcome> => {
      await sys.updateTable("payouts").set({ status: "failed", exception: reason, exception_detail: detail, last_attempt_at: at, amount_cents: amount, rental_count: count, ...(transfer_ref ? { transfer_ref } : {}) }).where("id", "=", p.id).execute();
      await sys.insertInto("admin_actions").values({ actor_id: null, actor_name: "System", action: `payout transfer failed for ${provider.name}: ${reason}`, target_type: "payout", target_id: p.id, target_label: provider.name }).execute();
      return { outcome: "failed", reason, detail, code };
    };
    let balance;
    try {
      balance = await payouts.platformBalance();
    } catch (e) {
      if (!isPayoutError(e)) throw e;
      return fail(failureCopy(e.code), `${e.message.slice(0, 140)} · attempt ${attempt}`, e.code);
    }
    if (balance.available_cents < amount) {
      return fail("Platform balance insufficient", `available ${formatMoney(balance.available_cents)} · needed ${formatMoney(amount)} · attempt ${attempt}`, "insufficient_funds");
    }

    // 4 · transfer, idempotent per (payout, attempt)
    await sys.updateTable("payouts").set({ transfer_attempts: attempt, last_attempt_at: at, payout_provider: payouts.name, livemode: payouts.livemode, amount_cents: amount, rental_count: count, account_masked: synced.derived.account_masked ?? p.account_masked }).where("id", "=", p.id).execute();
    const key = `payout:${p.id}:${attempt}`;
    let tr;
    try {
      tr = await payouts.transfer({ account_ref: account.account_ref, amount_cents: amount, idempotency_key: key, transfer_group: `payout_${p.id}`, description: `fab.rent payout · ${count} ${count === 1 ? "rental" : "rentals"}`, metadata: { payout_id: p.id, provider_id: p.provider_id, attempt: String(attempt) } });
    } catch (e) {
      if (!isPayoutError(e)) throw e;
      return fail(failureCopy(e.code), `${e.message.slice(0, 140)} · attempt ${attempt}`, e.code);
    }

    // 5 · reconcile: the provider's figure must equal the ledger's, to the cent, and land on the right account
    if (tr.amount_cents !== amount || tr.destination !== account.account_ref || tr.livemode !== payouts.livemode) {
      return fail("Reconciliation mismatch", `transfer ${tr.ref} is ${formatMoney(tr.amount_cents)} to ${tr.destination} (${tr.livemode ? "live" : "test"}); ledger says ${formatMoney(amount)} to ${account.account_ref} · attempt ${attempt}`, "provider_error", tr.ref);
    }
    const paid = await markPayoutPaid(sys, p.id, at, { transfer: { ref: tr.ref, livemode: tr.livemode, provider: payouts.name }, entry_ids: entries.map((e) => e.id) });
    if (!paid.ok) throw new PayoutError("provider_error", paid.error);
    return { outcome: "paid", amount_cents: paid.amount_cents, rental_count: paid.rental_count, transfer_ref: tr.ref };
  });
}

export interface RunTally {
  scheduled: number;
  paid: number;
  paused: number;
  failed: number;
  skipped: number;
  reconciled: number;
  reversed: number;
}

/** Every scheduled or paused row whose date has come. Failed rows are ops' to retry. */
export async function runDuePayouts(trx: Trx, at: Date = now(), config?: MarketplaceConfig): Promise<Omit<RunTally, "scheduled" | "reconciled" | "reversed">> {
  const cfg = config ?? (await getLiveConfig());
  const tz = cfg.market.timezone;
  const due = await asSystem(trx, (sys) => sys.selectFrom("payouts").select("id").where("status", "in", ["scheduled", "paused"]).where("scheduled_for", "<=", marketDate(at, tz)).orderBy("scheduled_for").execute());
  const tally = { paid: 0, paused: 0, failed: 0, skipped: 0 };
  for (const row of due) {
    const r = await attemptPayout(trx, row.id, { at, trigger: "job", config: cfg });
    if (r.outcome === "paid") tally.paid++;
    else if (r.outcome === "paused") tally.paused++;
    else if (r.outcome === "failed") tally.failed++;
    else tally.skipped++;
  }
  return tally;
}

/** A transfer the provider reversed (from a webhook or reconciliation): the money is back on the platform, the entries clear again, ops sees an exception. */
export async function reversePayout(trx: Trx, payoutId: string, detail: string, at: Date = now()): Promise<boolean> {
  return asSystem(trx, async (sys) => {
    const p = await sys.selectFrom("payouts as po").innerJoin("providers as pv", "pv.id", "po.provider_id").select(["po.id", "po.status", "po.amount_cents", "po.transfer_ref", "po.provider_id", "pv.name"]).where("po.id", "=", payoutId).forUpdate().executeTakeFirst();
    if (!p || p.status !== "paid") return false;
    await sys.updateTable("payouts").set({ status: "failed", exception: "Transfer reversed", exception_detail: detail.slice(0, 200), paid_at: null, reconciled_at: at }).where("id", "=", p.id).execute();
    await sys.updateTable("ledger_entries").set({ status: "available", payout_id: null }).where("payout_id", "=", p.id).where("type", "!=", "payout").execute();
    await sys.insertInto("ledger_entries").values({ provider_id: p.provider_id, booking_id: null, payout_id: p.id, entry_date: sql`(${at.toISOString()}::timestamptz)::date`, type: "payout", description: `Payout reversed · ${p.transfer_ref ?? ""}`.trim(), gross_cents: 0, commission_cents: 0, adjustment_cents: 0, net_cents: -Number(p.amount_cents), status: "paid" }).execute();
    await sys.insertInto("internal_notes").values({ target_type: "provider", target_id: p.provider_id, author_id: null, author_name: "System", body: `Payout ${formatMoney(Number(p.amount_cents))} reversed by the payout provider (${p.transfer_ref ?? "no transfer ref"}): ${detail}. The rentals are cleared again and will go out with the next run once resolved.` }).execute();
    await sys.insertInto("admin_actions").values({ actor_id: null, actor_name: "System", action: `payout transfer reversed for ${p.name}`, target_type: "payout", target_id: p.id, target_label: p.name }).execute();
    return true;
  });
}

/** Re-reads recent transfers from the provider: amounts must still match, reversals land in the exception state. */
export async function reconcilePayouts(trx: Trx, at: Date = now()): Promise<{ reconciled: number; reversed: number }> {
  const payouts = await getPayoutProvider();
  const rows = await asSystem(trx, (sys) =>
    sys
      .selectFrom("payouts")
      .select(["id", "transfer_ref", "amount_cents", "payout_provider"])
      .where("status", "=", "paid")
      .where("transfer_ref", "is not", null)
      .where("payout_provider", "=", payouts.name)
      .where("livemode", "=", payouts.livemode)
      .where("paid_at", ">=", new Date(at.getTime() - 14 * 86_400_000))
      .orderBy("paid_at", "desc")
      .limit(50)
      .execute(),
  );
  let reconciled = 0;
  let reversed = 0;
  for (const r of rows) {
    let tr;
    try {
      tr = await payouts.getTransfer(r.transfer_ref!);
    } catch (e) {
      if (isPayoutError(e)) continue;
      throw e;
    }
    if (tr.reversed) {
      if (await reversePayout(trx, r.id, "reversed at the payout provider", at)) reversed++;
      continue;
    }
    await asSystem(trx, (sys) => sys.updateTable("payouts").set({ reconciled_at: at, ...(tr.amount_cents !== Number(r.amount_cents) ? { exception: "Reconciliation mismatch", exception_detail: `transfer ${tr.ref} is ${formatMoney(tr.amount_cents)}, ledger says ${formatMoney(Number(r.amount_cents))}` } : {}) }).where("id", "=", r.id).execute());
    reconciled++;
  }
  return { reconciled, reversed };
}

/** The scheduled job: schedule → pay what is due → reconcile. */
export async function runPayoutJob(trx: Trx, at: Date = now()): Promise<RunTally> {
  const cfg = await getLiveConfig();
  const scheduled = await schedulePayouts(trx, at, cfg);
  const due = await runDuePayouts(trx, at, cfg);
  const rec = await reconcilePayouts(trx, at);
  return { scheduled, ...due, reconciled: rec.reconciled, reversed: rec.reversed };
}

/** Toast / log copy for an attempt. */
export function describeOutcome(r: AttemptOutcome): string {
  switch (r.outcome) {
    case "paid":
      return `Paid ${formatMoney(r.amount_cents)} · ${r.rental_count} ${r.rental_count === 1 ? "rental" : "rentals"} · ${r.transfer_ref} · provider notified`;
    case "paused":
      return `Still paused: ${r.reason}${r.detail ? ` · ${r.detail}` : ""}`;
    case "failed":
      return `${r.reason}${r.detail ? ` · ${r.detail}` : ""}`;
    case "below_minimum":
      return `${formatMoney(r.amount_cents)} is below the minimum payout · rolls to the next run`;
    case "nothing_to_pay":
      return "Nothing has cleared for this provider yet";
    case "already_paid":
      return "Already paid";
  }
}
