"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export const DialogRoot = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Centered dialog (desktop) — 16 px radius white card on a charcoal scrim. */
export function DialogContent({ title, description, children, className, footer, size = "md" }: { title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-charcoal/45 data-[state=open]:animate-[fr-fade-in_.15s_ease]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-white shadow-sticky outline-none data-[state=open]:animate-[fr-fade-in_.15s_ease] flex flex-col max-h-[calc(100vh-48px)]",
          size === "sm" ? "max-w-[420px]" : size === "lg" ? "max-w-[760px]" : "max-w-[560px]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[20px] font-extrabold tracking-[-0.02em] leading-tight">{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description className="mt-1 text-[14px] text-text-2 leading-[1.5]">{description}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="flex size-9 flex-none items-center justify-center rounded-full border border-border bg-white text-charcoal hover:bg-ivory" aria-label="Close">
            <Icon name="close" size={16} />
          </DialogPrimitive.Close>
        </div>
        <div className="px-6 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4 bg-paper rounded-b-card">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Mobile bottom sheet: 24 px top radius, drag handle, sticky footer, ivory surface (design M03/M07/M12). */
export function SheetContent({ title, description, children, className, footer, action, tall }: { title?: ReactNode; description?: ReactNode; children?: ReactNode; className?: string; footer?: ReactNode; action?: ReactNode; tall?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#6B675F]/70 data-[state=open]:animate-[fr-fade-in_.15s_ease]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[640px] rounded-t-[24px] bg-ivory shadow-sheet outline-none flex flex-col data-[state=open]:animate-[fr-sheet-in_.25s_cubic-bezier(.2,.8,.2,1)]",
          tall ? "top-[96px]" : "max-h-[92vh]",
          className,
        )}
      >
        <div className="mx-auto mt-2 h-[5px] w-10 rounded-pill bg-border-strong" aria-hidden />
        {(title || action) && (
          <div className="flex items-center justify-between gap-3 px-5 pt-3">
            <div className="min-w-0">
              {title ? <DialogPrimitive.Title className="text-[20px] lg:text-[22px] font-extrabold tracking-[-0.02em] leading-tight">{title}</DialogPrimitive.Title> : <DialogPrimitive.Title className="sr-only">Sheet</DialogPrimitive.Title>}
              {description && <DialogPrimitive.Description className="mt-1 text-[13px] lg:text-[14px] text-text-2 leading-[1.5]">{description}</DialogPrimitive.Description>}
            </div>
            {action}
          </div>
        )}
        {!title && !action && <DialogPrimitive.Title className="sr-only">Sheet</DialogPrimitive.Title>}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">{children}</div>
        {footer && <div className="flex-none border-t border-border bg-paper px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
