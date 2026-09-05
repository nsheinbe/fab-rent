"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ListingCard } from "@/components/domain/listing-card";
import { MapView } from "@/components/domain/map-view";
import type { SearchResultItem } from "@/lib/queries/listings";
import { toSearchQuery, type SearchState } from "@/lib/search/params";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

function useSelection(items: SearchResultItem[]) {
  const [picked, setSelectedId] = useState<string | null>(null);
  // fall back to the first result when nothing (or something no longer listed) is selected
  const selectedId = picked && items.some((i) => i.id === picked) ? picked : items[0]?.id ?? null;
  return [selectedId, setSelectedId] as const;
}

/** Desktop: grid of tiles + map with pins mirroring the list. Hovering/clicking a card selects the pin. */
export function DesktopResults({ items, origin, radius, ctx, empty, header }: { items: SearchResultItem[]; origin: { lat: number; lng: number }; radius: number; ctx: string; empty: React.ReactNode; header: React.ReactNode }) {
  const [selectedId, setSelectedId] = useSelection(items);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const select = (id: string) => {
    setSelectedId(id);
    refs.current[id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-col">
        {/* sole child on purpose: a server-rendered element in an array position has no key and trips React's key warning */}
        <div className="flex-none">{header}</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-3">
          {items.length === 0 ? empty : (
            <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
              {items.map((l) => (
                <div key={l.id} ref={(el) => { refs.current[l.id] = el; }} onMouseEnter={() => setSelectedId(l.id)}>
                  <ListingCard listing={l} variant="tile" selected={l.id === selectedId} href={`/listings/${l.slug}?${ctx}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <MapView className="hidden xl:block border-l border-border" pins={items.filter((i) => i.lat != null && i.lng != null).map((i) => ({ id: i.id, lat: i.lat!, lng: i.lng!, day_cents: i.day_cents, title: i.title }))} origin={origin} radiusKm={radius} selectedId={selectedId} onSelect={select} showSearchAsMove zoomControls />
    </>
  );
}

/** Mobile map view (M04): full-bleed map, price pins, swipeable card strip that moves the selection. */
export function MobileMap({ items, origin, radius, ctx, state, tz }: { items: SearchResultItem[]; origin: { lat: number; lng: number }; radius: number; ctx: string; state: SearchState; tz: string }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useSelection(items);
  const strip = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // swiping the strip moves the pin
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = best?.target.getAttribute("data-id");
        if (id) setSelectedId(id);
      },
      { root: el, threshold: [0.6, 0.9] },
    );
    for (const node of Object.values(cardRefs.current)) if (node) io.observe(node);
    return () => io.disconnect();
  }, [items, setSelectedId]);

  const select = (id: string) => {
    setSelectedId(id);
    cardRefs.current[id]?.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
  };

  return (
    <div className="relative flex-1 min-h-[calc(100vh-76px)]">
      <MapView className="absolute inset-0" pins={items.filter((i) => i.lat != null && i.lng != null).map((i) => ({ id: i.id, lat: i.lat!, lng: i.lng!, day_cents: i.day_cents, title: i.title }))} origin={origin} radiusKm={radius} selectedId={selectedId} onSelect={select} />
      <div className="absolute right-4 top-[max(14px,env(safe-area-inset-top))] z-10">
        <Button variant="dark" size="md" className="!rounded-pill shadow-[0_4px_14px_rgba(30,30,28,.15)]" onClick={() => router.replace(`/search?${toSearchQuery({ ...state, view: "list" }, tz)}`)}>List</Button>
      </div>
      <div ref={strip} className="absolute inset-x-0 bottom-0 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scrollbar-none pb-[max(20px,env(safe-area-inset-bottom))] pl-4 pr-4 pt-2">
        {items.map((l) => (
          <div key={l.id} data-id={l.id} ref={(el) => { cardRefs.current[l.id] = el; }} className="snap-center">
            <ListingCard listing={l} variant="compact" selected={l.id === selectedId} href={`/listings/${l.slug}?${ctx}`} />
          </div>
        ))}
        {items.length === 0 && <div className="w-full pb-4"><EmptyState compact icon="map" title="Nothing on the map for these filters" body="Widen the distance or clear a filter." /></div>}
      </div>
    </div>
  );
}
