import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor, withActor } from "@/lib/auth";
import { getLiveSettings } from "@/lib/settings/live";
import { marketLocal, now } from "@/lib/time";
import { getListingBySlug } from "@/lib/queries/listings";
import { getPaymentMethods } from "@/lib/queries/renter";
import { quoteBooking, QuoteError, freeCancelUntil, instantBookEligible } from "@/lib/pricing";
import { RenterHeader } from "@/components/domain/renter-header";
import { CheckoutForm } from "./checkout-form";
import type { DraftPayload } from "../../actions";

export const metadata: Metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ draftId: string }> }) {
  const [{ draftId }, { config }, actor] = await Promise.all([params, getLiveSettings(), getActor()]);
  if (!actor.userId) redirect(`/auth?next=${encodeURIComponent(`/checkout/${draftId}`)}`);
  const tz = config.market.timezone;
  const data = await withActor(async (trx) => {
    const draft = await trx.selectFrom("booking_drafts").selectAll().where("id", "=", draftId).executeTakeFirst();
    if (!draft) return null;
    const p = draft.payload as unknown as DraftPayload;
    const listing = await getListingBySlug(trx, p.listing_slug);
    if (!listing) return null;
    const methods = await getPaymentMethods(trx, actor.userId!);
    return { draft, p, listing, methods };
  });
  if (!data) notFound();
  const { p, listing, methods } = data;
  const start = marketLocal(p.from, tz);
  const end = marketLocal(p.to, tz);
  const extras = p.extras.map((e) => ({ extra: listing.extras.find((x) => x.id === e.id)!, qty: e.qty })).filter((e) => e.extra);
  let quote;
  try {
    quote = quoteBooking({ pricing: listing.pricing, delivery: listing.delivery }, { start, end, qty: p.qty, fulfillment: p.fulfillment, delivery_km: p.delivery_km ?? undefined, extras, tz, delivery_area: p.area ?? undefined }, config);
  } catch (e) {
    if (e instanceof QuoteError) redirect(`/listings/${listing.slug}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  const policy = config.cancellation.policies.find((x) => x.id === listing.policy_id) ?? config.cancellation.policies.find((x) => x.is_default)!;
  const eligible = instantBookEligible(actor.profile ? { id_verified: actor.profile.id_verified, rating: actor.profile.rating_from_providers, completed_count: actor.profile.completed_count } : null, listing.instant_book, config);
  const nowAt = now();
  void nowAt;
  return (
    <>
      <RenterHeader user={actor.profile ? { name: actor.profile.name } : null} variant="checkout" />
      <CheckoutForm
        draftId={draftId}
        listing={{ id: listing.id, slug: listing.slug, title: listing.title, short_title: listing.title.split(" ").slice(0, 3).join(" ").replace(/ 10-in$/, "") + (listing.title.toLowerCase().includes("table saw") ? " table saw" : ""), provider: listing.provider.name, provider_short: listing.provider.name.split(" ")[0]!, provider_rating: listing.provider.rating, cover_url: listing.photos[0]?.url ?? null, hold_without_waiver_cents: listing.pricing.hold_cents * p.qty, rules_count: listing.rules.length }}
        booking={{ start, end, qty: p.qty, fulfillment: p.fulfillment, address: p.address, area: p.area, drop: p.drop, collect: p.collect, extras: extras.map((e) => e.extra.name) }}
        quote={quote}
        config={config}
        policy={{ name: policy.name, free_until: freeCancelUntil(policy, start) }}
        contact={{ name: actor.profile?.name ?? "", phone: actor.profile?.phone ?? "", email: actor.profile?.email ?? "", id_verified: actor.profile?.id_verified ?? false }}
        methods={methods.map((m) => ({ id: m.id, brand: m.brand, last4: m.last4, exp: m.exp_month && m.exp_year ? `${String(m.exp_month).padStart(2, "0")}/${String(m.exp_year).slice(2)}` : null, is_default: m.is_default }))}
        instant={eligible}
      />
    </>
  );
}
