import { createHash } from "node:crypto";
import { NotificationError, type NotificationMessage, type NotificationProvider, type NotificationSend, type SendResult } from "./types";

/**
 * Demo / CI adapter. Never touches the network: it logs the message to the server console (the
 * documented way to read a one-time code in demo mode) and records it so tests can assert on
 * what would have been sent.
 */
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly name = "console" as const;
  private sends: NotificationSend[] = [];

  constructor(private readonly opts: { log?: (line: string) => void; logBody?: boolean } = {}) {}

  recordedSends(): NotificationSend[] {
    return this.sends.map((s) => ({ ...s }));
  }

  clearRecordedSends() {
    this.sends = [];
  }

  async send(message: NotificationMessage): Promise<SendResult> {
    if (!message.to.email || !message.to.email.includes("@")) {
      const err = new NotificationError("invalid_recipient", `No email address for ${message.to.name ?? "recipient"}`);
      this.sends.push({ ok: false, to: message.to.email, subject: message.subject, idempotency_key: message.idempotency_key, template: message.metadata?.template, error: err.message, at: new Date().toISOString() });
      throw err;
    }
    const ref = `console_${createHash("sha1").update(message.idempotency_key).digest("hex").slice(0, 16)}`;
    const log = this.opts.log ?? ((line: string) => console.info(line));
    const logBody = this.opts.logBody ?? process.env.NODE_ENV !== "production";
    log(`[notify] ${message.to.email} · ${message.subject}${logBody ? `\n${message.text.replace(/^/gm, "    ")}` : ""}`);
    this.sends.push({ ok: true, to: message.to.email, subject: message.subject, idempotency_key: message.idempotency_key, template: message.metadata?.template, ref, at: new Date().toISOString() });
    return { ok: true, ref, sent_at: new Date() };
  }
}
