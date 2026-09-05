import Link from "next/link";
import { cn } from "@/lib/cn";

/** `fab.rent` wordmark, 800 weight, −0.035em tracking, cobalt dot. */
export function Logo({ size = 22, className, href = "/", onDark, dotColor }: { size?: number; className?: string; href?: string | null; onDark?: boolean; dotColor?: string }) {
  const dot = dotColor ?? (onDark ? "#5B7BFF" : "#1E42E8");
  const inner = (
    <span className={cn("t-logo inline-block", className)} style={{ fontSize: size }}>
      fab<span style={{ color: dot }}>.</span>rent
    </span>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="text-inherit no-underline hover:text-inherit" aria-label="fab.rent home">
      {inner}
    </Link>
  );
}

/** App icon / favicon square: cobalt with `f.`. */
export function AppIcon({ size = 36, className, variant = "cobalt" }: { size?: number; className?: string; variant?: "cobalt" | "light" }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-icon font-extrabold text-white", variant === "cobalt" ? "bg-cobalt" : "bg-cobalt-light", className)} style={{ width: size, height: size, fontSize: size / 2, letterSpacing: "-0.05em", borderRadius: size <= 36 ? 10 : 12 }}>
      f<span style={{ color: variant === "cobalt" ? "#BFD0FF" : "#1E1E1C" }}>.</span>
    </span>
  );
}
