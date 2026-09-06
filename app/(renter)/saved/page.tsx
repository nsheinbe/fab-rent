import type { Metadata } from "next";
import { requireUserPage, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { comingWeekend, now } from "@/lib/time";
import { listSavedListings } from "@/lib/queries/renter";
import { searchListings } from "@/lib/queries/listings";
import { bookingContextQuery } from "@/lib/search/params";
import { RenterPage } from "@/components/domain/renter-page";
import { ListingCard } from "@/components/domain/listing-card";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Saved" };
export const dynamic = "force-dynamic";

/** Saved listings, priced for the coming weekend like the home page. */
export default async function SavedPage() {
  const [actor, config] = await Promise.all([requireUserPage(), getLiveConfig()]);
  const tz = config.market.timezone;
  const { start, end } = comingWeekend(now(), tz);
  const saved = await withActor((trx) => listSavedListings(trx, actor.userId!));
  const ids = saved.map((s) => s.listing_id);
  const result = ids.length ? await withActor((trx) => searchListings(trx, { ids, from: start, to: end, radius: 100, showUnavailable: true, limit: 100, sort: "best" }, config)) : null;
  const items = result ? ids.map((id) => result.items.find((i) => i.id === id)).filter((x): x is NonNullable<typeof x> => !!x) : [];
  const ctx = bookingContextQuery({ from: start, to: end, qty: 1, fulfillment: "any", where: undefined }, tz);
  const user = actor.profile ? { name: actor.profile.name } : null;
  return (
    <RenterPage user={user} title="Saved" subtitle={items.length ? `${items.length} ${items.length === 1 ? "listing" : "listings"} · priced for this weekend` : undefined} width={760}>
      {items.length === 0 ? (
        <div className="px-5 pt-10 lg:px-6"><EmptyState icon="heart" title="Nothing saved yet" body="Tap the heart on any listing to keep it here." action={<Button size="md" href="/search">Browse listings</Button>} /></div>
      ) : (
        <div className="grid gap-2.5 px-5 pt-4 pb-10 lg:grid-cols-2 lg:gap-3.5 lg:px-6 lg:pt-6">
          {items.map((l) => <ListingCard key={l.id} listing={l} variant="row" href={`/listings/${l.slug}?${ctx}`} />)}
        </div>
      )}
    </RenterPage>
  );
}
