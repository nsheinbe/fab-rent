"use client";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

export function CopyRef({ refCode }: { refCode: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(refCode).then(() => toast({ title: "Reference copied", tone: "ok" }))} className="card-sm flex items-center gap-2 rounded-control px-3 py-2" aria-label={`Copy booking reference ${refCode}`}>
      <span className="text-[11px] font-semibold text-text-3">REF</span>
      <span className="t-mono text-[15px] font-medium tracking-[.04em]" data-testid="booking-ref">{refCode}</span>
      <Icon name="copy" size={14} className="text-cobalt" />
    </button>
  );
}
