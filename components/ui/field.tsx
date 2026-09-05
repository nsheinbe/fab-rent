import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export function Label({ children, htmlFor, className, hint }: { children: ReactNode; htmlFor?: string; className?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={cn("text-[12px] font-semibold text-text-2 flex items-baseline justify-between gap-2", className)}>
      <span>{children}</span>
      {hint && <span className="text-text-3 font-medium">{hint}</span>}
    </label>
  );
}

export function CapsLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("t-label text-text-3", className)}>{children}</div>;
}

export function Field({ label, hint, error, children, className, id }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      {label && (
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
      )}
      {children}
      {error && (
        <div className="text-[12px] text-error-text font-medium" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

const control = "h-11 w-full rounded-control border border-border-strong bg-white px-3.5 text-[15px] lg:text-[14px] text-charcoal placeholder:text-placeholder outline-none focus:border-cobalt focus:border-2 focus:px-[13px] disabled:bg-ivory disabled:text-text-3 aria-[invalid=true]:border-error";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
  mono?: boolean;
  compact?: boolean;
}
export function Input({ className, leading, mono, compact, ...rest }: InputProps) {
  if (leading) {
    return (
      <div className={cn("relative", className)}>
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none">{leading}</span>
        <input className={cn(control, "pl-10", mono && "t-mono", compact && "h-[42px]")} {...rest} />
      </div>
    );
  }
  return <input className={cn(control, mono && "t-mono", compact && "h-[42px]", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "h-auto min-h-[84px] py-2.5 leading-[1.55] resize-y", className)} {...rest} />;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  compact?: boolean;
}
export function Select({ className, children, compact, ...rest }: SelectProps) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(control, "appearance-none pr-9", compact && "h-[42px]")} {...rest}>
        {children}
      </select>
      <Icon name="chevron-down" size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none" />
    </div>
  );
}
