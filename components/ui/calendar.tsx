"use client";
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameDay, startOfMonth } from "date-fns";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface CalendarProps {
  /** market-local month to show (any date in that month, already shifted to market wall clock) */
  month: Date;
  /** market-local "today" */
  today?: Date;
  /** selected range (market-local dates) */
  range?: { start: Date; end: Date } | null;
  /** day → true when all units are booked */
  isBooked?: (d: Date) => boolean;
  isDisabled?: (d: Date) => boolean;
  onSelectDay?: (d: Date) => void;
  onMonthChange?: (m: Date) => void;
  legend?: boolean;
  className?: string;
  navigable?: boolean;
  weekStartsOn?: 0 | 1;
}

/** Month grid with "Your dates / All units booked / Today" states (M05). Week starts Monday in Port Maren. */
export function Calendar({ month, today, range, isBooked, isDisabled, onSelectDay, onMonthChange, legend = true, className, navigable, weekStartsOn = 1 }: CalendarProps) {
  const [inner, setInner] = useState(month);
  const shown = onMonthChange ? month : inner;
  const setMonth = (m: Date) => (onMonthChange ? onMonthChange(m) : setInner(m));
  const days = eachDayOfInterval({ start: startOfMonth(shown), end: endOfMonth(shown) });
  const lead = (getDay(startOfMonth(shown)) - weekStartsOn + 7) % 7;
  const labels = weekStartsOn === 1 ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];

  const inRange = (d: Date) => range && d >= startOfDayLocal(range.start) && d <= startOfDayLocal(range.end);
  const isStart = (d: Date) => range && isSameDay(d, range.start);
  const isEnd = (d: Date) => range && isSameDay(d, range.end);

  return (
    <div className={cn("rounded-panel border border-border bg-white p-3", className)}>
      {navigable && (
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(addMonths(shown, -1))} className="flex size-8 items-center justify-center rounded-[8px] border border-border bg-white hover:bg-ivory">
            <Icon name="chevron-left" size={14} />
          </button>
          <div className="text-[14px] font-bold">{format(shown, "MMMM yyyy")}</div>
          <button type="button" aria-label="Next month" onClick={() => setMonth(addMonths(shown, 1))} className="flex size-8 items-center justify-center rounded-[8px] border border-border bg-white hover:bg-ivory">
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      )}
      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-text-3">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-semibold" role="grid">
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const booked = isBooked?.(d) ?? false;
          const disabled = isDisabled?.(d) ?? false;
          const selected = !!inRange(d);
          const past = today ? d < startOfDayLocal(today) : false;
          const isToday = today ? isSameDay(d, today) : false;
          return (
            <button
              key={d.toISOString()}
              type="button"
              role="gridcell"
              aria-selected={selected}
              aria-disabled={disabled || booked || past}
              disabled={!onSelectDay || disabled || booked || past}
              onClick={() => onSelectDay?.(d)}
              className={cn(
                "flex h-[34px] items-center justify-center transition-colors",
                selected ? "bg-cobalt text-white" : booked ? "bg-ivory-deep text-placeholder line-through rounded-[8px]" : past ? "text-placeholder" : "hover:bg-ivory rounded-[8px]",
                selected && isStart(d) && "rounded-l-[8px]",
                selected && isEnd(d) && "rounded-r-[8px]",
                isToday && !selected && "rounded-[8px] border-[1.5px] border-charcoal",
              )}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
      {legend && (
        <div className="mt-2.5 flex flex-wrap gap-3.5 text-[11px] text-text-3">
          <span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-cobalt align-[-1px]" />Your dates</span>
          <span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-ivory-deep align-[-1px]" />All units booked</span>
          <span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] border-[1.5px] border-charcoal align-[-1px]" />Today</span>
        </div>
      )}
    </div>
  );
}

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
