"use client";
import { useCallback, useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface PhotoSlotProps {
  /** current image URL (null → placeholder) */
  src?: string | null;
  /** placeholder text: the item name, never a stock image */
  placeholder: string;
  alt?: string;
  className?: string;
  radius?: number;
  /** when set, the slot accepts drops/uploads and posts to /api/upload */
  upload?: {
    bucket: "listing-photos" | "condition-photos" | "evidence";
    path: string; // object path prefix; the file name is appended
    onUploaded?: (result: { path: string; url: string }) => void | Promise<void>;
  };
  label?: string;
  badge?: string;
  outline?: "error" | "cobalt";
  fit?: "cover" | "contain";
  priority?: boolean;
}

/**
 * A drop/upload target that persists. Renders a neutral ivory-deep placeholder with the item name
 * until a real photo exists (the design: "every image is a drop slot").
 */
export function PhotoSlot({ src, placeholder, alt, className, upload, label, badge, outline, fit = "cover" }: PhotoSlotProps) {
  const [current, setCurrent] = useState<string | null>(src ?? null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useCallback(
    async (file: File) => {
      if (!upload) return;
      if (!file.type.startsWith("image/")) {
        setError("Images only");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.set("bucket", upload.bucket);
        form.set("path", upload.path);
        form.set("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "Upload failed" }))).error ?? "Upload failed");
        const json = (await res.json()) as { path: string; url: string };
        setCurrent(json.url);
        await upload.onUploaded?.(json);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [upload],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void send(file);
  };

  const interactive = !!upload;
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-ivory-deep text-text-3 select-none",
        interactive && "cursor-pointer",
        dragging && "ring-2 ring-cobalt ring-inset",
        outline === "error" && "outline outline-2 -outline-offset-2 outline-error",
        outline === "cobalt" && "outline outline-2 -outline-offset-2 outline-cobalt",
        className,
      )}
      onDragOver={interactive ? (e) => { e.preventDefault(); setDragging(true); } : undefined}
      onDragLeave={interactive ? () => setDragging(false) : undefined}
      onDrop={interactive ? onDrop : undefined}
      onClick={interactive ? () => inputRef.current?.click() : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click() : undefined}
      aria-label={interactive ? `Upload photo · ${placeholder}` : undefined}
    >
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current} alt={alt ?? placeholder} className={cn("absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain")} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center">
          <Icon name={interactive ? "camera" : "image"} size={18} className="text-placeholder" />
          <span className="text-[11px] font-semibold leading-tight text-text-3 line-clamp-2">{placeholder}</span>
          {interactive && <span className="text-[10px] text-placeholder">Drop or tap to upload</span>}
        </div>
      )}
      {label && <span className="absolute left-1.5 bottom-1.5 h-5 rounded-pill bg-charcoal/75 px-[7px] text-[10px] font-semibold leading-5 text-white">{label}</span>}
      {badge && <span className="absolute left-2 top-2 h-[22px] rounded-pill bg-charcoal px-2 text-[11px] font-semibold leading-[22px] text-white">{badge}</span>}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          <span className="size-5 rounded-full border-2 border-cobalt border-t-transparent animate-spin" />
        </div>
      )}
      {error && <div className="absolute inset-x-0 bottom-0 bg-error-bg px-2 py-1 text-[10px] font-semibold text-error-text">{error}</div>}
      {interactive && <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ""; }} />}
    </div>
  );
}
