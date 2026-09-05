import "server-only";
import type { Trx } from "@/lib/db";
import { photoUrl } from "@/lib/storage";

export async function listSavedListings(trx: Trx, profileId: string) {
  return trx.selectFrom("saved_listings").select("listing_id").where("profile_id", "=", profileId).execute();
}

export async function listConversations(trx: Trx, side: "renter" | "provider", ownerId: string) {
  const q = trx
    .selectFrom("conversations as c")
    .innerJoin("providers as p", "p.id", "c.provider_id")
    .innerJoin("profiles as r", "r.id", "c.renter_id")
    .leftJoin("bookings as b", "b.id", "c.booking_id")
    .leftJoin("listings as l", "l.id", "c.listing_id")
    .select((eb) => ["c.id", "c.last_message_at", "c.last_message_preview", "c.renter_unread", "c.provider_unread", "p.name as provider_name", "p.response_minutes", "r.name as renter_name", "b.ref", "b.status", "b.end_at", "l.title as listing_title", eb.selectFrom("listing_photos as ph").select("ph.storage_path").whereRef("ph.listing_id", "=", "l.id").orderBy("ph.is_cover", "desc").limit(1).as("cover_path")])
    .orderBy("c.last_message_at", "desc");
  const rows = await (side === "renter" ? q.where("c.renter_id", "=", ownerId) : q.where("c.provider_id", "=", ownerId)).execute();
  return Promise.all(rows.map(async (r) => ({ ...r, cover_url: await photoUrl("listing-photos", r.cover_path) })));
}

export async function getConversation(trx: Trx, id: string) {
  const c = await trx
    .selectFrom("conversations as c")
    .innerJoin("providers as p", "p.id", "c.provider_id")
    .innerJoin("profiles as r", "r.id", "c.renter_id")
    .leftJoin("profiles as o", "o.id", "p.owner_profile_id")
    .leftJoin("bookings as b", "b.id", "c.booking_id")
    .leftJoin("listings as l", "l.id", "c.listing_id")
    .select((eb) => ["c.id", "c.booking_id", "c.provider_id", "c.renter_id", "p.name as provider_name", "p.response_minutes", "o.name as owner_name", "r.name as renter_name", "b.ref", "b.status", "b.end_at", "l.title as listing_title", "l.slug as listing_slug", eb.selectFrom("listing_photos as ph").select("ph.storage_path").whereRef("ph.listing_id", "=", "l.id").orderBy("ph.is_cover", "desc").limit(1).as("cover_path")])
    .where("c.id", "=", id)
    .executeTakeFirst();
  if (!c) return null;
  const messages = await trx.selectFrom("messages as m").leftJoin("profiles as s", "s.id", "m.sender_id").select(["m.id", "m.sender_side", "m.kind", "m.body", "m.photo_path", "m.read_at", "m.created_at", "s.name as sender_name"]).where("m.conversation_id", "=", id).orderBy("m.created_at").execute();
  return { ...c, cover_url: await photoUrl("listing-photos", c.cover_path), messages: await Promise.all(messages.map(async (m) => ({ ...m, photo_url: await photoUrl("condition-photos", m.photo_path) }))) };
}

export async function getPaymentMethods(trx: Trx, profileId: string) {
  return trx.selectFrom("payment_methods").selectAll().where("profile_id", "=", profileId).orderBy("is_default", "desc").orderBy("created_at").execute();
}

export async function getUnreadCount(trx: Trx, side: "renter" | "provider", ownerId: string): Promise<number> {
  const r = await (side === "renter"
    ? trx.selectFrom("conversations").select((eb) => eb.fn.sum<number>("renter_unread").as("n")).where("renter_id", "=", ownerId)
    : trx.selectFrom("conversations").select((eb) => eb.fn.sum<number>("provider_unread").as("n")).where("provider_id", "=", ownerId)
  ).executeTakeFirst();
  return Number(r?.n ?? 0);
}
