"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { DataTable, TwoLine, type Column } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/states";

export interface UserRow { id: string; name: string; sub: string; role: string; joined: string; joined_ts: number; activity: string; rating: number | null; verification: { label: string; tone: "ok" | "warn" | "error" }; status: { label: string; tone: "ok" | "warn" | "error" } }

export function UsersTable({ rows, selected }: { rows: UserRow[]; selected: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const columns: Column<UserRow>[] = [
    { key: "user", header: "User", width: "minmax(0,2fr)", cell: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={30} tone={r.role === "Provider" ? "charcoal" : r.role === "Staff" ? "light" : "cobalt"} /><TwoLine primary={r.name} secondary={r.sub} /></div>, sortValue: (r) => r.name },
    { key: "role", header: "Role", width: "84px", cell: (r) => r.role, sortValue: (r) => r.role },
    { key: "joined", header: "Joined", width: "88px", cell: (r) => <span className="text-text-2">{r.joined}</span>, sortValue: (r) => r.joined_ts, hideBelow: "md" },
    { key: "activity", header: "Activity", width: "minmax(0,1.1fr)", cell: (r) => <span className="text-text-2">{r.activity}</span>, hideBelow: "md" },
    { key: "rating", header: "Rating", width: "70px", cell: (r) => (r.rating == null ? <span className="text-text-3">—</span> : `★ ${r.rating.toFixed(1)}`), sortValue: (r) => r.rating ?? -1, hideBelow: "lg" },
    { key: "verification", header: "Verification", width: "130px", cell: (r) => <Pill tone={r.verification.tone} size="xs" dot>{r.verification.label}</Pill> },
    { key: "status", header: "Status", width: "116px", cell: (r) => <Pill tone={r.status.tone} size="xs" dot>{r.status.label}</Pill>, sortValue: (r) => r.status.label },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} selectedKey={selected} dense onSelect={(r) => { const p = new URLSearchParams(params.toString()); p.set("id", r.id); router.replace(`/admin/users?${p.toString()}`, { scroll: false }); }} emptyState={<EmptyState compact icon="users" title="No users match" />} />;
}
