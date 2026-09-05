import { getActor, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { getBookingByRef } from "@/lib/queries/bookings";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

/** "Add to calendar" (M09): one event spanning handoff → return, in UTC so every calendar app shows market time correctly. */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const actor = await getActor();
  if (!actor.userId) return new Response("Sign in first", { status: 401 });
  const [b, config] = await Promise.all([withActor((trx) => getBookingByRef(trx, ref)), getLiveConfig()]);
  if (!b) return new Response("Not found", { status: 404 });
  const origin = new URL(req.url).origin;
  const delivery = b.fulfillment === "delivery";
  const location = delivery ? [b.delivery_address, b.delivery_area, config.market.name].filter(Boolean).join(", ") : [b.listing_extra.pickup_address, b.provider.neighbourhood, config.market.name].filter(Boolean).join(", ");
  const description = [
    `${b.listing.title} from ${b.provider.name} · booking ${b.ref}`,
    delivery && b.drop_window ? `Delivery window ${b.drop_window.start}–${b.drop_window.end}` : "Bring photo ID for the handoff",
    delivery && b.collect_window ? `Collection window ${b.collect_window.start}–${b.collect_window.end}` : "",
    `Charged ${formatMoney(b.charged_cents)}${b.hold_cents ? ` · ${formatMoney(b.hold_cents, { whole: true })} hold at handoff` : ""}`,
    `${origin}/rentals/${b.ref}`,
  ].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//fab.rent//booking//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@fab.rent`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(b.start_at)}`,
    `DTEND:${stamp(b.end_at)}`,
    `SUMMARY:${esc(`${b.listing.title} · fab.rent`)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${esc(description)}`,
    `URL:${origin}/rentals/${b.ref}`,
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${esc(`${delivery ? "Delivery" : "Pickup"} of ${b.listing.title} in 2 hours`)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="fabrent-${b.ref}.ics"`, "Cache-Control": "private, no-store" } });
}
