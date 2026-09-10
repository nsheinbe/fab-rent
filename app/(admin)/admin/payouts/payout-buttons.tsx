"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { payoutAction } from "@/app/(admin)/actions";

/** Ops actions per payout row. Retry, Release and Pay now all run the real transfer attempt (Phase 7). */
export function PayoutButtons({ payoutId, status, compact }: { payoutId: string; status: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (a: "retry" | "remind" | "release" | "pay_now") =>
    start(async () => {
      const r = await payoutAction(payoutId, a);
      toast({ title: r.ok ? (a === "retry" ? "Transfer retried · paid · provider notified" : a === "remind" ? "Reminder sent" : a === "pay_now" ? "Paid · provider notified" : "Released · paid · provider notified") : r.error, tone: r.ok ? "ok" : "error" });
      router.refresh();
    });
  if (status === "failed") return <div className="flex gap-1.5"><Button size="sm" variant="secondary" onClick={() => run("remind")} loading={pending}>Contact</Button>{!compact && <Button size="sm" onClick={() => run("retry")} loading={pending} data-testid="retry-payout">Retry</Button>}</div>;
  if (status === "paused") return <div className="flex gap-1.5"><Button size="sm" variant="secondary" onClick={() => run("remind")} loading={pending}>Remind</Button>{!compact && <Button size="sm" onClick={() => run("release")} loading={pending} data-testid="release-payout">Release</Button>}</div>;
  if (status === "scheduled" && !compact) return <div className="flex gap-1.5"><Button size="sm" variant="secondary" onClick={() => run("pay_now")} loading={pending} data-testid="pay-payout-now">Pay now</Button></div>;
  return null;
}
