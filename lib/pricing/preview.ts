import type { MarketplaceConfig } from "@/lib/settings/schema";
import { quoteBooking, type QuoteListing } from "./quote";
import type { Quote, QuoteInput } from "./types";

export interface SettingsPreviewRow {
  label: string;
  live_cents: number;
  draft_cents: number;
  changed: boolean;
}

export interface SettingsPreview {
  live: Quote;
  draft: Quote;
  rows: SettingsPreviewRow[];
  renter_pays: { live: number; draft: number; changed: boolean };
  provider_payout: { live: number; draft: number; changed: boolean };
  hold: { live: number; draft: number; changed: boolean };
}

/** Live vs draft config on the same sample booking, line by line (A05 preview). */
export function previewSettingsChange(listing: QuoteListing, input: QuoteInput, live: MarketplaceConfig, draft: MarketplaceConfig): SettingsPreview {
  const a = quoteBooking(listing, input, live);
  const b = quoteBooking(listing, input, draft);
  const row = (label: string, x: number, y: number): SettingsPreviewRow => ({ label, live_cents: x, draft_cents: y, changed: x !== y });
  return {
    live: a,
    draft: b,
    rows: [
      row("Rental", a.rental_cents, b.rental_cents),
      row("Delivery + extras", a.delivery_cents + a.extras_cents, b.delivery_cents + b.extras_cents),
      row("Renter service fee", a.service_fee_cents, b.service_fee_cents),
      row(`Sales tax ${draft.tax.sales_tax_pct}%`, a.tax_cents, b.tax_cents),
    ],
    renter_pays: { live: a.charged_cents, draft: b.charged_cents, changed: a.charged_cents !== b.charged_cents },
    provider_payout: { live: a.provider.payout_cents, draft: b.provider.payout_cents, changed: a.provider.payout_cents !== b.provider.payout_cents },
    hold: { live: a.hold_cents, draft: b.hold_cents, changed: a.hold_cents !== b.hold_cents },
  };
}
