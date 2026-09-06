"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { DialogRoot, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatMoney } from "@/lib/format";
import { previewDecision, type DisputeDecision } from "@/lib/pricing/claims";
import { addInternalNote, assignDispute, extendDisputeHold, requestMoreEvidence, resolveDispute } from "@/app/(admin)/actions";

/** Re-authorises the card hold for another authorisation window (7 days on Stripe and the mock provider). */
export function ExtendHoldButton({ code }: { code: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button size="md" variant="secondary" loading={pending} data-testid="extend-hold" onClick={() => start(async () => { const r = await extendDisputeHold(code); toast({ title: r.ok ? `Hold extended to ${formatDate(new Date(r.data.expires_at))}` : r.error, tone: r.ok ? "ok" : "error" }); router.refresh(); })}>
      Extend hold
    </Button>
  );
}

export function DisputeActions({ code, assigned }: { code: string; assigned: boolean }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"renter" | "provider">("renter");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="flex gap-2">
      <Button size="md" variant="secondary" onClick={() => start(async () => { const r = await assignDispute(code, assigned ? null : undefined); toast({ title: r.ok ? (assigned ? "Unassigned" : "Assigned to you") : r.error, tone: r.ok ? "ok" : "error" }); router.refresh(); })} loading={pending}>{assigned ? "Unassign" : "Assign to me"}</Button>
      <Button size="md" variant="secondary" onClick={() => setOpen(true)}>Ask for more evidence</Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent title="Ask for more evidence" size="sm" footer={<><Button size="md" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button size="md" loading={pending} onClick={() => start(async () => { const r = await requestMoreEvidence(code, side, msg); toast({ title: r.ok ? "Request sent · SLA paused" : r.error, tone: r.ok ? "ok" : "error" }); if (r.ok) { setOpen(false); router.refresh(); } })}>Send</Button></>}>
          <div className="flex flex-col gap-3">
            <Field label="Ask" id="ev-side"><Select id="ev-side" value={side} onChange={(e) => setSide(e.target.value as "renter" | "provider")}><option value="renter">the renter</option><option value="provider">the provider</option></Select></Field>
            <Field label="What do you need?" id="ev-msg"><Textarea id="ev-msg" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. a photo of the chuck collar from the same angle as handoff photo 2" /></Field>
          </div>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}

export function NoteBox({ disputeId }: { disputeId: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="flex gap-2">
      <Input compact value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a reviewer note (internal)" aria-label="Reviewer note" className="flex-1" />
      <Button size="sm" variant="secondary" loading={pending} disabled={note.trim().length < 2} onClick={() => start(async () => { const r = await addInternalNote("dispute", disputeId, note); toast({ title: r.ok ? "Note added" : r.error, tone: r.ok ? "ok" : "error" }); if (r.ok) { setNote(""); router.refresh(); } })}>Add</Button>
    </div>
  );
}

/** A04 decision box: uphold in full · uphold partially (wear allowance default) · dismiss · goodwill credit, with the money split live. */
export function DecisionBox({ code, claimCents, holdCents, partialDefault, wearPct, providerName, resolved, initialReasoning, appealDays }: { code: string; claimCents: number; holdCents: number; partialDefault: number; wearPct: number | null; providerName: string; resolved: { decision: string | null; charged: number | null; released: number | null; reasoning: string | null } | null; initialReasoning: string; appealDays: number }) {
  const [decision, setDecision] = useState<DisputeDecision>(wearPct ? "uphold_partial" : "uphold_full");
  const [partial, setPartial] = useState(partialDefault);
  const [reasoning, setReasoning] = useState(initialReasoning);
  const [send, setSend] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const preview = previewDecision(decision, claimCents, holdCents, partial);
  const submit = () =>
    start(async () => {
      const r = await resolveDispute(code, { decision, partial_cents: partial, reasoning, send_reasoning: send });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      toast({ title: `${code} resolved`, description: `${formatMoney(r.data.charged_cents)} charged · ${formatMoney(r.data.released_cents)} released. Both parties notified.`, tone: "ok" });
      router.refresh();
    });
  if (resolved) {
    return (
      <section className="card p-4">
        <div className="t-label text-text-3">Decision</div>
        <div className="mt-1 text-[15px] font-bold capitalize">{resolved.decision?.replace("_", " ")}</div>
        <div className="mt-2 text-[13px] text-text-2">{formatMoney(resolved.charged ?? 0)} charged from the hold · {formatMoney(resolved.released ?? 0)} released to the renter.</div>
        {resolved.reasoning && <p className="mt-2 text-[13px] leading-[1.5]">{resolved.reasoning}</p>}
      </section>
    );
  }
  return (
    <section className="card flex flex-col gap-2.5 p-4">
      <div className="t-label text-text-3">Decision</div>
      <Opt v="uphold_full" title="Uphold in full" amount={formatMoney(Math.min(claimCents, holdCents))} decision={decision} onPick={setDecision} />
      <Opt v="uphold_partial" title="Uphold partially" amount={formatMoney(partial)} sub={wearPct ? `${formatMoney(claimCents)} less ${wearPct}% wear allowance · charged from hold; remaining ${formatMoney(Math.max(0, holdCents - partial))} released to renter` : "Set the amount charged from the hold"} decision={decision} onPick={setDecision} />
      {decision === "uphold_partial" && <div className="relative pl-7"><span className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 text-[13px] text-text-3">$</span><Input compact value={String(partial / 100)} onChange={(e) => setPartial(Math.min(holdCents, Math.max(0, Math.round(Number(e.target.value || 0) * 100))))} inputMode="decimal" className="!pl-7" aria-label="Partial amount" data-testid="partial-amount" /></div>}
      <Opt v="dismiss" title="Dismiss claim" amount={`release ${formatMoney(holdCents, { whole: true })}`} decision={decision} onPick={setDecision} />
      <Opt v="goodwill_credit" title="fab.rent goodwill credit" amount="platform pays" decision={decision} onPick={setDecision} />
      <div className="mt-1 rounded-panel bg-ivory px-3 py-2.5 text-[12px]">
        <div className="flex justify-between"><span>Charged to renter from hold</span><span className="t-mono">{formatMoney(preview.charged_to_renter_cents)}</span></div>
        <div className="flex justify-between"><span>Paid to {providerName.split(" ")[0]} (no commission on claims)</span><span className="t-mono">{formatMoney(preview.paid_to_provider_cents)}</span></div>
        <div className="flex justify-between"><span>Released to renter</span><span className="t-mono">{formatMoney(preview.released_to_renter_cents)}</span></div>
        {preview.platform_pays_cents > 0 && <div className="flex justify-between text-warn-text"><span>Paid by fab.rent</span><span className="t-mono">{formatMoney(preview.platform_pays_cents)}</span></div>}
      </div>
      <Textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} rows={4} placeholder="Reasoning (kept on the dispute; optionally sent to both parties)" aria-label="Reasoning" />
      <label className="flex items-center gap-2 text-[12px] font-semibold"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="accent-cobalt" />Send both parties the reasoning above</label>
      <Button size="lg" block onClick={submit} loading={pending} disabled={reasoning.trim().length < 10} data-testid="resolve-dispute">Resolve · charge {formatMoney(preview.charged_to_renter_cents)}, release {formatMoney(preview.released_to_renter_cents)}</Button>
      <div className="text-center text-[11px] text-text-3">Either party can appeal once within {appealDays} days</div>
    </section>
  );
}

function Opt({ v, title, amount, sub, decision, onPick }: { v: DisputeDecision; title: string; amount: string; sub?: string; decision: DisputeDecision; onPick: (v: DisputeDecision) => void }) {
  return (
    <button type="button" onClick={() => onPick(v)} className={cn("flex w-full items-start justify-between gap-3 rounded-panel border px-3.5 py-2.5 text-left", decision === v ? "border-cobalt bg-cobalt-wash" : "border-border bg-white")}>
      <span className="flex items-start gap-2.5"><span className={cn("mt-0.5 size-4 flex-none rounded-full", decision === v ? "border-[5px] border-cobalt" : "border border-border-strong")} /><span><span className="block text-[13px] font-bold">{title}</span>{sub && <span className="block text-[11px] text-text-3">{sub}</span>}</span></span>
      <span className="t-mono text-[13px] font-medium">{amount}</span>
    </button>
  );
}
