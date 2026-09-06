"use client";
import { useEffect, useSyncExternalStore } from "react";
import { ListingRow, type ListingCardData } from "./listing-card";

const KEY = "fabrent:recently-viewed";
type Item = Pick<ListingCardData, "slug" | "title" | "day_cents" | "provider_name" | "cover_url">;

export function rememberViewed(item: Item) {
  try {
    const cur: Item[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    const next = [item, ...cur.filter((x) => x.slug !== item.slug)].slice(0, 6);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("fabrent:recently-viewed"));
  } catch {
    /* storage unavailable */
  }
}

export function RememberViewed(item: Item) {
  useEffect(() => {
    rememberViewed(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.slug]);
  return null;
}

/** Recently viewed (local storage — no account needed). Renders nothing until there is something to show. */
const EMPTY = "[]";
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("fabrent:recently-viewed", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("fabrent:recently-viewed", onChange);
  };
}
function readRaw() {
  try {
    return localStorage.getItem(KEY) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

export function RecentlyViewed({ title = "Recently viewed", className, limit = 3 }: { title?: string; className?: string; limit?: number }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => EMPTY);
  let items: Item[] = [];
  try {
    items = (JSON.parse(raw) as Item[]).slice(0, limit);
  } catch {
    items = [];
  }
  if (items.length === 0) return null;
  return (
    <section className={className}>
      <div className="text-[16px] font-bold">{title}</div>
      <div className="mt-2.5 flex flex-col gap-2">
        {items.map((i) => (
          <ListingRow key={i.slug} listing={i} />
        ))}
      </div>
    </section>
  );
}
