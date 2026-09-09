import { createHash } from "node:crypto";
import type { AuthorizeResult, CaptureResult, ChargeResult, PaymentCall, PaymentMethodRef, PaymentProvider, RefundResult, ReleaseResult } from "./types";
import { PaymentError } from "./types";

/**
 * Deterministic, key-less payment provider for the demo. Refs are derived from the idempotency key,
 * so repeating an action yields the same ref. A card whose last4 is "0000" always declines,
 * which lets the checkout error path be demoed and tested.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
  private authorizations = new Map<string, { amount_cents: number; captured: number; released: boolean }>();
  private calls: PaymentCall[] = [];

  private ref(prefix: string, key: string) {
    return `${prefix}_${createHash("sha1").update(key).digest("hex").slice(0, 16)}`;
  }

  private record(call: Omit<PaymentCall, "at">): PaymentCall {
    const row: PaymentCall = { ...call, at: new Date().toISOString() };
    this.calls.push(row);
    return row;
  }

  private assertCard(method: PaymentMethodRef) {
    if (method.label.endsWith("0000")) throw new PaymentError("declined", "Your card was declined. Try another payment method.");
  }

  recordedCalls(): PaymentCall[] {
    return this.calls.map((c) => ({ ...c }));
  }

  rememberAuthorization(ref: string, amount_cents: number) {
    if (!this.authorizations.has(ref)) this.authorizations.set(ref, { amount_cents, captured: 0, released: false });
  }

  clearRecordedCalls() {
    this.calls = [];
  }

  async charge(input: { amount_cents: number; method: PaymentMethodRef; idempotency_key: string }): Promise<ChargeResult> {
    try {
      if (input.amount_cents <= 0) throw new PaymentError("invalid_amount", "Nothing to charge");
      this.assertCard(input.method);
      const result = { ok: true as const, ref: this.ref("mock_ch", input.idempotency_key), amount_cents: input.amount_cents, captured_at: new Date() };
      this.record({ op: "charge", ok: true, amount_cents: input.amount_cents, ref: result.ref, method_label: input.method.label, idempotency_key: input.idempotency_key });
      return result;
    } catch (e) {
      if (e instanceof PaymentError) {
        this.record({ op: "charge", ok: false, amount_cents: input.amount_cents, method_label: input.method.label, idempotency_key: input.idempotency_key, error: e.message, code: e.code });
      }
      throw e;
    }
  }

  async authorize(input: { amount_cents: number; method: PaymentMethodRef; idempotency_key: string }): Promise<AuthorizeResult> {
    try {
      if (input.amount_cents <= 0) throw new PaymentError("invalid_amount", "Nothing to hold");
      this.assertCard(input.method);
      const ref = this.ref("mock_auth", input.idempotency_key);
      this.authorizations.set(ref, { amount_cents: input.amount_cents, captured: 0, released: false });
      const now = new Date();
      const result = { ok: true as const, ref, amount_cents: input.amount_cents, authorized_at: now, expires_at: new Date(now.getTime() + 7 * 86_400_000) };
      this.record({ op: "authorize", ok: true, amount_cents: input.amount_cents, ref, authorization_ref: ref, method_label: input.method.label, idempotency_key: input.idempotency_key });
      return result;
    } catch (e) {
      if (e instanceof PaymentError) {
        this.record({ op: "authorize", ok: false, amount_cents: input.amount_cents, method_label: input.method.label, idempotency_key: input.idempotency_key, error: e.message, code: e.code });
      }
      throw e;
    }
  }

  async capture(input: { authorization_ref: string; amount_cents: number }): Promise<CaptureResult> {
    try {
      const auth = this.authorizations.get(input.authorization_ref) ?? { amount_cents: input.amount_cents, captured: 0, released: false };
      if (input.amount_cents < 0 || input.amount_cents > auth.amount_cents) throw new PaymentError("invalid_amount", "Capture exceeds the authorized amount");
      auth.captured = input.amount_cents;
      auth.released = true;
      this.authorizations.set(input.authorization_ref, auth);
      const result = { ok: true as const, ref: `${input.authorization_ref}_cap`, captured_cents: input.amount_cents, released_cents: auth.amount_cents - input.amount_cents, captured_at: new Date() };
      this.record({ op: "capture", ok: true, amount_cents: input.amount_cents, captured_cents: result.captured_cents, released_cents: result.released_cents, authorization_ref: input.authorization_ref, ref: result.ref });
      return result;
    } catch (e) {
      if (e instanceof PaymentError) {
        this.record({ op: "capture", ok: false, amount_cents: input.amount_cents, authorization_ref: input.authorization_ref, error: e.message, code: e.code });
      }
      throw e;
    }
  }

  async release(input: { authorization_ref: string }): Promise<ReleaseResult> {
    const auth = this.authorizations.get(input.authorization_ref);
    if (auth) auth.released = true;
    const result = { ok: true as const, ref: `${input.authorization_ref}_rel`, released_at: new Date() };
    this.record({ op: "release", ok: true, authorization_ref: input.authorization_ref, ref: result.ref });
    return result;
  }

  async refund(input: { charge_ref: string; amount_cents: number }): Promise<RefundResult> {
    try {
      if (input.amount_cents <= 0) throw new PaymentError("invalid_amount", "Nothing to refund");
      const result = { ok: true as const, ref: `${input.charge_ref}_re_${input.amount_cents}`, amount_cents: input.amount_cents, refunded_at: new Date() };
      this.record({ op: "refund", ok: true, amount_cents: input.amount_cents, charge_ref: input.charge_ref, ref: result.ref });
      return result;
    } catch (e) {
      if (e instanceof PaymentError) {
        this.record({ op: "refund", ok: false, amount_cents: input.amount_cents, charge_ref: input.charge_ref, error: e.message, code: e.code });
      }
      throw e;
    }
  }

  async extendAuthorization(input: { authorization_ref: string; method: PaymentMethodRef; amount_cents: number }): Promise<AuthorizeResult> {
    await this.release({ authorization_ref: input.authorization_ref });
    const result = await this.authorize({ amount_cents: input.amount_cents, method: input.method, idempotency_key: `${input.authorization_ref}_ext_${Date.now()}` });
    this.record({ op: "extendAuthorization", ok: true, amount_cents: input.amount_cents, authorization_ref: result.ref, ref: result.ref, method_label: input.method.label });
    return result;
  }
}
