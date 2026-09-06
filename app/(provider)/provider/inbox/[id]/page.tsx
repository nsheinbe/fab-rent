import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProvider, withActor } from "@/lib/auth";
import { getConversation } from "@/lib/queries/renter";
import { bookingStatus, isBookingStatus } from "@/lib/booking-state";
import { Thread } from "@/app/(renter)/inbox/[id]/thread";

export const metadata: Metadata = { title: "Conversation" };

/** Provider side of the M13 thread — same component, mirrored. */
export default async function ProviderThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, actor] = await Promise.all([params, requireProvider()]);
  const c = await withActor((trx) => getConversation(trx, id));
  if (!c || c.provider_id !== actor.provider.id) notFound();
  const status = c.status && isBookingStatus(c.status) ? bookingStatus[c.status].label : null;
  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col bg-paper">
      <Thread
        conversationId={c.id}
        side="provider"
        me={{ id: actor.userId!, name: actor.profile?.name ?? "You" }}
        provider={{ name: c.provider_name, short: c.provider_name.split(" ")[0]!, responseMinutes: c.response_minutes, ownerName: c.owner_name }}
        renterName={c.renter_name}
        booking={c.ref ? { ref: c.ref, status: c.status ?? "", statusLabel: status, endAt: c.end_at?.toISOString() ?? null } : null}
        listing={{ title: c.listing_title, slug: c.listing_slug, coverUrl: c.cover_url }}
        messages={c.messages.map((m) => ({ id: m.id, sender_side: m.sender_side, kind: m.kind, body: m.body, photo_url: m.photo_url, read_at: m.read_at?.toISOString() ?? null, created_at: m.created_at.toISOString(), sender_name: m.sender_name }))}
      />
    </div>
  );
}
