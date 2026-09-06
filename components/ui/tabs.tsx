"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cn("flex gap-1.5 overflow-x-auto scrollbar-none", className)}>{children}</TabsPrimitive.List>;
}

export function TabsTrigger({ value, children, count }: { value: string; children: ReactNode; count?: ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-pill text-[13px] font-semibold whitespace-nowrap bg-white border border-border text-charcoal data-[state=active]:bg-charcoal data-[state=active]:text-white data-[state=active]:border-charcoal transition-colors"
    >
      {children}
      {count !== undefined && <span className="opacity-70">{count}</span>}
    </TabsPrimitive.Trigger>
  );
}

/** Segmented control (Any · Pickup · Delivery): ivory-deep track, white raised segment. */
export function SegmentedControl<T extends string>({ value, onChange, options, className, size = "md", name }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }>; className?: string; size?: "md" | "sm"; name?: string }) {
  return (
    <div role="radiogroup" className={cn("flex rounded-control bg-ivory-deep p-[3px]", size === "sm" && "rounded-[8px]", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            name={name}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-[8px] font-semibold transition-colors",
              size === "md" ? "h-9 text-[13px]" : "h-[26px] text-[12px] rounded-[6px] px-2.5",
              selected ? "bg-white text-charcoal shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-text-2 hover:text-charcoal",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
