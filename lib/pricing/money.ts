/** Half-up rounding of a fractional cent amount. */
export function roundCents(value: number): number {
  return Math.round(value + Number.EPSILON);
}

/** `pct` of `cents`, computed with integer basis points so x.5 cases round half-up exactly. */
export function pctOf(cents: number, pct: number): number {
  const bp = Math.round(pct * 100); // e.g. 7.5% → 750 bp
  return roundCents((cents * bp) / 10_000);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
