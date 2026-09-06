"use server";
import { withActor } from "@/lib/auth";
import { getAvailability } from "@/lib/queries/listings";
import { getLiveConfig } from "@/lib/settings/live";
import { marketLocal } from "@/lib/time";

/** Live unit availability for a span (booking builder quantity cap, extension check). */
export async function checkAvailability(listingId: string, fromIso: string, toIso: string): Promise<number> {
  const config = await getLiveConfig();
  const tz = config.market.timezone;
  const from = marketLocal(fromIso, tz);
  const to = marketLocal(toIso, tz);
  if (!(to > from)) return 0;
  return withActor((trx) => getAvailability(trx, listingId, from, to));
}
