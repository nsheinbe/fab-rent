"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { RadioCard, RadioDot } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { completeMockOnboarding } from "@/app/(provider)/actions";
import type { OnboardingScenario } from "@/lib/payouts/types";

const OUTCOMES: Array<{ id: OnboardingScenario; title: string; body: string }> = [
  { id: "verified", title: "Complete verification", body: "Identity, tax ID and bank account all verify. Payouts are enabled." },
  { id: "tax_id_missing", title: "Submit without a tax ID", body: "The bank account verifies; the tax ID is left for later. fab.rent pauses payouts until it arrives." },
  { id: "bank_failed", title: "Bank details fail verification", body: "The account number is rejected by the bank check. Payouts stay disabled until a working account is added." },
  { id: "pending", title: "Leave a document under review", body: "Everything is submitted; the ID document is still being reviewed. Payouts wait for the outcome." },
];

export function MockOnboardingForm({ providerId, businessType, currentStatus, last4, bankName, returnUrl, isOwner }: { providerId: string; businessType: "individual" | "company"; currentStatus: string; last4: string; bankName: string; returnUrl: string; isOwner: boolean }) {
  const [scenario, setScenario] = useState<OnboardingScenario>("verified");
  const [bank, setBank] = useState(bankName);
  const [account, setAccount] = useState(last4 ? `•••• ${last4}` : "");
  const [pending, start] = useTransition();
  const toast = useToast();
  const submit = () =>
    start(async () => {
      const digits = account.replace(/\D/g, "");
      const r = await completeMockOnboarding(providerId, { scenario, last4: digits.length >= 4 ? digits.slice(-4) : undefined, bank_name: bank.trim() || undefined });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      window.location.assign(returnUrl);
    });
  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between text-[12px] text-text-3"><span>{businessType === "company" ? "Business account" : "Individual account"}</span><span>Currently: {currentStatus}</span></div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Bank" id="ob-bank"><Input id="ob-bank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Maren Bank" /></Field>
        <Field label="Account number" id="ob-account" hint="only the last four digits are kept"><Input id="ob-account" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="000123456789" inputMode="numeric" mono /></Field>
      </div>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="How the verification ends">
        {OUTCOMES.map((o) => (
          <RadioCard key={o.id} value={o.id} selected={scenario === o.id} onSelect={() => setScenario(o.id)} className="flex items-start gap-3 text-left">
            <RadioDot selected={scenario === o.id} />
            <span className="min-w-0"><span className="block text-[13px] font-semibold" data-testid={`mock-onboarding-${o.id}`}>{o.title}</span><span className="block text-[12px] text-text-3">{o.body}</span></span>
          </RadioCard>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button size="md" variant="secondary" href="/provider/earnings">Cancel</Button>
        <Button size="md" onClick={submit} loading={pending} disabled={!isOwner} title={isOwner ? undefined : "Owners only"} data-testid="mock-onboarding-continue">Continue to fab.rent</Button>
      </div>
    </div>
  );
}
