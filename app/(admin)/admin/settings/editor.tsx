"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { MarketplaceConfig, CancellationPolicy } from "@/lib/settings/schema";
import { Button } from "@/components/ui/button";
import { Input, Select, CapsLabel, Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/controls";
import { Pill } from "@/components/ui/pill";
import { DialogRoot, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatMoney } from "@/lib/format";
import { diffConfigs } from "@/lib/settings/diff";
import { discardSettingsDraft, publishSettingsDraft, rollbackSettings, saveSettingsDraft } from "@/app/(admin)/actions";

interface PreviewRow { label: string; live_cents: number; draft_cents: number; changed: boolean }
interface Props {
  live: MarketplaceConfig;
  liveMeta: { version: number; published_at: string | null; published_by: string | null };
  draft: MarketplaceConfig | null;
  draftMeta: { version: number; changes: Array<{ path: string; label?: string; from: unknown; to: unknown; note?: string }> } | null;
  history: Array<{ version: number; status: string; summary: string | null; published_at: string | null; by: string | null }>;
  policyUse: Record<string, number>;
  categoryUse: Array<{ parent_slug: string; slug: string; n: number }>;
  preview: { rows: PreviewRow[]; renter_pays: { live: number; draft: number; changed: boolean }; provider_payout: { live: number; draft: number; changed: boolean }; hold: { live: number; draft: number; changed: boolean }; sample: string } | null;
  canEdit: boolean;
  tz: string;
}

const SECTIONS = ["Fees & tax", "Holds & waiver", "Cancellation policies", "Payouts", "Categories & review rules", "Verification & trust", "Market", "Change history"];
const pct = (n: number) => `${n}`;

export function SettingsEditor({ live, liveMeta, draft, draftMeta, history, policyUse, categoryUse, preview, canEdit, tz }: Props) {
  const [cfg, setCfg] = useState<MarketplaceConfig>(draft ?? live);
  const [publishOpen, setPublishOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [notifyDays, setNotifyDays] = useState(7);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const localChanges = diffConfigs(draft ?? live, cfg);
  const draftChanges = diffConfigs(live, cfg);
  const dirty = localChanges.length > 0;
  const set = <K extends keyof MarketplaceConfig>(k: K, patch: Partial<MarketplaceConfig[K]>) => setCfg((c) => ({ ...c, [k]: { ...c[k], ...patch } }));
  const save = () => start(async () => { const r = await saveSettingsDraft(cfg); toast({ title: r.ok ? `Draft v${r.data.version} saved · ${r.data.changes} ${r.data.changes === 1 ? "change" : "changes"}` : r.error, tone: r.ok ? "ok" : "error" }); router.refresh(); });
  const discard = () => start(async () => { const r = await discardSettingsDraft(); toast({ title: r.ok ? "Draft discarded" : r.error, tone: r.ok ? "ok" : "error" }); setCfg(live); router.refresh(); });
  const publish = () => start(async () => { const r = await publishSettingsDraft(summary, notifyDays); toast({ title: r.ok ? `v${r.data.version} is live` : r.error, description: r.ok ? "Applies to bookings created from now on; existing bookings keep their terms." : undefined, tone: r.ok ? "ok" : "error" }); setPublishOpen(false); router.refresh(); });
  const draftVersion = draftMeta?.version ?? liveMeta.version + 1;
  const fmtVal = (path: string, v: unknown) => (typeof v === "number" && path.endsWith("_cents") ? formatMoney(v, { whole: v % 100 === 0 }) : typeof v === "number" && path.endsWith("_pct") ? `${v}%` : typeof v === "boolean" ? (v ? "on" : "off") : String(v));
  const wasLabel = (path: string) => { const c = draftChanges.find((x) => x.path === path); return c ? <span className="ml-1.5 rounded-[4px] bg-warn-bg px-1.5 py-0.5 text-[10px] font-bold text-warn-text">was {fmtVal(path, c.from)}</span> : null; };
  const money = (cents: number) => String(cents / 100);
  const toCents = (s: string) => Math.round(Number(s || 0) * 100);

  return (
    <div className="flex flex-col">
      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-paper px-4 py-3 md:px-6 lg:px-7">
        <div className="flex items-center gap-3">
          <div className="text-[15px] font-bold">{draftChanges.length ? `${draftChanges.length} unsaved ${draftChanges.length === 1 ? "change" : "changes"}` : "No draft changes"}</div>
          <div className="text-[12px] text-text-3">Live config v{liveMeta.version}{liveMeta.published_at ? ` · published ${formatDate(new Date(liveMeta.published_at), tz)}` : ""}{liveMeta.published_by ? ` by ${liveMeta.published_by.split(" ")[0]} ${liveMeta.published_by.split(" ")[1]?.[0] ?? ""}.` : ""}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="md" variant="secondary" onClick={discard} disabled={!canEdit || (!draftMeta && !dirty)} loading={pending}>Discard</Button>
          {dirty && <Button size="md" variant="secondary" onClick={save} disabled={!canEdit} loading={pending} data-testid="save-draft">Save draft</Button>}
          <Button size="md" onClick={() => setPublishOpen(true)} disabled={!canEdit || !draftMeta || dirty} loading={pending} data-testid="review-publish">Review &amp; publish v{draftVersion}</Button>
        </div>
      </div>

      <div className="grid gap-6 px-4 py-5 md:px-6 lg:grid-cols-[190px_minmax(0,1fr)_340px] lg:px-7">
        <nav className="hidden lg:block sticky top-[130px] self-start text-[13px]" aria-label="Sections">
          {SECTIONS.map((s) => <a key={s} href={`#${s.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="block rounded-[8px] px-2.5 py-1.5 font-semibold text-text-2 no-underline hover:bg-ivory hover:text-charcoal">{s}</a>)}
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <Section id="fees-tax" title="Fees & tax" hint="applies to bookings created after publishing · existing bookings keep their terms">
            <div className="grid gap-3 md:grid-cols-3">
              <Num label={<>Renter service fee{wasLabel("fees.renter_fee_pct")}</>} unit="%" value={pct(cfg.fees.renter_fee_pct)} onChange={(v) => set("fees", { renter_fee_pct: Number(v) })} hint="of rental charge only · shown as its own line" disabled={!canEdit} />
              <Num label="Provider commission" unit="%" value={pct(cfg.fees.provider_commission_pct)} onChange={(v) => set("fees", { provider_commission_pct: Number(v) })} hint="of rental + extras · never on delivery or claims" disabled={!canEdit} />
              <Num label={`${cfg.tax.label}`} unit="%" value={pct(cfg.tax.sales_tax_pct)} onChange={(v) => set("tax", { sales_tax_pct: Number(v) })} hint="on rental, fees, delivery and extras · remitted by fab.rent" disabled={!canEdit} />
              <Num label="Minimum renter fee" unit="$" value={money(cfg.fees.renter_fee_min_cents)} onChange={(v) => set("fees", { renter_fee_min_cents: toCents(v) })} disabled={!canEdit} />
              <Num label="Renter fee cap" unit="$" value={money(cfg.fees.renter_fee_cap_cents)} onChange={(v) => set("fees", { renter_fee_cap_cents: toCents(v) })} disabled={!canEdit} />
              <div className="flex flex-col gap-1.5"><CapsLabel>Commission tiers</CapsLabel><div className="flex h-11 items-center rounded-control border border-border bg-ivory px-3.5 text-[13px] text-text-2">{cfg.fees.commission_tiers ? `${cfg.fees.commission_tiers.length} tiers` : `Off · flat ${cfg.fees.provider_commission_pct}%`}</div></div>
            </div>
            <Toggle label="Show all-in total in search results" sub="Cards show rental × days plus fees and tax for the searched dates, not just the day rate" checked={cfg.fees.show_all_in_totals} onChange={(v) => set("fees", { show_all_in_totals: v })} disabled={!canEdit} />
          </Section>

          <Section id="holds-waiver" title="Holds & damage waiver" hint="holds are card authorizations, never charges, until a claim is upheld">
            <div className="grid gap-3 md:grid-cols-3">
              <Static label="Hold placed" value="At handoff · after condition record" />
              <Num label="Auto-release after return" unit="business days" value={String(cfg.holds.auto_release_business_days)} onChange={(v) => set("holds", { auto_release_business_days: Number(v) })} disabled={!canEdit} />
              <Num label={<>Max hold · providers can&apos;t exceed{wasLabel("holds.max_hold_cents")}</>} unit="$" value={money(cfg.holds.max_hold_cents)} onChange={(v) => set("holds", { max_hold_cents: toCents(v) })} disabled={!canEdit} />
              <Static label="Provider claim window" value="At return check-in only" />
              <Num label="Renter response window" unit="hours" value={String(cfg.holds.renter_response_hours)} onChange={(v) => set("holds", { renter_response_hours: Number(v) })} disabled={!canEdit} />
              <Num label="Admin decision SLA" unit="hours" value={String(cfg.holds.admin_decision_sla_hours)} onChange={(v) => set("holds", { admin_decision_sla_hours: Number(v) })} disabled={!canEdit} />
              <Num label="Wear allowance" unit="%" value={pct(cfg.holds.wear_allowance_pct)} onChange={(v) => set("holds", { wear_allowance_pct: Number(v) })} hint={`on tools older than ${cfg.holds.wear_allowance_min_age_years} years`} disabled={!canEdit} />
              <Num label="Hold expiry" unit="days" value={String(cfg.holds.hold_expiry_days)} onChange={(v) => set("holds", { hold_expiry_days: Number(v) })} hint="card authorisations lapse; admin view offers extend" disabled={!canEdit} />
              <Num label="Appeal window" unit="days" value={String(cfg.holds.appeal_days)} onChange={(v) => set("holds", { appeal_days: Number(v) })} disabled={!canEdit} />
            </div>
            <div className="rounded-panel border border-border bg-white p-3.5">
              <div className="flex items-center justify-between"><div className="text-[13px] font-bold">Damage waiver · fab.rent-backed</div><Switch size="sm" checked={cfg.waiver.enabled} onCheckedChange={(v) => set("waiver", { enabled: v })} disabled={!canEdit} aria-label="Waiver enabled" /></div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <Num label="Price" unit="% /day" value={pct(cfg.waiver.price_pct_per_day)} onChange={(v) => set("waiver", { price_pct_per_day: Number(v) })} hint={`min ${formatMoney(cfg.waiver.min_cents_per_day, { whole: true })}`} disabled={!canEdit} />
                <Num label="Minimum per day" unit="$" value={money(cfg.waiver.min_cents_per_day)} onChange={(v) => set("waiver", { min_cents_per_day: toCents(v) })} disabled={!canEdit} />
                <Num label="Covers up to" unit="$" value={money(cfg.waiver.covers_up_to_cents)} onChange={(v) => set("waiver", { covers_up_to_cents: toCents(v) })} disabled={!canEdit} />
                <Static label="Hold with waiver" value={`Provider sets · ≤ ${Math.round(cfg.waiver.hold_with_waiver_max_fraction * 100)}% of hold`} />
              </div>
              <div className="mt-2 text-[12px] text-text-3">Excludes {cfg.waiver.excludes.join(", ").toLowerCase()}.</div>
            </div>
          </Section>

          <Section id="cancellation-policies" title="Cancellation policies">
            <PoliciesTable policies={cfg.cancellation.policies} use={policyUse} onChange={(p) => set("cancellation", { policies: p })} canEdit={canEdit} />
            <p className="text-[12px] text-text-3">Service fee and tax on the refunded portion are always returned. Holds are never placed before handoff, so a cancelled booking never has held money.</p>
          </Section>

          <Section id="payouts" title="Payouts">
            <div className="grid gap-3 md:grid-cols-4">
              <Static label="Funds clear" value={cfg.payouts.clears_at === "return_checkin" ? "At return check-in" : "At handoff"} />
              <Static label="Schedules offered" value={cfg.payouts.schedules.map((s) => s.replace("weekly_", "Weekly · ").replace("monthly_1", "Monthly")).join(", ")} />
              <Num label="Minimum payout" unit="$" value={money(cfg.payouts.min_payout_cents)} onChange={(v) => set("payouts", { min_payout_cents: toCents(v) })} disabled={!canEdit} />
              <Static label="Pause payouts when" value={cfg.payouts.pause_when.map((p) => p.replace("_", " ")).join(" or ")} />
            </div>
          </Section>

          <Section id="categories-review-rules" title="Categories & review rules">
            <div className="overflow-x-auto rounded-panel border border-border">
              <div className="grid min-w-[720px] grid-cols-[minmax(0,1.4fr)_170px_120px_minmax(0,1.6fr)_70px] gap-3 border-b border-border bg-paper px-3 py-2 t-label text-text-3"><span>Category</span><span>New listings</span><span>Price alert</span><span>Required documents</span><span className="text-right">Listings</span></div>
              {cfg.review.category_rules.map((r, i) => {
                const n = categoryUse.filter((c) => c.parent_slug === r.category_slug || c.slug === r.category_slug).reduce((s, c) => s + c.n, 0);
                return (
                  <div key={r.category_slug} className="grid min-w-[720px] grid-cols-[minmax(0,1.4fr)_170px_120px_minmax(0,1.6fr)_70px] items-center gap-3 border-b border-border px-3 py-2 text-[13px] last:border-b-0">
                    <span className="truncate-1 font-semibold capitalize">{r.category_slug.replace(/-/g, " ")}</span>
                    <Select compact value={r.review_mode} disabled={!canEdit} aria-label={`${r.category_slug} review mode`} onChange={(e) => set("review", { category_rules: cfg.review.category_rules.map((x, j) => (j === i ? { ...x, review_mode: e.target.value as typeof x.review_mode } : x)) })}><option value="auto_publish_verified">Auto-publish · verified</option><option value="manual">Manual review</option></Select>
                    <div className="flex items-center gap-1 text-[12px]">±<Input compact value={String(r.price_alert_pct)} disabled={!canEdit} aria-label="Price alert %" className="!w-14" onChange={(e) => set("review", { category_rules: cfg.review.category_rules.map((x, j) => (j === i ? { ...x, price_alert_pct: Number(e.target.value || 0) } : x)) })} />%</div>
                    <span className="truncate-1 text-text-2">{r.required_documents.length ? r.required_documents.map((d) => `${d.label}${d.max_age_months ? ` ≤ ${d.max_age_months} mo` : ""}`).join(" · ") : "None"}{r.renter_requirements?.length ? ` · ${r.renter_requirements.join(", ")} from renter` : ""}</span>
                    <span className="t-mono text-right text-text-2">{n}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 text-[13px]"><span>Always review listings from providers with fewer than</span><Input compact value={String(cfg.review.always_review_below_completed)} disabled={!canEdit} aria-label="Always review below" className="!w-16" onChange={(e) => set("review", { always_review_below_completed: Number(e.target.value || 0) })} /><span>completed rentals · regardless of category auto-publish setting</span></div>
          </Section>

          <Section id="verification-trust" title="Verification & trust">
            <Toggle label="Photo ID before first booking" sub="Renters verify at checkout, never while browsing" checked={cfg.verification.photo_id_before_first_booking} onChange={(v) => set("verification", { photo_id_before_first_booking: v })} disabled={!canEdit} />
            <div className="grid gap-3 md:grid-cols-3">
              <Static label="Instant book eligibility" value={`${cfg.verification.instant_book.require_id ? "Verified ID and " : ""}★ ${cfg.verification.instant_book.min_rating}+ or ≥ ${cfg.verification.instant_book.or_min_completed} completed rentals`} />
              <Num label="Condition photos at handoff & return" unit="minimum" value={String(cfg.verification.condition_photos_min)} onChange={(v) => set("verification", { condition_photos_min: Number(v) })} hint="timestamped · both parties sign" disabled={!canEdit} />
              <Num label="Reviews auto-publish after" unit="days" value={String(cfg.verification.review_auto_publish_days)} onChange={(v) => set("verification", { review_auto_publish_days: Number(v) })} disabled={!canEdit} />
            </div>
            <Toggle label="Auto-suspend on chargeback" sub="Pending review · admin notified within 1 h" checked={cfg.verification.auto_suspend_on_chargeback} onChange={(v) => set("verification", { auto_suspend_on_chargeback: v })} disabled={!canEdit} />
          </Section>

          <Section id="market" title={`Market · ${cfg.market.name}`}>
            <div className="grid gap-3 md:grid-cols-4">
              <Static label="Currency" value={`${cfg.market.currency.name} · ${cfg.market.currency.symbol} · ${cfg.market.currency.code}`} />
              <Num label="Default search radius" unit="km" value={String(cfg.market.default_radius_km)} onChange={(v) => set("market", { default_radius_km: Number(v) })} disabled={!canEdit} />
              <Num label={<>Max delivery radius{wasLabel("market.max_delivery_radius_km")}</>} unit="km" value={String(cfg.market.max_delivery_radius_km)} onChange={(v) => set("market", { max_delivery_radius_km: Number(v) })} disabled={!canEdit} />
              <Static label="Time zone · week start" value={`${cfg.market.timezone_label} · ${cfg.market.week_starts === "monday" ? "Monday" : "Sunday"}`} />
            </div>
            <div className="text-[12px] text-text-3">Neighbourhoods: {cfg.market.neighbourhoods.map((n) => n.name).join(" · ")}. Boundaries are edited in the seed for the pilot.</div>
          </Section>

          <Section id="change-history" title={`Change history · ${history.length}`}>
            <div className="flex flex-col divide-y divide-border">
              {history.map((h) => (
                <div key={h.version} className="flex items-center gap-3 py-2 text-[13px]">
                  <span className="t-mono w-10 font-medium">v{h.version}</span>
                  <Pill tone={h.status === "live" ? "ok" : "neutral"} size="xs" dot={h.status === "live"}>{h.status}</Pill>
                  <span className="min-w-0 flex-1 truncate-1">{h.summary ?? "—"}</span>
                  <span className="text-[12px] text-text-3">{h.published_at ? formatDate(new Date(h.published_at), tz) : ""}{h.by ? ` · ${h.by.split(" ")[0]} ${h.by.split(" ")[1]?.[0] ?? ""}.` : ""}</span>
                  {h.status === "archived" && canEdit && <Button size="sm" variant="ghost" loading={pending} onClick={() => start(async () => { const r = await rollbackSettings(h.version); toast({ title: r.ok ? `Rolled back to v${h.version}` : r.error, tone: r.ok ? "ok" : "error" }); router.refresh(); })}>Restore</Button>}
                </div>
              ))}
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[130px] lg:self-start">
          {preview && (
            <div className="card overflow-hidden">
              <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5"><div className="text-[13px] font-bold">Preview on a sample booking</div><span className="t-mono text-[11px] text-text-3">v{liveMeta.version} → v{draftVersion}</span></div>
              <div className="px-4 pt-3 text-[12px] text-text-2">{preview.sample}</div>
              <div className="px-4 pb-4 pt-2 text-[12px]">
                <div className="grid grid-cols-[minmax(0,1fr)_76px_76px] gap-2 py-1 t-label text-text-3"><span>Line</span><span className="text-right">Live</span><span className="text-right">Draft</span></div>
                {preview.rows.map((r) => <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_76px_76px] gap-2 border-t border-border py-1.5"><span>{r.label}</span><span className="t-mono text-right">{formatMoney(r.live_cents)}</span><span className={cn("t-mono text-right", r.changed && "font-bold text-cobalt")}>{r.changed ? formatMoney(r.draft_cents) : "—"}</span></div>)}
                <div className="grid grid-cols-[minmax(0,1fr)_76px_76px] gap-2 border-t-2 border-charcoal py-1.5 font-bold"><span>Renter pays</span><span className="t-mono text-right">{formatMoney(preview.renter_pays.live)}</span><span className={cn("t-mono text-right", preview.renter_pays.changed && "text-cobalt")}>{preview.renter_pays.changed ? formatMoney(preview.renter_pays.draft) : "—"}</span></div>
                <div className="grid grid-cols-[minmax(0,1fr)_152px] gap-2 border-t border-border py-1.5"><span>Provider payout</span><span className="t-mono text-right">{formatMoney(preview.provider_payout.live)}{preview.provider_payout.changed ? ` → ${formatMoney(preview.provider_payout.draft)}` : " · unchanged"}</span></div>
                <div className="grid grid-cols-[minmax(0,1fr)_152px] gap-2 border-t border-border py-1.5"><span>Held at handoff</span><span className="t-mono text-right">{formatMoney(preview.hold.live, { whole: true })}{preview.hold.changed ? ` → ${formatMoney(preview.hold.draft, { whole: true })}` : " · unchanged"}</span></div>
              </div>
            </div>
          )}
          <div className="card p-4">
            <div className="text-[13px] font-bold">Draft v{draftVersion} · {draftChanges.length} {draftChanges.length === 1 ? "change" : "changes"}</div>
            <ul className="mt-2 flex flex-col gap-2 text-[12px]">
              {draftChanges.map((c) => { const note = draftMeta?.changes.find((x) => x.path === c.path)?.note; return <li key={c.path}><b>{c.label}</b> {fmtVal(c.path, c.from)} → {fmtVal(c.path, c.to)}{note ? <div className="text-text-3">{note}</div> : null}</li>; })}
              {draftChanges.length === 0 && <li className="text-text-3">Edit a value to start a draft.</li>}
            </ul>
          </div>
          <div className="card p-4 text-[12px] text-text-3">
            <div className="text-[13px] font-bold text-charcoal">Publish</div>
            <div className="mt-2 flex gap-2"><button type="button" onClick={() => setWhen("now")} className={cn("flex-1 rounded-[8px] border px-3 py-1.5 font-semibold", when === "now" ? "border-cobalt bg-cobalt-wash text-charcoal" : "border-border bg-white")}>Now</button><button type="button" onClick={() => setWhen("schedule")} className={cn("flex-1 rounded-[8px] border px-3 py-1.5 font-semibold", when === "schedule" ? "border-cobalt bg-cobalt-wash text-charcoal" : "border-border bg-white")}>Schedule</button></div>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={notifyDays > 0} onChange={(e) => setNotifyDays(e.target.checked ? 7 : 0)} className="accent-cobalt" />Notify providers {notifyDays || 7} days before a fee change takes effect</label>
            <p className="mt-2">Publishing normally requires a second admin&apos;s approval; the pilot lets one admin publish and keeps rollback to v{liveMeta.version} one click away.</p>
          </div>
        </aside>
      </div>

      <DialogRoot open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent title={`Review & publish v${draftVersion}`} size="sm" description={`${draftChanges.length} ${draftChanges.length === 1 ? "change" : "changes"} vs live v${liveMeta.version}. Existing bookings keep their terms.`} footer={<><Button size="md" variant="secondary" onClick={() => setPublishOpen(false)}>Back</Button><Button size="md" onClick={publish} loading={pending} data-testid="confirm-publish">{when === "now" ? "Publish now" : "Schedule"}</Button></>}>
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1 text-[13px]">{draftChanges.map((c) => <li key={c.path}>· <b>{c.label}</b> {fmtVal(c.path, c.from)} → {fmtVal(c.path, c.to)}</li>)}</ul>
            <Field label="Change summary" id="pub-summary"><Input id="pub-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Shown in change history" /></Field>
          </div>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return <section id={id} className="card flex flex-col gap-3.5 p-5 scroll-mt-[140px]"><div className="flex flex-wrap items-baseline gap-2"><h2 className="text-[15px] font-bold">{title}</h2>{hint && <span className="text-[12px] text-text-3">{hint}</span>}</div>{children}</section>;
}
function Num({ label, unit, value, onChange, hint, disabled }: { label: ReactNode; unit: string; value: string; onChange: (v: string) => void; hint?: string; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <CapsLabel>{label}</CapsLabel>
      <div className="flex items-center gap-1.5">{unit === "$" && <span className="text-[13px] text-text-3">$</span>}<Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" disabled={disabled} className="!w-24" aria-label={typeof label === "string" ? label : undefined} />{unit !== "$" && <span className="text-[12px] text-text-3">{unit}</span>}</div>
      {hint && <div className="text-[11px] text-text-3">{hint}</div>}
    </div>
  );
}
function Static({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col gap-1.5"><CapsLabel>{label}</CapsLabel><div className="flex min-h-11 items-center rounded-control border border-border bg-ivory px-3.5 text-[13px] text-text-2">{value}</div></div>;
}
function Toggle({ label, sub, checked, onChange, disabled }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-start justify-between gap-4 rounded-panel border border-border bg-white px-3.5 py-3"><span><span className="block text-[13px] font-semibold">{label}</span><span className="block text-[12px] text-text-3">{sub}</span></span><Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} /></label>;
}

function PoliciesTable({ policies, use, onChange, canEdit }: { policies: CancellationPolicy[]; use: Record<string, number>; onChange: (p: CancellationPolicy[]) => void; canEdit: boolean }) {
  const [editing, setEditing] = useState<CancellationPolicy | null>(null);
  const describeTiers = (p: CancellationPolicy) => p.tiers.map((t) => `${t.keep_pct}%${t.within_hours != null ? ` inside ${t.within_hours >= 48 ? `${t.within_hours / 24} d` : `${t.within_hours} h`}` : ""}`).join(" · ");
  const credit = (p: CancellationPolicy) => (p.provider_cancel_credit_cents ? `Full refund + ${formatMoney(p.provider_cancel_credit_cents, { whole: true })} credit` : p.provider_cancel_credit_pct ? `Full refund + ${p.provider_cancel_credit_pct}% credit` : "Full refund");
  return (
    <>
      <div className="overflow-x-auto rounded-panel border border-border">
        <div className="grid min-w-[680px] grid-cols-[minmax(0,1.2fr)_130px_minmax(0,1.4fr)_minmax(0,1.3fr)_110px_60px] gap-3 border-b border-border bg-paper px-3 py-2 t-label text-text-3"><span>Policy</span><span>Free until</span><span>Then renter pays</span><span>Provider cancels</span><span className="text-right">Listings using</span><span /></div>
        {policies.map((p) => (
          <div key={p.id} className="grid min-w-[680px] grid-cols-[minmax(0,1.2fr)_130px_minmax(0,1.4fr)_minmax(0,1.3fr)_110px_60px] items-center gap-3 border-b border-border px-3 py-2 text-[13px] last:border-b-0">
            <span className="font-semibold">{p.name}{p.is_default && <span className="ml-1.5 text-[11px] font-semibold text-text-3">default</span>}</span>
            <span className="text-text-2">{p.free_until_hours >= 48 ? `${p.free_until_hours / 24} days` : `${p.free_until_hours} h`} before start</span>
            <span className="truncate-1 text-text-2">{describeTiers(p)} of rental charge</span>
            <span className="truncate-1 text-text-2">{credit(p)}</span>
            <span className="t-mono text-right text-text-2">{use[p.id] ?? 0}</span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(p)} disabled={!canEdit}>Edit</Button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="secondary" className="self-start" disabled={!canEdit} onClick={() => setEditing({ id: `policy-${Date.now().toString(36)}`, name: "New policy", free_until_hours: 24, tiers: [{ within_hours: null, keep_pct: 50 }], provider_cancel_credit_cents: 2000, provider_cancel_credit_pct: null, is_default: false })}>Add policy</Button>
      <DialogRoot open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.name} size="sm" footer={<><Button size="md" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="md" onClick={() => { onChange(policies.some((p) => p.id === editing.id) ? policies.map((p) => (p.id === editing.id ? editing : p)) : [...policies, editing]); setEditing(null); }}>Apply</Button></>}>
            <div className="flex flex-col gap-3">
              <Field label="Name" id="pol-name"><Input id="pol-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Free until (hours before start)" id="pol-free"><Input id="pol-free" value={String(editing.free_until_hours)} inputMode="numeric" onChange={(e) => setEditing({ ...editing, free_until_hours: Number(e.target.value || 0) })} /></Field>
              <Field label="Kept after the free window (% of rental)" id="pol-keep"><Input id="pol-keep" value={String(editing.tiers[0]?.keep_pct ?? 50)} inputMode="numeric" onChange={(e) => setEditing({ ...editing, tiers: [{ ...editing.tiers[0]!, keep_pct: Number(e.target.value || 0) }, ...editing.tiers.slice(1)] })} /></Field>
              <Field label="Provider cancellation credit ($)" id="pol-credit"><Input id="pol-credit" value={String((editing.provider_cancel_credit_cents ?? 0) / 100)} inputMode="decimal" onChange={(e) => setEditing({ ...editing, provider_cancel_credit_cents: Math.round(Number(e.target.value || 0) * 100), provider_cancel_credit_pct: null })} /></Field>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} className="accent-cobalt" />Default for new listings</label>
            </div>
          </DialogContent>
        )}
      </DialogRoot>
    </>
  );
}
