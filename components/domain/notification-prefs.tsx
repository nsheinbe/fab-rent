"use client";
import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { notificationCatalogue, optionalTemplatesFor, type NotificationPrefs, type TemplateKey } from "@/lib/notifications/catalogue";
import { updateNotificationPrefs } from "@/app/(renter)/actions";

/**
 * Per-message opt-outs (Phase 6). Only optional messages are listed; money and dispute messages are
 * always sent and say so. No design frame exists for this surface — it follows the profile cards.
 */
export function NotificationPrefsCard({ audience, initial, email, note }: { audience: "renter" | "provider"; initial: NotificationPrefs; email: string | null; note?: string }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [pending, start] = useTransition();
  const toast = useToast();
  const keys = optionalTemplatesFor(audience);
  const toggle = (key: TemplateKey, on: boolean) => {
    const previous = prefs;
    const next: NotificationPrefs = { ...prefs, [key]: on };
    setPrefs(next);
    start(async () => {
      const r = await updateNotificationPrefs(Object.fromEntries(keys.map((k) => [k, next[k] !== false])));
      if (!r.ok) {
        setPrefs(previous);
        toast({ title: r.error, tone: "error" });
        return;
      }
      toast({ title: on ? `${notificationCatalogue[key].label} emails on` : `${notificationCatalogue[key].label} emails off`, tone: "ok" });
    });
  };
  return (
    <section className="card-sm px-4 py-3.5" data-testid="notification-prefs">
      <div className="mb-1 text-[13px] font-bold">Notifications</div>
      <p className="mb-1 text-[12px] leading-[1.5] text-text-3">{note ?? `Sent by email to ${email ?? "the address on your profile"}.`} Receipts, refunds, holds, claims, disputes and payouts are always sent.</p>
      <ul className="flex flex-col divide-y divide-border">
        {keys.map((k) => (
          <li key={k} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">{notificationCatalogue[k].label}</div>
              <div className="text-[12px] text-text-3">{notificationCatalogue[k].description}</div>
            </div>
            <Switch size="sm" checked={prefs[k] !== false} onCheckedChange={(v) => toggle(k, v)} disabled={pending} aria-label={notificationCatalogue[k].label} name={`notify-${k}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
