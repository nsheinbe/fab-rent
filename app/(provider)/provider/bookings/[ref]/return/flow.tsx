"use client";
/* eslint-disable @next/next/no-img-element -- user uploads come from signed, short-lived URLs that next/image cannot optimise */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Input, Textarea } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { claimAgainstHold } from "@/lib/pricing/claims";
import { formatDateTime, formatDuration, formatMoney, formatRate } from "@/lib/format";
import { completeReturn } from "@/app/(provider)/actions";

interface Booking { ref: string; title: string; renter: string; status: string; due_at: string; returned_at: string; hold_cents: number; hold_status: string; waiver_bought: boolean; waiver_covers_cents: number; late_fee_per_hour: number; late_grace_minutes: number; accessories: string[]; unit: { unit_number: number; serial: string } | null; response_hours: number; wear_allowance_pct: number }
interface Check { item: string; ok: boolean; description?: string; repair_estimate_cents?: number; out_of_service_days?: number }
interface Props {
  booking: Booking;
  lateFee: { fee_cents: number; late_minutes: number; billable_hours: number };
  handoff: { photos: Array<{ label: string; url: string | null }>; completed_at: string | null; notes: string | null } | null;
  existing: { photos: Array<{ label: string; path: string | null; url: string | null; issue?: boolean }>; checklist: Check[]; notes: string | null; completed_at: string | null } | null;
  claims: Array<{ type: string; status: string; amount_cents: number; description: string | null }>;
  tz: string;
}

const dollars = (c: number | undefined) => (c ? String(c / 100) : "");

export function ReturnFlow({ booking, lateFee, handoff, existing, claims, tz }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const defaultChecks: Check[] = [{ item: "Body & housing", ok: true }, { item: "Working parts", ok: true }, ...(booking.accessories.length ? [{ item: `Accessories: ${booking.accessories.join(", ")}`, ok: true }] : []), { item: "Cleanliness", ok: true }];
  const [checks, setChecks] = useState<Check[]>(existing?.checklist?.length ? existing.checklist : defaultChecks);
  const slots = handoff?.photos.length ? handoff.photos.map((p) => p.label) : ["Front", "Back", "Left", "Right", "Serial plate", "Accessories"];
  const [photos, setPhotos] = useState<Array<{ label: string; path: string | null; url: string | null; issue?: boolean }>>(existing?.photos?.length ? existing.photos : slots.map((label) => ({ label, path: null, url: null })));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [uploading, setUploading] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const slotRef = useRef("");
  const done = booking.status === "inspecting" && !!existing?.completed_at;

  const damage = checks.filter((c) => !c.ok && c.item !== "Cleanliness" && !c.item.startsWith("Accessories")).reduce((s, c) => s + (c.repair_estimate_cents ?? 0), 0);
  const missing = checks.filter((c) => !c.ok && c.item.startsWith("Accessories")).reduce((s, c) => s + (c.repair_estimate_cents ?? 0), 0);
  const cleaning = checks.filter((c) => !c.ok && c.item === "Cleanliness").reduce((s, c) => s + (c.repair_estimate_cents ?? 0), 0);
  const claim = claimAgainstHold({ late_fee_cents: lateFee.fee_cents, damage_cents: damage + missing, cleaning_cents: cleaning, waiver_bought: booking.waiver_bought, waiver_covers_cents: booking.waiver_covers_cents, hold_cents: booking.hold_cents });
  const hasIssue = checks.some((c) => !c.ok);
  const claimTotal = claim.damage_cents + claim.cleaning_cents;

  const upload = async (label: string, f: File) => {
    setUploading(label);
    try {
      const fd = new FormData();
      fd.set("bucket", "condition-photos");
      fd.set("path", `return/${booking.ref}`);
      fd.set("file", f);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { path, url } = (await res.json()) as { path: string; url: string };
      setPhotos((ps) => ps.map((p) => (p.label === label ? { ...p, path, url } : p)));
    } catch (e) {
      toast({ title: (e as Error).message, tone: "error" });
    } finally {
      setUploading(null);
    }
  };

  const submit = (withClaim: boolean) =>
    start(async () => {
      const claimsOut = withClaim
        ? checks.filter((c) => !c.ok && (c.repair_estimate_cents ?? 0) > 0).map((c) => ({ type: (c.item === "Cleanliness" ? "cleaning" : c.item.startsWith("Accessories") ? "missing" : "damage") as "cleaning" | "missing" | "damage", area: c.item, description: c.description ?? c.item, amount_cents: c.repair_estimate_cents ?? 0, repair_estimate_cents: c.repair_estimate_cents, out_of_service_days: c.out_of_service_days }))
        : [];
      const r = await completeReturn(booking.ref, { record: { unit_id: null, photos: photos.map((p) => ({ label: p.label, path: p.path, taken_at: new Date().toISOString(), issue: p.issue })), checklist: checks, notes: notes || null }, late_fee_cents: lateFee.fee_cents, claims: claimsOut, returned_at: booking.returned_at });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      toast({ title: r.data.claim_cents > 0 ? `Return checked in · ${formatMoney(r.data.claim_cents)} claim sent` : "Return complete · hold released", description: r.data.claim_cents > 0 ? `${booking.renter.split(" ")[0]} has ${booking.response_hours} h to accept or dispute.` : undefined, tone: "ok" });
      router.push(`/provider/bookings?tab=completed&ref=${booking.ref}`);
    });

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[560px] flex-col">
      <div className="flex items-center gap-3 px-4 pt-4">
        <Link href={`/provider/bookings?ref=${booking.ref}`} aria-label="Back" className="flex size-9 items-center justify-center rounded-full border border-border bg-white text-charcoal no-underline"><Icon name="back" size={18} /></Link>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold tracking-[-0.01em]">Return check-in</div>
          <div className="truncate-1 text-[12px] text-text-3"><span className="t-mono">{booking.ref}</span> · {booking.title} · {booking.renter}{booking.unit ? ` · Unit ${booking.unit.unit_number}` : ""}</div>
        </div>
        {lateFee.late_minutes > 0 ? <Pill tone="error" dot size="sm">Late {formatDuration(lateFee.late_minutes * 60_000)}</Pill> : <Pill tone="ok" dot size="sm">On time</Pill>}
      </div>

      <div className="flex flex-1 flex-col gap-3.5 px-4 pb-36 pt-4">
        <div className="card-sm grid grid-cols-3 divide-x divide-border text-[12px]">
          <div className="px-3 py-2.5"><div className="text-text-3">Due</div><div className="font-semibold">{formatDateTime(new Date(booking.due_at), tz).replace(" · ", " ")}</div></div>
          <div className="px-3 py-2.5"><div className="text-text-3">Returned</div><div className="font-semibold">{formatDateTime(new Date(booking.returned_at), tz).replace(" · ", " ")}</div></div>
          <div className="px-3 py-2.5"><div className="text-text-3">Late fee · {booking.late_grace_minutes >= 60 ? `${booking.late_grace_minutes / 60} h` : `${booking.late_grace_minutes} min`} grace, then {formatRate(booking.late_fee_per_hour)}/h</div><div className={cn("t-mono font-medium", lateFee.fee_cents ? "text-error-text" : "")}>{formatMoney(lateFee.fee_cents)}</div></div>
        </div>

        <section className="card-sm p-3.5">
          <div className="flex items-baseline justify-between"><div className="text-[14px] font-bold">Compare</div><div className="text-[11px] text-text-3">{handoff?.completed_at ? `Handoff ${formatDateTime(new Date(handoff.completed_at), tz).replace(" · ", " ")} → now` : "No handoff record"}</div></div>
          <div className="mt-2 grid grid-cols-[auto_1fr_1fr] gap-x-2 text-[10px] font-bold text-text-3"><span /><span className="text-center">AT HANDOFF</span><span className="text-center">NOW{photos.some((p) => p.issue) ? " · ISSUE" : ""}</span></div>
          <div className="mt-1 flex flex-col gap-1.5">
            {photos.map((p) => {
              const before = handoff?.photos.find((h) => h.label === p.label);
              return (
                <div key={p.label} className="grid grid-cols-[64px_1fr_1fr] items-center gap-2">
                  <div className="truncate-1 text-[11px] font-semibold text-text-2">{p.label}</div>
                  <div className="aspect-[4/3] overflow-hidden rounded-[8px] bg-ivory-deep">{before?.url ? <img src={before.url} alt={`${p.label} at handoff`} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-text-3"><Icon name="image" size={14} /></div>}</div>
                  <button type="button" onClick={() => { slotRef.current = p.label; file.current?.click(); }} className={cn("relative aspect-[4/3] overflow-hidden rounded-[8px] border bg-ivory-deep", p.issue ? "border-2 border-error" : "border-border")} aria-label={`Photo ${p.label} now`}>
                    {p.url ? <img src={p.url} alt={`${p.label} now`} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-text-3">{uploading === p.label ? <span className="size-4 animate-spin rounded-full border-2 border-cobalt border-t-transparent" /> : <Icon name="camera" size={14} />}</div>}
                    {p.url && <span onClick={(e) => { e.stopPropagation(); setPhotos((ps) => ps.map((x) => (x.label === p.label ? { ...x, issue: !x.issue } : x))); }} className={cn("absolute right-1 top-1 rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold", p.issue ? "bg-error text-white" : "bg-white/90 text-charcoal")}>{p.issue ? "Issue" : "Mark issue"}</span>}
                  </button>
                </div>
              );
            })}
          </div>
          <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && slotRef.current) void upload(slotRef.current, f); e.target.value = ""; }} />
        </section>

        <section className="card-sm overflow-hidden">
          <div className="px-3.5 py-2.5 text-[14px] font-bold">Checklist</div>
          {checks.map((c, i) => (
            <div key={c.item} className="border-t border-border px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-[13px] font-semibold">{c.item}</div>
                <div className="flex rounded-[8px] bg-ivory-deep p-0.5 text-[12px] font-semibold">
                  <button type="button" onClick={() => setChecks((cs) => cs.map((x, j) => (j === i ? { ...x, ok: true } : x)))} className={cn("rounded-[6px] px-3 py-1", c.ok ? "bg-white text-ok-text shadow-sm" : "text-text-3")}>OK</button>
                  <button type="button" onClick={() => setChecks((cs) => cs.map((x, j) => (j === i ? { ...x, ok: false } : x)))} className={cn("rounded-[6px] px-3 py-1", !c.ok ? "bg-white text-error-text shadow-sm" : "text-text-3")}>Issue</button>
                </div>
              </div>
              {!c.ok && (
                <div className="mt-2 flex flex-col gap-2">
                  <Textarea value={c.description ?? ""} onChange={(e) => setChecks((cs) => cs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} rows={2} placeholder="What's wrong, where, and whether it was there at handoff (cite a photo)" aria-label={`${c.item} issue`} />
                  <div className="grid grid-cols-2 gap-2">
                    <div><div className="text-[11px] font-semibold text-text-3">{c.item === "Cleanliness" ? "Cleaning fee" : c.item.startsWith("Accessories") ? "Replacement cost" : "Repair estimate"}</div><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-text-3">$</span><Input compact value={dollars(c.repair_estimate_cents)} onChange={(e) => setChecks((cs) => cs.map((x, j) => (j === i ? { ...x, repair_estimate_cents: Math.round(Number(e.target.value || 0) * 100) } : x)))} inputMode="decimal" className="!pl-7" aria-label="Amount" /></div></div>
                    {!c.item.startsWith("Accessories") && c.item !== "Cleanliness" && <div><div className="text-[11px] font-semibold text-text-3">Out of service</div><div className="flex items-center gap-1.5"><Input compact value={c.out_of_service_days ?? ""} onChange={(e) => setChecks((cs) => cs.map((x, j) => (j === i ? { ...x, out_of_service_days: Number(e.target.value || 0) } : x)))} inputMode="numeric" aria-label="Days out of service" /><span className="text-[12px] text-text-3">days</span></div></div>}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="border-t border-border px-3.5 py-2.5"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes for the record" aria-label="Notes" /></div>
        </section>

        <section className="card-sm flex flex-col gap-1.5 px-3.5 py-3 text-[13px]">
          <Row k="Late fee" v={formatMoney(lateFee.fee_cents)} muted={!lateFee.fee_cents} />
          {claim.damage_cents > 0 || damage + missing > 0 ? <Row k={`Damage claim${checks.filter((c) => !c.ok && c.item !== "Cleanliness").length ? ` · ${checks.filter((c) => !c.ok && c.item !== "Cleanliness").map((c) => c.item.split(":")[0]!.toLowerCase()).join(", ")}` : ""}`} v={formatMoney(damage + missing)} /> : null}
          {cleaning > 0 && <Row k="Cleaning fee" v={formatMoney(cleaning)} />}
          <Row k="Damage waiver" v={booking.waiver_bought ? `Bought · covers up to ${formatMoney(booking.waiver_covers_cents, { whole: true })}` : "Not purchased"} muted />
          <div className="mt-1 flex items-center justify-between rounded-[8px] bg-charcoal px-3 py-2 text-white"><span className="text-[12px] font-semibold">Claim against {formatMoney(booking.hold_cents, { whole: true })} hold</span><span className="t-mono text-[16px] font-medium">{formatMoney(claimTotal + lateFee.fee_cents)}</span></div>
          {claim.uncovered_cents > 0 && <div className="text-[12px] font-semibold text-warn-text">{formatMoney(claim.uncovered_cents)} exceeds the hold — fab.rent support handles the remainder if the claim is upheld.</div>}
          <p className="text-[12px] leading-[1.5] text-text-3">{booking.renter.split(" ")[0]} has {booking.response_hours} h to accept or dispute. If disputed, fab.rent support reviews both photo sets. The hold stays in place until resolved; the undisputed late fee settles now.{booking.wear_allowance_pct ? ` Wear-and-tear allowance ${booking.wear_allowance_pct}% applies to tools over 2 years.` : ""}</p>
        </section>

        {claims.length > 0 && <div className="text-[12px] text-text-3">Existing claims on this booking: {claims.map((c) => `${c.type} ${formatMoney(c.amount_cents)} (${c.status})`).join(" · ")}</div>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[560px] flex-col gap-2 border-t border-border bg-paper px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {done ? (
          <Button size="xl" block variant="secondary" href={`/provider/bookings?ref=${booking.ref}`}>Return already recorded · back to booking</Button>
        ) : (
          <>
            <Button size="xl" block onClick={() => submit(true)} loading={pending} disabled={!hasIssue || claimTotal === 0} data-testid="complete-with-claim">Complete return &amp; send claim</Button>
            <Button size="xl" block variant="secondary" onClick={() => submit(false)} loading={pending} data-testid="complete-no-claim">Complete without a claim{booking.hold_cents ? " · release hold" : ""}</Button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return <div className={cn("flex justify-between gap-3", muted && "text-text-3")}><span>{k}</span><span className="t-mono">{v}</span></div>;
}
