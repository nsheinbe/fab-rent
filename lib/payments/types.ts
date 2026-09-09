export interface PaymentMethodRef {
  /** payment_methods.id */
  id: string;
  /** provider-side token/ref, e.g. Stripe payment method id */
  provider_ref: string | null;
  label: string; // "Visa •••• 4421"
  customer_ref?: string | null;
}

export interface ChargeResult {
  ok: true;
  ref: string;
  amount_cents: number;
  captured_at: Date;
}
export interface AuthorizeResult {
  ok: true;
  ref: string;
  amount_cents: number;
  authorized_at: Date;
  expires_at: Date;
}
export interface ReleaseResult {
  ok: true;
  ref: string;
  released_at: Date;
}
export interface CaptureResult {
  ok: true;
  ref: string;
  captured_cents: number;
  released_cents: number;
  captured_at: Date;
}
export interface RefundResult {
  ok: true;
  ref: string;
  amount_cents: number;
  refunded_at: Date;
}

export class PaymentError extends Error {
  constructor(
    readonly code: "declined" | "expired" | "not_found" | "invalid_amount" | "provider_error",
    message: string,
  ) {
    super(message);
    this.name = "PaymentError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isPaymentError(e: unknown): e is PaymentError {
  if (e instanceof PaymentError) return true;
  if (!e || typeof e !== "object") return false;
  const code = "code" in e ? (e as { code: unknown }).code : null;
  return (
    e instanceof Error &&
    (code === "declined" || code === "expired" || code === "not_found" || code === "invalid_amount" || code === "provider_error")
  );
}

/** One recorded payment-boundary call. The mock keeps these so e2e can assert money paths, not only the screen. */
export type PaymentCall = {
  op: "charge" | "authorize" | "capture" | "release" | "refund" | "extendAuthorization";
  ok: boolean;
  amount_cents?: number;
  captured_cents?: number;
  released_cents?: number;
  charge_ref?: string;
  authorization_ref?: string;
  ref?: string;
  method_label?: string;
  idempotency_key?: string;
  reason?: string;
  error?: string;
  code?: PaymentError["code"];
  at: string;
};

/**
 * The payment boundary. Charges and holds are different operations and are never mixed:
 * a hold is `authorize` (card authorization, manual capture) and later `release` or `capture`.
 */
export interface PaymentProvider {
  readonly name: "mock" | "stripe";
  /** Charge the renter now (rental + fees + tax + extras). */
  charge(input: { amount_cents: number; method: PaymentMethodRef; description: string; idempotency_key: string; metadata?: Record<string, string> }): Promise<ChargeResult>;
  /** Place a refundable authorization hold (at handoff). */
  authorize(input: { amount_cents: number; method: PaymentMethodRef; description: string; idempotency_key: string; metadata?: Record<string, string> }): Promise<AuthorizeResult>;
  /** Capture part or all of a hold (claim accepted/upheld); the remainder is released. */
  capture(input: { authorization_ref: string; amount_cents: number }): Promise<CaptureResult>;
  /** Release an authorization in full. */
  release(input: { authorization_ref: string }): Promise<ReleaseResult>;
  /** Refund part or all of a charge. */
  refund(input: { charge_ref: string; amount_cents: number; reason?: string }): Promise<RefundResult>;
  /** Extend a hold by re-authorizing (card auths expire after ~7 days). */
  extendAuthorization?(input: { authorization_ref: string; method: PaymentMethodRef; amount_cents: number }): Promise<AuthorizeResult>;
  /** Mock-only: recorded calls for money-path assertions. Stripe does not implement this. */
  recordedCalls?(): PaymentCall[];
  /** Mock-only: remember a seeded hold so a later capture knows the authorized amount. */
  rememberAuthorization?(ref: string, amount_cents: number): void;
  /** Mock-only: drop the call log between e2e cases that share the Next process. */
  clearRecordedCalls?(): void;
}
