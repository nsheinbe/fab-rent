"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioPrimitive from "@radix-ui/react-radio-group";
import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export function Switch({ checked, onCheckedChange, size = "md", tone = "cobalt", disabled, name, "aria-label": ariaLabel }: { checked: boolean; onCheckedChange?: (v: boolean) => void; size?: "md" | "sm"; tone?: "cobalt" | "ok"; disabled?: boolean; name?: string; "aria-label"?: string }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      name={name}
      aria-label={ariaLabel}
      className={cn(
        "relative flex-none rounded-pill transition-colors data-[state=unchecked]:bg-border-strong disabled:opacity-50",
        size === "md" ? "h-7 w-12" : "h-6 w-10",
        tone === "ok" ? "data-[state=checked]:bg-ok" : "data-[state=checked]:bg-cobalt",
      )}
    >
      <SwitchPrimitive.Thumb className={cn("block rounded-full bg-white transition-transform translate-x-[3px]", size === "md" ? "size-[22px] data-[state=checked]:translate-x-[23px]" : "size-[18px] data-[state=checked]:translate-x-[19px]")} />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({ checked, onCheckedChange, size = "md", disabled, id, name, "aria-label": ariaLabel }: { checked: boolean; onCheckedChange?: (v: boolean) => void; size?: "md" | "sm" | "lg"; disabled?: boolean; id?: string; name?: string; "aria-label"?: string }) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      name={name}
      checked={checked}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "flex flex-none items-center justify-center border-[1.5px] border-border-strong bg-white data-[state=checked]:bg-cobalt data-[state=checked]:border-cobalt disabled:opacity-50",
        size === "lg" ? "size-6 rounded-[7px]" : size === "md" ? "size-5 rounded-[6px]" : "size-[18px] rounded-[5px]",
      )}
    >
      <CheckboxPrimitive.Indicator>
        <Icon name="check" size={size === "lg" ? 14 : size === "md" ? 12 : 11} strokeWidth={3} className="text-white" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export const RadioGroup = RadioPrimitive.Root;

/** 20 px radio dot: 1.5 px border unselected, 6 px cobalt ring selected. */
export function Radio({ value, id, "aria-label": ariaLabel, size = "md" }: { value: string; id?: string; "aria-label"?: string; size?: "md" | "sm" }) {
  return (
    <RadioPrimitive.Item
      value={value}
      id={id}
      aria-label={ariaLabel}
      className={cn("flex-none rounded-full border-[1.5px] border-border-strong bg-white data-[state=checked]:border-cobalt", size === "md" ? "size-5 data-[state=checked]:border-[6px]" : "size-[18px] data-[state=checked]:border-[5.5px]")}
    />
  );
}

/** A whole card acting as a radio option (fulfillment, payment method, decision). */
export function RadioCard({ value, selected, children, className, onSelect, disabled }: { value: string; selected: boolean; children: ReactNode; className?: string; onSelect?: (v: string) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={() => onSelect?.(value)}
      className={cn(
        "w-full text-left rounded-panel transition-colors disabled:opacity-60",
        selected ? "border-2 border-cobalt bg-cobalt-wash p-[11px] lg:p-[11px]" : "border border-border bg-white p-3 hover:border-border-strong",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function RadioDot({ selected, size = "md" }: { selected: boolean; size?: "md" | "sm" }) {
  return <span aria-hidden className={cn("flex-none rounded-full bg-white", size === "md" ? "size-5" : "size-[18px]", selected ? (size === "md" ? "border-[6px] border-cobalt" : "border-[5.5px] border-cobalt") : "border-[1.5px] border-border-strong")} />;
}

export function CheckDot({ checked, size = "md" }: { checked: boolean; size?: "md" | "sm" | "lg" }) {
  return (
    <span aria-hidden className={cn("flex flex-none items-center justify-center", size === "lg" ? "size-6 rounded-[7px]" : size === "md" ? "size-5 rounded-[6px]" : "size-4 rounded-[4px]", checked ? "bg-cobalt" : "border-[1.5px] border-border-strong bg-white")}>
      {checked && <Icon name="check" size={size === "lg" ? 14 : size === "md" ? 12 : 10} strokeWidth={3.5} className="text-white" />}
    </span>
  );
}

/** Single- or dual-thumb slider on a 3 px track, 24 px white thumbs with cobalt ring (M03). */
export function Slider({ value, onValueChange, min, max, step = 1, "aria-label": ariaLabel, size = "md" }: { value: number[]; onValueChange: (v: number[]) => void; min: number; max: number; step?: number; "aria-label"?: string; size?: "md" | "sm" }) {
  const thumb = size === "md" ? "size-6" : "size-5";
  return (
    <SliderPrimitive.Root value={value} onValueChange={onValueChange} min={min} max={max} step={step} minStepsBetweenThumbs={1} className={cn("relative flex w-full touch-none select-none items-center", size === "md" ? "h-6" : "h-5")}>
      <SliderPrimitive.Track className="relative h-[3px] w-full grow rounded-[2px] bg-border">
        <SliderPrimitive.Range className="absolute h-full rounded-[2px] bg-cobalt" />
      </SliderPrimitive.Track>
      {value.map((_, i) => (
        <SliderPrimitive.Thumb key={i} aria-label={ariaLabel} className={cn("block rounded-full border-2 border-cobalt bg-white shadow-[0_2px_6px_rgba(0,0,0,.12)] outline-none focus-visible:ring-2 focus-visible:ring-cobalt/40", thumb)} />
      ))}
    </SliderPrimitive.Root>
  );
}
