import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getActor, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { getBookingByRef } from "@/lib/queries/bookings";
import { formatDateTime, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

/** The standard PDF fonts only speak WinAnsi: swap the few symbols our copy uses and drop anything else outside it. */
const WIN_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const SWAPS: Record<string, string> = { "→": "->", "≤": "<=", "≥": ">=", "−": "-", "★": "*", "✓": "v" };
function winAnsi(s: string) {
  return Array.from(s, (ch) => {
    const code = ch.codePointAt(0)!;
    if (code < 0x100 || WIN_EXTRA.has(ch)) return ch;
    return SWAPS[ch] ?? "?";
  }).join("");
}

/** Receipt PDF (M11 "Receipt (PDF)"). RLS decides who can see the booking: renter, provider members, staff. */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const actor = await getActor();
  if (!actor.userId) return new Response("Sign in to download receipts", { status: 401 });
  const [b, config] = await Promise.all([withActor((trx) => getBookingByRef(trx, ref)), getLiveConfig()]);
  if (!b) return new Response("Not found", { status: 404 });

  const pdf = await PDFDocument.create();
  pdf.setTitle(`fab.rent receipt ${b.ref}`);
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const charcoal = rgb(0.118, 0.118, 0.11);
  const muted = rgb(0.43, 0.42, 0.38);
  const cobalt = rgb(0.118, 0.259, 0.91);
  let y = 790;
  const text = (s: string, x: number, size = 11, f = font, color = charcoal) => page.drawText(winAnsi(s), { x, y, size, font: f, color });
  const right = (s: string, size = 11, f = font, color = charcoal) => {
    const t = winAnsi(s);
    page.drawText(t, { x: 545 - f.widthOfTextAtSize(t, size), y, size, font: f, color });
  };

  text("fab", 50, 22, bold);
  page.drawCircle({ x: 50 + bold.widthOfTextAtSize("fab", 22) + 4, y: y + 3, size: 2.6, color: cobalt });
  text("rent", 50 + bold.widthOfTextAtSize("fab", 22) + 10, 22, bold);
  right(`Receipt · ${b.ref}`, 12, mono, muted);
  y -= 18;
  right(`Issued ${formatDateTime(b.created_at, config.market.timezone)} · ${config.market.name}`, 9, font, muted);
  y -= 40;
  text(b.listing.title, 50, 15, bold);
  y -= 18;
  text(`${b.provider.name} · ${b.fulfillment === "delivery" ? `Delivery to ${[b.delivery_address, b.delivery_area].filter(Boolean).join(", ")}` : "Pickup"}`, 50, 10, font, muted);
  y -= 16;
  text(`${formatDateTime(b.start_at, config.market.timezone)}  →  ${formatDateTime(b.end_at, config.market.timezone)} · ${b.billed_days} ${b.billed_days === 1 ? "day" : "days"}${b.qty > 1 ? ` · ${b.qty} units` : ""}`, 50, 10, font, muted);
  y -= 14;
  text(`Renter: ${b.renter.name} · Booking status: ${b.status.replace(/_/g, " ")}`, 50, 10, font, muted);
  y -= 30;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.6, color: rgb(0.89, 0.87, 0.83) });
  y -= 22;
  for (const line of b.price_snapshot.lines) {
    if (line.cents === 0 && line.kind !== "delivery") continue;
    text(line.label, 50, 11);
    right(formatMoney(line.cents), 11, mono);
    y -= 18;
  }
  y -= 6;
  page.drawRectangle({ x: 50, y: y - 8, width: 495, height: 28, color: charcoal });
  text("CHARGED AT BOOKING", 60, 9, bold, rgb(1, 1, 1));
  right(formatMoney(b.charged_cents), 13, mono, rgb(1, 1, 1));
  y -= 30;
  text(`Paid with ${b.payment_method_label ?? "card"} · ${formatDateTime(b.events.find((e) => e.type === "payment_charged")?.occurred_at ?? b.created_at, config.market.timezone)}`, 50, 9.5, font, muted);
  y -= 26;
  if (b.hold_cents > 0) {
    text("Security hold (authorization, not a charge)", 50, 11);
    right(formatMoney(b.hold_cents), 11, mono, muted);
    y -= 15;
    const holdNote = b.hold_status === "released" ? `Released ${b.hold_released_at ? formatDateTime(b.hold_released_at, config.market.timezone) : ""}` : b.hold_status === "captured" || b.hold_status === "partially_captured" ? `${formatMoney(b.hold_captured_cents)} captured for an agreed claim; the rest released` : b.hold_status === "placed" ? `Placed at handoff${b.hold_placed_at ? ` ${formatDateTime(b.hold_placed_at, config.market.timezone)}` : ""} · released within ${config.holds.auto_release_business_days} business days of return check-in` : `Placed at handoff · released within ${config.holds.auto_release_business_days} business days of return check-in`;
    text(holdNote, 50, 9.5, font, muted);
    y -= 24;
  }
  if (b.status === "cancelled" && b.cancellation_snapshot) {
    text(`Cancelled ${b.cancelled_at ? formatDateTime(b.cancelled_at, config.market.timezone) : ""} · refunded ${formatMoney(Number(b.cancellation_snapshot.refunded_cents ?? 0))}`, 50, 10, bold);
    y -= 22;
  }
  y = 70;
  text(`${config.tax.label ?? "Sales tax"} ${config.tax.sales_tax_pct}% collected by fab.rent on behalf of ${b.provider.name}. Cancellation: ${b.cancellation_policy.name} policy.`, 50, 8.5, font, muted);
  y -= 12;
  text(`fab.rent · ${config.market.name} · support@fab.rent · booking ${b.ref}`, 50, 8.5, font, muted);

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="fabrent-${b.ref}.pdf"`, "Cache-Control": "private, no-store" } });
}
