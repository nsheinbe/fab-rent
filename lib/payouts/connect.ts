import "server-only";
import type { Selectable } from "kysely";
import { asSystem, type DB, type Trx } from "@/lib/db";
import { fmt, now } from "@/lib/time";
import { getLiveConfig } from "@/lib/settings/live";
import { notifyPayoutAccountAction, notifyPayoutAccountVerified } from "@/lib/notifications/events";
import { getPayoutProvider } from "./index";
import { derivePayoutState, type DerivedPayoutState } from "./requirements";
import { PayoutError, type ConnectAccountState, type ConnectExternalAccount, type ConnectRequirements, type OnboardingScenario } from "./types";

/**
 * The connected payout account behind a provider. `connect_accounts` is fab.rent's mirror of the
 * account's real state at the payout provider (Stripe Connect or the mock): every sync, webhook
 * event or onboarding return goes through `applyConnectState`, which rewrites the mirror, the
 * provider's tax-ID / bank / paused flags, moves scheduled payouts to paused (and back) and tells
 * the provider what changed. Nothing here is hand-set.
 */

export interface ConnectAccountRow {
  provider_id: string;
  payout_provider: string;
  account_ref: string;
  livemode: boolean;
  business_type: string | null;
  details_submitted: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements: ConnectRequirements;
  disabled_reason: string | null;
  external_account: ConnectExternalAccount | null;
  onboarding_started_at: Date | null;
  onboarding_completed_at: Date | null;
  last_synced_at: Date | null;
  last_event_id: string | null;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
}

export function parseRequirements(v: unknown): ConnectRequirements {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const errors = Array.isArray(o.errors) ? (o.errors as unknown[]).filter((e): e is Record<string, unknown> => !!e && typeof e === "object").map((e) => ({ code: String(e.code ?? ""), reason: String(e.reason ?? ""), requirement: String(e.requirement ?? "") })) : [];
  return { currently_due: strings(o.currently_due), past_due: strings(o.past_due), eventually_due: strings(o.eventually_due), pending_verification: strings(o.pending_verification), errors, current_deadline: typeof o.current_deadline === "string" ? o.current_deadline : null };
}

export function parseExternalAccount(v: unknown): ConnectExternalAccount | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x ? x : null);
  return { bank_name: str(o.bank_name), last4: str(o.last4), currency: str(o.currency), status: str(o.status) };
}

function toRow(r: Selectable<DB["connect_accounts"]>): ConnectAccountRow {
  return {
    provider_id: r.provider_id,
    payout_provider: r.payout_provider,
    account_ref: r.account_ref,
    livemode: r.livemode,
    business_type: r.business_type,
    details_submitted: r.details_submitted,
    charges_enabled: r.charges_enabled,
    payouts_enabled: r.payouts_enabled,
    requirements: parseRequirements(r.requirements),
    disabled_reason: r.disabled_reason,
    external_account: parseExternalAccount(r.external_account),
    onboarding_started_at: r.onboarding_started_at,
    onboarding_completed_at: r.onboarding_completed_at,
    last_synced_at: r.last_synced_at,
    last_event_id: r.last_event_id,
  };
}

export function rowToState(row: ConnectAccountRow): ConnectAccountState {
  return { account_ref: row.account_ref, livemode: row.livemode, business_type: row.business_type, details_submitted: row.details_submitted, charges_enabled: row.charges_enabled, payouts_enabled: row.payouts_enabled, requirements: row.requirements, disabled_reason: row.disabled_reason, external_account: row.external_account };
}

/** The stored mirror for a provider (RLS: members and staff can read it). */
export async function getConnectAccount(trx: Trx, providerId: string): Promise<ConnectAccountRow | null> {
  const r = await trx.selectFrom("connect_accounts").selectAll().where("provider_id", "=", providerId).executeTakeFirst();
  return r ? toRow(r) : null;
}

export async function getConnectAccountByRef(trx: Trx, accountRef: string): Promise<ConnectAccountRow | null> {
  const r = await asSystem(trx, (sys) => sys.selectFrom("connect_accounts").selectAll().where("account_ref", "=", accountRef).executeTakeFirst());
  return r ? toRow(r) : null;
}

function since(d: Date, tz: string) {
  return fmt(d, "d MMM", tz);
}

export interface ProviderPayoutState {
  account: ConnectAccountRow | null;
  derived: DerivedPayoutState;
  provider: { id: string; name: string; kind: string; payout_schedule: string; payouts_paused: boolean; payouts_paused_reason: string | null; payouts_paused_since: Date | null; payout_account_masked: string | null; tax_id_verified: boolean; payout_account_verified: boolean };
}

/** What the console renders: the stored mirror plus the derived flags. No network call. */
export async function providerPayoutState(trx: Trx, providerId: string): Promise<ProviderPayoutState> {
  const config = await getLiveConfig();
  const [provider, account] = await Promise.all([
    trx.selectFrom("providers").select(["id", "name", "kind", "payout_schedule", "payouts_paused", "payouts_paused_reason", "payouts_paused_since", "payout_account_masked", "tax_id_verified", "payout_account_verified"]).where("id", "=", providerId).executeTakeFirstOrThrow(),
    getConnectAccount(trx, providerId),
  ]);
  const derived = derivePayoutState(account ? rowToState(account) : null, config.payouts, { paused_since: provider.payouts_paused_since, formatDate: (d) => since(d, config.market.timezone) });
  return { account, derived, provider };
}

async function assertAdapterOwns(row: ConnectAccountRow) {
  const payouts = await getPayoutProvider();
  if (row.payout_provider !== payouts.name) {
    throw new PayoutError("mode_mismatch", `This payout account (${row.account_ref}) belongs to the ${row.payout_provider} adapter, but PAYOUTS_PROVIDER is ${payouts.name}. Reconnect the account under the current provider.`);
  }
  if (row.livemode !== payouts.livemode) {
    throw new PayoutError("mode_mismatch", `Account ${row.account_ref} is ${row.livemode ? "live" : "test"} mode but this configuration is ${payouts.livemode ? "live" : "test"} mode.`);
  }
  return payouts;
}

/** Creates the connected account at the payout provider the first time a provider starts onboarding. */
export async function ensureConnectAccount(trx: Trx, providerId: string, at: Date = now()): Promise<ConnectAccountRow> {
  const existing = await asSystem(trx, (sys) => getConnectAccount(sys, providerId));
  if (existing) {
    await assertAdapterOwns(existing);
    return existing;
  }
  const payouts = await getPayoutProvider();
  const p = await asSystem(trx, (sys) => sys.selectFrom("providers as pv").innerJoin("profiles as o", "o.id", "pv.owner_profile_id").select(["pv.id", "pv.name", "pv.kind", "o.email"]).where("pv.id", "=", providerId).executeTakeFirstOrThrow());
  const state = await payouts.createAccount({ provider_id: p.id, email: p.email, name: p.name, business_type: p.kind === "business" ? "company" : "individual", metadata: { provider_name: p.name.slice(0, 200) } });
  await asSystem(trx, (sys) =>
    sys
      .insertInto("connect_accounts")
      .values({
        provider_id: providerId,
        payout_provider: payouts.name,
        account_ref: state.account_ref,
        livemode: state.livemode,
        business_type: state.business_type,
        details_submitted: state.details_submitted,
        charges_enabled: state.charges_enabled,
        payouts_enabled: state.payouts_enabled,
        requirements: JSON.stringify(state.requirements),
        disabled_reason: state.disabled_reason,
        external_account: state.external_account ? JSON.stringify(state.external_account) : null,
        last_synced_at: at,
      })
      .execute(),
  );
  const row = await asSystem(trx, (sys) => getConnectAccount(sys, providerId));
  if (!row) throw new PayoutError("provider_error", "Could not store the payout account");
  return row;
}

/** Hosted onboarding: creates the account if needed and returns the provider's onboarding URL. */
export async function startPayoutOnboarding(trx: Trx, providerId: string, urls: { return_url: string; refresh_url: string }, at: Date = now()): Promise<{ url: string; expires_at: Date }> {
  const row = await ensureConnectAccount(trx, providerId, at);
  const payouts = await getPayoutProvider();
  const link = await payouts.createOnboardingLink({ account_ref: row.account_ref, return_url: urls.return_url, refresh_url: urls.refresh_url });
  if (!row.onboarding_started_at) await asSystem(trx, (sys) => sys.updateTable("connect_accounts").set({ onboarding_started_at: at }).where("provider_id", "=", providerId).execute());
  return link;
}

export interface ApplyOptions {
  at?: Date;
  /** webhook event id; a redelivered event is inert */
  event_id?: string | null;
  source: "sync" | "webhook" | "onboarding";
}

/**
 * The one writer of the account mirror and the flags derived from it. Idempotent: applying the same
 * state twice changes nothing and tells nobody twice (the outbox dedupes).
 */
export async function applyConnectState(trx: Trx, providerId: string, state: ConnectAccountState, opts: ApplyOptions): Promise<DerivedPayoutState> {
  const at = opts.at ?? now();
  const config = await getLiveConfig();
  const tz = config.market.timezone;
  const formatDate = (d: Date) => since(d, tz);
  return asSystem(trx, async (sys) => {
    const provider = await sys.selectFrom("providers").select(["id", "name", "payouts_paused", "payouts_paused_since", "payout_account_masked"]).where("id", "=", providerId).forUpdate().executeTakeFirstOrThrow();
    const existing = await getConnectAccount(sys, providerId);
    if (!existing) throw new PayoutError("not_found", `Provider ${providerId} has no payout account yet`);
    if (existing.account_ref !== state.account_ref) throw new PayoutError("mode_mismatch", `Account ${state.account_ref} does not belong to this provider (it has ${existing.account_ref})`);
    const prev = derivePayoutState(rowToState(existing), config.payouts, { paused_since: provider.payouts_paused_since, formatDate });
    if (opts.event_id && existing.last_event_id === opts.event_id) return prev;
    const derived = derivePayoutState(state, config.payouts, { paused_since: provider.payouts_paused_since ?? at, formatDate });
    const pausedSince = derived.payouts_paused ? (provider.payouts_paused_since ?? at) : null;
    await sys
      .updateTable("connect_accounts")
      .set({
        livemode: state.livemode,
        business_type: state.business_type,
        details_submitted: state.details_submitted,
        charges_enabled: state.charges_enabled,
        payouts_enabled: state.payouts_enabled,
        requirements: JSON.stringify(state.requirements),
        disabled_reason: state.disabled_reason,
        external_account: state.external_account ? JSON.stringify(state.external_account) : null,
        onboarding_completed_at: state.details_submitted ? (existing.onboarding_completed_at ?? at) : existing.onboarding_completed_at,
        last_synced_at: at,
        ...(opts.event_id ? { last_event_id: opts.event_id } : {}),
      })
      .where("provider_id", "=", providerId)
      .execute();
    await sys
      .updateTable("providers")
      .set({ tax_id_verified: derived.tax_id_verified, payout_account_verified: derived.payout_account_verified, payout_account_masked: derived.account_masked, payouts_paused: derived.payouts_paused, payouts_paused_reason: derived.paused_reason, payouts_paused_since: pausedSince })
      .where("id", "=", providerId)
      .execute();
    // payout rows follow the account: paused while it cannot be paid, back on the schedule once it can
    if (derived.payouts_paused) {
      await sys.updateTable("payouts").set({ status: "paused", exception: derived.reason ?? "Payouts paused", exception_detail: derived.detail }).where("provider_id", "=", providerId).where("status", "=", "scheduled").execute();
    } else {
      await sys.updateTable("payouts").set({ status: "scheduled", exception: null, exception_detail: null, account_masked: derived.account_masked }).where("provider_id", "=", providerId).where("status", "=", "paused").execute();
      await sys.updateTable("payouts").set({ account_masked: derived.account_masked }).where("provider_id", "=", providerId).where("status", "=", "scheduled").execute();
    }
    const notice = { account_ref: state.account_ref, account_masked: derived.account_masked, outstanding: derived.outstanding.map((o) => o.label), reason: derived.reason, detail: derived.detail, deadline: derived.deadline };
    if (derived.status === "verified" && prev.status !== "verified") {
      await notifyPayoutAccountVerified(sys, providerId, notice);
    } else if (state.details_submitted && (derived.status === "action_needed" || derived.status === "restricted") && derived.outstanding.length) {
      const changed = prev.outstanding.map((o) => o.key).sort().join("|") !== derived.outstanding.map((o) => o.key).sort().join("|") || prev.status === "not_connected" || prev.status === "onboarding" || prev.status === "verified";
      if (changed) await notifyPayoutAccountAction(sys, providerId, notice);
    }
    return derived;
  });
}

/** Fresh state from the payout provider, applied. Null when the provider has no account yet. */
export async function syncConnectAccount(trx: Trx, providerId: string, opts: { at?: Date } = {}): Promise<{ state: ConnectAccountState; derived: DerivedPayoutState } | null> {
  const row = await asSystem(trx, (sys) => getConnectAccount(sys, providerId));
  if (!row) return null;
  const payouts = await assertAdapterOwns(row);
  const state = await payouts.getAccount(row.account_ref, rowToState(row));
  const derived = await applyConnectState(trx, providerId, state, { at: opts.at, source: "sync" });
  return { state, derived };
}

/** Webhook entry point: apply the event's account object when given, otherwise re-read the account. */
export async function syncConnectAccountByRef(trx: Trx, accountRef: string, opts: { state?: ConnectAccountState | null; event_id?: string | null; at?: Date } = {}): Promise<{ provider_id: string; derived: DerivedPayoutState } | null> {
  const row = await getConnectAccountByRef(trx, accountRef);
  if (!row) return null;
  const payouts = await assertAdapterOwns(row);
  const state = opts.state ?? (await payouts.getAccount(row.account_ref, rowToState(row)));
  const derived = await applyConnectState(trx, row.provider_id, state, { at: opts.at, event_id: opts.event_id ?? null, source: "webhook" });
  return { provider_id: row.provider_id, derived };
}

/** Demo only: the simulated hosted onboarding reports its outcome, then the account is synced exactly as a Stripe return would be. */
export async function completeMockOnboarding(trx: Trx, providerId: string, scenario: OnboardingScenario, opts: { last4?: string; bank_name?: string } = {}, at: Date = now()): Promise<DerivedPayoutState> {
  const row = await ensureConnectAccount(trx, providerId, at);
  const payouts = await getPayoutProvider();
  if (!payouts.completeOnboarding) throw new PayoutError("misconfigured", `Onboarding for ${payouts.name} is hosted by the payout provider; there is nothing to simulate`);
  payouts.completeOnboarding(row.account_ref, scenario, { business_type: row.business_type === "company" ? "company" : "individual", last4: opts.last4, bank_name: opts.bank_name });
  const synced = await syncConnectAccount(trx, providerId, { at });
  if (!synced) throw new PayoutError("not_found", "Payout account vanished during onboarding");
  return synced.derived;
}
