import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserPage, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { getBookingByRef } from "@/lib/queries/bookings";
import { formatDateTime, formatMoney, itemNoun } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { RenterHeader } from "@/components/domain/renter-header";
import { StepBar } from "@/app/(renter)/book/[listingId]/builder";
import { MessageProviderButton } from "@/app/(renter)/listings/[slug]/message-button";
import { CopyRef } from "./copy-ref";

export const metadata: Metadata = { title: "You're booked" };
export const dynamic = "force-dynamic";

export default async function ConfirmedPage({ params }: { params: Promise<{ ref: string }> }) {
  const [{ ref }, actor, config] = await Promise.all([params, requireUserPage(), getLiveConfig()]);
  const b = await withActor((trx) => getBookingByRef(trx, ref));
  if (!b) notFound();
  const first = actor.profile?.name.split(" ")[0] ?? "there";
  const providerShort = b.provider.name.split(" ")[0]!;
  const itemShort = itemNoun(b.listing.title);
  const delivery = b.fulfillment === "delivery";
  const when = `${formatDateTime(b.start_at).split(" · ")[0]}${delivery && b.drop_window ? ` · ${b.drop_window.start}–${b.drop_window.end}` : ` · ${formatDateTime(b.start_at).split(" · ")[1]}`}`;
  const collect = delivery && b.collect_window ? `Collection ${formatDateTime(b.end_at).split(" · ")[0]}, ${b.collect_window.start}–${b.collect_window.end}.` : `Return by ${formatDateTime(b.end_at)}.`;

  return (
    <>
      <RenterHeader user={actor.profile ? { name: actor.profile.name } : null} variant="plain" />
      <main className="mx-auto flex min-h-[calc(100vh-76px)] w-full max-w-[560px] flex-col lg:min-h-0 lg:py-10">
        <div className="lg:hidden"><StepBar step={3} /></div>
        <div className="flex flex-col items-center gap-3 px-5 pt-10 text-center lg:pt-6">
          <span className="flex size-14 items-center justify-center rounded-full bg-ok"><Icon name="check" size={26} strokeWidth={3} className="text-white" /></span>
          <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">{b.status === "requested" ? `Request sent, ${first}` : `You're booked, ${first}`}</h1>
          <p className="text-[13px] leading-[1.5] text-text-2">{b.status === "requested" ? `${b.provider.name} usually answers within ${b.provider.response_minutes ? `${b.provider.response_minutes} minutes` : "an hour"}. You've been charged now and refunded in full if they decline.` : `${b.provider.name} confirmed instantly.`} A receipt is on its way to {actor.profile?.email ?? "your inbox"}.</p>
          <CopyRef refCode={b.ref} />
        </div>
        <div className="card-sm mx-5 mt-5 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-3.5 py-3">
            <span className="flex size-11 flex-none items-center justify-center rounded-control bg-cobalt-tint text-cobalt"><Icon name={delivery ? "van" : "box"} size={22} /></span>
            <div><div className="text-[14px] font-bold">{delivery ? "Delivery" : "Pickup"} {when}</div><div className="text-[12px] text-text-2">{delivery ? `${b.delivery_address ?? ""}${b.delivery_area ? `, ${b.delivery_area}` : ""}${b.provider.name ? ` · driver: ${providerShort} van` : ""}` : `${b.listing_extra.pickup_address ?? b.provider.name} · ${b.provider.name}`}</div></div>
          </div>
          <div className="px-3.5 py-3 text-[12px] leading-[1.55] text-text-2">Be there with your photo ID. You and the {delivery ? "driver" : "provider"} photograph the {itemShort} and confirm the serial together; the {formatMoney(b.hold_cents, { whole: true })} hold is placed then. {collect}</div>
        </div>
        <div className="card-sm mx-5 mt-3 flex flex-col gap-1.5 px-3.5 py-3 text-[13px]">
          <div className="flex justify-between"><span className="text-text-2">Charged to {b.payment_method_label}</span><span className="t-mono font-medium">{formatMoney(b.charged_cents)}</span></div>
          <div className="flex justify-between"><span className="text-text-2">Hold at {delivery ? "delivery" : "handoff"} (not charged)</span><span className="t-mono text-text-2">{formatMoney(b.hold_cents)}</span></div>
          {b.free_cancel_until && <div className="flex justify-between"><span className="text-text-2">Free cancellation until</span><span className="font-semibold">{formatDateTime(b.free_cancel_until).replace(" · ", ", ")}</span></div>}
        </div>
        <div className="flex flex-col gap-2 px-5 pt-5">
          <div className="t-label text-text-3">Next</div>
          <div className="grid grid-cols-2 gap-2">
            <a href={`/api/bookings/${b.ref}/calendar.ics`} className="card-sm flex flex-col gap-1.5 rounded-panel p-3 text-charcoal no-underline hover:text-charcoal"><Icon name="calendar" size={18} /><div className="text-[13px] font-semibold">Add to calendar</div></a>
            <MessageProviderButton bookingRef={b.ref} variant="secondary" className="card-sm !h-auto !rounded-panel !border-border !justify-start !items-start !p-3 !font-semibold flex-col gap-1.5 text-[13px]"><Icon name="message" size={18} />Message {providerShort}</MessageProviderButton>
          </div>
        </div>
        <div className="mt-auto flex flex-col gap-2 px-5 pt-6 pb-[max(20px,env(safe-area-inset-bottom))]">
          <Button size="xl" block className="!rounded-[12px]" href={`/rentals/${b.ref}`} data-testid="view-booking">View booking</Button>
          <Button size="xl" block variant="secondary" className="!rounded-[12px]" href="/">Keep browsing</Button>
        </div>
        <span className="sr-only">{config.market.name}</span>
        <Link href="/rentals" className="sr-only">Rentals</Link>
      </main>
    </>
  );
}
