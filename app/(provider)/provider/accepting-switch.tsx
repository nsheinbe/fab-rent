"use client";
import { useOptimistic, useTransition } from "react";
import { Switch } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { setAcceptingBookings } from "@/app/(provider)/actions";

export function AcceptingSwitch({ providerId, accepting }: { providerId: string; accepting: boolean }) {
  const [value, setValue] = useOptimistic(accepting);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <label className="flex items-center justify-between gap-2 text-[12px] font-semibold">
      <span className={value ? "text-ok-text" : "text-text-3"}>{value ? "Accepting bookings" : "Paused"}</span>
      <Switch
        size="sm"
        checked={value}
        disabled={pending}
        aria-label="Accepting bookings"
        onCheckedChange={(v) =>
          start(async () => {
            setValue(v);
            const r = await setAcceptingBookings(providerId, v);
            if (!r.ok) toast({ title: r.error, tone: "error" });
          })
        }
      />
    </label>
  );
}
