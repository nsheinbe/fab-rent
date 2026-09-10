"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { updateProviderSettings } from "@/app/(provider)/actions";

interface P { name: string; about: string; address: string; neighbourhood: string; response_minutes: number; hours_label: string; delivery_vans: string[]; kind: string; verified: boolean; insurance_valid_until: string | null; accepting: boolean; tax_id: string | null; tax_id_verified: boolean; payout_account_masked: string | null; payout_account_verified: boolean }

export function SettingsForm({ providerId, isOwner, provider, members, neighbourhoods, notifications }: { providerId: string; isOwner: boolean; provider: P; members: Array<{ role: string; name: string; email: string | null }>; neighbourhoods: string[]; notifications?: ReactNode }) {
  const [f, setF] = useState(provider);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const dirty = JSON.stringify(f) !== JSON.stringify(provider);
  const save = () =>
    start(async () => {
      const r = await updateProviderSettings(providerId, { name: f.name, about: f.about, address: f.address, neighbourhood: f.neighbourhood, response_minutes: f.response_minutes, hours_label: f.hours_label, delivery_vans: f.delivery_vans });
      toast({ title: r.ok ? "Settings saved" : r.error, tone: r.ok ? "ok" : "error" });
      if (r.ok) router.refresh();
    });
  return (
    <div className="grid gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-7">
      <div className="flex flex-col gap-5">
        <section className="card flex flex-col gap-3.5 p-5">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-bold">Business profile</h2><Button size="md" onClick={save} loading={pending} disabled={!dirty || !isOwner}>Save</Button></div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Business name" id="s-name"><Input id="s-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!isOwner} /></Field>
            <Field label="Neighbourhood" id="s-hood"><Select id="s-hood" value={f.neighbourhood} onChange={(e) => setF({ ...f, neighbourhood: e.target.value })} disabled={!isOwner}><option value="">—</option>{neighbourhoods.map((n) => <option key={n}>{n}</option>)}</Select></Field>
            <Field label="Address" id="s-addr"><Input id="s-addr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} disabled={!isOwner} /></Field>
            <Field label="Opening hours" id="s-hours"><Input id="s-hours" value={f.hours_label} onChange={(e) => setF({ ...f, hours_label: e.target.value })} placeholder="Mon–Sat 07:00–18:00" disabled={!isOwner} /></Field>
            <Field label="Typical response time (minutes)" id="s-resp" hint="shown to renters"><Input id="s-resp" type="number" min={1} value={f.response_minutes} onChange={(e) => setF({ ...f, response_minutes: Number(e.target.value || 60) })} disabled={!isOwner} /></Field>
            <Field label="Delivery vans" id="s-vans" hint="one per line · drives the calendar and today board"><Textarea id="s-vans" rows={2} value={f.delivery_vans.join("\n")} onChange={(e) => setF({ ...f, delivery_vans: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })} disabled={!isOwner} /></Field>
          </div>
          <Field label="About" id="s-about"><Textarea id="s-about" rows={4} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} disabled={!isOwner} /></Field>
        </section>
        <section className="card p-5">
          <h2 className="text-[15px] font-bold">Team</h2>
          <div className="mt-3 flex flex-col divide-y divide-border">
            {members.map((m) => <div key={m.email ?? m.name} className="flex items-center gap-3 py-2.5"><Avatar name={m.name} size={32} tone="charcoal" /><div className="min-w-0 flex-1"><div className="text-[13px] font-semibold">{m.name}</div><div className="text-[11px] text-text-3">{m.email}</div></div><Pill tone={m.role === "owner" ? "cobalt" : "neutral"} size="xs">{m.role}</Pill></div>)}
          </div>
          <p className="mt-2 text-[12px] text-text-3">Staff can run handoffs, returns and messages. Owners also change listings, pricing and payout details. Invites are handled by fab.rent during the pilot.</p>
        </section>
      </div>
      <aside className="flex flex-col gap-4">
        <div className="card p-4">
          <div className="text-[13px] font-bold">Verification</div>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
            <li className="flex justify-between"><span className="text-text-2">{provider.kind === "business" ? "Business" : "Identity"}</span><Pill tone={provider.verified ? "ok" : "warn"} size="xs" dot>{provider.verified ? "Verified" : "Pending"}</Pill></li>
            <li className="flex justify-between"><span className="text-text-2">Insurance</span><span className="font-semibold">{provider.insurance_valid_until ? `valid to ${formatDate(new Date(provider.insurance_valid_until)).replace(/^\w+ /, "")}` : "not on file"}</span></li>
            <li className="flex justify-between"><span className="text-text-2">Tax ID</span><Pill tone={provider.tax_id_verified ? "ok" : "warn"} size="xs" dot>{provider.tax_id_verified ? "Verified" : "Pending"}</Pill></li>
            <li className="flex justify-between"><span className="text-text-2">Payout account</span><Pill tone={provider.payout_account_verified ? "ok" : "warn"} size="xs" dot>{provider.payout_account_verified ? "Verified" : "Pending"}</Pill></li>
          </ul>
          <Button size="sm" variant="secondary" className="mt-3 w-full" href="/provider/earnings">Payout account</Button>
        </div>
        <div className="card p-4 text-[12px] leading-[1.5] text-text-3">
          <div className="text-[13px] font-bold text-charcoal">Accepting bookings</div>
          The switch in the sidebar pauses new requests and instant bookings without touching existing ones. Listings stay visible with “not accepting bookings”.
        </div>
        {notifications}
      </aside>
    </div>
  );
}
