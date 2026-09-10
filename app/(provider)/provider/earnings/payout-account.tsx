"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DialogRoot, DialogContent } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { refreshPayoutAccount, startPayoutOnboarding, updatePayoutSchedule } from "@/app/(provider)/actions";
import type { PayoutAccountStatus } from "@/lib/payouts/requirements";

const LABELS: Record<string, string> = { weekly_mon: "Weekly · Mondays", weekly_tue: "Weekly · Tuesdays", weekly_wed: "Weekly · Wednesdays", weekly_thu: "Weekly · Thursdays", weekly_fri: "Weekly · Fridays", daily: "Daily", monthly: "Monthly · 1st", monthly_1: "Monthly · 1st" };

/**
 * The actions under the payout account card. Onboarding is hosted by the payout provider (Stripe,
 * or the demo page in mock mode): the server action creates the account and returns the URL, and
 * the browser goes there. No frame in the design bundle — built from the style guide.
 */
export function PayoutAccountCard({ providerId, status, isOwner, hosted, schedule, schedules }: { providerId: string; status: PayoutAccountStatus; isOwner: boolean; hosted: "mock" | "stripe"; schedule: string; schedules: string[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [sched, setSched] = useState(schedule);
  const router = useRouter();
  const toast = useToast();
  const host = hosted === "stripe" ? "Stripe" : "the demo payout provider";
  const primary = status === "not_connected" ? "Set up payouts" : status === "onboarding" ? "Continue verification" : status === "verified" ? "Update payout details" : "Resolve with " + host;
  const go = () =>
    start(async () => {
      const r = await startPayoutOnboarding(providerId);
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      window.location.assign(r.data.url);
    });
  const refresh = () =>
    start(async () => {
      const r = await refreshPayoutAccount(providerId);
      toast({ title: r.ok ? `Payout account refreshed${r.data.reason ? ` · ${r.data.reason}` : " · up to date"}` : r.error, tone: r.ok ? "ok" : "error" });
      router.refresh();
    });
  const saveSchedule = () =>
    start(async () => {
      const r = await updatePayoutSchedule(providerId, sched);
      toast({ title: r.ok ? "Payout schedule saved" : r.error, tone: r.ok ? "ok" : "error" });
      if (r.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  return (
    <div className="mt-3 flex flex-col gap-2">
      <Button size="md" variant={status === "verified" ? "secondary" : "primary"} className="w-full" onClick={go} loading={pending} disabled={!isOwner} title={isOwner ? undefined : "Owners only"} data-testid="payout-onboard">
        {primary}
      </Button>
      <div className="flex gap-2">
        {status !== "not_connected" && (
          <Button size="sm" variant="secondary" className="flex-1" onClick={refresh} loading={pending} data-testid="payout-refresh">
            Refresh status
          </Button>
        )}
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setOpen(true)} disabled={!isOwner} title={isOwner ? undefined : "Owners only"} data-testid="payout-schedule">
          Schedule
        </Button>
      </div>
      <p className="text-[12px] text-text-3">
        {status === "not_connected" ? `Identity, tax ID and bank details are collected by ${host}; fab.rent keeps only the masked account and what is still outstanding.` : `Managed by ${host}. Cleared earnings go out on the schedule while the account is verified; anything outstanding pauses them.`}
      </p>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Payout schedule"
          size="sm"
          footer={
            <>
              <Button size="md" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="md" onClick={saveSchedule} loading={pending}>Save</Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Schedule" id="ps-schedule">
              <Select id="ps-schedule" value={sched} onChange={(e) => setSched(e.target.value)}>
                {schedules.map((s) => (
                  <option key={s} value={s}>{LABELS[s] ?? s}</option>
                ))}
              </Select>
            </Field>
            <p className="text-[12px] text-text-3">Applies from the next run. Earnings clear at return check-in and go out on the next scheduled day once they reach the marketplace minimum.</p>
          </div>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
