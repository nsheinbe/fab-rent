"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDays, format } from "date-fns";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Select, Field, Input } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { DialogRoot, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { StatusPill } from "@/components/domain/pills";
import { toMarket } from "@/lib/time";
import { formatDateTime } from "@/lib/format";
import { addBlock, assignUnit, deleteBlock } from "@/app/(provider)/actions";
import type { BookingStatus } from "@/lib/booking-state/status";

export interface CalRow {
  listing: { id: string; title: string; category_slug: string; parent_slug: string | null; prep_hours: number };
  unit: { id: string; unit_number: number; serial: string; status: string } | null;
  bookings: Array<{ id: string; ref: string; status: BookingStatus; start_at: string; end_at: string; renter: string; fulfillment: "pickup" | "delivery"; area: string | null; qty: number }>;
  blocks: Array<{ id: string; reason: string; note: string | null; start_at: string; end_at: string }>;
}
interface Props { rows: CalRow[]; categories: Array<{ slug: string; name: string; count: number }>; view: "day" | "week" | "month"; startIso: string; days: number; tz: string; category: string; showPrep: boolean; nowIso: string }

const REASONS: Record<string, string> = { service: "Service", inspection: "Inspection", off_platform: "Blocked · off-platform hire", other: "Blocked" };

/** P04: listing → unit rows against a day grid; bars for bookings, requests, prep time, service and blocks. Click a bar to move it to another unit; click empty space to block. */
export function CalendarGrid({ rows, categories, view, startIso, days, tz, category, showPrep, nowIso }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<{ row: CalRow; b: CalRow["bookings"][number] } | null>(null);
  const [blockAt, setBlockAt] = useState<{ row: CalRow; date: string } | null>(null);
  const [blockDraft, setBlockDraft] = useState({ end: "", reason: "service", note: "" });
  const startLocal = new Date(`${startIso}T00:00:00`);
  const dayList = Array.from({ length: days }, (_, i) => addDays(startLocal, i));
  const nav = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams({ view, start: startIso, ...(category ? { category } : {}), ...(showPrep ? { prep: "1" } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/provider/calendar?${p.toString()}`, { scroll: false });
  };
  const shift = (dir: 1 | -1) => nav({ start: format(addDays(startLocal, dir * days), "yyyy-MM-dd") });
  const spanMs = days * 86_400_000;
  const pos = (aIso: string, bIso: string) => {
    // wall-clock positions in market time
    const a = toMarket(new Date(aIso), tz).getTime() - startLocalAsMarket(startLocal).getTime();
    const b = toMarket(new Date(bIso), tz).getTime() - startLocalAsMarket(startLocal).getTime();
    const left = Math.max(0, a / spanMs) * 100;
    const right = Math.min(1, b / spanMs) * 100;
    return { left: `${left}%`, width: `${Math.max(0.6, right - left)}%`, clippedStart: a < 0, clippedEnd: b > spanMs };
  };
  const nowPos = (() => {
    const n = toMarket(new Date(nowIso), tz).getTime() - startLocalAsMarket(startLocal).getTime();
    return n >= 0 && n <= spanMs ? `${(n / spanMs) * 100}%` : null;
  })();
  const title = days === 1 ? format(startLocal, "EEEE d MMMM yyyy") : `${format(startLocal, "EEE d")} – ${format(addDays(startLocal, days - 1), "EEE d MMM yyyy")}`;
  const listings = [...new Map(rows.map((r) => [r.listing.id, r.listing])).values()];
  const unitsFor = (listingId: string) => rows.filter((r) => r.listing.id === listingId && r.unit).map((r) => r.unit!);

  const move = (ref: string, unitId: string) =>
    start(async () => {
      const r = await assignUnit(ref, unitId);
      if (!r.ok) toast({ title: r.error, tone: "error" });
      else toast({ title: `Moved to unit ${r.data.unit_number}`, tone: "ok" });
      setPicked(null);
      router.refresh();
    });
  const saveBlock = () =>
    start(async () => {
      if (!blockAt) return;
      const r = await addBlock(blockAt.row.listing.id, { unit_id: blockAt.row.unit?.id ?? null, start: `${blockAt.date}T07:00:00`, end: `${blockDraft.end || blockAt.date}T18:00:00`, reason: blockDraft.reason as never, note: blockDraft.note || null });
      if (!r.ok) toast({ title: r.error, tone: "error" });
      else toast({ title: "Dates blocked", tone: "ok" });
      setBlockAt(null);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3.5 px-4 py-4 md:px-6 lg:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous" className="flex size-8 items-center justify-center rounded-[8px] border border-border bg-white hover:bg-ivory"><Icon name="chevron-left" size={14} /></button>
          <div className="text-[15px] font-bold">{title}</div>
          <button type="button" onClick={() => shift(1)} aria-label="Next" className="flex size-8 items-center justify-center rounded-[8px] border border-border bg-white hover:bg-ivory"><Icon name="chevron-right" size={14} /></button>
          <Button size="sm" variant="ghost" onClick={() => nav({ start: null })}>Today</Button>
          <SegmentedControl size="sm" value={view} onChange={(v) => nav({ view: v })} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} className="w-[200px]" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select compact value={category} onChange={(e) => nav({ category: e.target.value || null })} aria-label="Category" className="w-[220px]">
            <option value="">All categories · {categories.reduce((s, c) => s + c.count, 0)} listings</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name} · {c.count} {c.count === 1 ? "listing" : "listings"}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-[13px] font-semibold"><Switch size="sm" checked={showPrep} onCheckedChange={(v) => nav({ prep: v ? "1" : null })} aria-label="Show prep time" />Show prep time</label>
          <Button size="md" variant="secondary" onClick={() => rows[0] && setBlockAt({ row: rows[0], date: startIso })} leading={<Icon name="plus" size={14} />}>Block dates</Button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[840px]">
            <div className="grid border-b border-border bg-paper" style={{ gridTemplateColumns: `220px repeat(${days}, minmax(0,1fr))` }}>
              <div className="px-3 py-2 t-label text-text-3">Listing · unit</div>
              {dayList.map((d) => {
                const today = format(d, "yyyy-MM-dd") === format(toMarket(new Date(nowIso), tz), "yyyy-MM-dd");
                return <div key={d.toISOString()} className={cn("border-l border-border px-2 py-2 text-center", today && "bg-cobalt-tint/60")}><div className="t-label text-text-3">{format(d, days > 7 ? "EEEEE" : "EEE")}</div><div className={cn("text-[15px] font-extrabold leading-tight", today && "text-cobalt")}>{format(d, "d")}</div></div>;
              })}
            </div>
            {listings.length === 0 && <div className="p-8 text-center text-[13px] text-text-3">No listings in this category.</div>}
            {listings.map((l) => {
              const lrows = rows.filter((r) => r.listing.id === l.id);
              return (
                <div key={l.id} className="border-b border-border last:border-b-0">
                  <div className="flex items-center justify-between px-3 py-1.5 text-[13px] font-bold">{l.title}<Link href={`/provider/listings/${l.id}`} className="text-[11px] font-semibold text-text-3 no-underline hover:text-charcoal">Edit</Link></div>
                  {lrows.map((r) => (
                    <div key={r.unit?.id ?? l.id} className="relative grid min-h-[46px] items-stretch" style={{ gridTemplateColumns: `220px repeat(${days}, minmax(0,1fr))` }}>
                      <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[12px]"><span className="t-mono text-text-2">{r.unit ? `Unit ${r.unit.unit_number} · ${r.unit.serial}` : "No units yet"}</span>{r.unit && r.unit.status !== "rentable" && <span className="rounded-[4px] bg-warn-bg px-1.5 py-0.5 text-[10px] font-bold text-warn-text">{r.unit.status.replace("_", " ")}</span>}</div>
                      {dayList.map((d) => (
                        <button key={d.toISOString()} type="button" aria-label={`Block ${format(d, "d MMM")}${r.unit ? ` for unit ${r.unit.unit_number}` : ""}`} onClick={() => { setBlockDraft({ end: format(d, "yyyy-MM-dd"), reason: "service", note: "" }); setBlockAt({ row: r, date: format(d, "yyyy-MM-dd") }); }} className="border-l border-t border-border hover:bg-ivory/70" />
                      ))}
                      <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: 220 }}>
                        {nowPos && <div className="absolute inset-y-0 w-px bg-error/70" style={{ left: nowPos }} />}
                        {r.blocks.map((k) => { const p = pos(k.start_at, k.end_at); return <BlockBar key={k.id} label={k.note ?? REASONS[k.reason] ?? k.reason} reason={k.reason} style={{ left: p.left, width: p.width }} onRemove={() => start(async () => { await deleteBlock(r.listing.id, k.id); router.refresh(); })} />; })}
                        {r.bookings.map((b) => {
                          const p = pos(b.start_at, b.end_at);
                          const prep = showPrep && r.listing.prep_hours > 0 ? pos(new Date(new Date(b.start_at).getTime() - r.listing.prep_hours * 3_600_000).toISOString(), b.start_at) : null;
                          return (
                            <div key={b.id} className="contents">
                              {prep && <div className="absolute top-[7px] h-[30px] rounded-l-[6px] border border-dashed border-border-strong bg-ivory-deep/80 px-1 text-[10px] leading-[28px] text-text-3" style={{ left: prep.left, width: prep.width }} title={`Prep ${r.listing.prep_hours} h`}>{parseFloat(prep.width) > 4 ? `Prep ${r.listing.prep_hours} h` : ""}</div>}
                              <BookingBar b={b} clipped={p} onClick={() => setPicked({ row: r, b })} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-border bg-paper px-4 py-2.5 text-[11px] font-semibold text-text-2">
          <Legend className="bg-cobalt" label="Confirmed booking" /><Legend className="bg-warn-bg border border-dashed border-warn" label="Requested · awaiting you" /><Legend className="bg-ok" label="Active / out" /><Legend className="bg-ivory-deep border border-dashed border-border-strong" label="Prep time" /><Legend className="bg-[repeating-linear-gradient(135deg,#E6E2D9_0_4px,#F3F0EA_4px_8px)]" label="Service · inspection" /><Legend className="bg-ivory-deep" label="Blocked" />
          <span className="ml-auto text-text-3">Click a bar to move it to another unit · click empty space to block</span>
        </div>
      </div>

      <DialogRoot open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        {picked && (
          <DialogContent title={picked.b.ref} size="sm" description={`${picked.row.listing.title} · ${picked.b.renter}${picked.b.qty > 1 ? ` · ×${picked.b.qty}` : ""}`} footer={<><Button size="md" variant="secondary" href={`/provider/bookings?ref=${picked.b.ref}`}>Open booking</Button><Button size="md" variant="secondary" onClick={() => setPicked(null)}>Close</Button></>}>
            <div className="flex flex-col gap-3 text-[13px]">
              <div className="flex items-center justify-between"><StatusPill status={picked.b.status} size="sm" /><span className="text-text-2">{formatDateTime(new Date(picked.b.start_at), tz).replace(" · ", " ")} → {formatDateTime(new Date(picked.b.end_at), tz).replace(" · ", " ")}</span></div>
              <div className="text-text-2 capitalize">{picked.b.fulfillment}{picked.b.area ? ` · ${picked.b.area}` : ""}</div>
              {!["completed", "cancelled", "disputed", "inspecting"].includes(picked.b.status) && (
                <Field label="Move to unit" id="move-unit">
                  <Select id="move-unit" value={picked.row.unit?.id ?? ""} disabled={pending} onChange={(e) => e.target.value && move(picked.b.ref, e.target.value)}>
                    <option value="">{picked.row.unit ? `Unit ${picked.row.unit.unit_number} (current)` : "Unassigned"}</option>
                    {unitsFor(picked.row.listing.id).filter((u) => u.id !== picked.row.unit?.id).map((u) => <option key={u.id} value={u.id}>Unit {u.unit_number} · {u.serial}</option>)}
                  </Select>
                </Field>
              )}
              <p className="text-[12px] text-text-3">Moving checks the other unit is free for the whole span, including prep time and blocks.</p>
            </div>
          </DialogContent>
        )}
      </DialogRoot>

      <DialogRoot open={!!blockAt} onOpenChange={(o) => !o && setBlockAt(null)}>
        {blockAt && (
          <DialogContent title="Block dates" size="sm" description={`${blockAt.row.listing.title} · ${blockAt.row.unit ? `unit ${blockAt.row.unit.unit_number}` : "all units"}`} footer={<><Button size="md" variant="secondary" onClick={() => setBlockAt(null)}>Cancel</Button><Button size="md" onClick={saveBlock} loading={pending}>Block</Button></>}>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="From" id="cb-from"><Input id="cb-from" type="date" value={blockAt.date} onChange={(e) => setBlockAt({ ...blockAt, date: e.target.value })} /></Field>
                <Field label="To" id="cb-to"><Input id="cb-to" type="date" value={blockDraft.end || blockAt.date} onChange={(e) => setBlockDraft({ ...blockDraft, end: e.target.value })} /></Field>
              </div>
              <Field label="Reason" id="cb-reason"><Select id="cb-reason" value={blockDraft.reason} onChange={(e) => setBlockDraft({ ...blockDraft, reason: e.target.value })}><option value="service">Scheduled service</option><option value="inspection">Inspection</option><option value="off_platform">Off-platform hire</option><option value="other">Other</option></Select></Field>
              <Field label="Note" id="cb-note"><Input id="cb-note" value={blockDraft.note} onChange={(e) => setBlockDraft({ ...blockDraft, note: e.target.value })} placeholder="Shown on the calendar" /></Field>
            </div>
          </DialogContent>
        )}
      </DialogRoot>
    </div>
  );
}

function startLocalAsMarket(d: Date) {
  return d; // the grid start is already a wall-clock Date built from the market-local yyyy-MM-dd
}

function BookingBar({ b, clipped, onClick }: { b: CalRow["bookings"][number]; clipped: { left: string; width: string; clippedStart: boolean; clippedEnd: boolean }; onClick: () => void }) {
  const requested = b.status === "requested";
  const active = ["active", "return_due", "overdue"].includes(b.status);
  const cls = requested ? "border border-dashed border-warn bg-warn-bg text-warn-text" : active ? (b.status === "overdue" ? "bg-error text-white" : "bg-ok text-white") : b.status === "cancelled" ? "bg-ivory-deep text-text-3 line-through" : "bg-cobalt text-white";
  return (
    <button type="button" onClick={onClick} className={cn("pointer-events-auto absolute top-[7px] h-[32px] overflow-hidden rounded-[6px] px-2 text-left text-[11px] font-semibold leading-[30px] shadow-[0_1px_2px_rgba(0,0,0,.08)] hover:brightness-95", cls, clipped.clippedStart && "rounded-l-none", clipped.clippedEnd && "rounded-r-none")} style={{ left: clipped.left, width: clipped.width }} title={`${b.ref} · ${b.renter}`}>
      <span className="truncate-1 block">{requested ? "Requested · " : ""}{b.renter} · {b.fulfillment}{b.area ? ` ${b.area}` : ""}{b.qty > 1 ? ` ×${b.qty}` : ""} <span className="t-mono opacity-80">{b.ref}</span>{clipped.clippedEnd ? " →" : ""}</span>
    </button>
  );
}

function BlockBar({ label, reason, style, onRemove }: { label: string; reason: string; style: React.CSSProperties; onRemove: () => void }) {
  const striped = reason === "service" || reason === "inspection";
  return (
    <button type="button" onClick={() => confirm(`Remove this block?\n${label}`) && onRemove()} className={cn("pointer-events-auto absolute top-[7px] h-[32px] overflow-hidden rounded-[6px] px-2 text-left text-[11px] font-semibold leading-[30px] text-text-2 hover:brightness-95", striped ? "bg-[repeating-linear-gradient(135deg,#E6E2D9_0_4px,#F3F0EA_4px_8px)]" : "bg-ivory-deep")} style={style} title={label}>
      <span className="truncate-1 block">{label}</span>
    </button>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={cn("inline-block h-3 w-5 rounded-[3px]", className)} />{label}</span>;
}
