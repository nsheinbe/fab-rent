"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { DialogRoot, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { openConversation } from "@/app/(renter)/actions";
import { assignUnit, cancelByProvider, dispatchBooking, markPrepared } from "@/app/(provider)/actions";
import { DecisionButtons } from "../decision-buttons";

/** Opens (or creates) the booking thread and jumps to the provider inbox. */
export function MessageRenterButton({ bookingRef, children, ...rest }: { bookingRef: string; children: React.ReactNode } & Omit<ButtonProps, "onClick" | "children">) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      {...rest}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await openConversation(bookingRef);
          if (!r.ok) {
            toast({ title: r.error, tone: "error" });
            return;
          }
          router.push(`/provider/inbox/${r.data.id}`);
        })
      }
    >
      {children}
    </Button>
  );
}

export function UnitSelect({ bookingRef, units, current }: { bookingRef: string; units: Array<{ id: string; unit_number: number; serial: string; free: boolean; status: string }>; current: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Select
      compact
      value={current ?? ""}
      disabled={pending}
      aria-label="Assigned unit"
      onChange={(e) =>
        start(async () => {
          const v = e.target.value || null;
          const r = await assignUnit(bookingRef, v);
          if (!r.ok) {
            toast({ title: r.error, tone: "error" });
            return;
          }
          toast({ title: r.data.unit_number ? `Unit ${r.data.unit_number} assigned` : "Unit unassigned", tone: "ok" });
          router.refresh();
        })
      }
    >
      <option value="">Unassigned</option>
      {units.map((u) => (
        <option key={u.id} value={u.id} disabled={!u.free && u.id !== current}>
          Unit {u.unit_number} · {u.serial}{!u.free && u.id !== current ? " · busy" : u.status !== "rentable" ? ` · ${u.status.replace("_", " ")}` : ""}
        </option>
      ))}
    </Select>
  );
}

interface ActionsProps {
  bookingRef: string;
  status: string;
  fulfillment: "pickup" | "delivery";
  hasExtension: boolean;
  handoffStarted: boolean;
  returnStarted: boolean;
  refundNote: string;
}

/** Footer of the P02 panel: the primary next step for the booking's status, then Message / Cancel. */
export function PanelActions({ bookingRef, status, fulfillment, hasExtension, handoffStarted, returnStarted, refundNote }: ActionsProps) {
  const [pending, start] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast({ title: r.error ?? "Something went wrong", tone: "error" });
        return;
      }
      toast({ title: ok, tone: "ok" });
      router.refresh();
    });
  const final = ["completed", "cancelled", "disputed"].includes(status);
  const cancellable = ["confirmed", "ready_for_pickup", "out_for_delivery"].includes(status);
  return (
    <div className="flex flex-col gap-2">
      {hasExtension && (
        <div className="flex items-center justify-between gap-3 rounded-panel bg-cobalt-tint px-3 py-2">
          <span className="text-[12px] font-semibold text-cobalt-hover">Extension requested</span>
          <DecisionButtons bookingRef={bookingRef} kind="extension" size="sm" />
        </div>
      )}
      {status === "requested" && <div className="flex justify-end"><DecisionButtons bookingRef={bookingRef} kind="booking" /></div>}
      {status === "confirmed" && fulfillment === "pickup" && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Button size="md" onClick={() => run(() => markPrepared(bookingRef), "Marked prepared — the renter has been told")} loading={pending} data-testid="mark-prepared">Mark prepared</Button>
          <Button size="md" variant="secondary" href={`/provider/bookings/${bookingRef}/handoff`} title="Print or start the handoff sheet" leading={<Icon name="file" size={14} />}>Handoff sheet</Button>
        </div>
      )}
      {status === "confirmed" && fulfillment === "delivery" && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Button size="md" onClick={() => run(() => dispatchBooking(bookingRef), "Dispatched — the renter sees the driver is on the way")} loading={pending} data-testid="dispatch" leading={<Icon name="van" size={14} />}>Dispatch</Button>
          <Button size="md" variant="secondary" href={`/provider/bookings/${bookingRef}/handoff`} leading={<Icon name="file" size={14} />}>Handoff sheet</Button>
        </div>
      )}
      {(status === "ready_for_pickup" || status === "out_for_delivery") && <Button size="md" href={`/provider/bookings/${bookingRef}/handoff`} leading={<Icon name="camera" size={14} />} data-testid="start-handoff">{handoffStarted ? "Continue handoff" : "Start handoff · record condition"}</Button>}
      {["active", "return_due", "overdue"].includes(status) && <Button size="md" href={`/provider/bookings/${bookingRef}/return`} leading={<Icon name="camera" size={14} />} data-testid="start-return">{returnStarted ? "Continue return check-in" : "Start return check-in"}</Button>}
      {status === "inspecting" && <Button size="md" variant="secondary" href={`/provider/bookings/${bookingRef}/return`}>Open return record</Button>}
      <div className="grid grid-cols-2 gap-2">
        <MessageRenterButton bookingRef={bookingRef} size="md" variant="secondary" leading={<Icon name="message" size={14} />}>Message</MessageRenterButton>
        {!final && status !== "requested" ? (
          <Button size="md" variant="secondary" onClick={() => setCancelOpen(true)} disabled={!cancellable} title={cancellable ? undefined : "Not available once handed over"}>Cancel booking</Button>
        ) : (
          <Button size="md" variant="secondary" href={`/api/bookings/${bookingRef}/receipt.pdf`} leading={<Icon name="download" size={14} />}>Receipt</Button>
        )}
      </div>
      {cancellable && <div className="text-center text-[11px] text-text-3">Cancel · {refundNote}</div>}
      <DialogRoot open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent title="Cancel this booking?" size="sm" description={`The renter is ${refundNote}. Provider cancellations count against your on-time rate.`} footer={<><Button size="md" variant="secondary" onClick={() => setCancelOpen(false)}>Keep it</Button><Button size="md" variant="danger" loading={pending} onClick={() => { setCancelOpen(false); run(() => cancelByProvider(bookingRef), "Booking cancelled · renter refunded"); }}>Cancel booking</Button></>}>
          <p className="text-[13px] text-text-2">If a unit broke down, consider reassigning to another unit instead — the renter keeps their dates.</p>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
