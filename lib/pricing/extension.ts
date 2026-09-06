import type { MarketplaceConfig } from "@/lib/settings/schema";
import { formatRate } from "@/lib/format";
import { renterServiceFee, salesTax } from "./quote";
import type { QuoteLine } from "./types";

export interface ExtensionQuote {
  extra_days: number;
  rental_cents: number;
  service_fee_cents: number;
  tax_cents: number;
  charged_cents: number;
  lines: QuoteLine[];
}

/** extra days × day rate + service fee + tax. Charged only when the provider approves; hold unchanged. */
export function quoteExtension(extraDays: number, dayCents: number, qty: number, config: MarketplaceConfig): ExtensionQuote {
  const days = Math.max(1, Math.floor(extraDays));
  const rental_cents = dayCents * days * Math.max(1, qty);
  const service_fee_cents = renterServiceFee(rental_cents, config);
  const tax_cents = salesTax(rental_cents + service_fee_cents, config);
  return {
    extra_days: days,
    rental_cents,
    service_fee_cents,
    tax_cents,
    charged_cents: rental_cents + service_fee_cents + tax_cents,
    lines: [
      { kind: "rental", label: `${formatRate(dayCents)} × ${days} extra ${days === 1 ? "day" : "days"}${qty > 1 ? ` × ${qty}` : ""}`, cents: rental_cents },
      { kind: "service_fee", label: `Service fee (${config.fees.renter_fee_pct}%)`, cents: service_fee_cents },
      { kind: "tax", label: `Sales tax ${config.tax.sales_tax_pct}%`, cents: tax_cents },
    ],
  };
}
