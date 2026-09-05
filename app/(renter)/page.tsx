import Link from "next/link";
import { getActor, withActor } from "@/lib/auth";
import { getLiveSettings } from "@/lib/settings/live";
import { comingWeekend, now } from "@/lib/time";
import { featuredListings, getCategoriesWithCounts } from "@/lib/queries/listings";
import { RenterHeader } from "@/components/domain/renter-header";
import { SearchBar } from "@/components/domain/search-bar";
import { ListingCard } from "@/components/domain/listing-card";
import { RecentlyViewed } from "@/components/domain/recently-viewed";
import { CategoryIcon } from "@/components/domain/category-icon";
import { Logo } from "@/components/domain/logo";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { Icon } from "@/components/ui/icons";
import { bookingContextQuery, toSearchQuery } from "@/lib/search/params";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ config }, actor] = await Promise.all([getLiveSettings(), getActor()]);
  const tz = config.market.timezone;
  const nowAt = now();
  const weekend = comingWeekend(nowAt, tz);
  const nearSlug = actor.profile?.neighbourhood ? config.market.neighbourhoods.find((n) => n.name === actor.profile!.neighbourhood)?.slug ?? "" : "old-harbour";
  const near = config.market.neighbourhoods.find((n) => n.slug === nearSlug) ?? config.market.neighbourhoods[0]!;
  const { categories, featured } = await withActor(async (trx) => ({ categories: await getCategoriesWithCounts(trx), featured: await featuredListings(trx, config, weekend.start, weekend.end, near.slug, 8) }));
  const searchState = { q: "", where: "", radius: config.market.default_radius_km, from: weekend.start, to: weekend.end, qty: 1 };
  const featuredHref = `/search?${toSearchQuery({ from: weekend.start, to: weekend.end, where: near.slug, radius: 50 }, tz)}`;
  const ctx = bookingContextQuery({ from: weekend.start, to: weekend.end, qty: 1 }, tz);
  const user = actor.profile ? { name: actor.profile.name } : null;
  const topCats = categories.slice(0, 8);

  return (
    <>
      <RenterHeader user={user} variant="home" />
      {/* ---------------- mobile (M01) */}
      <main className="lg:hidden flex flex-col">
        <div className="flex items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))]">
          <Logo size={24} />
          {user ? (
            <Link href="/profile" className="flex h-9 items-center rounded-pill border border-border-strong bg-white px-3.5 text-[13px] font-semibold text-charcoal no-underline">Hi, {user.name.split(" ")[0]}</Link>
          ) : (
            <Link href="/auth" className="flex h-9 items-center rounded-pill border border-border-strong bg-white px-3.5 text-[13px] font-semibold text-charcoal no-underline">Sign in</Link>
          )}
        </div>
        <h1 className="px-5 pt-[18px] text-[24px] font-extrabold leading-[1.15] tracking-[-0.03em] text-pretty">Rent it nearby, for exactly as long as you need.</h1>
        <div className="mx-5 mt-4">
          <SearchBar variant="hero" state={searchState} neighbourhoods={config.market.neighbourhoods} marketName={config.market.name} tz={tz} today={nowAt} />
        </div>
        <div className="flex items-baseline justify-between px-5 pt-[22px]">
          <div className="text-[16px] font-bold">Browse</div>
          <Link href="/search" className="text-[13px] font-semibold no-underline">All {categories.length} categories</Link>
        </div>
        <div className="grid grid-cols-4 gap-2 px-5 pt-3">
          {topCats.slice(0, 4).map((c) => (
            <Link key={c.id} href={`/search?category=${c.slug}&${ctx}`} className="card flex flex-col items-center gap-[7px] rounded-panel px-1.5 pb-2.5 pt-3 text-charcoal no-underline hover:text-charcoal">
              <CategoryIcon icon={c.icon} />
              <div className="text-center text-[11px] font-semibold leading-[1.2]">{c.name}</div>
            </Link>
          ))}
        </div>
        <div className="flex items-baseline justify-between px-5 pt-[22px]">
          <div className="text-[16px] font-bold">Available this weekend</div>
          <div className="text-[12px] text-text-3">near {near.name}</div>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-none pl-5 pr-5 pt-3">
          {featured.slice(0, 6).map((l) => (
            <ListingCard key={l.id} listing={l} variant="mini" href={`/listings/${l.slug}?${ctx}`} />
          ))}
        </div>
        <RecentlyViewed className="px-5 pt-5" />
        <div className="h-6" />
      </main>

      {/* ---------------- desktop (W01) */}
      <main className="hidden lg:block">
        <div className="grid items-center gap-12 px-10 pb-11 pt-14 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-[22px]">
            <h1 className="text-[50px] font-extrabold leading-[1.04] tracking-[-0.035em] text-balance">Rent it nearby, for exactly as long as you need.</h1>
            <p className="max-w-[540px] text-[16px] leading-[1.55] text-text-2">Tools, equipment and event supplies from verified providers across {config.market.name}. Every handoff is photographed, deposits are holds not charges, and the full price is shown before you pay.</p>
            <DesktopHeroSearch searchState={searchState} config={config} tz={tz} nowAt={nowAt} />
            <div className="text-[13px] text-text-3">Popular this week: <span className="font-semibold text-charcoal">{["table saw", "frame tent", "generator", "projector", "pressure washer"].map((t, i) => (<span key={t}>{i > 0 && " · "}<Link href={`/search?q=${encodeURIComponent(t)}&${ctx}`} className="text-charcoal no-underline hover:text-cobalt">{t}</Link></span>))}</span></div>
          </div>
          <div className="relative hidden h-[400px] overflow-hidden rounded-[20px] xl:block">
            <PhotoSlot placeholder="Hero photo · provider handing a tool to a renter" className="absolute inset-0" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2.5 px-10 xl:grid-cols-8">
          {topCats.map((c) => (
            <Link key={c.id} href={`/search?category=${c.slug}&${ctx}`} className="card flex flex-col items-center gap-2 rounded-card-sm px-3 pb-3.5 pt-4 text-charcoal no-underline hover:text-charcoal hover:shadow-card">
              <CategoryIcon icon={c.icon} size={24} />
              <div className="text-[13px] font-semibold">{c.name}</div>
              <div className="text-[11px] text-text-3">{(c.listing_count_display ?? Number(c.count)).toLocaleString()}</div>
            </Link>
          ))}
        </div>
        <div className="flex items-baseline justify-between px-10 pt-11">
          <h2 className="text-[22px] font-bold tracking-[-0.02em]">Available this weekend near {near.name}</h2>
          <Link href={featuredHref} className="text-[13px] font-semibold no-underline">See all</Link>
        </div>
        <div className="grid grid-cols-2 gap-4 px-10 pt-4 xl:grid-cols-4">
          {featured.slice(0, 4).map((l) => (
            <ListingCard key={l.id} listing={l} variant="tile" href={`/listings/${l.slug}?${ctx}`} />
          ))}
        </div>
        <section id="how" className="mx-10 mb-10 mt-11 grid gap-8 rounded-[20px] border border-border bg-white px-8 py-7 xl:grid-cols-3">
          {[
            { icon: "camera", title: "Photographed at every handoff", body: "You and the provider record condition and serial together, so returns are never a guessing game." },
            { icon: "lock", title: "Holds, not deposits", body: `Security is a temporary card authorization placed at handoff and released within ${config.holds.auto_release_business_days} business days of return.` },
            { icon: "shield-check", title: "Verified providers", body: "Businesses and individuals are ID-checked, and every listing shows service history and real handoff ratings." },
          ].map((t) => (
            <div key={t.title} className="flex gap-3.5">
              <span className="flex size-10 flex-none items-center justify-center rounded-control bg-cobalt-tint text-cobalt"><Icon name={t.icon as "camera"} size={20} /></span>
              <div>
                <div className="text-[15px] font-bold">{t.title}</div>
                <div className="mt-1 text-[13px] leading-[1.5] text-text-2">{t.body}</div>
              </div>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}

function DesktopHeroSearch({ searchState, config, tz, nowAt }: { searchState: { q: string; where: string; radius: number; from: Date; to: Date; qty: number }; config: { market: { neighbourhoods: Array<{ slug: string; name: string }>; name: string } }; tz: string; nowAt: Date }) {
  return (
    <div className="card p-1.5 shadow-[0_12px_36px_rgba(30,30,28,.08)]">
      <SearchBar variant="desktop" state={searchState} neighbourhoods={config.market.neighbourhoods} marketName={config.market.name} tz={tz} today={nowAt} className="!max-w-none !h-14 !border-0 !shadow-none !rounded-[12px]" />
    </div>
  );
}
