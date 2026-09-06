import type { Metadata } from "next";
import Link from "next/link";
import { requireProvider, withActor } from "@/lib/auth";
import { listConversations } from "@/lib/queries/renter";
import { bookingStatus, isBookingStatus } from "@/lib/booking-state";
import { formatDate, formatTime } from "@/lib/format";
import { now } from "@/lib/time";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Messages" };

export default async function ProviderInboxPage() {
  const actor = await requireProvider();
  const convs = await withActor((trx) => listConversations(trx, "provider", actor.provider.id));
  const today = formatDate(now());
  return (
    <div className="px-4 py-5 md:px-6 lg:px-7">
      {convs.length === 0 ? <EmptyState icon="message" title="No conversations yet" body="Each booking gets a thread with the renter; enquiries before booking land here too." /> : (
        <div className="card overflow-hidden">
          {convs.map((c, i) => {
            const unread = Number(c.provider_unread ?? 0) > 0;
            const status = c.status && isBookingStatus(c.status) ? bookingStatus[c.status].label : null;
            return (
              <Link key={c.id} href={`/provider/inbox/${c.id}`} className={`flex items-center gap-3 px-4 py-3 text-charcoal no-underline hover:bg-ivory/60 ${i < convs.length - 1 ? "border-b border-border" : ""}`}>
                <Avatar name={c.renter_name} size={40} tone="cobalt" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3"><div className={`truncate-1 text-[14px] ${unread ? "font-extrabold" : "font-bold"}`}>{c.renter_name}</div><div className="text-[11px] text-text-3">{c.last_message_at ? (formatDate(c.last_message_at) === today ? formatTime(c.last_message_at) : formatDate(c.last_message_at)) : ""}</div></div>
                  <div className="truncate-1 text-[12px] text-text-3">{c.listing_title ?? "Enquiry"}{c.ref ? ` · ${c.ref}` : ""}{status ? ` · ${status}` : ""}</div>
                  <div className={`truncate-1 text-[13px] ${unread ? "font-semibold" : "text-text-2"}`}>{c.last_message_preview ?? "—"}</div>
                </div>
                {unread && <span className="size-2.5 rounded-full bg-cobalt" aria-label="Unread" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
