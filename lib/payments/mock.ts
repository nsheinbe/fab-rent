import { createHash } from "node:crypto";
import type { AuthorizeResult, CaptureResult, ChargeResult, PaymentMethodRef, PaymentProvider, RefundResult, ReleaseResult } from "./types";
import { PaymentError } from "./types";

/**
 * Deterministic, key-less payment provider for the demo. Refs are derived from the idempotency key,
 * so repeating an action yields the same ref. A card whose last4 is "0000" always declines,
 * which lets the checkout error path be demoed and tested.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
  private authorizations = new Map<string, { amount_cents: number; captured: number; released: boolean }>();

  private ref(prefix: string, key: string) {
    return `${prefix}_${createHash("sha1").update(key).digest("hex").slice(0, 16)}`;
  }

  private assertCard(method: PaymentMethodRef) {
    if (method.label.endsWith("0000")) throw new PaymentError("declined", "Your card was declined. Try another payment method.");
  }

  async charge(input: { amount_cents: number; method: PaymentMethodRef; idempotency_key: string }): Promise<ChargeResult> {
    if (input.amount_cents <= 0) throw new PaymentError("invalid_amount", "Nothing to charge");
    this.assertCard(input.method);
    return { ok: true, ref: this.ref("mock_ch", input.idempotency_key), amount_cents: input.amount_cents, captured_at: new Date() };
  }

  async authorize(input: { amount_cents: number; method: PaymentMethodRef; idempotency_key: string }): Promise<AuthorizeResult> {
    if (input.amount_cents <= 0) throw new PaymentError("invalid_amount", "Nothing to hold");
    this.assertCard(input.method);
    const ref = this.ref("mock_auth", input.idempotency_key);
    this.authorizations.set(ref, { amount_cents: input.amount_cents, captured: 0, released: false });
    const now = new Date();
    return { ok: true, ref, amount_cents: input.amount_cents, authorized_at: now, expires_at: new Date(now.getTime() + 7 * 86_400_000) };
  }

  async capture(input: { authorization_ref: string; amount_cents: number }): Promise<CaptureResult> {
    const auth = this.authorizations.get(input.authorization_ref) ?? { amount_cents: input.amount_cents, captured: 0, released: false };
    if (input.amount_cents < 0 || input.amount_cents > auth.amount_cents) throw new PaymentError("invalid_amount", "Capture exceeds the authorized amount");
    auth.captured = input.amount_cents;
    auth.released = true;
    this.authorizations.set(input.authorization_ref, auth);
    return { ok: true, ref: `${input.authorization_ref}_cap`, captured_cents: input.amount_cents, released_cents: auth.amount_cents - input.amount_cents, captured_at: new Date() };
  }

  async release(input: { authorization_ref: string }): Promise<ReleaseResult> {
    const auth = this.authorizations.get(input.authorization_ref);
    if (auth) auth.released = true;
    return { ok: true, ref: `${input.authorization_ref}_rel`, released_at: new Date() };
  }

  async refund(input: { charge_ref: string; amount_cents: number }): Promise<RefundResult> {
    if (input.amount_cents <= 0) throw new PaymentError("invalid_amount", "Nothing to refund");
    return { ok: true, ref: `${input.charge_ref}_re_${input.amount_cents}`, amount_cents: input.amount_cents, refunded_at: new Date() };
  }

  async extendAuthorization(input: { authorization_ref: string; method: PaymentMethodRef; amount_cents: number }): Promise<AuthorizeResult> {
    await this.release({ authorization_ref: input.authorization_ref });
    return this.authorize({ amount_cents: input.amount_cents, method: input.method, idempotency_key: `${input.authorization_ref}_ext_${Date.now()}` });
  }
}
