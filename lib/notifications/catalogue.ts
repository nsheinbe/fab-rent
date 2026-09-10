import type { BookingEvent } from "@/lib/booking-state/machine";

/**
 * Every outbound message fab.rent can send, in one place. The keys are stable identifiers (stored on
 * delivery records and in opt-out maps); the copy lives in ./templates.ts.
 *
 * `optional` decides whether a person may opt out. Money and dispute messages are never optional:
 * a charge, refund, hold, claim, decision or payout is always announced.
 */
export const NOTIFICATION_TEMPLATES = [
  "otp_code",
  "booking_requested",
  "booking_confirmed",
  "booking_declined",
  "booking_cancelled",
  "ready_for_pickup",
  "out_for_delivery",
  "handoff_reminder",
  "handoff_complete",
  "return_due",
  "overdue",
  "return_complete",
  "claim_raised",
  "claim_answered",
  "dispute_decided",
  "extension_requested",
  "extension_decided",
  "payout_sent",
  "payout_reminder",
  "payout_account_verified",
  "payout_account_action",
  "listing_reviewed",
] as const;

export type TemplateKey = (typeof NOTIFICATION_TEMPLATES)[number];

/** Who a message is addressed to. `user` is the account itself (sign-in codes). */
export type Party = "renter" | "provider" | "user";

export type NotificationCategory = "sign_in" | "booking" | "reminder" | "money" | "dispute" | "listing";

export interface TemplateMeta {
  label: string;
  category: NotificationCategory;
  /** may be switched off per profile */
  optional: boolean;
  /** which sides ever receive it (drives the preferences UI) */
  audiences: Party[];
  /** one line for the preferences UI */
  description: string;
}

export const notificationCatalogue: Record<TemplateKey, TemplateMeta> = {
  otp_code: { label: "Sign-in code", category: "sign_in", optional: false, audiences: ["user"], description: "Your one-time code when you sign in by email." },
  booking_requested: { label: "Booking requested", category: "money", optional: false, audiences: ["renter", "provider"], description: "Receipt for the renter; the request for the provider to approve." },
  booking_confirmed: { label: "Booking confirmed", category: "money", optional: false, audiences: ["renter", "provider"], description: "Confirmation and receipt once the provider approves or instant book confirms." },
  booking_declined: { label: "Request declined", category: "money", optional: false, audiences: ["renter"], description: "Full refund when a provider can't take a request." },
  booking_cancelled: { label: "Booking cancelled", category: "money", optional: false, audiences: ["renter", "provider"], description: "What was refunded or kept, and any credit." },
  ready_for_pickup: { label: "Ready for pickup", category: "reminder", optional: true, audiences: ["renter"], description: "When the provider has your order prepared." },
  out_for_delivery: { label: "Out for delivery", category: "reminder", optional: true, audiences: ["renter"], description: "When the driver is on the way." },
  handoff_reminder: { label: "Handoff reminder", category: "reminder", optional: true, audiences: ["renter", "provider"], description: "The day before a pickup or delivery." },
  handoff_complete: { label: "Handoff complete", category: "money", optional: false, audiences: ["renter"], description: "The deposit hold placed on your card and when to return." },
  return_due: { label: "Return due", category: "reminder", optional: true, audiences: ["renter", "provider"], description: "Within 24 hours of the return time." },
  overdue: { label: "Return overdue", category: "money", optional: false, audiences: ["renter", "provider"], description: "After the grace period, when late fees apply." },
  return_complete: { label: "Return complete", category: "money", optional: false, audiences: ["renter"], description: "Check-in done and the hold released." },
  claim_raised: { label: "Claim raised", category: "money", optional: false, audiences: ["renter"], description: "A claim against your hold, with the time you have to respond." },
  claim_answered: { label: "Claim answered", category: "money", optional: false, audiences: ["renter", "provider"], description: "The renter accepted or disputed the claim." },
  dispute_decided: { label: "Dispute decided", category: "dispute", optional: false, audiences: ["renter", "provider"], description: "fab.rent's decision and what moved." },
  extension_requested: { label: "Extension requested", category: "money", optional: false, audiences: ["provider"], description: "A renter asked to keep the item longer." },
  extension_decided: { label: "Extension decided", category: "money", optional: false, audiences: ["renter"], description: "Approved (and charged) or declined." },
  payout_sent: { label: "Payout sent", category: "money", optional: false, audiences: ["provider"], description: "When a payout goes to your account." },
  payout_reminder: { label: "Payout paused", category: "money", optional: false, audiences: ["provider"], description: "What is blocking a payout." },
  payout_account_verified: { label: "Payout account verified", category: "money", optional: false, audiences: ["provider"], description: "When your payout account is verified and cleared earnings can go out." },
  payout_account_action: { label: "Payout account needs attention", category: "money", optional: false, audiences: ["provider"], description: "When the payout provider needs more details or a bank account failed verification." },
  listing_reviewed: { label: "Listing reviewed", category: "listing", optional: false, audiences: ["provider"], description: "Approved, changes requested or rejected, with the reason." },
};

/**
 * The parties each booking transition tells, one message per affected party. `return_checkin_start`
 * is silent because the outcome (no claim, or a claim) follows in the same action.
 */
export const TRANSITION_NOTIFICATIONS: Record<BookingEvent, { template: TemplateKey; parties: Array<"renter" | "provider"> } | null> = {
  instant_confirm: { template: "booking_confirmed", parties: ["renter", "provider"] },
  provider_approve: { template: "booking_confirmed", parties: ["renter"] },
  provider_decline: { template: "booking_declined", parties: ["renter"] },
  renter_cancel: { template: "booking_cancelled", parties: ["renter", "provider"] },
  provider_cancel: { template: "booking_cancelled", parties: ["renter"] },
  mark_prepared: { template: "ready_for_pickup", parties: ["renter"] },
  dispatch: { template: "out_for_delivery", parties: ["renter"] },
  handoff_complete: { template: "handoff_complete", parties: ["renter"] },
  return_window_open: { template: "return_due", parties: ["renter", "provider"] },
  grace_elapsed: { template: "overdue", parties: ["renter", "provider"] },
  return_checkin_start: null,
  return_no_claim: { template: "return_complete", parties: ["renter"] },
  claim_accepted: { template: "claim_answered", parties: ["renter", "provider"] },
  claim_disputed: { template: "claim_answered", parties: ["renter", "provider"] },
  admin_decision: { template: "dispute_decided", parties: ["renter", "provider"] },
};

export function planTransition(event: BookingEvent): Array<{ template: TemplateKey; party: "renter" | "provider" }> {
  const plan = TRANSITION_NOTIFICATIONS[event];
  if (!plan) return [];
  return plan.parties.map((party) => ({ template: plan.template, party }));
}

/** `{ "return_due": false }` = opted out. Absent or true = send. Unknown keys are ignored. */
export type NotificationPrefs = Partial<Record<TemplateKey, boolean>>;

export function isTemplateKey(v: unknown): v is TemplateKey {
  return typeof v === "string" && (NOTIFICATION_TEMPLATES as readonly string[]).includes(v);
}

export function parsePrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: NotificationPrefs = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isTemplateKey(k) && typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** Honoured before send: only optional templates can be switched off; money and dispute messages always go. */
export function isOptedOut(prefs: NotificationPrefs | null | undefined, template: TemplateKey): boolean {
  if (!notificationCatalogue[template].optional) return false;
  return prefs?.[template] === false;
}

/** Templates a person may switch off, for the preferences UI of one side. */
export function optionalTemplatesFor(audience: "renter" | "provider"): TemplateKey[] {
  return NOTIFICATION_TEMPLATES.filter((k) => notificationCatalogue[k].optional && notificationCatalogue[k].audiences.includes(audience));
}

/** One message per (template, subject entity, party): the unique key on delivery records. */
export function dedupeKey(template: TemplateKey, subjectId: string, party: Party | string): string {
  return `${template}:${subjectId}:${party}`;
}
