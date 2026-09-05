"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { formatRate } from "@/lib/format";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  day_cents: number;
  title: string;
}

export interface MapViewProps {
  pins: MapPin[];
  origin: { lat: number; lng: number };
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  showSearchAsMove?: boolean;
  zoomControls?: boolean;
  radiusKm?: number;
}

/**
 * Results map. Draws the design's "Map tiles · demo" pattern with price pins projected from lat/lng,
 * and upgrades to MapLibre GL vector tiles when the library and demo style can load.
 */
export function MapView({ pins, origin, selectedId, onSelect, className, showSearchAsMove, zoomControls, radiusKm = 15 }: MapViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [searchAsMove, setSearchAsMove] = useState(true);
  const [libreReady, setLibreReady] = useState(false);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Try MapLibre (demo tiles); stay on the placeholder if it can't load.
  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el || process.env.NEXT_PUBLIC_DISABLE_MAPLIBRE === "1") return;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (cancelled) return;
        const map = new maplibre.Map({ container: el, style: "https://demotiles.maplibre.org/style.json", center: [origin.lng, origin.lat], zoom: 11, attributionControl: false, interactive: true });
        map.on("load", () => {
          if (cancelled) return;
          mapRef.current = map;
          setLibreReady(true);
        });
        map.on("error", () => {
          if (!mapRef.current) {
            map.remove();
          }
        });
      } catch {
        /* placeholder stays */
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MapLibre markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !libreReady) return;
    (async () => {
      const maplibre = await import("maplibre-gl");
      for (const [id, m] of markersRef.current) {
        if (!pins.some((p) => p.id === id)) {
          m.remove();
          markersRef.current.delete(id);
        }
      }
      for (const p of pins) {
        const selected = p.id === selectedId;
        let marker = markersRef.current.get(p.id);
        const node = document.createElement("button");
        node.type = "button";
        node.className = pinClass(selected);
        node.textContent = formatRate(p.day_cents);
        node.setAttribute("aria-label", `${p.title} · ${formatRate(p.day_cents)} per day`);
        node.onclick = () => onSelect?.(p.id);
        if (!marker) {
          marker = new maplibre.Marker({ element: node, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map);
          markersRef.current.set(p.id, marker);
        } else {
          marker.getElement().replaceWith(node);
          markersRef.current.set(p.id, new maplibre.Marker({ element: node, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map));
          marker.remove();
        }
      }
    })();
  }, [pins, selectedId, libreReady, onSelect]);

  // equirectangular projection around the origin for the placeholder
  const projected = useMemo(() => {
    const kmPerDegLat = 111.32;
    const kmPerDegLng = 111.32 * Math.cos((origin.lat * Math.PI) / 180);
    const span = (radiusKm * 1.15) / zoom; // km from centre to edge
    const scale = Math.min(size.w, size.h) / 2 / span; // px per km
    // whole pixels: keeps the SSR markup byte-identical to the client render (last-digit float drift breaks hydration)
    return pins.map((p) => ({ ...p, x: Math.round(size.w / 2 + (p.lng - origin.lng) * kmPerDegLng * scale), y: Math.round(size.h / 2 - (p.lat - origin.lat) * kmPerDegLat * scale) }));
  }, [pins, origin, size, zoom, radiusKm]);

  return (
    <div className={cn("relative overflow-hidden map-tiles", className)}>
      <div ref={ref} className="absolute inset-0" aria-label="Map" role="img" />
      {!libreReady && (
        <>
          <div className="pointer-events-none absolute -left-5 -right-5 top-[38%] h-3.5 -rotate-[8deg] bg-paper" />
          <div className="pointer-events-none absolute left-[45%] top-0 bottom-0 w-3 rotate-[12deg] bg-paper" />
          <div className="pointer-events-none absolute -left-5 -right-5 top-[64%] h-2.5 rotate-[4deg] bg-paper" />
          <div className="pointer-events-none absolute -right-10 top-[14%] h-[30%] w-[38%] rounded-[50%_40%_60%_50%] bg-[#D7DFE6]" />
          <div className="pointer-events-none absolute left-[10%] bottom-[16%] h-[10%] w-[30%] rounded-[40%] bg-[#DDE3D2]" />
          <div className="absolute size-3.5 rounded-full border-[3px] border-white bg-cobalt shadow-[0_0_0_6px_rgba(30,66,232,.18)]" style={{ left: size.w / 2 - 7, top: size.h / 2 - 7 }} aria-label="Search centre" />
          {projected.map((p) => {
            const selected = p.id === selectedId;
            return (
              <button key={p.id} type="button" onClick={() => onSelect?.(p.id)} className={cn("absolute -translate-x-1/2 -translate-y-full", selected && "z-10")} style={{ left: p.x, top: p.y }} aria-label={`${p.title} · ${formatRate(p.day_cents)} per day`} aria-pressed={selected}>
                <span className={pinClass(selected)}>{formatRate(p.day_cents)}</span>
                {selected && <span className="absolute left-1/2 -bottom-1 size-2.5 -translate-x-1/2 rotate-45 bg-charcoal" />}
              </button>
            );
          })}
          <div className="absolute bottom-3 right-3 rounded-[4px] bg-paper/80 px-1.5 py-0.5 text-[10px] text-text-3">Map tiles · demo</div>
        </>
      )}
      {showSearchAsMove && (
        <label className="absolute left-4 top-4 flex h-8 items-center gap-2 rounded-pill border border-border bg-white px-3 text-[12px] font-semibold shadow-[0_2px_8px_rgba(0,0,0,.08)]">
          <span className={cn("flex size-3.5 items-center justify-center rounded-[4px]", searchAsMove ? "bg-cobalt" : "border border-border-strong bg-white")}>{searchAsMove && <Icon name="check" size={9} strokeWidth={3.5} className="text-white" />}</span>
          <input type="checkbox" className="sr-only" checked={searchAsMove} onChange={(e) => setSearchAsMove(e.target.checked)} />
          Search as I move the map
        </label>
      )}
      {zoomControls && !libreReady && (
        <div className="absolute right-4 top-4 flex flex-col gap-0.5">
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z * 1.4))} className="flex size-8 items-center justify-center rounded-t-[8px] border border-border bg-white text-[16px]">+</button>
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z / 1.4))} className="flex size-8 items-center justify-center rounded-b-[8px] border border-border bg-white text-[16px]">−</button>
        </div>
      )}
    </div>
  );
}

function pinClass(selected: boolean) {
  return cn("inline-flex h-8 items-center whitespace-nowrap rounded-pill px-2.5 text-[13px] font-bold", selected ? "bg-charcoal text-white shadow-[0_4px_12px_rgba(0,0,0,.25)]" : "border border-border-strong bg-white text-charcoal shadow-[0_2px_8px_rgba(0,0,0,.12)]");
}
