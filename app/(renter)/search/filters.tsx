"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icons";
import { Switch, Checkbox, Slider } from "@/components/ui/controls";
import { SegmentedControl } from "@/components/ui/tabs";
import { DialogRoot, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { CapsLabel, Select } from "@/components/ui/field";
import { activeFilterCount, toSearchQuery, type SearchState, type SortKey } from "@/lib/search/params";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import { formatDateRange } from "@/lib/format";
import { countSearch } from "./search-actions";

export interface FiltersProps {
  state: SearchState;
  config: MarketplaceConfig;
  typeCounts: Array<{ slug: string; name: string; count: number }>;
  hidden: number;
  /** day-rate histogram buckets for the price slider (8 buckets) */
  histogram: number[];
  resultCount: number;
}

const PRICE_MAX = 400;

function useFilterDraft(state: SearchState) {
  const [draft, setDraft] = useState<SearchState>(state);
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    // the URL changed underneath us (navigation / apply) — adopt it as the new draft
    setSeen(state);
    setDraft(state);
  }
  return [draft, setDraft] as const;
}

export function useApply(tz: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const apply = (s: SearchState) => start(() => router.replace(`/search?${toSearchQuery(s, tz)}`, { scroll: false }));
  return { apply, pending };
}

/** Body of the filters (shared by the mobile sheet and the desktop rail). */
function FilterBody({ draft, setDraft, config, typeCounts, hidden, histogram, dense }: { draft: SearchState; setDraft: (s: SearchState) => void; config: MarketplaceConfig; typeCounts: FiltersProps["typeCounts"]; hidden: number; histogram: number[]; dense?: boolean }) {
  const tz = config.market.timezone;
  const min = draft.min ?? 0;
  const max = draft.max ?? PRICE_MAX;
  const maxHist = Math.max(1, ...histogram);
  const toggleType = (slug: string) => setDraft({ ...draft, types: draft.types.includes(slug) ? draft.types.filter((t) => t !== slug) : [...draft.types, slug] });
  const toggleProvider = (k: "business" | "individual") => setDraft({ ...draft, provider: draft.provider.includes(k) ? draft.provider.filter((p) => p !== k) : [...draft.provider, k] });
  return (
    <div className={cn("flex flex-col", dense ? "gap-5" : "gap-[18px]")}>
      <div className={cn("flex items-center justify-between", !dense && "card rounded-panel px-3.5 py-3")}>
        <div>
          <div className={cn("font-semibold", dense ? "text-[13px]" : "text-[14px]")}>Only {dense ? "available" : "show available"}</div>
          <div className={cn("text-text-3", dense ? "text-[11px]" : "text-[12px]")}>{dense ? `for ${formatDateRange(draft.from, draft.to, { tz }).replace(/^\w+ /, "").replace(/ – \w+ /, "–")}` : `${formatDateRange(draft.from, draft.to, { tz })} · ${draft.qty} unit${draft.qty === 1 ? "" : "s"}`}{hidden > 0 && dense ? ` · ${hidden} hidden` : ""}</div>
        </div>
        <Switch checked={!draft.showUnavailable} onCheckedChange={(v) => setDraft({ ...draft, showUnavailable: !v })} size={dense ? "sm" : "md"} aria-label="Only show available" />
      </div>
      {dense && typeCounts.length > 0 && (
        <div className="flex flex-col gap-2">
          <CapsLabel>Type</CapsLabel>
          {typeCounts.slice(0, 8).map((t) => (
            <label key={t.slug} className="flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-2"><Checkbox size="sm" checked={draft.types.includes(t.slug)} onCheckedChange={() => toggleType(t.slug)} aria-label={t.name} />{t.name}</span>
              <span className="text-[12px] text-text-3">{t.count}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <CapsLabel>Fulfillment</CapsLabel>
        <SegmentedControl value={draft.fulfillment} onChange={(v) => setDraft({ ...draft, fulfillment: v })} options={[{ value: "any", label: "Any" }, { value: "pickup", label: "Pickup" }, { value: "delivery", label: "Delivery" }]} size={dense ? "sm" : "md"} />
      </div>
      {!dense && (
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between"><CapsLabel>Distance</CapsLabel><div className="text-[13px] font-bold">Within {draft.radius} km</div></div>
          <Slider value={[draft.radius]} onValueChange={([r]) => setDraft({ ...draft, radius: r ?? draft.radius })} min={1} max={50} aria-label="Distance" />
          <div className="flex justify-between text-[11px] text-text-3"><span>1 km</span><span>50 km</span></div>
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        <div className="flex justify-between"><CapsLabel>Price {dense ? "/ day" : "per day"}</CapsLabel><div className={cn("font-bold", dense ? "text-[12px]" : "text-[13px]")}>${min} – ${max >= PRICE_MAX ? `${PRICE_MAX}+` : max}</div></div>
        {!dense && (
          <div className="flex h-9 items-end gap-[3px]">
            {histogram.map((h, i) => {
              const lo = (i / histogram.length) * PRICE_MAX;
              const hi = ((i + 1) / histogram.length) * PRICE_MAX;
              const active = hi > min && lo < max;
              return <div key={i} className={cn("flex-1 rounded-[2px]", active ? "bg-cobalt" : "bg-border")} style={{ height: `${Math.max(8, (h / maxHist) * 100)}%` }} />;
            })}
          </div>
        )}
        <Slider value={[min, max]} onValueChange={([a, b]) => setDraft({ ...draft, min: a && a > 0 ? a : null, max: b != null && b < PRICE_MAX ? b : null })} min={0} max={PRICE_MAX} step={5} aria-label="Price per day" size={dense ? "sm" : "md"} />
      </div>
      {dense && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between"><CapsLabel>Distance</CapsLabel><div className="text-[12px] font-bold">≤ {draft.radius} km</div></div>
          <Slider value={[draft.radius]} onValueChange={([r]) => setDraft({ ...draft, radius: r ?? draft.radius })} min={1} max={50} aria-label="Distance" size="sm" />
        </div>
      )}
      {!dense && typeCounts.length > 0 && (
        <div className="flex flex-col gap-2">
          <CapsLabel>Type</CapsLabel>
          <div className="flex flex-wrap gap-2">
            {typeCounts.slice(0, 8).map((t) => (
              <Chip key={t.slug} selected={draft.types.includes(t.slug)} onClick={() => toggleType(t.slug)}>{t.name}</Chip>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <CapsLabel>Provider</CapsLabel>
        <div className="flex flex-wrap gap-2">
          <Chip size={dense ? "sm" : "md"} selected={draft.provider.includes("business")} onClick={() => toggleProvider("business")}>Verified business</Chip>
          <Chip size={dense ? "sm" : "md"} selected={draft.provider.includes("individual")} onClick={() => toggleProvider("individual")}>Individual</Chip>
          <Chip size={dense ? "sm" : "md"} selected={draft.rating === 4.5} onClick={() => setDraft({ ...draft, rating: draft.rating === 4.5 ? null : 4.5 })}>★ 4.5+</Chip>
          <Chip size={dense ? "sm" : "md"} selected={draft.instant} onClick={() => setDraft({ ...draft, instant: !draft.instant })}>Instant book</Chip>
        </div>
      </div>
    </div>
  );
}

function useLiveCount(draft: SearchState, tz: string, initial: number, enabled: boolean) {
  const [count, setCount] = useState(initial);
  const query = useMemo(() => toSearchQuery({ ...draft, view: "list" }, tz), [draft, tz]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const t = setTimeout(() => {
      countSearch(query).then((n) => alive && setCount(n)).catch(() => {});
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, enabled]);
  return count;
}

/** Mobile filter chips row + sheet (M02 / M03). */
export function MobileFilters({ state, config, typeCounts, hidden, histogram, resultCount }: FiltersProps) {
  const tz = config.market.timezone;
  const { apply } = useApply(tz);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useFilterDraft(state);
  const n = activeFilterCount(state, config);
  const live = useLiveCount(draft, tz, resultCount, open);
  const sortLabel: Record<SortKey, string> = { best: "Best match", price_asc: "Price: low to high", price_desc: "Price: high to low", distance: "Nearest", rating: "Top rated" };
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none pl-4 pr-4">
      <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(state); }}>
        <DialogTrigger asChild>
          <button type="button" className="flex h-[34px] flex-none items-center gap-1.5 rounded-pill bg-charcoal px-3 text-[12px] font-semibold text-white">
            <Icon name="filter" size={14} />Filters{n > 0 ? ` · ${n}` : ""}
          </button>
        </DialogTrigger>
        <SheetContent tall title="Filters" action={<Button variant="text" size="sm" onClick={() => setDraft({ ...draft, fulfillment: "any", min: null, max: null, types: [], provider: [], rating: null, instant: false, radius: config.market.default_radius_km, showUnavailable: false })}>Reset</Button>} footer={<Button size="xl" block className="!rounded-[12px]" onClick={() => { apply(draft); setOpen(false); }}>Show {live} {live === 1 ? "item" : "items"}</Button>}>
          <FilterBody draft={draft} setDraft={setDraft} config={config} typeCounts={typeCounts} hidden={hidden} histogram={histogram} />
        </SheetContent>
      </DialogRoot>
      <Chip selected={!state.showUnavailable} onClick={() => apply({ ...state, showUnavailable: !state.showUnavailable })} className="flex-none">Available</Chip>
      <Chip selected={state.max != null && state.max <= 80} onClick={() => apply({ ...state, max: state.max != null && state.max <= 80 ? null : 80 })} className="flex-none">Under $80/day</Chip>
      <Chip selected={state.fulfillment === "delivery"} onClick={() => apply({ ...state, fulfillment: state.fulfillment === "delivery" ? "any" : "delivery" })} className="flex-none">Delivery</Chip>
      <div className="relative flex-none">
        <select value={state.sort} onChange={(e) => apply({ ...state, sort: e.target.value as SortKey })} aria-label="Sort" className="h-[34px] appearance-none rounded-pill border border-border bg-white pl-3 pr-3 text-[12px] font-semibold outline-none">
          {(Object.keys(sortLabel) as SortKey[]).map((k) => <option key={k} value={k}>Sort: {sortLabel[k]}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Desktop persistent filter rail (W02). Changes apply immediately. */
export function FilterRail({ state, config, typeCounts, hidden, histogram }: Omit<FiltersProps, "resultCount">) {
  const tz = config.market.timezone;
  const { apply } = useApply(tz);
  const [draft, setDraft] = useFilterDraft(state);
  // debounce apply so slider drags don't refetch on every pixel
  useEffect(() => {
    if (draft === state) return;
    const t = setTimeout(() => apply(draft), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  return (
    <aside className="flex flex-col gap-5 border-r border-border bg-paper px-5 py-5" aria-label="Filters">
      <div className="flex items-baseline justify-between">
        <div className="text-[15px] font-bold">Filters</div>
        <button type="button" onClick={() => apply({ ...state, fulfillment: "any", min: null, max: null, types: [], provider: [], rating: null, instant: false, radius: config.market.default_radius_km, showUnavailable: false })} className="text-[12px] font-semibold text-cobalt">Reset</button>
      </div>
      <FilterBody draft={draft} setDraft={setDraft} config={config} typeCounts={typeCounts} hidden={hidden} histogram={histogram} dense />
    </aside>
  );
}

export function SortSelect({ state, tz }: { state: SearchState; tz: string }) {
  const { apply } = useApply(tz);
  return (
    <Select value={state.sort} onChange={(e) => apply({ ...state, sort: e.target.value as SortKey })} aria-label="Sort" className="w-[190px] [&_select]:h-[34px] [&_select]:rounded-[8px] [&_select]:border-border [&_select]:text-[12px] [&_select]:font-semibold">
      <option value="best">Sort: Best match</option>
      <option value="price_asc">Sort: Price low to high</option>
      <option value="price_desc">Sort: Price high to low</option>
      <option value="distance">Sort: Nearest</option>
      <option value="rating">Sort: Top rated</option>
    </Select>
  );
}

export function ShowHiddenLink({ state, tz, children }: { state: SearchState; tz: string; children: ReactNode }) {
  const { apply } = useApply(tz);
  return (
    <button type="button" onClick={() => apply({ ...state, showUnavailable: !state.showUnavailable })} className="text-[12px] font-semibold text-cobalt">
      {children}
    </button>
  );
}
