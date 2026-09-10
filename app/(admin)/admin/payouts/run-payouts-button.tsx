"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { runPayoutsNow } from "@/app/(admin)/actions";

/** Runs the scheduled payout job on demand (what the cron does every morning). */
export function RunPayoutsButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = () =>
    start(async () => {
      const r = await runPayoutsNow();
      toast({ title: r.ok ? `Payout run · ${r.data.paid} paid · ${r.data.paused} paused · ${r.data.failed} failed · ${r.data.skipped} not due` : r.error, tone: r.ok ? "ok" : "error" });
      router.refresh();
    });
  return <Button size="sm" variant="secondary" onClick={run} loading={pending} data-testid="run-payouts">Run due payouts</Button>;
}
