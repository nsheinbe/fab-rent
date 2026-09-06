import { Pill } from "@/components/ui/pill";
import { bookingStatus, type BookingStatus } from "@/lib/booking-state/status";
import { formatDateRangeCompact, formatRate } from "@/lib/format";

/** Exactly the 11 booking statuses, colours from the single map. */
export function StatusPill({ status, size = "md", compact, className, labelOverride }: { status: BookingStatus; size?: "md" | "sm" | "xs"; compact?: boolean; className?: string; labelOverride?: string }) {
  const m = bookingStatus[status];
  return (
    <Pill tone={m.tone} dot={m.dot} strike={m.strike} size={size} className={className}>
      {labelOverride ?? (compact ? m.short : m.label)}
    </Pill>
  );
}

export type Availability = { kind: "available"; range?: { start: Date; end: Date } } | { kind: "only_left"; count: number } | { kind: "unavailable"; next?: Date | null };

/** Available (ok) · Only 1 left (warn) · Unavailable · next {date} (neutral). */
export function AvailabilityPill({ availability, size = "md", className }: { availability: Availability; size?: "md" | "sm" | "xs"; className?: string }) {
  if (availability.kind === "available") {
    return (
      <Pill tone="ok" dot size={size} className={className}>
        Available{availability.range ? ` ${formatDateRangeCompact(availability.range.start, availability.range.end).replace("–", "–")}` : ""}
      </Pill>
    );
  }
  if (availability.kind === "only_left") {
    return (
      <Pill tone="warn" size={size} className={className}>
        Only {availability.count} left
      </Pill>
    );
  }
  return (
    <Pill tone="neutral" size={size} className={className}>
      Unavailable{availability.next ? ` · next ${availability.next.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
    </Pill>
  );
}

/** Pickup · free / Delivery · from $X (outlined) · Instant book (charcoal). */
export function FulfillmentPill({ kind, deliveryFromCents, size = "md", className, short }: { kind: "pickup" | "delivery" | "pickup_only" | "instant" | "delivery_setup"; deliveryFromCents?: number; size?: "md" | "sm" | "xs"; className?: string; short?: boolean }) {
  if (kind === "instant") {
    return (
      <Pill tone="dark" size={size} className={className}>
        Instant book
      </Pill>
    );
  }
  const label =
    kind === "pickup" ? (short ? "Pickup" : "Pickup · free")
    : kind === "pickup_only" ? "Pickup only"
    : kind === "delivery_setup" ? "Delivery & setup"
    : deliveryFromCents != null ? (short ? `Delivery ${formatRate(deliveryFromCents)}` : `Delivery · from ${formatRate(deliveryFromCents)}`) : "Delivery";
  return (
    <Pill tone="outline" size={size} className={className}>
      {label}
    </Pill>
  );
}
