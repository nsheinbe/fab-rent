/** Tiny classnames joiner — no runtime dependency needed. */
export function cn(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(" ");
}
