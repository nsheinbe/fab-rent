"use client";
import { useState } from "react";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { DialogRoot, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

export interface GalleryPhoto {
  id: string;
  url: string | null;
  label: string | null;
}

/** Mobile hero (1 / 6 counter) + desktop 2×2 grid with "Show all N photos". */
export function Gallery({ photos, title, variant }: { photos: GalleryPhoto[]; title: string; variant: "mobile" | "desktop" | "tablet" }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const list = photos.length ? photos : [{ id: "placeholder", url: null, label: title }];
  const lightbox = (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogContent title={title} description={`${index + 1} / ${list.length}${list[index]?.label ? ` · ${list[index]!.label}` : ""}`} size="lg">
        <div className="relative h-[60vh] overflow-hidden rounded-panel"><PhotoSlot src={list[index]?.url} placeholder={list[index]?.label ?? title} className="absolute inset-0" fit="contain" /></div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {list.map((p, i) => (
            <button key={p.id} type="button" onClick={() => setIndex(i)} className={cn("relative size-16 flex-none overflow-hidden rounded-[8px]", i === index && "outline outline-2 outline-cobalt")} aria-label={`Photo ${i + 1}`}>
              <PhotoSlot src={p.url} placeholder="" className="absolute inset-0" />
            </button>
          ))}
        </div>
      </DialogContent>
    </DialogRoot>
  );
  if (variant === "mobile") {
    return (
      <div className="relative h-[330px] flex-none bg-ivory-deep">
        <button type="button" className="absolute inset-0" onClick={() => { setIndex(0); setOpen(true); }} aria-label="Open photos">
          <PhotoSlot src={list[0]?.url} placeholder={`Hero photo · ${title}`} className="absolute inset-0" />
        </button>
        <div className="pointer-events-none absolute bottom-3.5 right-4 flex h-[26px] items-center rounded-pill bg-charcoal/75 px-2.5 text-[12px] font-semibold text-white">1 / {list.length}</div>
        {lightbox}
      </div>
    );
  }
  if (variant === "tablet") {
    return (
      <div className="grid grid-cols-[2fr_1fr] grid-rows-[150px_150px] gap-2">
        <button type="button" onClick={() => { setIndex(0); setOpen(true); }} className="relative row-span-2 overflow-hidden rounded-card-sm"><PhotoSlot src={list[0]?.url} placeholder="Main photo" className="absolute inset-0" /></button>
        {[1, 2].map((i) => (
          <button key={i} type="button" onClick={() => { setIndex(Math.min(i, list.length - 1)); setOpen(true); }} className="relative overflow-hidden rounded-card-sm"><PhotoSlot src={list[i]?.url} placeholder={list[i]?.label ?? ""} className="absolute inset-0" /></button>
        ))}
        {lightbox}
      </div>
    );
  }
  return (
    <div className="relative grid grid-cols-[2fr_1fr_1fr] grid-rows-[210px_210px] gap-2.5 overflow-hidden rounded-[20px]">
      <button type="button" onClick={() => { setIndex(0); setOpen(true); }} className="relative row-span-2"><PhotoSlot src={list[0]?.url} placeholder={`Main photo · ${title}`} className="absolute inset-0" /></button>
      {[1, 2, 3, 4].map((i) => (
        <button key={i} type="button" onClick={() => { setIndex(Math.min(i, list.length - 1)); setOpen(true); }} className="relative"><PhotoSlot src={list[i]?.url} placeholder={list[i]?.label ?? ""} className="absolute inset-0" /></button>
      ))}
      <button type="button" onClick={() => { setIndex(0); setOpen(true); }} className="absolute bottom-4 right-4 flex h-9 items-center rounded-control border border-border bg-paper px-3.5 text-[13px] font-semibold">Show all {list.length} photos</button>
      {lightbox}
    </div>
  );
}
