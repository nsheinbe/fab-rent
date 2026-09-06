"use client";
/* eslint-disable @next/next/no-img-element -- user uploads come from signed, short-lived URLs that next/image cannot optimise */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, CapsLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/controls";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icons";
import { DialogRoot, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatMoney, formatRate } from "@/lib/format";
import { addBlock, addListingPhoto, deleteBlock, deleteExtra, setListingHidden, submitListing, updateListing, updateListingPhoto, upsertExtra, upsertUnit, type ListingPatch } from "@/app/(provider)/actions";

export interface EditorListing {
  id: string; title: string; slug: string; status: string; description: string; brand: string | null; model: string | null; condition: string | null; age_years: number | null; last_serviced_at: string | null; category_id: string;
  specs: Array<{ label: string; value: string }>; included_accessories: string[]; day_cents: number; weekend_cents: number | null; week_cents: number | null; month_cents: number | null; hold_cents: number; hold_with_waiver_cents: number | null;
  late_fee_cents_per_hour: number; late_grace_minutes: number; cleaning_fee_cents: number; min_days: number; max_days: number; prep_hours: number; same_day_cutoff_minutes: number; instant_book: boolean;
  pickup_enabled: boolean; pickup_address: string | null; pickup_hours_label: string | null; pickup_instructions: string | null; delivery_enabled: boolean; delivery_radius_km: number; delivery_window_hours: number; delivery_base_cents: number; delivery_base_km: number; delivery_per_km_cents: number; delivery_notes: string | null;
  rules: string[]; cancellation_policy_id: string; id_required: boolean; min_renter_age: number;
}
interface Photo { id: string; url: string | null; label: string | null; is_cover: boolean; has_serial_plate: boolean }
interface Extra { id: string; name: string; description: string | null; price_cents: number; per: "day" | "rental"; is_damage_waiver: boolean; waiver_covers_cents: number | null }
interface Unit { id: string; unit_number: number; serial: string; acquired_at: string | null; hours: number | null; next_service_at: string | null; status: string }
interface Block { id: string; unit_id: string | null; unit_number: number | null; start_at: string; end_at: string; reason: string; note: string | null }

interface Props {
  listing: EditorListing;
  photos: Photo[];
  extras: Extra[];
  units: Unit[];
  blocks: Block[];
  category: { name: string; parent_name: string | null; slug: string };
  categories: Array<{ id: string; name: string; parent_name: string | null }>;
  policies: Array<{ id: string; name: string; free_until_hours: number }>;
  waiverCoversCents: number;
  quality: { score: number; items: Array<{ label: string; done: boolean }> };
  upcomingCount: number;
  review: { kind: string; reasons: string[]; decision: string | null; message: string | null; submitted_at: string; decided_at: string | null } | null;
  provider: { name: string; rating: number | null; rating_count: number };
  tz: string;
  /** server clock (DEMO_NOW-aware) for "service due soon" highlighting */
  nowIso: string;
}

const SECTIONS = ["Photos", "Basics", "Specifications", "Units", "Pricing & extras", "Rental period", "Availability blocks", "Pickup & delivery", "Rules & cancellation"];
const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "neutral" | "error" }> = { published: { label: "Published", tone: "ok" }, draft: { label: "Draft", tone: "neutral" }, pending_review: { label: "In review", tone: "warn" }, changes_requested: { label: "Changes requested", tone: "warn" }, rejected: { label: "Rejected", tone: "error" }, hidden: { label: "Hidden", tone: "neutral" } };

const dollars = (cents: number | null | undefined) => (cents == null ? "" : String(Math.round(cents) / 100));
const cents = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 100));

/** P03 listing editor. Field edits collect into one "Save changes"; photos, units, extras and blocks save inline. */
export function ListingEditor({ listing, photos, extras, units, blocks, category, categories, policies, waiverCoversCents, quality, upcomingCount, review, provider, tz, nowIso }: Props) {
  const [form, setForm] = useState<EditorListing>(listing);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const set = <K extends keyof EditorListing>(k: K, v: EditorListing[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(listing);

  const save = () =>
    start(async () => {
      const patch: ListingPatch = {};
      for (const k of Object.keys(form) as Array<keyof EditorListing>) {
        if (k === "id" || k === "slug" || k === "status") continue;
        if (JSON.stringify(form[k]) !== JSON.stringify(listing[k])) (patch as Record<string, unknown>)[k] = form[k];
      }
      const r = await updateListing(listing.id, patch);
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      toast({ title: "Saved", description: r.data.status === "pending_review" ? "This edit goes through review before it shows to renters." : listing.status === "published" ? "Applies to new bookings only." : undefined, tone: "ok" });
      router.refresh();
    });
  const publish = () =>
    start(async () => {
      if (dirty) {
        toast({ title: "Save your changes first", tone: "error" });
        return;
      }
      const r = await submitListing(listing.id);
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      toast({ title: r.data.status === "published" ? "Listing published" : "Sent for review", description: r.data.status === "published" ? "Renters can book it now." : `fab.rent reviews it within 24 h · ${r.data.reasons.join(" · ")}`, tone: "ok" });
      router.refresh();
    });
  const s = STATUS[listing.status] ?? { label: listing.status, tone: "neutral" as const };
  const canPublish = ["draft", "changes_requested", "rejected"].includes(listing.status);

  return (
    <div className="flex flex-col">
      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-paper px-4 py-3 md:px-6 lg:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate-1 text-[17px] font-extrabold tracking-[-0.01em]">{form.title}</h1>
          <Pill tone={s.tone} size="sm" dot={s.tone !== "neutral"}>{s.label}</Pill>
        </div>
        <div className="flex items-center gap-2">
          {["published", "hidden"].includes(listing.status) && <Button size="md" variant="secondary" href={`/listings/${listing.slug}`} leading={<Icon name="eye" size={14} />}>Preview as renter</Button>}
          {["published", "hidden"].includes(listing.status) && <Button size="md" variant="secondary" loading={pending} onClick={() => start(async () => { const r = await setListingHidden(listing.id, listing.status === "published"); toast({ title: r.ok ? (listing.status === "published" ? "Hidden from renters" : "Visible again") : r.error, tone: r.ok ? "ok" : "error" }); router.refresh(); })}>{listing.status === "published" ? "Hide" : "Unhide"}</Button>}
          {canPublish && <Button size="md" variant="secondary" onClick={publish} loading={pending} disabled={dirty} data-testid="publish-listing">{listing.status === "draft" ? "Publish" : "Resubmit"}</Button>}
          <Button size="md" onClick={save} loading={pending} disabled={!dirty} data-testid="save-listing">Save changes</Button>
        </div>
      </div>

      {review && review.decision !== "approve" && listing.status !== "published" && (
        <div className={cn("mx-4 mt-4 rounded-panel px-4 py-3 text-[13px] md:mx-6 lg:mx-7", review.decision === "reject" ? "bg-error-bg text-error-text" : "bg-warn-bg text-warn-text")}>
          <b>{review.decision === "reject" ? "Rejected" : review.decision === "request_changes" ? "Changes requested" : "In review"}</b>{review.reasons.length ? ` · ${review.reasons.join(" · ")}` : ""}{review.message ? ` — “${review.message}”` : ""}
        </div>
      )}

      <div className="grid gap-6 px-4 py-5 md:px-6 lg:grid-cols-[168px_minmax(0,1fr)_300px] lg:px-7">
        <nav className="hidden lg:block sticky top-[130px] self-start text-[13px]" aria-label="Sections">
          {SECTIONS.map((sec) => <a key={sec} href={`#${sec.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="block rounded-[8px] px-2.5 py-1.5 font-semibold text-text-2 no-underline hover:bg-ivory hover:text-charcoal">{sec}</a>)}
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <PhotosSection listingId={listing.id} photos={photos} />

          <Section id="basics" title="Basics">
            <Field label="Title" id="title"><Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={120} /></Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Category" id="category" hint={category.parent_name ? `${category.parent_name} › ${category.name}` : category.name}>
                <Select id="category" value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.parent_name ? `${c.parent_name} › ` : ""}{c.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Brand" id="brand"><Input id="brand" value={form.brand ?? ""} onChange={(e) => set("brand", e.target.value || null)} /></Field>
                <Field label="Model" id="model"><Input id="model" value={form.model ?? ""} onChange={(e) => set("model", e.target.value || null)} /></Field>
              </div>
              <Field label="Condition" id="condition">
                <Select id="condition" value={form.condition ?? ""} onChange={(e) => set("condition", e.target.value || null)}>
                  <option value="">—</option>{["Excellent", "Very good", "Good", "Fair"].map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Last serviced" id="serviced"><Input id="serviced" type="date" value={form.last_serviced_at ?? ""} onChange={(e) => set("last_serviced_at", e.target.value || null)} /></Field>
                <Field label="Age (years)" id="age"><Input id="age" type="number" step="0.5" min={0} value={form.age_years ?? ""} onChange={(e) => set("age_years", e.target.value === "" ? null : Number(e.target.value))} /></Field>
              </div>
            </div>
            <Field label="Description" id="desc" hint={`${form.description.length} chars · renters read this before the specs`}><Textarea id="desc" rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <Field label="Included accessories" hint="checked at handoff and return">
              <ChipList values={form.included_accessories} onChange={(v) => set("included_accessories", v)} placeholder="Add…" />
            </Field>
          </Section>

          <Section id="specifications" title="Specifications">
            <div className="grid gap-2 md:grid-cols-2">
              {form.specs.map((sp, i) => (
                <div key={i} className="flex items-center gap-2 rounded-panel border border-border bg-white px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <input value={sp.label} onChange={(e) => set("specs", form.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="w-full bg-transparent text-[11px] font-semibold text-text-3 outline-none" aria-label="Spec label" />
                    <input value={sp.value} onChange={(e) => set("specs", form.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="w-full bg-transparent text-[13px] font-semibold outline-none" aria-label="Spec value" />
                  </div>
                  <button type="button" onClick={() => set("specs", form.specs.filter((_, j) => j !== i))} aria-label="Remove specification" className="text-text-3 hover:text-charcoal"><Icon name="close" size={14} /></button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={() => set("specs", [...form.specs, { label: "Spec", value: "" }])} leading={<Icon name="plus" size={12} />}>Add specification</Button>
          </Section>

          <UnitsSection listingId={listing.id} units={units} tz={tz} soonMs={new Date(nowIso).getTime() + 7 * 86_400_000} />

          <Section id="pricing-extras" title="Pricing & extras" hint="changes apply to new bookings only">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Money label="Per day" value={form.day_cents} onChange={(v) => set("day_cents", v ?? 0)} />
              <Money label="Weekend · Fri–Mon" value={form.weekend_cents} onChange={(v) => set("weekend_cents", v)} />
              <Money label="Per week · from 5 days" value={form.week_cents} onChange={(v) => set("week_cents", v)} />
              <Money label="Per month" value={form.month_cents} onChange={(v) => set("month_cents", v)} />
              <Money label="Hold at handoff" value={form.hold_cents} onChange={(v) => set("hold_cents", v ?? 0)} />
              <Money label="Hold with damage waiver" value={form.hold_with_waiver_cents} onChange={(v) => set("hold_with_waiver_cents", v)} />
              <div className="flex flex-col gap-1.5"><CapsLabel>Late fee · grace</CapsLabel><div className="flex items-center gap-1.5"><Input value={dollars(form.late_fee_cents_per_hour)} onChange={(e) => set("late_fee_cents_per_hour", cents(e.target.value) ?? 0)} inputMode="decimal" aria-label="Late fee per hour" /><span className="text-[12px] text-text-3">/h</span><Input value={String(form.late_grace_minutes / 60)} onChange={(e) => set("late_grace_minutes", Math.round(Number(e.target.value || 0) * 60))} inputMode="decimal" aria-label="Grace hours" className="!w-16" /><span className="text-[12px] text-text-3">h</span></div></div>
              <Money label="Cleaning fee" value={form.cleaning_fee_cents} onChange={(v) => set("cleaning_fee_cents", v ?? 0)} />
            </div>
            <ExtrasSection listingId={listing.id} extras={extras} waiverCoversCents={waiverCoversCents} />
          </Section>

          <Section id="rental-period" title="Rental period & preparation">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="Minimum (days)" id="min"><Input id="min" type="number" min={1} value={form.min_days} onChange={(e) => set("min_days", Number(e.target.value || 1))} /></Field>
              <Field label="Maximum (days)" id="max"><Input id="max" type="number" min={1} value={form.max_days} onChange={(e) => set("max_days", Number(e.target.value || 1))} /></Field>
              <Field label="Prep time between rentals (h)" id="prep"><Input id="prep" type="number" step="0.5" min={0} value={form.prep_hours} onChange={(e) => set("prep_hours", Number(e.target.value || 0))} /></Field>
              <Field label="Same-day cutoff (h before closing)" id="cutoff"><Input id="cutoff" type="number" step="0.5" min={0} value={form.same_day_cutoff_minutes / 60} onChange={(e) => set("same_day_cutoff_minutes", Math.round(Number(e.target.value || 0) * 60))} /></Field>
            </div>
            <label className="flex items-start justify-between gap-4 rounded-panel border border-border bg-white px-3.5 py-3">
              <div><div className="text-[13px] font-semibold">Instant book</div><div className="text-[12px] text-text-3">Renters with verified ID and ★ 4.5+ are confirmed without approval. Others become requests.</div></div>
              <Switch checked={form.instant_book} onCheckedChange={(v) => set("instant_book", v)} aria-label="Instant book" />
            </label>
          </Section>

          <BlocksSection listingId={listing.id} blocks={blocks} units={units} tz={tz} />

          <Section id="pickup-delivery" title="Pickup & delivery">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-panel border border-border bg-white p-3.5">
                <label className="flex items-center justify-between text-[13px] font-semibold">Pickup at your location <Switch checked={form.pickup_enabled} onCheckedChange={(v) => set("pickup_enabled", v)} aria-label="Pickup enabled" size="sm" /></label>
                <Field label="Address" id="paddr"><Input id="paddr" value={form.pickup_address ?? ""} onChange={(e) => set("pickup_address", e.target.value || null)} /></Field>
                <Field label="Hours" id="phours"><Input id="phours" value={form.pickup_hours_label ?? ""} onChange={(e) => set("pickup_hours_label", e.target.value || null)} placeholder="Mon–Sat 07:00–18:00 · closed Sun" /></Field>
                <Field label="Instructions for renters" id="pinst"><Textarea id="pinst" rows={3} value={form.pickup_instructions ?? ""} onChange={(e) => set("pickup_instructions", e.target.value || null)} /></Field>
              </div>
              <div className="flex flex-col gap-3 rounded-panel border border-border bg-white p-3.5">
                <label className="flex items-center justify-between text-[13px] font-semibold">Delivery &amp; collection <Switch checked={form.delivery_enabled} onCheckedChange={(v) => set("delivery_enabled", v)} aria-label="Delivery enabled" size="sm" /></label>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Radius (km)" id="drad"><Input id="drad" type="number" min={0} value={form.delivery_radius_km} onChange={(e) => set("delivery_radius_km", Number(e.target.value || 0))} /></Field>
                  <Field label="Window (h)" id="dwin"><Input id="dwin" type="number" step="0.5" min={0.5} value={form.delivery_window_hours} onChange={(e) => set("delivery_window_hours", Number(e.target.value || 1))} /></Field>
                  <Money label={`Base ≤${form.delivery_base_km} km`} value={form.delivery_base_cents} onChange={(v) => set("delivery_base_cents", v ?? 0)} />
                  <Money label="Per extra km" value={form.delivery_per_km_cents} onChange={(v) => set("delivery_per_km_cents", v ?? 0)} />
                </div>
                <Field label="Notes (yours)" id="dnotes"><Textarea id="dnotes" rows={2} value={form.delivery_notes ?? ""} onChange={(e) => set("delivery_notes", e.target.value || null)} /></Field>
              </div>
            </div>
          </Section>

          <Section id="rules-cancellation" title="Rules & cancellation">
            <Field label="Rental rules · one per line" id="rules"><Textarea id="rules" rows={4} value={form.rules.join("\n")} onChange={(e) => set("rules", e.target.value.split("\n").map((r) => r.trim()).filter(Boolean))} /></Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Cancellation policy" id="policy">
                <Select id="policy" value={form.cancellation_policy_id} onChange={(e) => set("cancellation_policy_id", e.target.value)}>
                  {policies.map((p) => <option key={p.id} value={p.id}>{p.name} · free until {p.free_until_hours >= 48 ? `${p.free_until_hours / 24} days` : `${p.free_until_hours} h`} before</option>)}
                </Select>
              </Field>
              <label className="flex items-center justify-between gap-3 rounded-panel border border-border bg-white px-3.5 py-2.5 text-[13px] font-semibold">Photo ID required at handoff <Switch checked={form.id_required} onCheckedChange={(v) => set("id_required", v)} aria-label="ID required" size="sm" /></label>
              <Field label="Minimum renter age" id="age-min"><Input id="age-min" type="number" min={16} value={form.min_renter_age} onChange={(e) => set("min_renter_age", Number(e.target.value || 18))} /></Field>
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[130px] lg:self-start">
          <div className="card overflow-hidden">
            <div className="border-b border-border px-4 py-2.5 text-[12px] font-semibold text-text-3">Renter preview</div>
            <div className="p-4">
              <div className="mb-3 h-[120px] rounded-panel bg-ivory-deep" style={photos[0]?.url ? { backgroundImage: `url(${photos[0].url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} />
              <div className="text-[14px] font-bold leading-tight">{form.title}</div>
              <div className="mt-0.5 text-[12px] text-text-2">{provider.name}{provider.rating ? ` · ★ ${provider.rating.toFixed(1)} (${provider.rating_count})` : ""}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">{form.pickup_enabled && <Pill tone="outline" size="xs">Pickup · free</Pill>}{form.delivery_enabled && <Pill tone="outline" size="xs">Delivery from {formatRate(form.delivery_base_cents)}</Pill>}{form.instant_book && <Pill tone="dark" size="xs">Instant book</Pill>}</div>
              <div className="mt-2 text-[18px] font-extrabold">{formatRate(form.day_cents)}<span className="text-[12px] font-medium text-text-3">/day{form.week_cents ? ` · ${formatRate(form.week_cents)}/week` : ""}</span></div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-baseline justify-between"><div className="text-[13px] font-bold">Listing quality</div><div className={cn("text-[22px] font-extrabold", quality.score >= 80 ? "text-ok-text" : quality.score >= 50 ? "text-warn-text" : "text-error-text")}>{quality.score}%</div></div>
            <ul className="mt-2 flex flex-col gap-1 text-[12px]">
              {quality.items.map((it) => <li key={it.label} className={cn("flex items-center gap-1.5", it.done ? "text-charcoal" : "text-text-3")}>{it.done ? <Icon name="check" size={12} className="text-ok-text" /> : <span className="inline-block size-3 rounded-full border border-border-strong" />}{it.label}</li>)}
            </ul>
          </div>
          <p className="text-[12px] leading-[1.5] text-text-3">{upcomingCount} upcoming {upcomingCount === 1 ? "booking uses" : "bookings use"} this listing. Price and policy edits apply to new bookings only; availability blocks that overlap a confirmed booking will ask you to reassign the unit first.</p>
        </aside>
      </div>
    </div>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="card flex flex-col gap-3.5 p-5 scroll-mt-[140px]">
      <div className="flex items-baseline gap-2"><h2 className="text-[15px] font-bold">{title}</h2>{hint && <span className="text-[12px] text-text-3">· {hint}</span>}</div>
      {children}
    </section>
  );
}

function Money({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <CapsLabel>{label}</CapsLabel>
      <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-text-3">$</span><Input value={dollars(value)} onChange={(e) => onChange(cents(e.target.value))} inputMode="decimal" className="!pl-7" aria-label={label} /></div>
    </div>
  );
}

function ChipList({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim(); if (v && !values.includes(v)) onChange([...values, v]); setDraft(""); };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v) => <span key={v} className="inline-flex h-[30px] items-center gap-1.5 rounded-pill bg-ivory px-3 text-[12px] font-semibold">{v}<button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="text-text-3 hover:text-charcoal">×</button></span>)}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder} className="h-[30px] min-w-[80px] rounded-pill border border-dashed border-border-strong bg-transparent px-3 text-[12px] outline-none focus:border-cobalt" aria-label="Add accessory" />
    </div>
  );
}

const PHOTO_LABELS = ["Cover", "Serial plate", "Left", "Right", "Accessories", "Stand", "Existing marks", "Detail"];
function PhotosSection({ listingId, photos }: { listingId: string; photos: Photo[] }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const upload = async (f: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("bucket", "listing-photos");
      fd.set("path", `listings/${listingId}`);
      fd.set("file", f);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "Upload failed" }))).error);
      const { path } = (await res.json()) as { path: string };
      const label = PHOTO_LABELS[photos.length] ?? null;
      const r = await addListingPhoto(listingId, { path, label, has_serial_plate: label === "Serial plate" });
      if (!r.ok) throw new Error(r.error);
      router.refresh();
    } catch (e) {
      toast({ title: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const patch = (id: string, p: { label?: string | null; has_serial_plate?: boolean; is_cover?: boolean; remove?: boolean }) => updateListingPhoto(listingId, id, p).then(() => router.refresh());
  return (
    <Section id="photos" title={`Photos · ${photos.length} of 10`} hint="renters compare the return against these — show every accessory">
      <div className="grid grid-cols-3 gap-2.5 md:grid-cols-5">
        {photos.map((p) => (
          <div key={p.id} className="group relative aspect-square overflow-hidden rounded-panel border border-border bg-ivory-deep">
            {p.url ? <img src={p.url} alt={p.label ?? ""} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-text-3"><Icon name="image" size={20} /></div>}
            {p.is_cover && <span className="absolute left-1.5 top-1.5 rounded-[4px] bg-charcoal px-1.5 py-0.5 text-[10px] font-bold text-white">Cover</span>}
            {p.has_serial_plate && <span className="absolute right-1.5 top-1.5 rounded-[4px] bg-white/90 px-1.5 py-0.5 text-[10px] font-bold">Serial</span>}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <input defaultValue={p.label ?? ""} onBlur={(e) => e.target.value !== (p.label ?? "") && patch(p.id, { label: e.target.value || null })} placeholder="Label" className="min-w-0 flex-1 rounded-[4px] bg-white/90 px-1.5 py-0.5 text-[11px] outline-none" aria-label="Photo label" />
              {!p.is_cover && <button type="button" title="Make cover" onClick={() => patch(p.id, { is_cover: true })} className="rounded-[4px] bg-white/90 p-1 text-charcoal"><Icon name="star" size={12} /></button>}
              <button type="button" title={p.has_serial_plate ? "Unmark serial plate" : "Mark as serial plate"} onClick={() => patch(p.id, { has_serial_plate: !p.has_serial_plate })} className="rounded-[4px] bg-white/90 p-1 text-charcoal"><Icon name="barcode" size={12} /></button>
              <button type="button" title="Remove" onClick={() => patch(p.id, { remove: true })} className="rounded-[4px] bg-white/90 p-1 text-error-text"><Icon name="trash" size={12} /></button>
            </div>
          </div>
        ))}
        {photos.length < 10 && (
          <button type="button" onClick={() => file.current?.click()} disabled={busy} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-panel border border-dashed border-border-strong text-[12px] font-semibold text-text-2 hover:bg-ivory">
            {busy ? <span className="size-4 animate-spin rounded-full border-2 border-cobalt border-t-transparent" /> : <Icon name="plus" size={18} />}Add
          </button>
        )}
        <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { const fs = Array.from(e.target.files ?? []); for (const f of fs) await upload(f); e.target.value = ""; }} />
      </div>
    </Section>
  );
}

function UnitsSection({ listingId, units, tz, soonMs }: { listingId: string; units: Unit[]; tz: string; soonMs: number }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ serial: "", acquired_at: "", hours: "", next_service_at: "" });
  const [pending, start] = useTransition();
  const saveNew = () =>
    start(async () => {
      const r = await upsertUnit(listingId, { serial: draft.serial, acquired_at: draft.acquired_at || null, hours: draft.hours ? Number(draft.hours) : null, next_service_at: draft.next_service_at || null });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      setAdding(false);
      setDraft({ serial: "", acquired_at: "", hours: "", next_service_at: "" });
      router.refresh();
    });
  const setStatus = (u: Unit, status: string) => start(async () => { const r = await upsertUnit(listingId, { id: u.id, serial: u.serial, acquired_at: u.acquired_at, hours: u.hours, next_service_at: u.next_service_at, status: status as never }); if (!r.ok) toast({ title: r.error, tone: "error" }); router.refresh(); });
  const tone = (s: string) => (s === "rentable" ? "ok" : s === "service_due" ? "warn" : s === "in_maintenance" ? "error" : "neutral");
  return (
    <Section id="units" title={`Units · quantity ${units.length}`} hint="each unit is tracked by serial">
      <div className="overflow-x-auto rounded-panel border border-border">
        <div className="grid min-w-[520px] grid-cols-[44px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_136px] gap-3 border-b border-border bg-paper px-3 py-2 t-label text-text-3"><span>Unit</span><span>Serial</span><span>Acquired · hours</span><span>Next service</span><span>Status</span></div>
        {units.map((u) => (
          <div key={u.id} className="grid min-w-[520px] grid-cols-[44px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_136px] items-center gap-3 border-b border-border px-3 py-2 text-[13px] last:border-b-0">
            <span className="font-semibold">{u.unit_number}</span>
            <span className="t-mono text-[12px]">{u.serial}</span>
            <span className="text-text-2">{u.acquired_at ? formatDate(new Date(u.acquired_at), tz).replace(/^\w+ /, "") : "—"}{u.hours != null ? ` · ${u.hours} h` : ""}</span>
            <span className={cn("text-text-2", u.next_service_at && new Date(u.next_service_at).getTime() < soonMs && "font-semibold text-warn-text")}>{u.next_service_at ? formatDate(new Date(u.next_service_at), tz) : "—"}</span>
            <Select compact value={u.status} onChange={(e) => setStatus(u, e.target.value)} aria-label={`Unit ${u.unit_number} status`} className="text-[12px]">
              <option value="rentable">Rentable</option><option value="service_due">Service due</option><option value="in_maintenance">In maintenance</option><option value="retired">Retired</option>
            </Select>
            <span className="sr-only">{tone(u.status)}</span>
          </div>
        ))}
        {adding && (
          <div className="grid min-w-[520px] grid-cols-[44px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_136px] items-center gap-3 border-t border-border bg-ivory/60 px-3 py-2">
            <span className="text-[13px] font-semibold">{units.length + 1}</span>
            <Input compact value={draft.serial} onChange={(e) => setDraft({ ...draft, serial: e.target.value })} placeholder="Serial" aria-label="Serial" mono />
            <div className="flex gap-1.5"><Input compact type="date" value={draft.acquired_at} onChange={(e) => setDraft({ ...draft, acquired_at: e.target.value })} aria-label="Acquired" /><Input compact value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} placeholder="h" inputMode="numeric" aria-label="Hours" className="!w-16" /></div>
            <Input compact type="date" value={draft.next_service_at} onChange={(e) => setDraft({ ...draft, next_service_at: e.target.value })} aria-label="Next service" />
            <div className="flex gap-1.5"><Button size="sm" onClick={saveNew} loading={pending} disabled={draft.serial.trim().length < 2}>Save</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
          </div>
        )}
      </div>
      {!adding && <Button size="sm" variant="ghost" onClick={() => setAdding(true)} leading={<Icon name="plus" size={12} />} data-testid="add-unit">Add unit</Button>}
    </Section>
  );
}

function ExtrasSection({ listingId, extras, waiverCoversCents }: { listingId: string; extras: Extra[]; waiverCoversCents: number }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", price: "", per: "rental" as "rental" | "day", waiver: false });
  const [pending, start] = useTransition();
  const add = () =>
    start(async () => {
      const r = await upsertExtra(listingId, { name: draft.name, price_cents: cents(draft.price) ?? 0, per: draft.per, is_damage_waiver: draft.waiver, waiver_covers_cents: draft.waiver ? waiverCoversCents : null });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      setAdding(false);
      setDraft({ name: "", price: "", per: "rental", waiver: false });
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      <CapsLabel>Optional extras</CapsLabel>
      <div className="rounded-panel border border-border">
        {extras.map((x, i) => (
          <div key={x.id} className={cn("flex items-center gap-3 px-3.5 py-2.5 text-[13px]", i < extras.length - 1 && "border-b border-border")}>
            <div className="min-w-0 flex-1"><div className="font-semibold">{x.name}{x.is_damage_waiver ? <span className="ml-1.5 text-[11px] font-semibold text-text-3">fab.rent-backed, up to {formatMoney(x.waiver_covers_cents ?? waiverCoversCents, { whole: true })}</span> : null}</div>{x.description && <div className="text-[12px] text-text-3">{x.description}</div>}</div>
            <div className="t-mono text-[13px]">{formatMoney(x.price_cents, { whole: x.price_cents % 100 === 0 })}<span className="text-text-3"> {x.per === "day" ? "per day" : "per rental"}</span></div>
            <button type="button" onClick={() => start(async () => { await deleteExtra(listingId, x.id); router.refresh(); })} aria-label={`Remove ${x.name}`} className="text-text-3 hover:text-error-text"><Icon name="close" size={14} /></button>
          </div>
        ))}
        {extras.length === 0 && !adding && <div className="px-3.5 py-3 text-[12px] text-text-3">No extras yet — a damage waiver reduces the renter&apos;s hold and is popular.</div>}
        {adding && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-ivory/60 px-3.5 py-2.5">
            <Input compact value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" aria-label="Extra name" className="min-w-[180px] flex-1" />
            <Input compact value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="$" inputMode="decimal" aria-label="Price" className="!w-24" />
            <Select compact value={draft.per} onChange={(e) => setDraft({ ...draft, per: e.target.value as "rental" | "day" })} aria-label="Per" className="w-32"><option value="rental">per rental</option><option value="day">per day</option></Select>
            <label className="flex items-center gap-1.5 text-[12px] font-semibold"><input type="checkbox" checked={draft.waiver} onChange={(e) => setDraft({ ...draft, waiver: e.target.checked, per: e.target.checked ? "day" : draft.per })} />Damage waiver</label>
            <Button size="sm" onClick={add} loading={pending} disabled={!draft.name.trim() || !draft.price}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        )}
      </div>
      {!adding && <Button size="sm" variant="ghost" onClick={() => setAdding(true)} leading={<Icon name="plus" size={12} />} className="self-start">Add extra</Button>}
    </div>
  );
}

const REASONS: Record<string, string> = { service: "Scheduled service", inspection: "Inspection", off_platform: "Off-platform hire", other: "Other" };
export function BlocksSection({ listingId, blocks, units, tz, title = "Availability blocks", id = "availability-blocks", initialOpen = false, initialUnit = null, initialStart }: { listingId: string; blocks: Block[]; units: Array<{ id: string; unit_number: number }>; tz: string; title?: string; id?: string; initialOpen?: boolean; initialUnit?: string | null; initialStart?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(initialOpen);
  const [draft, setDraft] = useState({ unit_id: initialUnit ?? "", start: initialStart ?? "", end: "", reason: "service", note: "" });
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await addBlock(listingId, { unit_id: draft.unit_id || null, start: `${draft.start}T07:00:00`, end: `${draft.end}T18:00:00`, reason: draft.reason as never, note: draft.note || null });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      setOpen(false);
      toast({ title: "Dates blocked", tone: "ok" });
      router.refresh();
    });
  return (
    <Section id={id} title={title}>
      <div className="flex flex-col gap-2">
        {blocks.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-panel border border-border bg-white px-3.5 py-2.5 text-[13px]">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{formatDate(new Date(b.start_at), tz)}{formatDate(new Date(b.start_at), tz) !== formatDate(new Date(b.end_at), tz) ? ` – ${formatDate(new Date(b.end_at), tz)}` : ""} · {b.unit_number ? `Unit ${b.unit_number}` : "All units"}</div>
              <div className="text-[12px] text-text-3">{b.note ?? REASONS[b.reason] ?? b.reason}{b.reason === "inspection" && !b.note ? " · shows as unavailable to renters" : ""}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => start(async () => { await deleteBlock(listingId, b.id); router.refresh(); })} loading={pending}>Remove</Button>
          </div>
        ))}
        {blocks.length === 0 && <div className="text-[12px] text-text-3">No blocks. Renters see blocked dates as unavailable.</div>}
      </div>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} leading={<Icon name="plus" size={12} />} className="self-start" data-testid="block-dates">Block dates</Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent title="Block dates" size="sm" footer={<><Button size="md" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button size="md" onClick={save} loading={pending} disabled={!draft.start || !draft.end}>Block</Button></>}>
          <div className="flex flex-col gap-3">
            <Field label="Unit" id="blk-unit"><Select id="blk-unit" value={draft.unit_id} onChange={(e) => setDraft({ ...draft, unit_id: e.target.value })}><option value="">All units</option>{units.map((u) => <option key={u.id} value={u.id}>Unit {u.unit_number}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="From" id="blk-from"><Input id="blk-from" type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value, end: draft.end || e.target.value })} /></Field><Field label="To" id="blk-to"><Input id="blk-to" type="date" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field></div>
            <Field label="Reason" id="blk-reason"><Select id="blk-reason" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })}>{Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Note" id="blk-note"><Input id="blk-note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. arbor bearing, fence alignment" /></Field>
            <p className="text-[12px] text-text-3">Blocks that overlap a confirmed booking on the same unit are refused — reassign the booking first.</p>
          </div>
        </DialogContent>
      </DialogRoot>
    </Section>
  );
}
