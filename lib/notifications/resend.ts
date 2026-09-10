import { NotificationError, type NotificationMessage, type NotificationProvider, type SendResult } from "./types";
import { missingResendSecrets } from "./hermetic";

type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Transactional email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * Fail-closed: refuses to construct without RESEND_API_KEY and NOTIFICATIONS_FROM. No SDK — one
 * POST with the message's idempotency key, so a retried delivery never sends twice.
 */
export class ResendNotificationProvider implements NotificationProvider {
  readonly name = "resend" as const;
  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo: string | undefined;
  private readonly fetchImpl: FetchLike;

  constructor(opts: { env?: Env; fetch?: FetchLike } = {}) {
    const env = opts.env ?? process.env;
    const missing = missingResendSecrets(env);
    if (missing.length) throw new NotificationError("misconfigured", `NOTIFICATIONS_PROVIDER=resend is fail-closed without live secrets: missing ${missing.join(", ")}`);
    this.apiKey = env.RESEND_API_KEY!;
    this.from = env.NOTIFICATIONS_FROM!;
    this.replyTo = env.NOTIFICATIONS_REPLY_TO || undefined;
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    if (!message.to.email.includes("@")) throw new NotificationError("invalid_recipient", `Not an email address: ${message.to.email}`);
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": message.idempotency_key.slice(0, 256) },
      body: JSON.stringify({
        from: this.from,
        to: [message.to.name ? `${message.to.name.replace(/[<>"]/g, "")} <${message.to.email}>` : message.to.email],
        subject: message.subject,
        text: message.text,
        html: message.html,
        reply_to: this.replyTo,
        tags: message.metadata ? Object.entries(message.metadata).slice(0, 5).map(([name, value]) => ({ name: name.replace(/[^a-zA-Z0-9_-]/g, "_"), value: value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) })) : undefined,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      let detail = body;
      try {
        detail = (JSON.parse(body) as { message?: string }).message ?? body;
      } catch {
        /* keep raw body */
      }
      throw new NotificationError("provider_error", `Resend ${res.status}: ${detail.slice(0, 300)}`);
    }
    let id = "";
    try {
      id = (JSON.parse(body) as { id?: string }).id ?? "";
    } catch {
      /* no id in body */
    }
    return { ok: true, ref: id || `resend_${message.idempotency_key.slice(0, 40)}`, sent_at: new Date() };
  }
}
