import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUserPage, withActor } from "@/lib/auth";
import { getConversation } from "@/lib/queries/renter";
import { bookingStatus, isBookingStatus } from "@/lib/booking-state";
import { RenterHeader } from "@/components/domain/renter-header";
import { Thread } from "./thread";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await withActor((trx) => getConversation(trx, id)).catch(() => null);
  return { title: c ? `Chat with ${c.provider_name}` : "Messages" };
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, actor] = await Promise.all([params, requireUserPage()]);
  const c = await withActor((trx) => getConversation(trx, id));
  if (!c) notFound();
  const mine = c.renter_id === actor.userId;
  const side = mine ? "renter" : actor.providers.some((p) => p.id === c.provider_id) ? "provider" : null;
  if (!side) notFound();
  const user = actor.profile ? { name: actor.profile.name } : null;
  const status = c.status && isBookingStatus(c.status) ? bookingStatus[c.status].label : null;
  return (
    <>
      <RenterHeader user={user} variant="home" />
      <Thread
        conversationId={c.id}
        side={side}
        me={{ id: actor.userId!, name: actor.profile?.name ?? "You" }}
        provider={{ name: c.provider_name, short: c.provider_name.split(" ")[0]!, responseMinutes: c.response_minutes, ownerName: c.owner_name }}
        renterName={c.renter_name}
        booking={c.ref ? { ref: c.ref, status: c.status ?? "", statusLabel: status, endAt: c.end_at?.toISOString() ?? null } : null}
        listing={{ title: c.listing_title, slug: c.listing_slug, coverUrl: c.cover_url }}
        messages={c.messages.map((m) => ({ id: m.id, sender_side: m.sender_side, kind: m.kind, body: m.body, photo_url: m.photo_url, read_at: m.read_at?.toISOString() ?? null, created_at: m.created_at.toISOString(), sender_name: m.sender_name }))}
      />
    </>
  );
}
