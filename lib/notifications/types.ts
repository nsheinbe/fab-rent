/** Who a message goes to. Email only in Phase 6 (SMS and push are out of scope). */
export interface NotificationRecipient {
  email: string;
  name?: string | null;
}

export interface NotificationMessage {
  to: NotificationRecipient;
  subject: string;
  text: string;
  html?: string;
  /** Stable per logical message; adapters pass it on (Resend's Idempotency-Key) so a retry never double-sends. */
  idempotency_key: string;
  metadata?: Record<string, string>;
}

export interface SendResult {
  ok: true;
  /** provider-side id (Resend email id) or a deterministic console ref */
  ref: string;
  sent_at: Date;
}

export class NotificationError extends Error {
  constructor(
    readonly code: "misconfigured" | "invalid_recipient" | "provider_error",
    message: string,
  ) {
    super(message);
    this.name = "NotificationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** One recorded send at the boundary. The console adapter keeps these so tests can assert delivery, not only the screen. */
export type NotificationSend = {
  ok: boolean;
  to: string;
  subject: string;
  idempotency_key: string;
  template?: string;
  ref?: string;
  error?: string;
  at: string;
};

/**
 * The notification boundary, shaped like `PaymentProvider` / `StorageAdapter`: one method that
 * delivers a rendered message. Rendering, preferences, idempotency and delivery records live
 * above this interface so every adapter behaves the same.
 */
export interface NotificationProvider {
  readonly name: "console" | "resend";
  send(message: NotificationMessage): Promise<SendResult>;
  /** Console-only: what would have been sent (never hits the network). */
  recordedSends?(): NotificationSend[];
  /** Console-only: drop the log between e2e cases that share the Next process. */
  clearRecordedSends?(): void;
}
