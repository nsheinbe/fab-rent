import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

export type AvatarTone = "charcoal" | "cobalt" | "ivory" | "light";

/** Initials avatar. Providers are charcoal (N), renters cobalt-tint (PN) or ivory (JK), staff cobalt-light (IV). */
export function Avatar({ name, size = 40, tone = "ivory", className, src }: { name: string; size?: number; tone?: AvatarTone; className?: string; src?: string | null }) {
  const tones: Record<AvatarTone, string> = {
    charcoal: "bg-charcoal text-white",
    cobalt: "bg-cobalt-tint text-cobalt-hover",
    ivory: "bg-ivory-deep text-charcoal",
    light: "bg-cobalt-light text-white",
  };
  const text = initials(name);
  const fontSize = size >= 48 ? 18 : size >= 40 ? (text.length > 1 ? 14 : 16) : 12;
  return (
    <span
      className={cn("inline-flex flex-none items-center justify-center rounded-full font-extrabold select-none overflow-hidden", tones[tone], className)}
      style={{ width: size, height: size, fontSize }}
      aria-label={name}
      role="img"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="size-full object-cover" /> : text}
    </span>
  );
}
