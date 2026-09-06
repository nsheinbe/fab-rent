import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { adminDisputeDetail } from "@/lib/queries/admin";
import { defaultPartialAmount } from "@/lib/pricing/claims";
import { formatDate, formatDateTime, formatDuration, formatMoney } from "@/lib/format";
import { differenceInMinutes } from "date-fns";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/ui/icons";
import { Timeline, type TimelineStep } from "@/components/ui/timeline";
import { KeyValueList } from "@/components/ui/side-panel";
import { DisputeActions, DecisionBox, NoteBox, ExtendHoldButton } from "./decision";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `Dispute ${code}` };
}

export default async function DisputePage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, actor, config] = await Promise.all([params, requireStaff(), getLiveConfig()]);
  const nowAt = now();
  const tz = config.market.timezone;
  const d = await withActor((trx) => adminDisputeDetail(trx, code, config));
  if (!d) notFound();
  const { dispute, booking: b, claim, lateClaim, handoff, ret } = d;
  const left = differenceInMinutes(dispute.decision_due_at, nowAt);
  const claimCents = claim?.amount_cents ?? dispute.charged_cents ?? 0;
  const partialDefault = defaultPartialAmount(claimCents, b.age_years, config);
  const wearApplies = b.age_years != null && b.age_years > d.policy.wear_min_age;
  const holdExpires = b.hold_expires_at ?? (b.hold_placed_at ? new Date(b.hold_placed_at.getTime() + d.policy.hold_expiry_days * 86_400_000) : null);
  const waiver = b.price_snapshot.waiver_bought;
  const lateMin = b.returned_at ? Math.max(0, differenceInMinutes(b.returned_at, b.return_due_at ?? b.end_at)) : 0;
  const claimRaised = d.events.find((e) => e.type === "claim_raised");
  const disputedEv = d.events.find((e) => e.type === "claim_disputed");
  const steps: TimelineStep[] = [
    { title: `Handoff recorded${handoff ? ` · ${handoff.photos.length} photos` : ""}`, meta: handoff?.completed_at ? `${formatDateTime(handoff.completed_at, tz)} · both signed` : "no record", state: "done" },
    { title: "Return check-in · issue flagged", meta: `${ret?.completed_at ? formatDateTime(ret.completed_at, tz) : b.returned_at ? formatDateTime(b.returned_at, tz) : ""}${claimRaised ? ` · claim ${formatMoney(Number((claimRaised.payload as { cents?: number })?.cents ?? claimCents), { whole: true })} sent` : ""}`, state: "done" },
    { title: "Renter disputed", meta: `${disputedEv ? formatDateTime(disputedEv.occurred_at, tz) : formatDateTime(dispute.opened_at, tz)} · statement${dispute.statements.find((s) => s.side === "renter")?.attachments?.length ? " + photos" : ""}`, state: "done" },
    dispute.status === "resolved"
      ? { title: `Resolved · ${dispute.decision?.replace("_", " ")}`, meta: dispute.resolved_at ? formatDateTime(dispute.resolved_at, tz) : undefined, state: "done" }
      : { title: "Admin decision due", meta: `${formatDateTime(dispute.decision_due_at, tz)} · ${d.policy.sla_hours} h SLA`, state: left < 0 ? "error" : "current" },
  ];
  const areas = dispute.evidence_areas.length ? dispute.evidence_areas : (handoff?.photos ?? []).slice(0, 3).map((p, i) => ({ area: p.label, handoff_index: i, return_index: ret?.photos.findIndex((r) => r.label === p.label) ?? null, matched_angle: true }));
  const focus = areas.find((a) => a.area.toLowerCase().includes((claim?.area ?? "").toLowerCase().split(" ")[0] ?? "")) ?? areas[0];

  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 lg:px-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-extrabold tracking-[-0.02em]"><span className="t-mono">{dispute.code}</span> <span className="text-text-3">·</span> {dispute.summary.split(" · ")[0]} on {b.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-text-2">
            <Pill tone={dispute.status === "resolved" ? "neutral" : left < 0 ? "error" : "warn"} size="sm" dot>{dispute.status === "resolved" ? "Resolved" : dispute.status === "more_evidence" ? "Waiting for evidence" : dispute.status === "appealed" ? "Appealed" : "Awaiting decision"}</Pill>
            {dispute.status !== "resolved" && <span className={cn("font-semibold", left < 0 ? "text-error-text" : "")}>{left >= 0 ? `${Math.round(left / 60)} h left` : `SLA passed ${Math.round(-left / 60)} h ago`}</span>}
            {d.assignee && <span>· assigned to {d.assignee.name}</span>}
          </div>
        </div>
        {dispute.status !== "resolved" && <DisputeActions code={dispute.code} assigned={d.assignee?.id === actor.staff.id} />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <section className="card p-4">
              <div className="t-label text-text-3">Parties</div>
              <div className="mt-2 flex flex-col gap-3">
                <div className="flex items-center gap-3"><Avatar name={b.provider_name} size={36} tone="charcoal" /><div className="min-w-0"><div className="text-[13px] font-bold">{b.provider_name}</div><div className="text-[12px] text-text-3">Claimant · provider{b.provider_rating ? ` · ★ ${Number(b.provider_rating).toFixed(1)}` : ""} · {d.provider_prior.total} prior {d.provider_prior.total === 1 ? "claim" : "claims"}, {d.provider_prior.upheld} upheld</div></div></div>
                <div className="flex items-center gap-3"><Avatar name={b.renter_name} size={36} tone="cobalt" /><div className="min-w-0"><div className="text-[13px] font-bold">{b.renter_name}</div><div className="text-[12px] text-text-3">Respondent · renter{b.renter_rating ? ` · ★ ${Number(b.renter_rating).toFixed(1)}` : ""} · {d.renter_prior.total} prior {d.renter_prior.total === 1 ? "claim" : "claims"}</div></div></div>
              </div>
            </section>
            <section className="card p-4">
              <div className="t-label text-text-3">Booking · <Link href={`/rentals/${b.ref}`} className="t-mono text-charcoal no-underline">{b.ref}</Link></div>
              <KeyValueList size="sm" className="mt-2 !border-0 !bg-transparent !px-0 !py-0" rows={[
                { k: "Rental", v: `${formatDate(b.start_at, tz)} – ${formatDate(b.end_at, tz)} · ${b.billed_days} days · ${formatMoney(b.price_snapshot.rental_cents, { whole: true })}` },
                { k: "Hold placed", v: b.hold_placed_at ? `${formatMoney(b.hold_cents, { whole: true })} · ${formatDateTime(b.hold_placed_at, tz)}` : formatMoney(b.hold_cents, { whole: true }) },
                { k: "Damage waiver", v: waiver ? `Bought · covers ${formatMoney(config.waiver.covers_up_to_cents, { whole: true })}` : "Not purchased" },
                { k: "Returned", v: b.returned_at ? `${formatDateTime(b.returned_at, tz).replace(/^\w+ \d+ \w+ · /, "")}${lateMin > 0 ? ` · ${formatDuration(lateMin * 60_000)} late` : " · on time"}` : "—" },
                ...(lateClaim ? [{ k: "Late fee (undisputed)", v: `${formatMoney(lateClaim.amount_cents, { whole: true })} · ${lateClaim.status}` }] : []),
              ]} />
            </section>
          </div>

          <section className="card p-4"><div className="t-label text-text-3">Timeline</div><Timeline steps={steps} className="mt-3" compact /></section>

          <section className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="t-label text-text-3">Evidence · {focus?.area ?? "photos"}</div><div className="flex gap-1.5">{areas.map((a) => <Pill key={a.area} tone={a.area === focus?.area ? "dark" : "outline"} size="xs">{a.area}</Pill>)}<Pill tone="outline" size="xs">All {(handoff?.photos.length ?? 0) + (ret?.photos.length ?? 0)}</Pill></div></div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <EvidenceCard title={`HANDOFF · ${handoff?.completed_at ? formatDateTime(handoff.completed_at, tz).replace(" · ", " ") : "—"}`} sub={`${b.provider_name.split(" ")[0]}${handoff?.location_label ? ` · geotag ${handoff.location_label}` : ""}`} photo={focus?.handoff_index != null ? handoff?.photos[focus.handoff_index] : undefined} extra={(handoff?.photos.length ?? 0) - 1} />
              <EvidenceCard title={`RETURN · ${ret?.completed_at ? formatDateTime(ret.completed_at, tz).replace(" · ", " ") : "—"}`} sub={`${b.provider_name.split(" ")[0]}${ret?.location_label ? ` · geotag ${ret.location_label}` : ""}`} photo={focus?.return_index != null ? ret?.photos[focus.return_index] : undefined} extra={(ret?.photos.length ?? 0) - 1} issue />
            </div>
            {focus && <div className="mt-2 text-[12px] text-text-3">{focus.matched_angle ? "Matched-angle pair — comparable." : "Angles differ — treat as weaker evidence."}</div>}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            {dispute.statements.filter((s) => s.side !== "staff").map((s, i) => (
              <section key={i} className="card p-4">
                <div className="flex items-baseline justify-between"><div className="t-label text-text-3">{s.side === "provider" ? "Provider statement" : "Renter response"}</div><div className="text-[12px] text-text-3">{s.author} · {formatDateTime(new Date(s.at), tz).replace(/^\w+ \d+ \w+ · /, "")}</div></div>
                <p className="mt-2 text-[13px] leading-[1.55]">{s.body}</p>
                {s.attachments?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{s.attachments.map((a) => <span key={a.name} className="inline-flex items-center gap-1 rounded-pill border border-border bg-white px-2.5 py-1 text-[11px] font-semibold"><Icon name="file" size={11} />{a.name}</span>)}</div> : null}
              </section>
            ))}
          </div>

          <section className="card p-4">
            <div className="t-label text-text-3">Reviewer notes · internal</div>
            <div className="mt-2 flex flex-col gap-2">
              {[...dispute.internal_notes.map((n) => ({ id: n.at, author: n.author, at: n.at, body: n.body })), ...d.notes.filter((n) => !dispute.internal_notes.some((x) => x.body === n.body)).map((n) => ({ id: n.id, author: n.author_name, at: n.created_at.toISOString(), body: n.body }))].map((n) => <div key={n.id} className="rounded-panel bg-ivory px-3 py-2 text-[13px] leading-[1.5]"><b>{n.author}</b> · {formatDateTime(new Date(n.at), tz).replace(/^\w+ \d+ \w+ · /, "")} — {n.body}</div>)}
              <NoteBox disputeId={dispute.id} />
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-20 xl:self-start">
          <section className="card p-4 text-[13px] leading-[1.6]">
            <div className="t-label text-text-3">Policy facts</div>
            <ul className="mt-2 flex flex-col gap-1 text-text-2">
              <li>· Hold available: {formatMoney(b.hold_cents, { whole: true })}{holdExpires ? ` (expires ${formatDate(holdExpires, tz)} — extend if undecided)` : ""}{b.hold_status !== "placed" ? ` · currently ${b.hold_status.replace("_", " ")}` : ""}</li>
              {dispute.status !== "resolved" && ["placed", "expired"].includes(b.hold_status) && <li className="pt-1"><ExtendHoldButton code={dispute.code} /></li>}
              <li>· {waiver ? `Waiver bought → renter liable only above ${formatMoney(config.waiver.covers_up_to_cents, { whole: true })} of accidental damage` : "No waiver → renter liable for accidental damage up to the hold"}</li>
              <li>· Normal wear on tools &gt;{d.policy.wear_min_age} yrs: reduce by {d.policy.wear_pct}%{b.age_years != null ? ` (this tool: ${b.age_years} yrs${wearApplies ? " → applies" : " → no allowance"})` : ""}</li>
              <li>· Provider claims upheld in full only with matched-angle photo pairs</li>
              <li>· Either party can appeal once within {d.policy.appeal_days} days</li>
            </ul>
          </section>
          <DecisionBox code={dispute.code} claimCents={claimCents} holdCents={b.hold_cents} partialDefault={partialDefault} wearPct={wearApplies ? d.policy.wear_pct : null} providerName={b.provider_name} resolved={dispute.status === "resolved" ? { decision: dispute.decision, charged: dispute.charged_cents, released: dispute.released_cents, reasoning: dispute.reasoning } : null} initialReasoning={dispute.internal_notes[dispute.internal_notes.length - 1]?.body ?? ""} appealDays={d.policy.appeal_days} />
        </div>
      </div>
    </div>
  );
}

function EvidenceCard({ title, sub, photo, extra, issue }: { title: string; sub: string; photo?: { label: string; url: string | null; taken_at: string } | null; extra: number; issue?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-panel border bg-white", issue ? "border-error/40" : "border-border")}>
      <div className="relative aspect-[4/3] bg-ivory-deep">
        {photo?.url ? <img src={photo.url} alt={photo.label} className="size-full object-cover" /> : <div className="flex size-full flex-col items-center justify-center gap-1 text-text-3"><Icon name="image" size={20} /><span className="text-[11px]">{photo?.label ?? "no photo"}</span></div>}
        {extra > 0 && <span className="absolute bottom-2 right-2 rounded-pill bg-charcoal/80 px-2 py-0.5 text-[11px] font-bold text-white">+{extra}</span>}
      </div>
      <div className="px-3 py-2"><div className="text-[11px] font-bold">{title}</div><div className="truncate-1 text-[11px] text-text-3">{sub}</div></div>
    </div>
  );
}
