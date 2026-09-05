"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { toggleSaved } from "@/app/(renter)/actions";
import { useToast } from "@/components/ui/toast";

export function SaveButton({ listingId, saved: initial, variant = "round", className, signedIn }: { listingId: string; saved: boolean; variant?: "round" | "pill"; className?: string; signedIn: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const onClick = () =>
    start(async () => {
      if (!signedIn) {
        router.push(`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      const r = await toggleSaved(listingId);
      if (r.ok) {
        setSaved(r.data.saved);
        toast({ title: r.data.saved ? "Saved to your list" : "Removed from your list", tone: "ok" });
      } else toast({ title: r.error, tone: "error" });
    });
  const icon = <Icon name={saved ? "heart-filled" : "heart"} size={variant === "round" ? 18 : 16} className={saved ? "text-cobalt" : undefined} />;
  if (variant === "pill") {
    return (
      <button type="button" onClick={onClick} disabled={pending} aria-pressed={saved} className={cn("flex h-[38px] items-center gap-2 rounded-pill border border-border-strong bg-white px-3.5 text-[13px] font-semibold", className)}>
        {icon}
        {saved ? "Saved" : "Save"}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={pending} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save"} className={cn("flex size-10 items-center justify-center rounded-full bg-paper/90", className)}>
      {icon}
    </button>
  );
}
