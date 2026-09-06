"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Textarea, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { decideListingReview } from "@/app/(admin)/actions";

type Decision = "approve" | "request_changes" | "reject";

/** A03 decision column: approve & publish · request changes (checklist + message, pauses SLA) · reject. */
export function DecisionPanel({ reviewId, listingTitle, providerFirst, suggestions, hasRequired, decided }: { reviewId: string; listingTitle: string; providerFirst: string; suggestions: string[]; hasRequired: boolean; decided: string | null }) {
  const [decision, setDecision] = useState<Decision>(hasRequired ? "request_changes" : "approve");
  const [checks, setChecks] = useState<string[]>(suggestions);
  const [newItem, setNewItem] = useState("");
  const [message, setMessage] = useState(hasRequired ? `Hi ${providerFirst} — happy to approve once ${suggestions[0]?.toLowerCase() ?? "the checks pass"}.` : "");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const submit = () =>
    start(async () => {
      const r = await decideListingReview(reviewId, { decision, message: message || undefined, checklist: decision === "request_changes" ? checks : undefined, reject_reason: decision === "reject" ? reason : undefined });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      toast({ title: decision === "approve" ? "Approved & published" : decision === "reject" ? "Rejected · provider notified" : "Changes requested · SLA paused", description: listingTitle, tone: "ok" });
      router.push("/admin/listing-review");
      router.refresh();
    });
  if (decided) return <aside className="card p-5 text-[13px] text-text-2">Decided: <b>{decided.replace("_", " ")}</b>. Nothing else to do here.</aside>;
  return (
    <aside className="card flex flex-col gap-3 p-5 xl:sticky xl:top-20 xl:self-start">
      <div className="text-[14px] font-bold">Decision</div>
      <Option v="approve" title="Approve & publish" sub="Goes live immediately" decision={decision} onPick={setDecision} />
      <Option v="request_changes" title="Request changes" sub="Listing stays hidden; provider gets a checklist" decision={decision} onPick={setDecision} />
      {decision === "request_changes" && (
        <div className="flex flex-col gap-1.5 pl-2">
          {checks.map((c, i) => <label key={c} className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked readOnly className="mt-0.5 accent-cobalt" onClick={() => setChecks((cs) => cs.filter((_, j) => j !== i))} />{c}</label>)}
          <div className="flex gap-1.5"><Input compact value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a change" aria-label="Add change" onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) { setChecks((cs) => [...cs, newItem.trim()]); setNewItem(""); } }} /><Button size="sm" variant="ghost" onClick={() => { if (newItem.trim()) { setChecks((cs) => [...cs, newItem.trim()]); setNewItem(""); } }}><Icon name="plus" size={12} /></Button></div>
        </div>
      )}
      <Option v="reject" title="Reject" sub="Policy breach · provider notified with reason" decision={decision} onPick={setDecision} />
      {decision === "reject" && <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason shown to the provider" aria-label="Reject reason" />}
      {decision !== "reject" && <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder={`Message to ${providerFirst} (optional)`} aria-label="Message to provider" />}
      <Button size="lg" block variant={decision === "reject" ? "danger" : "primary"} onClick={submit} loading={pending} disabled={decision === "reject" && reason.trim().length < 3} data-testid="review-submit">
        {decision === "approve" ? "Approve & publish" : decision === "request_changes" ? "Send request · pauses SLA" : "Reject listing"}
      </Button>
    </aside>
  );
}

function Option({ v, title, sub, decision, onPick }: { v: Decision; title: string; sub: string; decision: Decision; onPick: (v: Decision) => void }) {
  return (
    <button type="button" onClick={() => onPick(v)} className={cn("flex w-full items-start gap-3 rounded-panel border px-3.5 py-3 text-left", decision === v ? (v === "reject" ? "border-error bg-error-bg/60" : "border-cobalt bg-cobalt-wash") : "border-border bg-white")}>
      <span className={cn("mt-0.5 size-4 flex-none rounded-full border-[5px]", decision === v ? (v === "reject" ? "border-error" : "border-cobalt") : "border-white ring-1 ring-border-strong")} />
      <span><span className="block text-[14px] font-bold">{title}</span><span className="block text-[12px] text-text-3">{sub}</span></span>
    </button>
  );
}
