import { formatDateRange, formatDateTime, formatMoney } from "@/lib/format";
import type { TemplateKey } from "./catalogue";

/**
 * Copy for every message. Plain text first (the source of truth for what a person is told); HTML is
 * the same text wrapped by `toHtml`. The notification templates have no design frames, so the
 * voice follows the product's system messages: short lines, "·" separators, amounts to the cent.
 */

export interface Rendered {
  subject: string;
  text: string;
}

export interface BookingContext {
  ref: string;
  title: string;
  provider_name: string;
  renter_name: string;
  start_at: Date;
  end_at: Date;
  tz: string;
  fulfillment: "pickup" | "delivery";
  pickup_address: string | null;
  delivery_address: string | null;
  drop_window: { start: string; end: string } | null;
  collect_window: { start: string; end: string } | null;
  charged_cents: number;
  hold_cents: number;
  payment_method_label: string | null;
  free_cancel_until: Date | null;
  response_minutes: number | null;
  late_fee_cents_per_hour: number;
  late_grace_minutes: number;
  /** from the booking's settings version */
  auto_release_business_days: number;
  renter_response_hours: number;
  admin_decision_sla_hours: number;
  appeal_days: number;
  /** settled late fee at return check-in, if any */
  late_fee_cents: number;
  /** open claim total at return check-in, if any */
  claim_cents: number;
  /** the transition's event payload (refunded_cents, credit_cents, captured_cents, decision, extension fields …) */
  payload: Record<string, unknown>;
  app_url: string;
}

const first = (name: string) => name.split(" ")[0] || name;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const money = (cents: number) => formatMoney(cents);
const whole = (cents: number) => formatMoney(cents, { whole: true });
const when = (d: Date, tz: string) => formatDateTime(d, tz);

function whereLine(b: BookingContext): string {
  if (b.fulfillment === "delivery") {
    const win = b.drop_window ? ` · ${b.drop_window.start}–${b.drop_window.end}` : "";
    return `Delivery ${when(b.start_at, b.tz).split(" · ")[0]}${win}${b.delivery_address ? ` · ${b.delivery_address}` : ""}`;
  }
  return `Pickup ${when(b.start_at, b.tz)}${b.pickup_address ? ` · ${b.pickup_address}` : ""}`;
}

function returnLine(b: BookingContext): string {
  if (b.fulfillment === "delivery" && b.collect_window) return `Collection ${when(b.end_at, b.tz).split(" · ")[0]} · ${b.collect_window.start}–${b.collect_window.end}`;
  return `Return by ${when(b.end_at, b.tz)}`;
}

const links = {
  booking: (b: BookingContext) => `${b.app_url}/rentals/${b.ref}`,
  receipt: (b: BookingContext) => `${b.app_url}/api/bookings/${b.ref}/receipt.pdf`,
  providerBooking: (b: BookingContext) => `${b.app_url}/provider/bookings?ref=${b.ref}`,
};

function holdLine(b: BookingContext): string {
  if (b.hold_cents <= 0) return "No deposit hold on this rental.";
  return `A ${whole(b.hold_cents)} deposit hold is placed on your card at ${b.fulfillment === "delivery" ? "delivery" : "handoff"} — an authorisation, not a charge. It is released ${b.auto_release_business_days} business days after return check-in unless a claim is open.`;
}

function decisionLabel(d: string): string {
  return d === "uphold_full" ? "claim upheld in full" : d === "uphold_partial" ? "claim upheld partially" : d === "dismiss" ? "claim dismissed" : d === "goodwill_credit" ? "goodwill credit from fab.rent" : d.replace(/_/g, " ");
}

/** Booking-scoped messages. `party` selects the copy for the renter or the provider. */
export function renderBooking(template: Exclude<TemplateKey, "otp_code" | "payout_sent" | "payout_reminder" | "listing_reviewed">, party: "renter" | "provider", b: BookingContext): Rendered {
  const dates = formatDateRange(b.start_at, b.end_at, { times: true, tz: b.tz });
  const renter = first(b.renter_name);
  const p = b.payload;
  const method = b.payment_method_label ?? "your card";
  switch (template) {
    case "booking_requested":
      return party === "renter"
        ? {
            subject: `Request sent · ${b.ref} · ${b.title}`,
            text: [
              `Hi ${renter}, your request for ${b.title} is with ${b.provider_name}. They usually answer within ${b.response_minutes ? `${b.response_minutes} minutes` : "an hour"}.`,
              `${dates}`,
              `${whereLine(b)}`,
              `Charged now: ${money(b.charged_cents)} to ${method}. Refunded in full if they decline.`,
              holdLine(b),
              `Receipt: ${links.receipt(b)}`,
              `Booking: ${links.booking(b)}`,
            ].join("\n"),
          }
        : {
            subject: `New request · ${b.ref} · ${b.title}`,
            text: [
              `${b.renter_name} requested ${b.title}.`,
              `${dates} · ${b.fulfillment}`,
              `The renter has already paid ${money(b.charged_cents)}; approve or decline in your dashboard.`,
              `Booking: ${links.providerBooking(b)}`,
            ].join("\n"),
          };
    case "booking_confirmed":
      return party === "renter"
        ? {
            subject: `You're booked · ${b.ref} · ${b.title}`,
            text: [
              `Hi ${renter}, ${b.provider_name} confirmed your booking.`,
              `${dates}`,
              `${whereLine(b)}`,
              `Bring your photo ID. You and the ${b.fulfillment === "delivery" ? "driver" : "provider"} photograph the item and confirm the serial together.`,
              `Charged: ${money(b.charged_cents)} to ${method}.`,
              holdLine(b),
              b.free_cancel_until ? `Free cancellation until ${when(b.free_cancel_until, b.tz)}.` : "",
              `Receipt: ${links.receipt(b)}`,
              `Booking: ${links.booking(b)}`,
            ].filter(Boolean).join("\n"),
          }
        : {
            subject: `New booking · ${b.ref} · ${b.title}`,
            text: [
              `${b.renter_name} booked ${b.title} · confirmed instantly.`,
              `${dates} · ${b.fulfillment}`,
              `Prep before ${when(b.start_at, b.tz)}.`,
              `Booking: ${links.providerBooking(b)}`,
            ].join("\n"),
          };
    case "booking_declined":
      return {
        subject: `${b.provider_name} couldn't take your request · ${b.ref}`,
        text: [
          `Hi ${renter}, ${b.provider_name} couldn't take ${b.title} for ${dates}.`,
          `Refunded in full: ${money(num(p.refunded_cents) || b.charged_cents)} to ${method}. Refunds show within 5–10 business days.`,
          str(p.reason) ? `Reason: ${str(p.reason)}` : "",
          `Nothing is held on a cancelled booking.`,
          `Find something similar: ${b.app_url}/search`,
        ].filter(Boolean).join("\n"),
      };
    case "booking_cancelled": {
      const refunded = num(p.refunded_cents);
      const kept = num(p.kept_rental_cents);
      const credit = num(p.credit_cents);
      const byProvider = str(p.cancelled_by) === "provider";
      return party === "renter"
        ? {
            subject: `Booking cancelled · ${b.ref} · ${b.title}`,
            text: [
              byProvider ? `${b.provider_name} cancelled ${b.title} for ${dates}. Sorry about that.` : `You cancelled ${b.title} for ${dates}.`,
              `Refund: ${money(refunded)} to ${method}.${kept > 0 ? ` ${money(kept)} of the rental charge is kept under the ${str(p.policy_name) || "cancellation"} policy.` : ""}`,
              credit > 0 ? `Credit: ${money(credit)} added to your fab.rent account.` : "",
              `Nothing is held on a cancelled booking.`,
              `Booking: ${links.booking(b)}`,
            ].filter(Boolean).join("\n"),
          }
        : {
            subject: `${b.renter_name} cancelled ${b.ref} · ${b.title}`,
            text: [
              `${b.renter_name} cancelled ${b.title} for ${dates}. The dates are free again.`,
              kept > 0 ? `You keep ${money(kept)} of the rental charge (${num(p.keep_pct)}% under the policy); commission applies to the kept amount only.` : `The renter was refunded in full.`,
              `Booking: ${links.providerBooking(b)}`,
            ].join("\n"),
          };
    }
    case "ready_for_pickup":
      return {
        subject: `Ready for pickup · ${b.ref} · ${b.title}`,
        text: [
          `Hi ${renter}, ${b.title} is ready at ${b.provider_name}.`,
          `${whereLine(b)}`,
          `Bring your photo ID.${b.hold_cents > 0 ? ` The ${whole(b.hold_cents)} hold is placed at handoff.` : ""}`,
          `Booking: ${links.booking(b)}`,
        ].join("\n"),
      };
    case "out_for_delivery":
      return {
        subject: `Out for delivery · ${b.ref} · ${b.title}`,
        text: [
          `Hi ${renter}, ${b.provider_name}'s driver is on the way with ${b.title}.`,
          `${whereLine(b)}`,
          `You and the driver record the condition together${b.hold_cents > 0 ? `; the ${whole(b.hold_cents)} hold is placed then` : ""}.`,
          `Booking: ${links.booking(b)}`,
        ].join("\n"),
      };
    case "handoff_reminder":
      return party === "renter"
        ? {
            subject: `Tomorrow: ${b.fulfillment === "delivery" ? "delivery" : "pickup"} of ${b.title} · ${b.ref}`,
            text: [
              `Hi ${renter}, a reminder for tomorrow.`,
              `${whereLine(b)}`,
              `Bring your photo ID.${b.hold_cents > 0 ? ` The ${whole(b.hold_cents)} hold is placed at handoff, not before.` : ""}`,
              `${returnLine(b)}.`,
              `Booking: ${links.booking(b)}`,
            ].join("\n"),
          }
        : {
            subject: `Handoff tomorrow · ${b.ref} · ${b.renter_name}`,
            text: [`${b.renter_name} · ${b.title}`, `${whereLine(b)}`, `Check photo ID, scan the serial and take the condition photos before completing the handoff.`, `Booking: ${links.providerBooking(b)}`].join("\n"),
          };
    case "handoff_complete":
      return {
        subject: `Handed over${b.hold_cents > 0 ? ` · ${whole(b.hold_cents)} hold placed` : ""} · ${b.ref}`,
        text: [
          `Hi ${renter}, ${b.title} is with you. ${returnLine(b)}.`,
          b.hold_cents > 0 ? `${whole(b.hold_cents)} is held on ${method} — an authorisation, not a charge. It is released ${b.auto_release_business_days} business days after return check-in unless a claim is open.` : "",
          `Late returns: ${b.late_grace_minutes >= 60 ? `${b.late_grace_minutes / 60} h` : `${b.late_grace_minutes} min`} grace, then ${money(b.late_fee_cents_per_hour)} per hour.`,
          `Need longer? Ask for an extension from the booking: ${links.booking(b)}`,
        ].filter(Boolean).join("\n"),
      };
    case "return_due":
      return party === "renter"
        ? {
            subject: `Return due ${when(b.end_at, b.tz)} · ${b.ref}`,
            text: [
              `Hi ${renter}, ${b.title} is due back soon.`,
              `${returnLine(b)}.`,
              `After ${b.late_grace_minutes >= 60 ? `${b.late_grace_minutes / 60} h` : `${b.late_grace_minutes} min`} grace a late fee of ${money(b.late_fee_cents_per_hour)} per hour applies.`,
              `Running late? Message ${first(b.provider_name)} or request an extension: ${links.booking(b)}`,
            ].join("\n"),
          }
        : {
            subject: `Return due ${when(b.end_at, b.tz)} · ${b.ref} · ${b.renter_name}`,
            text: [`${b.renter_name} · ${b.title}`, `${returnLine(b)}.`, `Have the handoff photos ready for the check-in comparison.`, `Booking: ${links.providerBooking(b)}`].join("\n"),
          };
    case "overdue":
      return party === "renter"
        ? {
            subject: `Overdue · ${b.ref} · ${b.title}`,
            text: [
              `Hi ${renter}, ${b.title} was due back ${when(b.end_at, b.tz)} and hasn't been checked in.`,
              `A late fee of ${money(b.late_fee_cents_per_hour)} per whole hour applies after the ${b.late_grace_minutes >= 60 ? `${b.late_grace_minutes / 60} h` : `${b.late_grace_minutes} min`} grace period; it is charged to ${method} at check-in, separately from the hold.`,
              `Please return it or message ${first(b.provider_name)} now: ${links.booking(b)}`,
            ].join("\n"),
          }
        : {
            subject: `Overdue · ${b.ref} · ${b.renter_name}`,
            text: [`${b.renter_name} has not returned ${b.title} (due ${when(b.end_at, b.tz)}).`, `The late fee accrues at ${money(b.late_fee_cents_per_hour)} per hour after grace and settles at check-in.`, `Booking: ${links.providerBooking(b)}`].join("\n"),
          };
    case "return_complete":
      return {
        subject: `Return complete${b.hold_cents > 0 ? " · hold released" : ""} · ${b.ref}`,
        text: [
          `Hi ${renter}, ${b.provider_name} checked ${b.title} in with no issues. Thanks!`,
          b.hold_cents > 0 ? `The ${whole(b.hold_cents)} hold on ${method} has been released; your bank may take a few days to show it.` : "",
          b.late_fee_cents > 0 ? `Late fee charged at check-in: ${money(b.late_fee_cents)} to ${method}.` : "",
          `Leave a review: ${links.booking(b)}/review`,
        ].filter(Boolean).join("\n"),
      };
    case "claim_raised":
      return {
        subject: `Claim on ${b.ref} · ${money(b.claim_cents)} against your ${whole(b.hold_cents)} hold`,
        text: [
          `Hi ${renter}, ${b.provider_name} raised a claim of ${money(b.claim_cents)} at the return check-in of ${b.title}.`,
          b.late_fee_cents > 0 ? `Separately, a late fee of ${money(b.late_fee_cents)} was charged to ${method}.` : "",
          `You have ${b.renter_response_hours} hours to accept or dispute it. Accepting captures ${money(Math.min(b.claim_cents, b.hold_cents))} from the hold and releases the rest; disputing sends both photo sets to fab.rent support, who decide within ${b.admin_decision_sla_hours} hours.`,
          `If you don't respond, the claim goes to fab.rent support.`,
          `Respond: ${links.booking(b)}`,
        ].filter(Boolean).join("\n"),
      };
    case "claim_answered": {
      const accepted = str(p.event) === "claim_accepted";
      const captured = num(p.captured_cents);
      const released = num(p.released_cents);
      if (party === "renter") {
        return accepted
          ? { subject: `Claim settled · ${money(captured)} charged from your hold · ${b.ref}`, text: [`You accepted the claim on ${b.title}.`, `${money(captured)} was captured from the ${whole(b.hold_cents)} hold on ${method}${released > 0 ? ` and ${money(released)} released` : ""}.`, `Booking: ${links.booking(b)}`].join("\n") }
          : { subject: `Dispute opened · ${b.ref} · decision within ${b.admin_decision_sla_hours} h`, text: [`You disputed the claim on ${b.title}. fab.rent support reviews both photo sets and decides within ${b.admin_decision_sla_hours} hours.`, `The ${whole(b.hold_cents)} hold stays in place until then; nothing is charged before a decision.`, `Add anything useful in the booking thread: ${links.booking(b)}`].join("\n") };
      }
      return accepted
        ? { subject: `Claim accepted · ${money(captured)} captured · ${b.ref}`, text: [`${b.renter_name} accepted the claim on ${b.title}.`, `${money(captured)} was captured from the hold and is added to your available balance with no commission${released > 0 ? `; ${money(released)} was released to the renter` : ""}.`, `Booking: ${links.providerBooking(b)}`].join("\n") }
        : { subject: `Claim disputed · ${b.ref} · fab.rent decides within ${b.admin_decision_sla_hours} h`, text: [`${b.renter_name} disputed the claim on ${b.title}. fab.rent support reviews both photo sets and decides within ${b.admin_decision_sla_hours} hours.`, `The hold stays in place until then. Matched-angle photo pairs are what make a full uphold possible.`, `Booking: ${links.providerBooking(b)}`].join("\n") };
    }
    case "dispute_decided": {
      const charged = num(p.captured_cents);
      const released = num(p.released_cents);
      const label = decisionLabel(str(p.decision));
      const reasoning = str(p.reasoning);
      const outcome = `${charged > 0 ? `${money(charged)} charged from the hold` : "Nothing charged from the hold"}${released > 0 ? ` · ${money(released)} released to the renter` : ""}.`;
      return {
        subject: `Decision on ${b.ref}: ${label}`,
        text: [
          party === "renter" ? `fab.rent support decided the claim on ${b.title}: ${label}.` : `fab.rent support decided your claim on ${b.title} (${b.renter_name}): ${label}.`,
          outcome,
          party === "provider" && charged > 0 ? `The upheld amount goes to your balance with no commission.` : "",
          reasoning ? `Reasoning: ${reasoning}` : "",
          `Either party can appeal once within ${b.appeal_days} days.`,
          party === "renter" ? `Booking: ${links.booking(b)}` : `Booking: ${links.providerBooking(b)}`,
        ].filter(Boolean).join("\n"),
      };
    }
    case "extension_requested": {
      const days = num(p.extra_days);
      const newEnd = str(p.new_end_at) ? when(new Date(str(p.new_end_at)), b.tz) : "";
      return {
        subject: `Extension request · ${b.ref} · +${days} ${days === 1 ? "day" : "days"}`,
        text: [`${b.renter_name} asked to keep ${b.title} until ${newEnd}.`, `${money(num(p.amount_cents))} is charged to the renter's card only when you approve; the hold is unchanged.`, `Approve or decline: ${links.providerBooking(b)}`].join("\n"),
      };
    }
    case "extension_decided": {
      const approved = str(p.decision) === "approved";
      const days = num(p.extra_days);
      const newEnd = str(p.new_end_at) ? when(new Date(str(p.new_end_at)), b.tz) : "";
      return approved
        ? { subject: `Extension approved · ${b.ref} · new return ${newEnd}`, text: [`Hi ${renter}, ${b.provider_name} approved ${days} more ${days === 1 ? "day" : "days"} with ${b.title}.`, `New return: ${newEnd}. Charged: ${money(num(p.amount_cents))} to ${method}. The hold is unchanged.`, `Booking: ${links.booking(b)}`].join("\n") }
        : { subject: `Extension declined · ${b.ref}`, text: [`Hi ${renter}, ${b.provider_name} can't extend ${b.title} — the unit is needed after your return time.`, `The original return stands: ${when(b.end_at, b.tz)}. Nothing was charged.`, `Booking: ${links.booking(b)}`].join("\n") };
    }
  }
}

export function renderOtp(code: string, ttlMinutes: number): Rendered {
  return {
    subject: `${code} is your fab.rent sign-in code`,
    text: [`Your one-time code is ${code}.`, `It expires in ${ttlMinutes} minutes and works once. If you didn't request it, you can ignore this email.`].join("\n"),
  };
}

export interface PayoutContext {
  provider_name: string;
  amount_cents: number;
  account_masked: string | null;
  rental_count: number;
  scheduled_for: Date;
  tz: string;
  exception: string | null;
  exception_detail: string | null;
  app_url: string;
}

export function renderPayoutSent(c: PayoutContext): Rendered {
  return {
    subject: `Payout sent · ${money(c.amount_cents)} to ${c.account_masked ?? "your account"}`,
    text: [`${money(c.amount_cents)} for ${c.rental_count} ${c.rental_count === 1 ? "rental" : "rentals"} was sent to ${c.account_masked ?? "your payout account"} on ${formatDateTime(c.scheduled_for, c.tz).split(" · ")[0]}.`, `Banks usually show it within 1–2 business days.`, `Earnings and the ledger: ${c.app_url}/provider/earnings`].join("\n"),
  };
}

export function renderPayoutReminder(c: PayoutContext): Rendered {
  const why = [c.exception, c.exception_detail].filter(Boolean).join(" · ") || "verification pending";
  return {
    subject: `Your payout of ${money(c.amount_cents)} is paused`,
    text: [`${money(c.amount_cents)} for ${c.rental_count} ${c.rental_count === 1 ? "rental" : "rentals"} is waiting: ${why}.`, `Update your tax ID or payout account under Earnings → Payout settings and it goes out on the next run.`, `${c.app_url}/provider/earnings`].join("\n"),
  };
}

export interface ListingReviewContext {
  title: string;
  listing_id: string;
  decision: "approve" | "request_changes" | "reject";
  message: string | null;
  checklist: string[];
  reject_reason: string | null;
  app_url: string;
}

export function renderListingReviewed(c: ListingReviewContext): Rendered {
  const link = `${c.app_url}/provider/listings/${c.listing_id}`;
  if (c.decision === "approve") return { subject: `${c.title} is live`, text: [`fab.rent approved ${c.title}. It's published and bookable now.`, c.message ? `Note from the reviewer: ${c.message}` : "", `Listing: ${link}`].filter(Boolean).join("\n") };
  if (c.decision === "request_changes") return { subject: `Changes requested on ${c.title}`, text: [`fab.rent needs a few changes before ${c.title} can go live; it's hidden until then.`, ...c.checklist.map((x) => `• ${x}`), c.message ? `Message: ${c.message}` : "", `Edit the listing: ${link}`].filter(Boolean).join("\n") };
  return { subject: `${c.title} wasn't approved`, text: [`fab.rent didn't approve ${c.title}.`, c.reject_reason ? `Reason: ${c.reject_reason}` : "", c.message ? `Message: ${c.message}` : "", `Listing: ${link}`].filter(Boolean).join("\n") };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text → a small HTML email: one paragraph per line, URLs made clickable, brand line on top. */
export function toHtml(subject: string, text: string): string {
  const paragraphs = text
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line).replace(/(https?:\/\/[^\s]+)/g, (u) => `<a href="${u}" style="color:#1F4BFF">${u}</a>`)}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#F6F4EF;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1D1C1A"><div style="max-width:560px;margin:0 auto;padding:28px 20px"><div style="font-weight:800;font-size:18px;margin-bottom:18px">fab.rent</div><h1 style="font-size:17px;margin:0 0 14px">${escapeHtml(subject)}</h1>${paragraphs}<p style="margin-top:22px;font-size:12px;color:#6B675F">fab.rent · Port Maren</p></div></body></html>`;
}
