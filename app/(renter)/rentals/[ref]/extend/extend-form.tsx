"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { CapsLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatMoney, formatRate, formatDate } from "@/lib/format";
import { pctOf } from "@/lib/pricing/money";
import { requestExtension } from "@/app/(renter)/actions";

interface Props {
  bookingRef: string;
  endAt: string;
  dayCents: number;
  qty: number;
  holdCents: number;
  fulfillment: "pickup" | "delivery";
  collectWindow: { start: string; end: string } | null;
  providerName: string;
  responseMinutes: number | null;
  freeUntil: string | null;
  fees: { renter_fee_pct: number; sales_tax_pct: number };
  pending: { extra_days: number; amount_cents: number } | null;
  maxDays: number;
}

/** M12: availability checked against the unit's next booking, priced before asking, charged only when approved. */
export function ExtendForm(p: Props) {
  const [days, setDays] = useState(p.pending?.extra_days ?? 1);
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const end = new Date(p.endAt);
  const newEnd = new Date(end.getTime() + days * 86_400_000);
  const free = p.freeUntil ? new Date(p.freeUntil) : null;
  const fits = !free || newEnd.getTime() <= free.getTime();
  const rental = p.dayCents * days * Math.max(1, p.qty);
  const fee = pctOf(rental, p.fees.renter_fee_pct);
  const tax = pctOf(rental + fee, p.fees.sales_tax_pct);
  const total = rental + fee + tax;
  const providerShort = p.providerName.split(" ")[0]!;

  const submit = () =>
    start(async () => {
      const r = await requestExtension(p.bookingRef, days);
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      toast({ title: "Extension requested", description: `${providerShort} will answer shortly. ${formatMoney(r.data.amount_cents)} is charged only if they approve.`, tone: "ok" });
      router.push(`/rentals/${p.bookingRef}`);
    });

  return (
    <div className="flex flex-col gap-4 px-5 pt-5 pb-8 lg:px-6">
      <div className="card-sm flex items-center justify-between gap-4 px-4 py-3.5">
        <div>
          <CapsLabel>New return</CapsLabel>
          <div className="mt-1 text-[18px] font-extrabold tracking-[-0.01em]">{formatDateTime(newEnd).replace(" · ", " · ")}</div>
        </div>
        <Stepper value={days} onChange={setDays} min={1} max={p.maxDays} format={(v) => `+${v} ${v === 1 ? "day" : "days"}`} aria-label="Extra days" />
      </div>

      <div className={`flex items-start gap-2 rounded-panel px-3.5 py-3 text-[13px] leading-[1.5] ${fits ? "bg-ok-bg text-ok-text" : "bg-warn-bg text-warn-text"}`}>
        <Icon name={fits ? "check" : "alert"} size={16} strokeWidth={2.5} className="mt-px flex-none" />
        <span>{fits ? (free ? `Your unit is free until ${formatDate(free)} — no swap needed.` : "Your unit has nothing booked after you — no swap needed.") : `Your unit is booked from ${formatDate(free!)}. ${providerShort} may still be able to swap units — message them, or choose fewer days.`}</span>
      </div>

      <div className="card-sm flex flex-col gap-2 px-4 py-3.5 text-[13px]">
        <div className="flex justify-between"><span className="text-text-2">{formatRate(p.dayCents)} × {days} extra {days === 1 ? "day" : "days"}{p.qty > 1 ? ` × ${p.qty}` : ""}</span><span className="t-mono">{formatMoney(rental)}</span></div>
        <div className="flex justify-between"><span className="text-text-2">Service fee ({p.fees.renter_fee_pct}%)</span><span className="t-mono">{formatMoney(fee)}</span></div>
        <div className="flex justify-between"><span className="text-text-2">Sales tax {p.fees.sales_tax_pct}%</span><span className="t-mono">{formatMoney(tax)}</span></div>
        <div className="mt-1 flex items-center justify-between rounded-[8px] bg-charcoal px-3 py-2.5 text-white"><span className="t-label text-on-dark-muted">Charged when approved</span><span className="t-mono text-[16px] font-medium" data-testid="extension-total">{formatMoney(total)}</span></div>
      </div>

      <p className="text-[13px] leading-[1.5] text-text-2">
        {p.holdCents > 0 ? `Your ${formatMoney(p.holdCents, { whole: true })} hold stays as is. ` : ""}
        {p.fulfillment === "delivery" && p.collectWindow ? `Collection window moves to ${formatDate(newEnd).replace(/ \d+ \w+$/, "")} ${p.collectWindow.start}–${p.collectWindow.end}.` : `Return time moves to ${formatDateTime(newEnd).replace(" · ", ", ")}.`}
      </p>
      <p className="text-[12px] leading-[1.5] text-text-3">{p.providerName} usually answers within {p.responseMinutes ? `${p.responseMinutes} minutes` : "an hour"}. If they decline, nothing is charged and the original return time stands.</p>

      {p.pending && <div className="rounded-panel bg-cobalt-tint px-3.5 py-2.5 text-[12px] text-cobalt-hover">You already asked for +{p.pending.extra_days} {p.pending.extra_days === 1 ? "day" : "days"} ({formatMoney(p.pending.amount_cents)}). Sending a new request replaces it.</div>}

      <Button size="xl" block className="!rounded-[12px] mt-2" onClick={submit} loading={busy} disabled={!fits} data-testid="request-extension">Request extension</Button>
    </div>
  );
}
