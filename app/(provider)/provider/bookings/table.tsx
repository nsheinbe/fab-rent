"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { DataTable, TwoLine, Mono, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/domain/pills";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/states";
import { formatMoney } from "@/lib/format";

export interface TableRow {
  ref: string;
  renter: string;
  trust: string;
  item: string;
  unit: string;
  start: string;
  end: string;
  days: number;
  fulfillment: "pickup" | "delivery";
  status: string;
  badge: { label: string; tone: "warn" | "cobalt" | "ok" | "error" | "neutral" } | null;
  total_cents: number;
  start_ts: number;
}

export function BookingsTable({ rows, selected }: { rows: TableRow[]; selected: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const columns: Column<TableRow>[] = [
    { key: "ref", header: "Ref", width: "112px", cell: (r) => <Mono className="text-[12px] font-medium">{r.ref}</Mono>, sortValue: (r) => r.ref },
    { key: "renter", header: "Renter", width: "minmax(0,1.2fr)", cell: (r) => <TwoLine primary={r.renter} secondary={r.trust} />, sortValue: (r) => r.renter },
    { key: "item", header: "Item · unit", width: "minmax(0,1.6fr)", cell: (r) => <TwoLine primary={r.item} secondary={r.unit} />, sortValue: (r) => r.item },
    { key: "dates", header: "Dates", width: "minmax(0,1.3fr)", cell: (r) => <TwoLine primary={r.start} secondary={`→ ${r.end} · ${r.days} d`} />, sortValue: (r) => r.start_ts, hideBelow: "md" },
    { key: "fulfil", header: "Fulfil.", width: "82px", cell: (r) => <span className="capitalize">{r.fulfillment}</span>, hideBelow: "lg" },
    { key: "status", header: "Status", width: "132px", cell: (r) => (r.badge ? <Pill tone={r.badge.tone} dot size="xs">{r.badge.label}</Pill> : <StatusPill status={r.status as never} size="xs" compact />), sortValue: (r) => r.status },
    { key: "total", header: "Total", width: "88px", align: "right", cell: (r) => <Mono className="font-medium">{formatMoney(r.total_cents)}</Mono>, sortValue: (r) => r.total_cents },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.ref}
      selectedKey={selected}
      dense
      onSelect={(r) => {
        const p = new URLSearchParams(params.toString());
        p.set("ref", r.ref);
        router.replace(`/provider/bookings?${p.toString()}`, { scroll: false });
      }}
      emptyState={<EmptyState compact icon="box" title="No bookings here" body="Try another tab or clear the search." />}
    />
  );
}
