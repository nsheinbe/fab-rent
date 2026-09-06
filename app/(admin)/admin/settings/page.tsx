import type { Metadata } from "next";
import { requireStaff, withActor } from "@/lib/auth";
import { settingsVersions } from "@/lib/queries/admin";
import { marketplaceConfigSchema } from "@/lib/settings/schema";
import { previewSettingsChange, type QuoteListing } from "@/lib/pricing";
import { marketLocal } from "@/lib/time";
import { SettingsEditor } from "./editor";

export const metadata: Metadata = { title: "Marketplace settings" };

/** A05: the money model in one place — versioned, previewed on the §5 vector-2 booking before publishing. */
export default async function SettingsPage() {
  const actor = await requireStaff();
  const data = await withActor((trx) => settingsVersions(trx));
  if (!data.live) return <div className="p-8 text-[13px] text-text-3">No live settings version.</div>;
  const live = marketplaceConfigSchema.parse(data.live.config);
  const draft = data.draft ? marketplaceConfigSchema.parse(data.draft.config) : null;
  const tz = live.market.timezone;
  // sample: the DeWalt from vector 2 — $58 × 3 days, delivery 4.2 km, blade + waiver
  const sample = await withActor((trx) => trx.selectFrom("listings").select(["id", "title", "day_cents", "weekend_cents", "week_cents", "month_cents", "hold_cents", "hold_with_waiver_cents", "late_fee_cents_per_hour", "late_grace_minutes", "cleaning_fee_cents", "min_days", "max_days", "delivery_enabled", "delivery_base_cents", "delivery_base_km", "delivery_per_km_cents", "delivery_radius_km"]).where("slug", "like", "dewalt-dwe7491%").executeTakeFirst());
  const extras = sample ? await withActor((trx) => trx.selectFrom("listing_extras").selectAll().where("listing_id", "=", sample.id).execute()) : [];
  const listing: QuoteListing | null = sample
    ? { pricing: { day_cents: sample.day_cents, weekend_cents: sample.weekend_cents, week_cents: sample.week_cents, month_cents: sample.month_cents, hold_cents: sample.hold_cents, hold_with_waiver_cents: sample.hold_with_waiver_cents, late_fee_cents_per_hour: sample.late_fee_cents_per_hour, late_grace_minutes: sample.late_grace_minutes, cleaning_fee_cents: sample.cleaning_fee_cents, min_days: sample.min_days, max_days: sample.max_days }, delivery: { enabled: sample.delivery_enabled, base_cents: sample.delivery_base_cents, base_km: Number(sample.delivery_base_km), per_km_cents: sample.delivery_per_km_cents, radius_km: Number(sample.delivery_radius_km) } }
    : null;
  const input = { start: marketLocal("2026-09-11T09:00:00", tz), end: marketLocal("2026-09-13T17:00:00", tz), qty: 1, fulfillment: "delivery" as const, delivery_km: 4.2, extras: extras.filter((e) => /blade|waiver/i.test(e.name)).map((e) => ({ extra: { id: e.id, name: e.name, price_cents: e.price_cents, per: e.per, is_damage_waiver: e.is_damage_waiver, waiver_covers_cents: e.waiver_covers_cents }, qty: 1 })), tz };
  const preview = listing ? previewSettingsChange(listing, input, live, draft ?? live) : null;
  return (
    <SettingsEditor
      live={live}
      liveMeta={{ version: data.live.version, published_at: data.live.published_at?.toISOString() ?? null, published_by: data.live.published_by_name }}
      draft={draft}
      draftMeta={data.draft ? { version: data.draft.version, changes: (data.draft.changes as unknown as Array<{ path: string; label?: string; from: unknown; to: unknown; note?: string }>) ?? [] } : null}
      history={data.versions.filter((v) => v.status !== "draft").map((v) => ({ version: v.version, status: v.status, summary: v.change_summary, published_at: v.published_at?.toISOString() ?? null, by: v.published_by_name }))}
      policyUse={data.policy_use}
      categoryUse={data.category_use}
      preview={preview ? { rows: preview.rows, renter_pays: preview.renter_pays, provider_payout: preview.provider_payout, hold: preview.hold, sample: `${sample!.title.split(" ").slice(0, 2).join(" ")} · $${sample!.day_cents / 100} × 3 days · delivery $${preview.live.delivery_cents / 100} · extras $${preview.live.extras_cents / 100} · hold $${preview.live.hold_cents / 100}${preview.live.waiver_bought ? " (waiver)" : " (no waiver)"}` } : null}
      canEdit={actor.staff.permissions.includes("settings")}
      tz={tz}
    />
  );
}
