"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DialogRoot, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { updateProviderSettings } from "@/app/(provider)/actions";

const LABELS: Record<string, string> = { weekly_mon: "Weekly · Mondays", weekly_tue: "Weekly · Tuesdays", weekly_wed: "Weekly · Wednesdays", weekly_thu: "Weekly · Thursdays", weekly_fri: "Weekly · Fridays", daily: "Daily", monthly_1: "Monthly · 1st" };

export function PayoutSettings({ providerId, schedule, schedules, account, taxId, isOwner }: { providerId: string; schedule: string; schedules: string[]; account: string | null; taxId: string | null; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ schedule, account: "", taxId: taxId ?? "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const save = () =>
    start(async () => {
      const masked = form.account.replace(/\s+/g, "") ? `Maren Bank •••• ${form.account.replace(/\D/g, "").slice(-4)}` : undefined;
      const r = await updateProviderSettings(providerId, { payout_schedule: form.schedule, payout_account_masked: masked, tax_id: form.taxId || undefined });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      setOpen(false);
      toast({ title: "Payout settings saved", description: masked ? "Only the last four digits are stored on fab.rent." : undefined, tone: "ok" });
      router.refresh();
    });
  return (
    <>
      <Button size="md" variant="secondary" className="mt-3 w-full" onClick={() => setOpen(true)} disabled={!isOwner} title={isOwner ? undefined : "Owners only"}>Change payout account</Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent title="Payout settings" size="sm" footer={<><Button size="md" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button size="md" onClick={save} loading={pending}>Save</Button></>}>
          <div className="flex flex-col gap-3">
            <Field label="Schedule" id="ps-schedule"><Select id="ps-schedule" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })}>{schedules.map((s) => <option key={s} value={s}>{LABELS[s] ?? s}</option>)}</Select></Field>
            <Field label="Bank account" id="ps-account" hint={account ? `currently ${account}` : "not set"}><Input id="ps-account" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} placeholder="Account number" inputMode="numeric" mono /></Field>
            <Field label="Tax ID" id="ps-tax"><Input id="ps-tax" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} placeholder="PM-00-000-000" mono /></Field>
            <p className="text-[12px] text-text-3">Account details are tokenised by the payout provider; fab.rent keeps only a masked label. Changing the account pauses payouts until it is verified (mock: instant).</p>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
