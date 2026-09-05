import "server-only";
import { cache } from "react";
import { runAsSystem } from "@/lib/db";
import { setMarketTz } from "@/lib/time";
import { marketplaceConfigSchema, type MarketplaceConfig } from "./schema";
import { CONFIG_V41 } from "./defaults";

export interface LiveSettings {
  version: number;
  config: MarketplaceConfig;
  published_at: Date | null;
  published_by_name: string | null;
}

/** The live marketplace config (one per request). Falls back to the built-in v41 if the DB is unreachable. */
export const getLiveSettings = cache(async (): Promise<LiveSettings> => {
  try {
    const row = await runAsSystem((trx) =>
      trx
        .selectFrom("marketplace_settings_versions as v")
        .leftJoin("profiles as p", "p.id", "v.published_by")
        .select(["v.version", "v.config", "v.published_at", "p.name as published_by_name"])
        .where("v.status", "=", "live")
        .executeTakeFirst(),
    );
    if (!row) throw new Error("no live settings");
    const config = marketplaceConfigSchema.parse(row.config);
    setMarketTz(config.market.timezone);
    return { version: row.version, config, published_at: row.published_at, published_by_name: row.published_by_name };
  } catch (e) {
    if (process.env.NODE_ENV !== "test") console.warn("[settings] using built-in config:", (e as Error).message);
    setMarketTz(CONFIG_V41.market.timezone);
    return { version: 41, config: CONFIG_V41, published_at: null, published_by_name: null };
  }
});

export async function getLiveConfig(): Promise<MarketplaceConfig> {
  return (await getLiveSettings()).config;
}

/** Config a booking was created under (its settings_version), falling back to live. */
export async function getConfigForVersion(version: number): Promise<MarketplaceConfig> {
  const live = await getLiveSettings();
  if (live.version === version) return live.config;
  const row = await runAsSystem((trx) => trx.selectFrom("marketplace_settings_versions").select("config").where("version", "=", version).executeTakeFirst());
  if (!row) return live.config;
  const parsed = marketplaceConfigSchema.safeParse(row.config);
  return parsed.success ? parsed.data : live.config;
}
