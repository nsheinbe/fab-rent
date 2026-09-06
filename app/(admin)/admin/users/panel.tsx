"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Textarea } from "@/components/ui/field";
import { SidePanel, PanelSection, KeyValueList } from "@/components/ui/side-panel";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { addInternalNote, clearUserFlag, setUserStatus } from "@/app/(admin)/actions";

export interface PanelUser {
  id: string; public_id: number; name: string; roleLabel: string; joined_at: string; neighbourhood: string | null; email: string | null; phone: string | null; status: string; flags: string[];
  id_verified: boolean; id_verified_method: string | null; completed_count: number; spent_cents: number; rating: number | null; rating_count: number; late_return_count: number; claims_open: number; claims_upheld: number;
  disputes: Array<{ code: string; status: string; summary: string; last_event: string | null; last_event_at: string | null; hold_cents: number; hold_status: string }>;
  notes: Array<{ id: string; author: string; body: string; at: string }>;
  methods: Array<{ brand: string; last4: string; is_default: boolean }>;
  provider_id: string | null; provider_kind: string | null; provider_verified: boolean | null; insurance_valid_until: string | null; tax_id_verified: boolean | null; payouts_paused: boolean | null; units: number; provider_completed: number | null;
  staff_role: string | null; resolved_count: number | null; two_factor: boolean | null;
}

/** A02 side panel: identity, verification, payment, open items, internal notes, actions. */
export function UserPanel({ u, tz, standalone, nowIso }: { u: PanelUser; tz: string; standalone?: boolean; nowIso: string }) {
  const soon = new Date(nowIso).getTime() + 45 * 86_400_000;
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); toast({ title: r.ok ? ok : r.error ?? "Failed", tone: r.ok ? "ok" : "error" }); if (r.ok) { setNote(""); router.refresh(); } });
  const isProvider = u.roleLabel === "Provider";
  const isStaff = u.roleLabel === "Staff";
  const header = (
    <div className="flex items-center gap-3">
      <Avatar name={u.name} size={44} tone={isProvider ? "charcoal" : isStaff ? "light" : "cobalt"} />
      <div className="min-w-0 flex-1">
        <div className="truncate-1 text-[15px] font-bold">{u.name}</div>
        <div className="truncate-1 text-[12px] text-text-3">{u.roleLabel} · #{u.public_id} · joined {formatDate(new Date(u.joined_at), tz).replace(/^\w+ \d+ /, "")} {new Date(u.joined_at).getFullYear()}{u.neighbourhood ? ` · ${u.neighbourhood}` : ""}</div>
      </div>
      {u.status !== "active" && <Pill tone={u.status === "suspended" ? "error" : "warn"} size="xs" dot>{u.status.replace("_", " ")}</Pill>}
      {standalone && <Link href="/admin/users" className="text-[12px] font-semibold text-cobalt no-underline">All users</Link>}
    </div>
  );
  const body = (
    <>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        {isStaff ? <Stat k="Resolved" v={`${u.resolved_count ?? 0} disputes`} /> : isProvider ? <Stat k="Units · rentals" v={`${u.units} · ${u.provider_completed ?? 0}`} /> : <Stat k="Rentals" v={`${u.completed_count} · ${formatMoney(u.spent_cents, { whole: true })}`} />}
        <Stat k={isProvider ? "Rating" : "Rating from providers"} v={u.rating ? `★ ${u.rating.toFixed(1)}` : "—"} />
        {!isStaff && !isProvider && <Stat k="Late returns" v={`${u.late_return_count} of ${u.completed_count}`} />}
        {!isStaff && <Stat k="Claims" v={`${u.claims_open} open · ${u.claims_upheld} upheld`} />}
      </div>
      <PanelSection label="Verification">
        <KeyValueList size="sm" rows={isStaff ? [{ k: "Two-factor", v: u.two_factor ? "On" : "Off", tone: u.two_factor ? "ok" : "warn" }, { k: "Role", v: u.staff_role === "trust_safety" ? "Trust & safety" : "Marketplace ops" }] : isProvider ? [{ k: u.provider_kind === "business" ? "Business" : "Identity", v: u.provider_verified ? "Verified" : "Pending", tone: u.provider_verified ? "ok" : "warn" }, { k: "Insurance", v: u.insurance_valid_until ? `valid to ${formatDate(new Date(u.insurance_valid_until), tz).replace(/^\w+ /, "")}` : "not on file", tone: u.insurance_valid_until && new Date(u.insurance_valid_until).getTime() < soon ? "warn" : "default" }, { k: "Tax ID", v: u.tax_id_verified ? "Verified" : "Missing", tone: u.tax_id_verified ? "ok" : "warn" }, { k: "Payouts", v: u.payouts_paused ? "Paused" : "Active", tone: u.payouts_paused ? "warn" : "ok" }] : [{ k: "Photo ID", v: u.flags.includes("id_mismatch") ? "Mismatch — needs review" : u.id_verified ? `Verified${u.id_verified_method ? ` · ${u.id_verified_method.replace(/_/g, " ")}` : ""}` : "Not verified", tone: u.flags.includes("id_mismatch") ? "error" : u.id_verified ? "ok" : "warn" }, { k: "Phone · email", v: u.phone && u.email ? "Both confirmed" : u.email ? "Email only" : "—" }, { k: "Payment", v: u.methods.length ? `${u.methods[0]!.brand} •••• ${u.methods[0]!.last4} · ${u.flags.includes("chargeback") ? "1 chargeback" : "0 chargebacks"}` : "No card on file", tone: u.flags.includes("chargeback") ? "error" : "default" }]} />
        {u.flags.length > 0 && <div className="flex flex-wrap gap-1.5">{u.flags.map((f) => <button key={f} type="button" onClick={() => run(() => clearUserFlag(u.id, f), `Flag ${f} cleared`)} className="inline-flex h-6 items-center gap-1 rounded-pill bg-error-bg px-2 text-[11px] font-semibold text-error-text" title="Clear flag">{f.replace("_", " ")} ×</button>)}</div>}
      </PanelSection>
      {u.disputes.length > 0 && (
        <PanelSection label="Open items">
          {u.disputes.map((d) => <Link key={d.code} href={`/admin/disputes/${d.code}`} className="card-sm !rounded-panel flex items-center justify-between gap-3 px-3 py-2.5 text-charcoal no-underline"><div className="min-w-0"><div className="truncate-1 text-[13px] font-semibold"><span className="t-mono">{d.code}</span> · {d.summary}</div><div className="truncate-1 text-[11px] text-text-3">{d.last_event}{d.last_event_at ? ` ${formatDateTime(new Date(d.last_event_at), tz).replace(" · ", " ")}` : ""}{d.hold_status === "placed" ? ` · hold ${formatMoney(d.hold_cents, { whole: true })} in place` : ""}</div></div><Pill tone={d.status === "resolved" ? "neutral" : "warn"} size="xs">{d.status === "resolved" ? "Resolved" : "Open"}</Pill></Link>)}
        </PanelSection>
      )}
      <PanelSection label="Internal notes">
        {u.notes.map((n) => <div key={n.id} className="rounded-panel bg-white px-3 py-2 text-[12px] leading-[1.5]"><b>{n.author}</b> · {formatDate(new Date(n.at), tz).replace(/^\w+ /, "")} — {n.body}</div>)}
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note (staff only)" aria-label="Internal note" />
      </PanelSection>
    </>
  );
  const footer = (
    <div className="grid grid-cols-2 gap-2">
      <Button size="md" variant="secondary" href={u.email ? `mailto:${u.email}` : "#"} disabled={!u.email}>Message</Button>
      <Button size="md" variant="secondary" onClick={() => run(() => addInternalNote(isProvider && u.provider_id ? "provider" : "profile", isProvider && u.provider_id ? u.provider_id : u.id, note), "Note added")} disabled={note.trim().length < 2} loading={pending}>Add note</Button>
      <Button size="md" variant="secondary" href={`/admin/bookings?q=${encodeURIComponent(u.name)}`}>View bookings</Button>
      {u.status === "suspended" ? <Button size="md" onClick={() => run(() => setUserStatus(u.id, "active", note || "reinstated by ops"), "Account reinstated")} loading={pending}>Reinstate</Button> : <Button size="md" variant="danger" onClick={() => run(() => setUserStatus(u.id, "suspended", note || "suspended by ops"), "Account suspended")} loading={pending} disabled={isStaff}>Suspend</Button>}
    </div>
  );
  if (standalone) return <div className="flex flex-col gap-3.5 p-4">{header}{body}{footer}</div>;
  return <SidePanel header={header} footer={footer} width={400} className="sticky top-16 h-[calc(100vh-64px)]">{body}</SidePanel>;
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-panel border border-border bg-white px-3 py-2"><div className="text-text-3">{k}</div><div className="text-[13px] font-bold">{v}</div></div>;
}
