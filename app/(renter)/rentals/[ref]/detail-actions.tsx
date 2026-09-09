"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DialogRoot, DialogContent, SheetContent } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { formatMoney } from "@/lib/format";
import { cancelBooking, reportProblem, respondToClaim } from "@/app/(renter)/actions";
import { cn } from "@/lib/cn";

/** One row of the M11 actions list: title, meta, chevron. Renders as a link, a button or a disabled row. */
export function ActionRow({ title, meta, href, onClick, disabled, icon, external, danger, last, testId }: { title: string; meta?: string; href?: string; onClick?: () => void; disabled?: boolean; icon?: IconName; external?: boolean; danger?: boolean; last?: boolean; testId?: string }) {
  const cls = cn("flex w-full items-center gap-3 px-3.5 py-3 text-left text-charcoal no-underline hover:bg-ivory/60", !last && "border-b border-border", disabled && "opacity-60 hover:bg-transparent cursor-not-allowed");
  const inner = (
    <>
      {icon && <Icon name={icon} size={18} className={danger ? "text-error-text" : "text-text-2"} />}
      <div className="min-w-0 flex-1">
        <div className={cn("text-[14px] font-semibold", danger && !disabled && "text-error-text")}>{title}</div>
        {meta && <div className="text-[12px] text-text-3">{meta}</div>}
      </div>
      {!disabled && <Icon name={external ? "download" : "chevron-right"} size={16} className="text-text-3" />}
    </>
  );
  if (disabled) return <div className={cls} aria-disabled>{inner}</div>;
  if (href) return <a href={href} className={cls} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} data-testid={testId}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cls} data-testid={testId}>{inner}</button>;
}

/** Cancel with the refund preview computed server-side from the booking's own policy snapshot. */
export function CancelAction({ bookingRef, preview, last }: { bookingRef: string; preview: { free: boolean; refunded_cents: number; kept_rental_cents: number; keep_pct: number; explanation: string } | null; last?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const desktop = useIsDesktop();
  if (!preview) return <ActionRow title="Cancel" meta="Not available once handed over" disabled last={last} icon="close" />;
  const confirm = () =>
    start(async () => {
      const r = await cancelBooking(bookingRef);
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      setOpen(false);
      toast({ title: "Booking cancelled", description: r.data.refunded_cents > 0 ? `${formatMoney(r.data.refunded_cents)} goes back to your card in 3–5 business days.` : undefined, tone: "ok" });
      router.refresh();
    });
  const body = (
    <div className="flex flex-col gap-3 text-[14px] leading-[1.5]">
      <p className="text-text-2">{preview.explanation}</p>
      <div className="card-sm flex flex-col gap-1.5 px-3.5 py-3 text-[13px]">
        <div className="flex justify-between"><span className="text-text-2">Refund to your card</span><span className="t-mono font-medium">{formatMoney(preview.refunded_cents)}</span></div>
        {preview.kept_rental_cents > 0 && <div className="flex justify-between"><span className="text-text-2">Kept by the provider ({preview.keep_pct}% of the rental)</span><span className="t-mono text-text-2">{formatMoney(preview.kept_rental_cents)}</span></div>}
      </div>
      <p className="text-[12px] text-text-3">Nothing has been held on your card — the hold is only placed at handoff.</p>
    </div>
  );
  const footer = (
    <>
      <Button variant="secondary" size={desktop ? "md" : "xl"} block={!desktop} onClick={() => setOpen(false)}>Keep booking</Button>
      <Button variant="danger" size={desktop ? "md" : "xl"} block={!desktop} onClick={confirm} loading={pending} data-testid="confirm-cancel">{preview.free ? "Cancel for free" : "Cancel booking"}</Button>
    </>
  );
  return (
    <>
      <ActionRow title="Cancel" meta={preview.free ? "Free — you're inside the free-cancellation window" : `${preview.keep_pct}% of the rental is kept after the free window`} onClick={() => setOpen(true)} icon="close" danger last={last} testId="cancel-booking" />
      <DialogRoot open={open} onOpenChange={setOpen}>
        {desktop ? <DialogContent title="Cancel this booking?" size="sm" footer={footer}>{body}</DialogContent> : <SheetContent title="Cancel this booking?" footer={<div className="flex flex-col gap-2 w-full">{footer}</div>}>{body}</SheetContent>}
      </DialogRoot>
    </>
  );
}

const KINDS = [
  ["fault", "Item isn't working"],
  ["damage", "Damage at handoff"],
  ["safety", "Safety concern"],
  ["missing", "Something is missing"],
  ["provider", "Problem with the provider"],
  ["other", "Something else"],
] as const;

export function ReportProblemAction({ bookingRef, last }: { bookingRef: string; last?: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("fault");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const desktop = useIsDesktop();
  const send = () =>
    start(async () => {
      const r = await reportProblem(bookingRef, kind, body);
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      setOpen(false);
      setBody("");
      toast({ title: "Report sent", description: "The provider and fab.rent support can see it on the booking.", tone: "ok" });
      router.refresh();
    });
  const form = (
    <div className="flex flex-col gap-3">
      <Field label="What happened?" id="report-kind">
        <Select id="report-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Details" id="report-body" hint="photos can be added in the message thread">
        <Textarea id="report-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Tell us what's wrong and when you noticed it" rows={4} />
      </Field>
      <p className="text-[12px] text-text-3">Safety issue right now? Stop using the item and call the provider first.</p>
    </div>
  );
  const footer = <Button size={desktop ? "md" : "xl"} block={!desktop} onClick={send} loading={pending} disabled={body.trim().length < 5}>Send report</Button>;
  return (
    <>
      <ActionRow title="Report a problem" meta="Fault, damage, safety" onClick={() => setOpen(true)} icon="alert" last={last} />
      <DialogRoot open={open} onOpenChange={setOpen}>
        {desktop ? <DialogContent title="Report a problem" size="sm" footer={footer}>{form}</DialogContent> : <SheetContent title="Report a problem" footer={footer}>{form}</SheetContent>}
      </DialogRoot>
    </>
  );
}

/** Return claim awaiting the renter's answer (inspecting): accept → hold captured for the amount; dispute → staff decide. */
export function ClaimResponse({ bookingRef, claim, holdCents }: { bookingRef: string; claim: { id: string; type: string; description: string | null; amount_cents: number; renter_respond_by: Date | null }; holdCents: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const act = (accept: boolean) =>
    start(async () => {
      const r = await respondToClaim(bookingRef, claim.id, accept);
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      toast({ title: accept ? "Claim accepted" : "Claim disputed", description: accept ? `${formatMoney(Math.min(claim.amount_cents, holdCents))} is captured from your hold; the rest is released.` : "fab.rent support will review both sides' evidence and decide within 2 business days.", tone: "ok" });
      router.refresh();
    });
  return (
    <div className="card overflow-hidden rounded-card-sm border-warn/60">
      <div className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[14px] font-bold capitalize">{claim.type} claim</div>
          <div className="t-mono text-[15px] font-medium">{formatMoney(claim.amount_cents)}</div>
        </div>
        {claim.description && <p className="text-[13px] leading-[1.5] text-text-2">{claim.description}</p>}
        <p className="text-[12px] text-text-3">Accepting captures {formatMoney(Math.min(claim.amount_cents, holdCents))} of your {formatMoney(holdCents, { whole: true })} hold and releases the rest. Disputing sends both sides&apos; photos to fab.rent support.{claim.renter_respond_by ? " Reply before the deadline or the claim is upheld." : ""}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border bg-paper px-4 py-3">
        <Button size="md" variant="secondary" onClick={() => act(false)} loading={pending} data-testid="dispute-claim">Dispute</Button>
        <Button size="md" onClick={() => act(true)} loading={pending} data-testid="accept-claim">Accept</Button>
      </div>
    </div>
  );
}
