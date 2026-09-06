import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { Icon } from "@/components/ui/icons";
import { formatKm, formatMoney, formatRate } from "@/lib/format";
import { AvailabilityPill, FulfillmentPill, type Availability } from "./pills";

export interface ListingCardData {
  id: string;
  slug: string;
  title: string;
  provider_name: string;
  provider_short?: string;
  rating: number | null;
  rating_count?: number | null;
  distance_km?: number | null;
  day_cents: number;
  /** total for the searched dates — only when dates are known */
  total_cents?: number | null;
  billed_days?: number | null;
  availability?: Availability | null;
  fulfillment: "pickup" | "delivery" | "pickup_only" | "instant" | "delivery_setup";
  delivery_from_cents?: number | null;
  instant?: boolean;
  cover_url?: string | null;
  saved?: boolean;
}

export type ListingCardVariant = "row" | "tile" | "mini" | "compact";

/**
 * The listing card — the four facts, in order:
 * title → provider · rating · distance → availability + fulfillment → per-day and total for the searched dates.
 * Distance and total only render once location and dates are known.
 */
export function ListingCard({ listing, variant = "row", href, selected, className, saveButton, onClick }: { listing: ListingCardData; variant?: ListingCardVariant; href?: string; selected?: boolean; className?: string; saveButton?: ReactNode; onClick?: () => void }) {
  const link = href ?? `/listings/${listing.slug}`;
  const meta = [listing.provider_short ?? listing.provider_name, listing.rating != null ? `★ ${Number(listing.rating).toFixed(1)}${listing.rating_count && variant !== "mini" && variant !== "compact" ? ` (${listing.rating_count})` : ""}` : null, listing.distance_km != null ? formatKm(listing.distance_km) : null]
    .filter(Boolean)
    .join(" · ");
  const total = listing.total_cents != null && listing.billed_days ? `${formatMoney(listing.total_cents, { whole: true })} · ${listing.billed_days} ${listing.billed_days === 1 ? "day" : "days"}` : null;
  const pills = (size: "xs" | "sm") => (
    <div className="flex flex-wrap gap-1.5">
      {listing.availability && <AvailabilityPill availability={listing.availability} size={size} />}
      {listing.instant ? <FulfillmentPill kind="instant" size={size} /> : <FulfillmentPill kind={listing.fulfillment} deliveryFromCents={listing.delivery_from_cents ?? undefined} size={size} short />}
    </div>
  );
  const price = (
    <div className="mt-auto flex items-baseline justify-between gap-2">
      <div>
        <span className="text-[16px] font-bold">{formatRate(listing.day_cents)}</span>
        <span className="text-[11px] lg:text-[12px] text-text-3">/day</span>
      </div>
      {total && <div className="text-[12px] text-text-2">{total}</div>}
    </div>
  );
  const heart = saveButton ?? (listing.saved ? <Icon name="heart-filled" size={20} className="text-cobalt flex-none" /> : <Icon name="heart" size={20} className="text-charcoal flex-none" />);

  if (variant === "tile") {
    return (
      <Link href={link} onClick={onClick} className={cn("card flex flex-col gap-2 p-2.5 no-underline text-charcoal hover:text-charcoal transition-shadow hover:shadow-card", selected && "border-2 border-cobalt p-[9px]", className)}>
        <div className="relative h-[150px] xl:h-[170px] overflow-hidden rounded-panel">
          <PhotoSlot src={listing.cover_url} placeholder={listing.title} className="absolute inset-0" />
          <span className="absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-full bg-paper/90">{listing.saved ? <Icon name="heart-filled" size={16} className="text-cobalt" /> : <Icon name="heart" size={16} />}</span>
        </div>
        <div className="flex flex-1 flex-col gap-1 px-1 pb-1">
          <div className="text-[14px] font-bold leading-[1.3]">{listing.title}</div>
          <div className="text-[12px] text-text-3">{meta}</div>
          <div className="mt-0.5">{pills("xs")}</div>
          <div className="mt-1">{price}</div>
        </div>
      </Link>
    );
  }
  if (variant === "mini") {
    return (
      <Link href={link} onClick={onClick} className={cn("flex w-[172px] flex-none flex-col gap-2 no-underline text-charcoal hover:text-charcoal", className)}>
        <div className="relative h-[124px] w-[172px] overflow-hidden rounded-panel">
          <PhotoSlot src={listing.cover_url} placeholder={listing.title} className="absolute inset-0" />
        </div>
        <div className="text-[13px] font-bold leading-[1.3]">{listing.title}</div>
        <div className="text-[11px] text-text-3">{meta}</div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[14px] font-bold">{formatRate(listing.day_cents)}</span>
            <span className="text-[11px] text-text-3">/day</span>
          </div>
          {listing.availability?.kind === "available" && <span className="inline-flex items-center gap-[5px] text-[11px] font-semibold text-ok-text"><span className="size-1.5 rounded-full bg-ok" />Available</span>}
          {listing.availability?.kind === "only_left" && <span className="text-[11px] font-semibold text-warn-text">Only {listing.availability.count} left</span>}
        </div>
      </Link>
    );
  }
  if (variant === "compact") {
    return (
      <Link href={link} onClick={onClick} className={cn("flex w-[320px] flex-none gap-3 rounded-card bg-white p-2.5 shadow-[0_12px_32px_rgba(0,0,0,.18)] no-underline text-charcoal hover:text-charcoal", !selected && "opacity-90", className)}>
        <div className="relative size-[92px] flex-none overflow-hidden rounded-control">
          <PhotoSlot src={listing.cover_url} placeholder={listing.title} className="absolute inset-0" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="text-[14px] font-bold leading-[1.3] line-clamp-2">{listing.title}</div>
          <div className="text-[11px] text-text-3 truncate-1">{[listing.provider_short ?? listing.provider_name.split(" ")[0], listing.rating != null ? `★ ${Number(listing.rating).toFixed(1)}` : null, listing.distance_km != null ? formatKm(listing.distance_km) : null, listing.delivery_from_cents != null ? `Delivery ${formatRate(listing.delivery_from_cents)}` : null].filter(Boolean).join(" · ")}</div>
          {price}
        </div>
      </Link>
    );
  }
  // row (mobile results, default)
  return (
    <Link href={link} onClick={onClick} className={cn("card flex gap-3 rounded-card-sm p-2.5 no-underline text-charcoal hover:text-charcoal", selected && "border-cobalt border-2 p-[9px]", className)}>
      <div className="relative h-[118px] w-[108px] flex-none overflow-hidden rounded-control">
        <PhotoSlot src={listing.cover_url} placeholder={listing.title} className="absolute inset-0" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[14px] font-bold leading-[1.3] tracking-[-0.01em]">{listing.title}</div>
          {heart}
        </div>
        <div className="text-[11px] text-text-3">{meta}</div>
        {pills("xs")}
        {price}
      </div>
    </Link>
  );
}

/** Recently viewed row (M01). */
export function ListingRow({ listing, className }: { listing: Pick<ListingCardData, "slug" | "title" | "day_cents" | "provider_name" | "cover_url">; className?: string }) {
  return (
    <Link href={`/listings/${listing.slug}`} className={cn("card flex items-center gap-3 rounded-panel py-2 pl-2 pr-3 no-underline text-charcoal hover:text-charcoal", className)}>
      <div className="relative size-12 flex-none overflow-hidden rounded-[8px]">
        <PhotoSlot src={listing.cover_url} placeholder="" className="absolute inset-0" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate-1">{listing.title}</div>
        <div className="text-[11px] text-text-3 truncate-1">
          {formatRate(listing.day_cents)}/day · {listing.provider_name}
        </div>
      </div>
      <Icon name="chevron-right" size={16} className="text-placeholder" />
    </Link>
  );
}
