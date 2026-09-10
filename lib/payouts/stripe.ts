import Stripe from "stripe";
import type { BalanceResult, ConnectAccountState, CreateAccountInput, PayoutProvider, TransferInput, TransferResult } from "./types";
import { PayoutError } from "./types";
import { liveModeAllowed, missingConnectSecrets, stripeKeyMode } from "./hermetic";

type Env = Record<string, string | undefined>;

/**
 * Stripe Connect adapter: separate charges and transfers. The platform charges the renter (see
 * lib/payments/stripe.ts) and, once the ledger has cleared, transfers the provider's share to their
 * Express connected account. Express onboarding is Stripe-hosted (Account Links), so bank details
 * and identity documents never touch fab.rent; the account's requirement state is read back and
 * mirrored. A deposit hold stays a platform-side authorisation and is never part of a transfer.
 *
 * Fail-closed: refuses to construct without the Connect secrets, with a live key unless
 * PAYOUTS_LIVE_MODE=1, and with a test key when that flag is set. Every account and transfer is
 * checked against the key's mode, so a test-mode run can never move live money.
 */

/** The slice of the SDK the adapter uses, so tests inject a stub and never touch the network. */
export interface StripeConnectClient {
  accounts: {
    create(params: Stripe.AccountCreateParams): Promise<Stripe.Account>;
    retrieve(id: string): Promise<Stripe.Account>;
  };
  accountLinks: {
    create(params: Stripe.AccountLinkCreateParams): Promise<Stripe.AccountLink>;
  };
  transfers: {
    create(params: Stripe.TransferCreateParams, options?: Stripe.RequestOptions): Promise<Stripe.Transfer>;
    retrieve(id: string): Promise<Stripe.Transfer>;
  };
  balance: {
    retrieve(params?: Stripe.BalanceRetrieveParams, options?: Stripe.RequestOptions): Promise<Stripe.Balance>;
  };
}

/**
 * Normalise a Stripe account object (from the API or an `account.updated` webhook) into the shape the
 * product reads. Account objects carry no `livemode` of their own: the caller passes the mode of the
 * key or event that produced it.
 */
export function normaliseStripeAccount(a: Stripe.Account, livemode: boolean): ConnectAccountState {
  const req = a.requirements ?? null;
  const first = a.external_accounts?.data?.[0] ?? null;
  let external_account: ConnectAccountState["external_account"] = null;
  if (first && first.object === "bank_account") {
    external_account = { bank_name: first.bank_name ?? null, last4: first.last4 ?? null, currency: first.currency ?? null, status: first.status ?? null };
  } else if (first) {
    external_account = { bank_name: first.brand ?? null, last4: first.last4 ?? null, currency: first.currency ?? null, status: null };
  }
  return {
    account_ref: a.id,
    livemode,
    business_type: a.business_type ?? null,
    details_submitted: !!a.details_submitted,
    charges_enabled: !!a.charges_enabled,
    payouts_enabled: !!a.payouts_enabled,
    requirements: {
      currently_due: req?.currently_due ?? [],
      past_due: req?.past_due ?? [],
      eventually_due: req?.eventually_due ?? [],
      pending_verification: req?.pending_verification ?? [],
      errors: (req?.errors ?? []).map((e) => ({ code: String(e.code), reason: e.reason, requirement: e.requirement })),
      current_deadline: req?.current_deadline ? new Date(req.current_deadline * 1000).toISOString() : null,
    },
    disabled_reason: req?.disabled_reason ?? null,
    external_account,
  };
}

function toTransferResult(tr: Stripe.Transfer): TransferResult {
  return {
    ok: true,
    ref: tr.id,
    amount_cents: tr.amount,
    currency: tr.currency,
    livemode: !!tr.livemode,
    destination: typeof tr.destination === "string" ? tr.destination : (tr.destination?.id ?? ""),
    created_at: new Date(tr.created * 1000),
    reversed: !!tr.reversed,
  };
}

export class StripePayoutProvider implements PayoutProvider {
  readonly name = "stripe" as const;
  readonly livemode: boolean;
  private readonly client: StripeConnectClient;
  private readonly env: Env;

  constructor(opts: { env?: Env; client?: StripeConnectClient } = {}) {
    const env = opts.env ?? process.env;
    this.env = env;
    const missing = missingConnectSecrets(env);
    if (missing.length) throw new PayoutError("misconfigured", `PAYOUTS_PROVIDER=stripe is fail-closed without Connect secrets: missing ${missing.join(", ")}`);
    const key = env.STRIPE_SECRET_KEY!;
    const mode = stripeKeyMode(key);
    if (mode === null) throw new PayoutError("misconfigured", "STRIPE_SECRET_KEY must be sk_test_… / rk_test_… (test) or sk_live_… / rk_live_… (live) so the mode is unambiguous");
    if (mode === "live" && !liveModeAllowed(env)) throw new PayoutError("live_mode_refused", "STRIPE_SECRET_KEY is a live key: live payouts are refused unless PAYOUTS_LIVE_MODE=1 is set deliberately");
    if (mode === "test" && liveModeAllowed(env)) throw new PayoutError("misconfigured", "PAYOUTS_LIVE_MODE=1 with a test key: unset the flag for test mode, or supply the live key deliberately");
    this.livemode = mode === "live";
    this.client = opts.client ?? (new Stripe(key) as unknown as StripeConnectClient);
  }

  private currency() {
    // MRD is fictional; Stripe test mode runs in the real currency configured here (same as the charges).
    return (this.env.STRIPE_CURRENCY ?? "usd").toLowerCase();
  }

  private assertMode(livemode: boolean, what: string) {
    if (livemode !== this.livemode) throw new PayoutError("mode_mismatch", `${what} is a ${livemode ? "live" : "test"}-mode object but this configuration is ${this.livemode ? "live" : "test"} mode`);
  }

  private mapError(e: unknown): never {
    if (e instanceof PayoutError) throw e;
    const err = e as { type?: string; code?: string; message?: string } | null;
    const message = err?.message ?? String(e);
    const code = err?.code ?? "";
    if (err?.type === "StripeInvalidRequestError" || e instanceof Stripe.errors.StripeInvalidRequestError) {
      if (code === "balance_insufficient" || /insufficient/i.test(message)) throw new PayoutError("insufficient_funds", message);
      if (code === "account_invalid" || code === "resource_missing") throw new PayoutError("not_found", message);
      if (/capabilit|restricted|not (yet )?enabled|cannot currently|rejected|verification/i.test(message)) throw new PayoutError("account_restricted", message);
      throw new PayoutError("provider_error", message);
    }
    if (err?.type === "StripePermissionError" || e instanceof Stripe.errors.StripePermissionError) throw new PayoutError("account_restricted", message);
    throw new PayoutError("provider_error", message);
  }

  async createAccount(input: CreateAccountInput): Promise<ConnectAccountState> {
    try {
      const acct = await this.client.accounts.create({
        type: "express",
        country: input.country ?? this.env.STRIPE_CONNECT_COUNTRY ?? "US",
        email: input.email ?? undefined,
        business_type: input.business_type,
        capabilities: { transfers: { requested: true } },
        business_profile: { name: input.name, product_description: "Equipment, tool and event-supply rental through fab.rent" },
        metadata: { provider_id: input.provider_id, ...(input.metadata ?? {}) },
      });
      const state = normaliseStripeAccount(acct, this.livemode);
      this.assertMode(state.livemode, `Account ${state.account_ref}`);
      return state;
    } catch (e) {
      this.mapError(e);
    }
  }

  async createOnboardingLink(input: { account_ref: string; refresh_url: string; return_url: string }): Promise<{ url: string; expires_at: Date }> {
    try {
      const link = await this.client.accountLinks.create({ account: input.account_ref, refresh_url: input.refresh_url, return_url: input.return_url, type: "account_onboarding", collection_options: { fields: "eventually_due" } });
      return { url: link.url, expires_at: new Date(link.expires_at * 1000) };
    } catch (e) {
      this.mapError(e);
    }
  }

  async getAccount(account_ref: string): Promise<ConnectAccountState> {
    try {
      const state = normaliseStripeAccount(await this.client.accounts.retrieve(account_ref), this.livemode);
      this.assertMode(state.livemode, `Account ${account_ref}`);
      return state;
    } catch (e) {
      this.mapError(e);
    }
  }

  async transfer(input: TransferInput): Promise<TransferResult> {
    if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) throw new PayoutError("invalid_amount", "Nothing to transfer");
    if (this.livemode && !liveModeAllowed(this.env)) throw new PayoutError("live_mode_refused", "Live transfers are refused without PAYOUTS_LIVE_MODE=1");
    try {
      const tr = await this.client.transfers.create(
        {
          amount: input.amount_cents,
          currency: (input.currency ?? this.currency()).toLowerCase(),
          destination: input.account_ref,
          transfer_group: input.transfer_group,
          description: input.description,
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotency_key },
      );
      const result = toTransferResult(tr);
      this.assertMode(result.livemode, `Transfer ${result.ref}`);
      return result;
    } catch (e) {
      this.mapError(e);
    }
  }

  async getTransfer(ref: string): Promise<TransferResult> {
    try {
      const result = toTransferResult(await this.client.transfers.retrieve(ref));
      this.assertMode(result.livemode, `Transfer ${ref}`);
      return result;
    } catch (e) {
      this.mapError(e);
    }
  }

  private balanceOf(b: Stripe.Balance): BalanceResult {
    const cur = this.currency();
    const sum = (rows: Array<{ amount: number; currency: string }>) => rows.filter((x) => x.currency.toLowerCase() === cur).reduce((s, x) => s + x.amount, 0);
    return { available_cents: sum(b.available ?? []), pending_cents: sum(b.pending ?? []), currency: cur, livemode: !!b.livemode };
  }

  async platformBalance(): Promise<BalanceResult> {
    try {
      const b = this.balanceOf(await this.client.balance.retrieve());
      this.assertMode(b.livemode, "Platform balance");
      return b;
    } catch (e) {
      this.mapError(e);
    }
  }

  async accountBalance(account_ref: string): Promise<BalanceResult> {
    try {
      const b = this.balanceOf(await this.client.balance.retrieve({}, { stripeAccount: account_ref }));
      this.assertMode(b.livemode, `Balance of ${account_ref}`);
      return b;
    } catch (e) {
      this.mapError(e);
    }
  }
}
