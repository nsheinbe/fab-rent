"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { resolveReport } from "@/app/(admin)/actions";

export function ReportButtons({ reportId }: { reportId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (s: "resolved" | "dismissed") => start(async () => { const r = await resolveReport(reportId, s); toast({ title: r.ok ? `Report ${s}` : r.error, tone: r.ok ? "ok" : "error" }); router.refresh(); });
  return <div className="flex gap-1.5"><Button size="sm" variant="secondary" onClick={() => run("dismissed")} loading={pending}>Dismiss</Button><Button size="sm" onClick={() => run("resolved")} loading={pending}>Resolve</Button></div>;
}
