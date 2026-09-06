"use server";
import { withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { parseSearchParams, type RawParams } from "@/lib/search/params";
import { searchListings } from "@/lib/queries/listings";

/** Live result count for the filters sheet ("Show 18 items"). */
export async function countSearch(query: string): Promise<number> {
  const config = await getLiveConfig();
  const raw: RawParams = Object.fromEntries(new URLSearchParams(query).entries());
  const state = parseSearchParams(raw, config, now());
  const r = await withActor((trx) => searchListings(trx, { ...state, types: state.types, provider: state.provider, min: state.min ?? undefined, max: state.max ?? undefined, rating: state.rating ?? undefined, category: state.category ?? undefined, limit: 500 }, config));
  return r.items.length;
}
