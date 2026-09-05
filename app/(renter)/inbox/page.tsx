import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, withActor } from "@/lib/auth";
import { listConversations } from "@/lib/queries/renter";
import { bookingStatus, isBookingStatus } from "@/lib/booking-state";
import { formatDate, formatTime } from "@/lib/format";
import { now } from "@/lib/time";
import { RenterPage } from "@/components/domain/renter-page";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const actor = await requireUser();
  const convs = await withActor((trx) => listConversations(trx, "renter", actor.userId!));
  const user = actor.profile ? { name: actor.profile.name } : null;
  const today = formatDate(now());
  return (
    <RenterPage user={user} title="Inbox" width={720}>
      {convs.length === 0 ? (
        <div className="px-5 pt-10 lg:px-6"><EmptyState icon="message" title="No messages yet" body="Threads with providers appear here — one per booking, with delivery updates inline." action={<Button size="md" href="/rentals">Go to rentals</Button>} /></div>
      ) : (
        <div className="card-sm mx-5 mt-4 overflow-hidden rounded-panel lg:mx-6 lg:mt-6">
          {convs.map((c, i) => {
            const unread = Number(c.renter_unread ?? 0) > 0;
            const status = c.status && isBookingStatus(c.status) ? bookingStatus[c.status].label : null;
            const when = c.last_message_at ? (formatDate(c.last_message_at) === today ? formatTime(c.last_message_at) : formatDate(c.last_message_at)) : "";
            return (
              <Link key={c.id} href={`/inbox/${c.id}`} className={`flex items-center gap-3 px-3.5 py-3 text-charcoal no-underline hover:bg-ivory/60 ${i < convs.length - 1 ? "border-b border-border" : ""}`}>
                <Avatar name={c.provider_name} size={44} tone="charcoal" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className={`truncate-1 text-[14px] ${unread ? "font-extrabold" : "font-bold"}`}>{c.provider_name}</div>
                    <div className="flex-none text-[11px] text-text-3">{when}</div>
                  </div>
                  <div className="truncate-1 text-[12px] text-text-3">{c.listing_title ?? "Listing"}{c.ref ? ` · ${c.ref}` : ""}{status ? ` · ${status}` : ""}</div>
                  <div className={`truncate-1 text-[13px] ${unread ? "font-semibold text-charcoal" : "text-text-2"}`}>{c.last_message_preview ?? "Say hello"}</div>
                </div>
                {unread && <span className="size-2.5 flex-none rounded-full bg-cobalt" aria-label="Unread" />}
              </Link>
            );
          })}
        </div>
      )}
    </RenterPage>
  );
}
