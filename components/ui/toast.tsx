"use client";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  tone?: "ok" | "error" | "neutral";
}

const ToastContext = createContext<{ toast: (t: Omit<ToastMessage, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMessage[]>([]);
  const toast = useCallback((t: Omit<ToastMessage, "id">) => {
    setItems((prev) => [...prev, { ...t, id: Date.now() + Math.random() }]);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="down" duration={4500}>
        {children}
        {items.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            onOpenChange={(open) => !open && setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className={cn(
              "flex items-start gap-3 rounded-[12px] border px-4 py-3 shadow-card bg-charcoal text-white border-charcoal data-[state=open]:animate-[fr-toast-in_.2s_ease]",
            )}
          >
            <span className={cn("mt-0.5 flex size-5 items-center justify-center rounded-full", t.tone === "error" ? "bg-error" : t.tone === "ok" ? "bg-ok" : "bg-white/15")}>
              <Icon name={t.tone === "error" ? "alert" : "check"} size={12} strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <ToastPrimitive.Title className="text-[14px] font-semibold">{t.title}</ToastPrimitive.Title>
              {t.description && <ToastPrimitive.Description className="text-[12px] text-on-dark-muted">{t.description}</ToastPrimitive.Description>}
            </div>
            <ToastPrimitive.Close className="ml-auto text-on-dark-muted hover:text-white" aria-label="Dismiss">
              <Icon name="close" size={14} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] lg:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex w-[min(92vw,420px)] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx.toast;
}
