"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { addDays, addHours, differenceInCalendarDays, isSameDay, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select } from "@/components/ui/field";
import { DialogRoot, DialogTrigger, SheetContent, DialogContent } from "@/components/ui/dialog";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { toSearchQuery, type SearchState } from "@/lib/search/params";
import { formatDateRange } from "@/lib/format";

export interface SearchBarProps {
  state: Pick<SearchState, "q" | "where" | "radius" | "from" | "to" | "qty">;
  neighbourhoods: Array<{ slug: string; name: string }>;
  marketName: string;
  tz: string;
  today: Date;
  variant: "hero" | "pill" | "desktop";
  className?: string;
  /** keep these params when navigating (filters etc.) */
  carry?: Partial<SearchState>;
}

const HOURS = Array.from({ length: 13 }, (_, i) => 7 + i); // 07:00 – 19:00

export function whereLabel(where: string, radius: number, neighbourhoods: Array<{ slug: string; name: string }>, marketName: string) {
  const n = neighbourhoods.find((x) => x.slug === where);
  return `${n?.name ?? marketName} · ${radius} km`;
}

/** The what / where / when search control in its three shapes: home hero card, results pill, desktop header bar. */
export function SearchBar({ state, neighbourhoods, marketName, tz, today, variant, className, carry }: SearchBarProps) {
  const router = useRouter();
  const [q, setQ] = useState(state.q);
  const [where, setWhere] = useState(state.where);
  const [radius, setRadius] = useState(state.radius);
  const [from, setFrom] = useState(state.from);
  const [to, setTo] = useState(state.to);
  const [openSheet, setOpenSheet] = useState(false);

  const submit = () => {
    router.push(`/search?${toSearchQuery({ ...carry, q, where, radius, from, to, qty: state.qty }, tz)}`);
    setOpenSheet(false);
  };

  const whenLabel = formatDateRange(from, to, { tz });
  const whereText = whereLabel(where, radius, neighbourhoods, marketName);

  const form = (dense: boolean) => (
    <div className={cn("flex flex-col gap-1.5", dense && "gap-2")}>
      <label className="flex h-12 items-center gap-2.5 rounded-control bg-ivory px-3.5">
        <Icon name="search" size={18} strokeWidth={2.2} />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Table saw, tent, camera…" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-placeholder" aria-label="What do you need?" />
      </label>
      <div className="flex gap-1.5">
        <WherePicker where={where} radius={radius} neighbourhoods={neighbourhoods} marketName={marketName} onChange={(w, r) => { setWhere(w); setRadius(r); }}>
          <button type="button" className="flex h-[52px] flex-1 items-center gap-2 rounded-control bg-ivory px-3 text-left">
            <Icon name="pin" size={18} />
            <div className="min-w-0"><div className="text-[10px] font-semibold tracking-[.04em] text-text-3">WHERE</div><div className="text-[13px] font-semibold truncate-1">{whereText}</div></div>
          </button>
        </WherePicker>
        <DateRangePicker from={from} to={to} tz={tz} today={today} onChange={(f, t) => { setFrom(f); setTo(t); }}>
          <button type="button" className="flex h-[52px] flex-1 items-center gap-2 rounded-control bg-ivory px-3 text-left">
            <Icon name="calendar" size={18} />
            <div className="min-w-0"><div className="text-[10px] font-semibold tracking-[.04em] text-text-3">WHEN</div><div className="text-[13px] font-semibold truncate-1">{whenLabel}</div></div>
          </button>
        </DateRangePicker>
      </div>
      <Button size="lg" block className="!h-12" onClick={submit}>Search</Button>
    </div>
  );

  if (variant === "hero") {
    return <div className={cn("card flex flex-col gap-1.5 p-2 shadow-float", className)}>{form(false)}</div>;
  }

  if (variant === "pill") {
    return (
      <DialogRoot open={openSheet} onOpenChange={setOpenSheet}>
        <DialogTrigger asChild>
          <button type="button" className={cn("flex h-11 flex-1 items-center justify-between rounded-pill border border-border bg-white pl-4 pr-2 text-left shadow-[0_4px_14px_rgba(30,30,28,.06)]", className)} aria-label="Edit search">
            <div className="min-w-0">
              <div className="text-[13px] font-bold leading-[1.2] truncate-1">{q || "Anything nearby"}</div>
              <div className="text-[11px] leading-[1.2] text-text-3 truncate-1">{whereText} · {whenLabel}</div>
            </div>
            <span className="flex size-[30px] flex-none items-center justify-center rounded-full bg-ivory"><Icon name="edit" size={14} /></span>
          </button>
        </DialogTrigger>
        <SheetContent title="Search" footer={null}>
          {form(true)}
        </SheetContent>
      </DialogRoot>
    );
  }

  // desktop header bar (W01 hero variant handled by hero; this is the 44 px pill with three segments)
  return (
    <div className={cn("flex h-11 w-full max-w-[560px] items-center rounded-pill border border-border bg-white pl-[18px] pr-1.5 shadow-[0_2px_10px_rgba(30,30,28,.05)]", className)}>
      <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Table saw, tent, camera…" className="min-w-0 flex-1 bg-transparent text-[13px] font-bold outline-none placeholder:font-medium placeholder:text-placeholder" aria-label="What do you need?" />
      <span className="mx-2 h-[22px] w-px bg-border" />
      <WherePicker where={where} radius={radius} neighbourhoods={neighbourhoods} marketName={marketName} onChange={(w, r) => { setWhere(w); setRadius(r); }}>
        <button type="button" className="flex-1 truncate px-2 text-left text-[13px] font-semibold">{whereText}</button>
      </WherePicker>
      <span className="mx-2 h-[22px] w-px bg-border" />
      <DateRangePicker from={from} to={to} tz={tz} today={today} onChange={(f, t) => { setFrom(f); setTo(t); }}>
        <button type="button" className="flex-[1.2] truncate px-2 text-left text-[13px] font-semibold">{whenLabel}</button>
      </DateRangePicker>
      <button type="button" onClick={submit} aria-label="Search" className="ml-1 flex size-[34px] flex-none items-center justify-center rounded-full bg-cobalt text-white hover:bg-cobalt-hover">
        <Icon name="search" size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function ResponsiveOverlay({ title, description, open, onOpenChange, trigger, children, footer }: { title: string; description?: string; open: boolean; onOpenChange: (o: boolean) => void; trigger: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const desktop = useIsDesktop();
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {desktop ? (
        <DialogContent title={title} description={description} footer={footer} size="sm">{children}</DialogContent>
      ) : (
        <SheetContent title={title} description={description} footer={footer}>{children}</SheetContent>
      )}
    </DialogRoot>
  );
}

export function WherePicker({ where, radius, neighbourhoods, marketName, onChange, children }: { where: string; radius: number; neighbourhoods: Array<{ slug: string; name: string }>; marketName: string; onChange: (where: string, radius: number) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [w, setW] = useState(where);
  const [r, setR] = useState(radius);
  return (
    <ResponsiveOverlay title="Where" description="Distances are measured from the centre of the neighbourhood you pick." open={open} onOpenChange={(o) => { setOpen(o); if (o) { setW(where); setR(radius); } }} trigger={children} footer={<Button block size="xl" onClick={() => { onChange(w, r); setOpen(false); }}>Done</Button>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="text-[12px] font-semibold text-text-2">Neighbourhood</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setW("")} className={cn("h-[34px] rounded-pill border px-3 text-[12px] font-semibold", w === "" ? "border-cobalt-tint-border bg-cobalt-tint text-cobalt-hover" : "border-border bg-white")}>{marketName}</button>
            {neighbourhoods.map((n) => (
              <button key={n.slug} type="button" onClick={() => setW(n.slug)} className={cn("h-[34px] rounded-pill border px-3 text-[12px] font-semibold", w === n.slug ? "border-cobalt-tint-border bg-cobalt-tint text-cobalt-hover" : "border-border bg-white")}>{n.name}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between"><div className="text-[12px] font-semibold text-text-2">Distance</div><div className="text-[13px] font-bold">Within {r} km</div></div>
          <input type="range" min={1} max={50} value={r} onChange={(e) => setR(Number(e.target.value))} className="w-full accent-cobalt" aria-label="Distance in km" />
          <div className="flex justify-between text-[11px] text-text-3"><span>1 km</span><span>50 km</span></div>
        </div>
      </div>
    </ResponsiveOverlay>
  );
}

export function DateRangePicker({ from, to, tz, today, onChange, children, minDays = 1, maxDays = 60, isBooked }: { from: Date; to: Date; tz: string; today: Date; onChange: (from: Date, to: Date) => void; children: ReactNode; minDays?: number; maxDays?: number; isBooked?: (d: Date) => boolean }) {
  const [open, setOpen] = useState(false);
  const zFrom = toZonedTime(from, tz);
  const zTo = toZonedTime(to, tz);
  const [startDay, setStartDay] = useState<Date>(startOfDay(zFrom));
  const [endDay, setEndDay] = useState<Date | null>(startOfDay(zTo));
  const [startHour, setStartHour] = useState(zFrom.getHours());
  const [endHour, setEndHour] = useState(zTo.getHours());
  const zToday = toZonedTime(today, tz);
  const [month, setMonth] = useState(startOfDay(zFrom));

  const pick = (d: Date) => {
    if (!endDay || d < startDay || (endDay && isSameDay(startDay, endDay) === false && endDay)) {
      if (endDay && d >= startDay && !isSameDay(startDay, endDay)) {
        // range complete → start over
        setStartDay(d);
        setEndDay(null);
        return;
      }
    }
    if (endDay === null) {
      if (d < startDay) {
        setStartDay(d);
        return;
      }
      setEndDay(d);
      return;
    }
    setStartDay(d);
    setEndDay(null);
  };

  const done = () => {
    const e = endDay ?? startDay;
    let f = fromZonedTime(addHours(startDay, startHour), tz);
    let t = fromZonedTime(addHours(e, endHour), tz);
    if (t <= f) t = fromZonedTime(addHours(addDays(startDay, 1), endHour), tz);
    if (differenceInCalendarDays(t, f) > maxDays) t = fromZonedTime(addHours(addDays(startDay, maxDays), endHour), tz);
    if (differenceInCalendarDays(e, startDay) + 1 < minDays) t = fromZonedTime(addHours(addDays(startDay, Math.max(0, minDays - 1)), endHour), tz);
    f = fromZonedTime(addHours(startDay, startHour), tz);
    onChange(f, t);
    setOpen(false);
  };

  const range = { start: startDay, end: endDay ?? startDay };
  const label = `${formatInTimeZone(fromZonedTime(startDay, tz), tz, "EEE d MMM")} → ${formatInTimeZone(fromZonedTime(endDay ?? startDay, tz), tz, "EEE d MMM")}`;

  return (
    <ResponsiveOverlay title="When" description={endDay ? label : "Pick the return day"} open={open} onOpenChange={(o) => { setOpen(o); if (o) { setStartDay(startOfDay(zFrom)); setEndDay(startOfDay(zTo)); setStartHour(zFrom.getHours()); setEndHour(zTo.getHours()); setMonth(startOfDay(zFrom)); } }} trigger={children} footer={<Button block size="xl" onClick={done} disabled={!endDay}>Use these dates</Button>}>
      <div className="flex flex-col gap-4">
        <Calendar month={month} onMonthChange={setMonth} today={zToday} range={range} onSelectDay={pick} isBooked={isBooked} navigable legend={false} />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] font-semibold text-text-2">Pickup / delivery from</div>
            <Select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} aria-label="Start time">
              {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] font-semibold text-text-2">Return by</div>
            <Select value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} aria-label="End time">
              {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </Select>
          </div>
        </div>
        <div className="text-[12px] text-text-3">Any part of a 24-hour period counts as a day. Weekly rates apply from 5 days.</div>
      </div>
    </ResponsiveOverlay>
  );
}
