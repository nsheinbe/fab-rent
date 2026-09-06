"use client";
/* eslint-disable @next/next/no-img-element -- user uploads come from signed, short-lived URLs that next/image cannot optimise */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Input, Textarea, Select } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { completeHandoff, saveHandoff, type ConditionInput } from "@/app/(provider)/actions";
import { SignaturePad } from "./signature-pad";

interface Booking { ref: string; title: string; fulfillment: "pickup" | "delivery"; start_at: string; end_at: string; hold_cents: number; waiver: boolean; renter: { name: string; id_verified: boolean }; address: string; unit: { id: string; unit_number: number; serial: string } | null; units: Array<{ id: string; unit_number: number; serial: string; free: boolean; status: string }>; accessories: string[]; id_required: boolean }
interface Existing { photos: Array<{ label: string; path: string | null; taken_at: string; lat?: number; lng?: number; url?: string | null }>; checklist: Array<{ item: string; ok: boolean }>; notes: string | null; serial_scanned: string | null; serial_matches: boolean | null; id_matched: boolean | null; id_checked_at: string | null; location_label: string | null; geotag: { lat: number; lng: number } | null; renter_signature_path: string | null; signature_url: string | null; unit_id: string | null; started_at: string; completed_at: string | null }

const STEPS = ["Renter", "Serial", "Photos", "Checklist", "Sign"];
const SLOTS = ["Front", "Back", "Left", "Right", "Serial plate", "Accessories", "Existing marks"];

export function HandoffFlow({ booking, existing, tz, providerName }: { booking: Booking; existing: Existing | null; tz: string; providerName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(existing?.renter_signature_path ? 4 : existing?.photos.some((p) => p.path) ? 3 : existing?.serial_scanned ? 2 : existing?.id_matched ? 1 : 0);
  const [idMatched, setIdMatched] = useState<boolean>(existing?.id_matched ?? false);
  const [idAt, setIdAt] = useState<string | null>(existing?.id_checked_at ?? null);
  const [unitId, setUnitId] = useState<string | null>(existing?.unit_id ?? booking.unit?.id ?? null);
  const [serial, setSerial] = useState(existing?.serial_scanned ?? "");
  const [photos, setPhotos] = useState<Existing["photos"]>(existing?.photos?.length ? existing.photos : SLOTS.map((label) => ({ label, path: null, taken_at: "", url: null })));
  const [checklist, setChecklist] = useState<Array<{ item: string; ok: boolean }>>(existing?.checklist?.length ? existing.checklist : booking.accessories.map((item) => ({ item, ok: false })));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [signature, setSignature] = useState<{ path: string | null; url: string | null }>({ path: existing?.renter_signature_path ?? null, url: existing?.signature_url ?? null });
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(existing?.geotag ?? null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const slotRef = useRef<string>("");

  useEffect(() => {
    if (geo || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => setGeo({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 }), () => {}, { timeout: 4000 });
  }, [geo]);

  const unit = booking.units.find((u) => u.id === unitId) ?? null;
  const serialMatches = unit ? serial.trim().toLowerCase() === unit.serial.toLowerCase() : null;
  const photoCount = photos.filter((p) => p.path).length;
  const payload = (): ConditionInput => ({ unit_id: unitId, serial_scanned: serial || null, serial_matches: serialMatches, id_matched: idMatched, photos: photos.map((p) => ({ label: p.label, path: p.path, taken_at: p.taken_at || new Date().toISOString(), lat: p.lat, lng: p.lng })), checklist, notes: notes || null, location_label: booking.address || null, geotag: geo, renter_signature_path: signature.path });

  const persist = () => start(async () => { const r = await saveHandoff(booking.ref, payload()); if (!r.ok) toast({ title: r.error, tone: "error" }); });
  const next = () => { persist(); setStep((s) => Math.min(STEPS.length - 1, s + 1)); };

  const upload = async (label: string, f: File) => {
    setUploading(label);
    try {
      const fd = new FormData();
      fd.set("bucket", "condition-photos");
      fd.set("path", `handoff/${booking.ref}`);
      fd.set("file", f);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { path, url } = (await res.json()) as { path: string; url: string };
      setPhotos((ps) => ps.map((p) => (p.label === label ? { ...p, path, url, taken_at: new Date().toISOString(), lat: geo?.lat, lng: geo?.lng } : p)));
    } catch (e) {
      toast({ title: (e as Error).message, tone: "error" });
    } finally {
      setUploading(null);
    }
  };

  const complete = () =>
    start(async () => {
      const r = await completeHandoff(booking.ref, payload());
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      toast({ title: "Handoff complete", description: `${booking.renter.name} has the record. ${r.data.hold_cents ? `${formatMoney(r.data.hold_cents, { whole: true })} hold placed.` : ""} Status → Active.`, tone: "ok" });
      router.push(`/provider/bookings?ref=${booking.ref}`);
    });

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[520px] flex-col">
      <div className="flex items-center gap-3 px-4 pt-4">
        <Link href={`/provider/bookings?ref=${booking.ref}`} aria-label="Back" className="flex size-9 items-center justify-center rounded-full border border-border bg-white text-charcoal no-underline"><Icon name="back" size={18} /></Link>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold tracking-[-0.01em]">Handoff · {booking.fulfillment}</div>
          <div className="truncate-1 text-[12px] text-text-3"><span className="t-mono">{booking.ref}</span> · {booking.title}{unit ? ` · Unit ${unit.unit_number}` : ""} · {formatDateTime(new Date(), tz)}</div>
        </div>
        <span className="text-[12px] font-semibold text-text-3">{step + 1} of {STEPS.length}</span>
      </div>
      <div className="flex gap-1 px-4 pt-3">{STEPS.map((s, i) => <div key={s} className={cn("h-1 flex-1 rounded-pill", i <= step ? "bg-cobalt" : "bg-border")} />)}</div>

      <div className="flex flex-1 flex-col gap-3.5 px-4 pb-32 pt-4">
        {step === 0 && (
          <>
            <div className="card-sm flex items-center gap-3 p-3.5">
              <Avatar name={booking.renter.name} size={44} tone="cobalt" />
              <div className="min-w-0 flex-1"><div className="text-[15px] font-bold">{booking.renter.name}</div><div className="text-[12px] text-text-3">{booking.renter.id_verified ? "ID verified on fab.rent" : "ID not verified online — check it now"} · {booking.address}</div></div>
            </div>
            <button type="button" onClick={() => { setIdMatched(true); setIdAt(new Date().toISOString()); }} className={cn("flex items-center justify-between rounded-card-sm border-2 px-4 py-4 text-left", idMatched ? "border-ok bg-ok-bg" : "border-border bg-white")}>
              <div><div className="text-[15px] font-bold">{idMatched ? "ID matched" : "Check photo ID"}</div><div className="text-[12px] text-text-2">{idMatched && idAt ? `Confirmed ${formatTime(new Date(idAt), tz)}${booking.address ? ` · ${booking.address}` : ""}` : "Compare the photo ID to the name on the booking"}</div></div>
              <span className={cn("flex size-8 items-center justify-center rounded-full", idMatched ? "bg-ok text-white" : "border border-border-strong")}>{idMatched && <Icon name="check" size={16} strokeWidth={3} />}</span>
            </button>
            {idMatched && <button type="button" onClick={() => setIdMatched(false)} className="text-[12px] font-semibold text-text-3">Undo</button>}
          </>
        )}
        {step === 1 && (
          <>
            <div className="card-sm p-3.5">
              <div className="text-[12px] font-semibold text-text-3">Assigned unit</div>
              <Select compact value={unitId ?? ""} onChange={(e) => setUnitId(e.target.value || null)} aria-label="Unit" className="mt-1.5">
                <option value="">Choose a unit</option>
                {booking.units.map((u) => <option key={u.id} value={u.id} disabled={!u.free && u.id !== booking.unit?.id}>Unit {u.unit_number} · {u.serial}{!u.free && u.id !== booking.unit?.id ? " · busy" : ""}</option>)}
              </Select>
            </div>
            <div className="card-sm p-3.5">
              <div className="text-[12px] font-semibold text-text-3">Serial on the tool</div>
              <div className="mt-1.5 flex gap-2"><Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder={unit?.serial ?? "Scan or type the serial"} mono aria-label="Serial" data-testid="serial-input" /><Button size="lg" variant="secondary" onClick={() => unit && setSerial(unit.serial)} leading={<Icon name="barcode" size={16} />} title="Simulated scan">Scan</Button></div>
              {serial && (
                <div className={cn("mt-2 flex items-center gap-2 rounded-panel px-3 py-2 text-[13px] font-semibold", serialMatches ? "bg-ok-bg text-ok-text" : "bg-error-bg text-error-text")}><Icon name={serialMatches ? "check" : "alert"} size={14} strokeWidth={2.5} />{serialMatches ? `Matches assigned unit ${unit?.unit_number}` : unit ? `Doesn't match unit ${unit.unit_number} (${unit.serial}) — pick the right unit or re-scan` : "Choose the unit this serial belongs to"}</div>
              )}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="flex items-baseline justify-between"><div className="text-[14px] font-bold">Condition photos · {photoCount} of {SLOTS.length}</div><div className="text-[11px] text-text-3">Timestamped{geo ? " · geotagged" : ""}</div></div>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <button key={p.label} type="button" onClick={() => { slotRef.current = p.label; file.current?.click(); }} className="relative aspect-square overflow-hidden rounded-panel border border-border bg-ivory-deep text-left">
                  {p.url ? <img src={p.url} alt={p.label} className="size-full object-cover" /> : <div className="flex size-full flex-col items-center justify-center gap-1 text-text-3">{uploading === p.label ? <span className="size-4 animate-spin rounded-full border-2 border-cobalt border-t-transparent" /> : <Icon name="camera" size={18} />}</div>}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-[10px] font-bold text-white">{p.label}{p.path ? " ✓" : ""}</span>
                </button>
              ))}
            </div>
            <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && slotRef.current) void upload(slotRef.current, f); e.target.value = ""; }} />
            <p className="text-[12px] text-text-3">Every angle plus the serial plate. Existing marks get their own photo — it&apos;s what makes a later claim fair.</p>
          </>
        )}
        {step === 3 && (
          <>
            <div className="text-[14px] font-bold">Accessories handed over</div>
            <div className="card-sm overflow-hidden">
              {checklist.map((c, i) => (
                <label key={c.item} className={cn("flex items-center gap-3 px-3.5 py-3", i < checklist.length - 1 && "border-b border-border")}>
                  <input type="checkbox" checked={c.ok} onChange={(e) => setChecklist((cs) => cs.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)))} className="size-5 accent-cobalt" />
                  <span className="text-[14px] font-semibold">{c.item}</span>
                </label>
              ))}
              {checklist.length === 0 && <div className="px-3.5 py-3 text-[12px] text-text-3">No accessories listed.</div>}
            </div>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Existing marks, what you showed the renter, anything worth remembering at return" aria-label="Notes" />
          </>
        )}
        {step === 4 && (
          <>
            <div className="text-[14px] font-bold">Renter signature</div>
            <SignaturePad bookingRef={booking.ref} initialUrl={signature.url} onSigned={(path, url) => setSignature({ path, url })} onClear={() => setSignature({ path: null, url: null })} />
            <p className="text-[12px] leading-[1.5] text-text-2"><b>{booking.renter.name}</b> agrees the condition and accessories as recorded ({photoCount} photos, {checklist.filter((c) => c.ok).length}/{checklist.length} accessories). Record kept by {providerName} and fab.rent.</p>
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[520px] border-t border-border bg-paper px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {step < STEPS.length - 1 ? (
          <div className="flex gap-2">
            {step > 0 && <Button size="xl" variant="secondary" onClick={() => setStep((s) => s - 1)}>Back</Button>}
            <Button size="xl" block onClick={next} disabled={(step === 0 && booking.id_required && !idMatched) || (step === 1 && !unitId) || (step === 2 && photoCount === 0)} loading={pending} data-testid="handoff-next">Continue</Button>
          </div>
        ) : (
          <>
            <Button size="xl" block onClick={complete} loading={pending} disabled={!signature.path} data-testid="complete-handoff">Complete handoff{booking.hold_cents ? ` · place ${formatMoney(booking.hold_cents, { whole: true })} hold` : ""}</Button>
            <div className="mt-2 text-center text-[11px] text-text-3">Renter gets the record instantly · status → Active · return {formatDateTime(new Date(booking.end_at), tz)}</div>
          </>
        )}
      </div>
    </div>
  );
}
