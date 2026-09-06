import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "text" | "danger" | "dark";
export type ButtonSize = "lg" | "md" | "sm" | "xl";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-cobalt text-white hover:bg-cobalt-hover disabled:bg-cobalt/50",
  secondary: "bg-white text-charcoal border border-border-strong hover:bg-ivory disabled:text-placeholder",
  ghost: "bg-ivory-deep text-charcoal hover:bg-border disabled:text-placeholder",
  text: "bg-transparent text-cobalt hover:text-cobalt-hover hover:bg-cobalt-tint/60 disabled:text-placeholder",
  danger: "bg-error-bg text-error-text hover:bg-[#f6d9d6] disabled:opacity-60",
  dark: "bg-charcoal text-white hover:bg-black disabled:opacity-60",
};
const sizes: Record<ButtonSize, string> = {
  xl: "h-[50px] px-6 rounded-[12px] text-[15px] gap-2",
  lg: "h-11 px-[18px] rounded-control text-[15px] gap-2",
  md: "h-9 px-3.5 rounded-[8px] text-[13px] gap-1.5",
  sm: "h-8 px-3 rounded-[8px] text-[12px] gap-1.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  block?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function Button({ variant = "primary", size = "lg", href, block, loading, leading, trailing, className, children, disabled, type, ...rest }: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center font-semibold whitespace-nowrap select-none transition-colors disabled:cursor-not-allowed",
    variants[variant],
    sizes[size],
    block && "w-full",
    className,
  );
  const content = (
    <>
      {loading ? <span className="inline-block size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden /> : leading}
      {children}
      {trailing}
    </>
  );
  if (href && !disabled) {
    // data-* / aria-* / id / title carry over to the anchor; button-only attributes are dropped
    const { onClick, id, title, ...others } = rest;
    const passthrough = Object.fromEntries(Object.entries(others).filter(([k]) => k.startsWith("data-") || k.startsWith("aria-")));
    return (
      <Link href={href} className={classes} aria-disabled={disabled || loading || undefined} id={id} title={title} onClick={onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>} {...passthrough}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type ?? "button"} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}
