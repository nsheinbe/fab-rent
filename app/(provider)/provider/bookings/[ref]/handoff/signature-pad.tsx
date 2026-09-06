"use client";
/* eslint-disable @next/next/no-img-element -- user uploads come from signed, short-lived URLs that next/image cannot optimise */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Finger/mouse signature → PNG → private condition-photos bucket. */
export function SignaturePad({ bookingRef, initialUrl, onSigned, onClear }: { bookingRef: string; initialUrl: string | null; onSigned: (path: string, url: string) => void; onClear: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.current!.width, y: ((e.clientY - r.top) / r.height) * canvas.current!.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { drawing.current = true; const ctx = canvas.current!.getContext("2d")!; const p = point(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const ctx = canvas.current!.getContext("2d")!; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#1E1E1C"; const p = point(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setDirty(true); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvas.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setDirty(false); setSaved(null); onClear(); };
  const save = async () => {
    setBusy(true);
    try {
      const blob: Blob = await new Promise((res, rej) => canvas.current!.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"));
      const fd = new FormData();
      fd.set("bucket", "condition-photos");
      fd.set("path", `handoff/${bookingRef}/signature`);
      fd.set("file", new File([blob], "signature.png", { type: "image/png" }));
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) throw new Error("Couldn't save the signature");
      const { path, url } = (await r.json()) as { path: string; url: string };
      setSaved(url);
      onSigned(path, url);
    } catch (e) {
      toast({ title: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-card-sm border border-border-strong bg-white">
        {saved ? <img src={saved} alt="Renter signature" className="h-[160px] w-full object-contain" /> : <canvas ref={canvas} width={800} height={320} className="h-[160px] w-full touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Sign here" />}
        {!saved && !dirty && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-placeholder">Sign here</div>}
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
        {!saved && <Button size="sm" onClick={save} disabled={!dirty} loading={busy} data-testid="save-signature">Save signature</Button>}
      </div>
    </div>
  );
}
