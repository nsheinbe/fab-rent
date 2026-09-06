"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { payoutAction } from "@/app/(admin)/actions";

export function PayoutButtons({ payoutId, status, compact }: { payoutId: string; status: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (a: "retry" | "remind" | "release") => start(async () => { const r = await payoutAction(payoutId, a); toast({ title: r.ok ? (a === "retry" ? "Payout re-queued" : a === "remind" ? "Reminder sent" : "Payout released") : r.error, tone: r.ok ? "ok" : "error" }); router.refresh(); });
  if (status === "failed") return <div className="flex gap-1.5"><Button size="sm" variant="secondary" onClick={() => run("remind")} loading={pending}>Contact</Button>{!compact && <Button size="sm" onClick={() => run("retry")} loading={pending}>Retry</Button>}</div>;
  if (status === "paused") return <div className="flex gap-1.5"><Button size="sm" variant="secondary" onClick={() => run("remind")} loading={pending}>Remind</Button>{!compact && <Button size="sm" onClick={() => run("release")} loading={pending}>Release</Button>}</div>;
  return null;
}
