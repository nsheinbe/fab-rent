"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { approveBooking, approveExtension, declineBooking, declineExtension } from "@/app/(provider)/actions";
import { formatMoney } from "@/lib/format";

/** Approve / Decline pair for requests and extension requests (P01 needs-action list, P02 panel). */
export function DecisionButtons({ bookingRef, kind, size = "md" }: { bookingRef: string; kind: "booking" | "extension"; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (approve: boolean) =>
    start(async () => {
      const r = kind === "booking" ? (approve ? await approveBooking(bookingRef) : await declineBooking(bookingRef)) : approve ? await approveExtension(bookingRef) : await declineExtension(bookingRef);
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      const charged = kind === "extension" && approve && r.data && typeof r.data === "object" && "charged_cents" in r.data ? (r.data as { charged_cents: number }).charged_cents : null;
      toast({ title: approve ? (kind === "booking" ? "Booking confirmed" : "Extension approved") : kind === "booking" ? "Request declined · renter refunded" : "Extension declined", description: charged ? `${formatMoney(charged)} charged to the renter.` : undefined, tone: "ok" });
      router.refresh();
    });
  return (
    <div className="flex items-center gap-2">
      <Button size={size} variant="secondary" onClick={() => run(false)} loading={pending} data-testid={`decline-${kind}`}>Decline</Button>
      <Button size={size} onClick={() => run(true)} loading={pending} data-testid={`approve-${kind}`}>Approve</Button>
    </div>
  );
}
