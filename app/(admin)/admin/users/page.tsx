import type { Metadata } from "next";
import { requireStaff, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { adminUsers, adminUserDetail, type UserTab } from "@/lib/queries/admin";
import { fmt, now } from "@/lib/time";
import { TabChip } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/states";
import { UsersTable, type UserRow } from "./table";
import { UserPanel } from "./panel";

export const metadata: Metadata = { title: "Users" };
const TABS: Array<{ key: UserTab; label: string }> = [{ key: "all", label: "All roles" }, { key: "renters", label: "Renters" }, { key: "providers", label: "Providers" }, { key: "staff", label: "Staff" }, { key: "flagged", label: "Flagged" }, { key: "pending", label: "Pending verification" }, { key: "suspended", label: "Suspended" }];

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; id?: string }> }) {
  const [sp, , config] = await Promise.all([searchParams, requireStaff(), getLiveConfig()]);
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : "all") as UserTab;
  const { rows, counts, detail } = await withActor(async (trx) => ({ ...(await adminUsers(trx, { tab, q: sp.q })), detail: sp.id ? await adminUserDetail(trx, sp.id) : null }));
  const tz = config.market.timezone;
  const table: UserRow[] = rows.map((u) => ({ id: u.id, name: u.display_name, sub: u.sub, role: u.roleLabel, joined: fmt(u.joined_at, "MMM yyyy", tz), joined_ts: u.joined_at.getTime(), activity: u.activity, rating: u.rating, verification: u.verification, status: u.statusPill }));
  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <div className="min-w-0 flex-1 px-4 py-4 md:px-6 lg:px-7">
        <div className="mb-3.5 flex gap-1.5 overflow-x-auto scrollbar-none">
          {TABS.map((t) => <TabChip key={t.key} href={`/admin/users?tab=${t.key}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${sp.id ? `&id=${sp.id}` : ""}`} selected={tab === t.key} count={["flagged", "pending", "suspended"].includes(t.key) ? counts[t.key] : undefined}>{t.label}</TabChip>)}
        </div>
        <UsersTable rows={table} selected={detail?.id ?? null} />
      </div>
      {detail ? <div className="hidden xl:block"><UserPanel u={serialize(detail)} tz={tz} nowIso={now().toISOString()} /></div> : <aside className="hidden w-[400px] flex-none items-center justify-center border-l border-border bg-paper p-6 xl:flex"><EmptyState compact icon="users" title="Select a user" body="Verification, risk, open items and internal notes show here." /></aside>}
      {detail && <div className="fixed inset-0 z-40 flex justify-end bg-charcoal/30 xl:hidden"><div className="h-full w-full max-w-[440px] overflow-y-auto bg-paper"><UserPanel u={serialize(detail)} tz={tz} standalone nowIso={now().toISOString()} /></div></div>}
    </div>
  );
}

function serialize(d: NonNullable<Awaited<ReturnType<typeof adminUserDetail>>>) {
  return {
    id: d.id, public_id: d.public_id, name: d.display_name, roleLabel: d.roleLabel, joined_at: d.joined_at.toISOString(), neighbourhood: d.neighbourhood, email: d.email, phone: d.phone, status: d.status, flags: d.flags,
    id_verified: d.id_verified, id_verified_method: d.id_verified_method, completed_count: d.completed_count, spent_cents: d.spent_cents, rating: d.rating, rating_count: d.rating_count, late_return_count: d.late_return_count, claims_open: d.claims_open, claims_upheld: d.claims_upheld,
    disputes: d.disputes.map((x) => ({ code: x.code, status: x.status, summary: x.summary, last_event: x.last_event, last_event_at: x.last_event_at?.toISOString() ?? null, hold_cents: x.hold_cents, hold_status: x.hold_status })),
    notes: d.notes.map((n) => ({ id: n.id, author: n.author_name, body: n.body, at: n.created_at.toISOString() })),
    methods: d.methods, provider_id: d.provider_id, provider_kind: d.provider_kind, provider_verified: d.provider_verified, insurance_valid_until: d.insurance_valid_until?.toISOString() ?? null, tax_id_verified: d.tax_id_verified, payouts_paused: d.payouts_paused, units: Number(d.units ?? 0), provider_completed: d.provider_completed, staff_role: d.staff_role, resolved_count: d.resolved_count, two_factor: d.two_factor,
  };
}
