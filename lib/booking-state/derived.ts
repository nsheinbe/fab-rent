import { differenceInMinutes } from "date-fns";
import type { BookingStatus } from "./status";
import type { PillTone } from "./status";

export interface DerivedBadge {
  label: string;
  tone: PillTone;
  dot?: boolean;
}

interface DerivedInput {
  status: BookingStatus;
  start_at: Date;
  end_at: Date;
  fulfillment: "pickup" | "delivery";
  prep_hours: number;
  late_grace_minutes: number;
  now: Date;
  instant?: boolean;
  provider_response_minutes?: number | null;
}

/**
 * Display labels layered on the canonical status for dense tables and cards
 * ("Prep due", "Ready · bay 2", "Awaiting provider · ~1 h", "Late 2 h 10 m").
 * Purely presentational — never stored.
 */
export function derivedBadge(b: DerivedInput): DerivedBadge | null {
  const minsToStart = differenceInMinutes(b.start_at, b.now);
  switch (b.status) {
    case "requested": {
      const eta = b.provider_response_minutes ?? 60;
      const label = eta < 60 ? `~${eta} min` : `~${Math.round(eta / 60)} h`;
      return { label: `Awaiting provider · ${label}`, tone: "warn", dot: true };
    }
    case "confirmed":
      if (minsToStart <= b.prep_hours * 60 && minsToStart > -60) return { label: "Prep due", tone: "warn", dot: true };
      return null;
    case "overdue": {
      const late = differenceInMinutes(b.now, b.end_at);
      const h = Math.floor(late / 60);
      const m = late % 60;
      return { label: `Late ${h > 0 ? `${h} h ` : ""}${m} m`.trim(), tone: "error", dot: true };
    }
    default:
      return null;
  }
}
