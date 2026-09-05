import Stripe from "stripe";
import type { AuthorizeResult, CaptureResult, ChargeResult, PaymentMethodRef, PaymentProvider, RefundResult, ReleaseResult } from "./types";
import { PaymentError } from "./types";

/**
 * Stripe adapter using PaymentIntents. Holds are PaymentIntents with `capture_method: 'manual'`
 * (an authorization, never a charge) that are later captured for a partial amount or cancelled.
 * Enabled with PAYMENTS_PROVIDER=stripe and STRIPE_SECRET_KEY.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  private stripe: Stripe;
  constructor(secretKey = process.env.STRIPE_SECRET_KEY) {
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required for PAYMENTS_PROVIDER=stripe");
    this.stripe = new Stripe(secretKey);
  }

  private mapError(e: unknown): never {
    if (e instanceof Stripe.errors.StripeCardError) throw new PaymentError("declined", e.message);
    if (e instanceof Stripe.errors.StripeInvalidRequestError) throw new PaymentError("provider_error", e.message);
    throw new PaymentError("provider_error", (e as Error).message);
  }

  private currency() {
    // MRD is fictional; Stripe test mode is run in a real currency configured here.
    return (process.env.STRIPE_CURRENCY ?? "usd").toLowerCase();
  }

  async charge(input: { amount_cents: number; method: PaymentMethodRef; description: string; idempotency_key: string; metadata?: Record<string, string> }): Promise<ChargeResult> {
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: input.amount_cents,
          currency: this.currency(),
          payment_method: input.method.provider_ref ?? undefined,
          customer: input.method.customer_ref ?? undefined,
          confirm: true,
          off_session: true,
          description: input.description,
          metadata: input.metadata,
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        },
        { idempotencyKey: input.idempotency_key },
      );
      if (pi.status !== "succeeded") throw new PaymentError("declined", `Payment ${pi.status}`);
      return { ok: true, ref: pi.id, amount_cents: pi.amount_received, captured_at: new Date() };
    } catch (e) {
      this.mapError(e);
    }
  }

  async authorize(input: { amount_cents: number; method: PaymentMethodRef; description: string; idempotency_key: string; metadata?: Record<string, string> }): Promise<AuthorizeResult> {
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: input.amount_cents,
          currency: this.currency(),
          payment_method: input.method.provider_ref ?? undefined,
          customer: input.method.customer_ref ?? undefined,
          confirm: true,
          off_session: true,
          capture_method: "manual",
          description: input.description,
          metadata: { ...input.metadata, kind: "hold" },
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        },
        { idempotencyKey: input.idempotency_key },
      );
      if (pi.status !== "requires_capture") throw new PaymentError("declined", `Authorization ${pi.status}`);
      const now = new Date();
      return { ok: true, ref: pi.id, amount_cents: pi.amount, authorized_at: now, expires_at: new Date(now.getTime() + 7 * 86_400_000) };
    } catch (e) {
      this.mapError(e);
    }
  }

  async capture(input: { authorization_ref: string; amount_cents: number }): Promise<CaptureResult> {
    try {
      const pi = await this.stripe.paymentIntents.retrieve(input.authorization_ref);
      if (input.amount_cents === 0) {
        await this.stripe.paymentIntents.cancel(input.authorization_ref);
        return { ok: true, ref: pi.id, captured_cents: 0, released_cents: pi.amount, captured_at: new Date() };
      }
      const captured = await this.stripe.paymentIntents.capture(input.authorization_ref, { amount_to_capture: input.amount_cents });
      return { ok: true, ref: captured.id, captured_cents: captured.amount_received, released_cents: pi.amount - captured.amount_received, captured_at: new Date() };
    } catch (e) {
      this.mapError(e);
    }
  }

  async release(input: { authorization_ref: string }): Promise<ReleaseResult> {
    try {
      const pi = await this.stripe.paymentIntents.cancel(input.authorization_ref);
      return { ok: true, ref: pi.id, released_at: new Date() };
    } catch (e) {
      this.mapError(e);
    }
  }

  async refund(input: { charge_ref: string; amount_cents: number; reason?: string }): Promise<RefundResult> {
    try {
      const r = await this.stripe.refunds.create({ payment_intent: input.charge_ref, amount: input.amount_cents, reason: "requested_by_customer", metadata: input.reason ? { reason: input.reason } : undefined });
      return { ok: true, ref: r.id, amount_cents: r.amount, refunded_at: new Date() };
    } catch (e) {
      this.mapError(e);
    }
  }

  async extendAuthorization(input: { authorization_ref: string; method: PaymentMethodRef; amount_cents: number }): Promise<AuthorizeResult> {
    await this.release({ authorization_ref: input.authorization_ref });
    return this.authorize({ amount_cents: input.amount_cents, method: input.method, description: "Hold extension", idempotency_key: `${input.authorization_ref}_ext_${Date.now()}` });
  }
}
