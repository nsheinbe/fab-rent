"use client";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  /** grid track, e.g. "104px" or "minmax(0,1.5fr)" */
  width: string;
  align?: "left" | "right";
  cell: (row: Row) => ReactNode;
  sortValue?: (row: Row) => string | number | null | undefined;
  hideBelow?: "md" | "lg";
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  selectedKey?: string | null;
  onSelect?: (row: Row) => void;
  emptyState?: ReactNode;
  className?: string;
  dense?: boolean;
  initialSort?: { key: string; dir: "asc" | "desc" };
  rowHref?: (row: Row) => string | undefined;
}

/**
 * Dense, sortable, selectable table built on CSS grid. Columns are `minmax(0, Nfr)` or fixed px,
 * every cell has `min-width:0` and truncates, so dense rows never overflow their column.
 */
export function DataTable<Row>({ columns, rows, rowKey, selectedKey, onSelect, emptyState, className, dense, initialSort, rowHref }: DataTableProps<Row>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(initialSort ?? null);
  const template = columns.map((c) => c.width).join(" ");
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = sv(a);
      const y = sv(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const hide = (c: Column<Row>) => (c.hideBelow === "md" ? "hidden md:block" : c.hideBelow === "lg" ? "hidden lg:block" : "");

  return (
    <div className={cn("card overflow-hidden text-[13px]", className)} role="table">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid gap-3 border-b border-border bg-paper px-4 py-2.5 t-label text-text-3" style={{ gridTemplateColumns: template }} role="row">
            {columns.map((c) => (
              <div key={c.key} role="columnheader" aria-sort={c.sortValue ? (sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined} className={cn("min-w-0 flex items-center gap-1", c.align === "right" && "justify-end", hide(c))}>
                {c.sortValue ? (
                  <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 uppercase hover:text-charcoal">
                    {c.header}
                    {sort?.key === c.key && <Icon name="chevron-down" size={10} className={cn("transition-transform", sort.dir === "asc" && "rotate-180")} />}
                  </button>
                ) : (
                  c.header
                )}
              </div>
            ))}
          </div>
          {sorted.length === 0 && emptyState && <div className="p-4">{emptyState}</div>}
          {sorted.map((row) => {
            const key = rowKey(row);
            const selected = selectedKey === key;
            const href = rowHref?.(row);
            const Tag = href ? "a" : onSelect ? "button" : "div";
            return (
              <Tag
                key={key}
                role="row"
                {...(href ? { href } : {})}
                {...(Tag === "button" ? { type: "button" as const, onClick: () => onSelect?.(row) } : {})}
                aria-selected={selected || undefined}
                className={cn(
                  "grid w-full items-center gap-3 border-b border-border px-4 text-left last:border-b-0 transition-colors",
                  dense ? "py-[11px]" : "py-3",
                  (onSelect || href) && "hover:bg-ivory/70 cursor-pointer",
                  selected && "bg-cobalt-wash shadow-[inset_3px_0_0_#1E42E8]",
                )}
                style={{ gridTemplateColumns: template }}
              >
                {columns.map((c) => (
                  <div key={c.key} role="cell" className={cn("min-w-0 truncate-1", c.align === "right" && "text-right", hide(c))}>
                    {c.cell(row)}
                  </div>
                ))}
              </Tag>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Two-line cell: bold name + 11 px meta line, both truncating. */
export function TwoLine({ primary, secondary, mono }: { primary: ReactNode; secondary?: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={cn("truncate-1 font-semibold", mono && "t-mono text-[12px]")}>{primary}</div>
      {secondary && <div className="truncate-1 text-[11px] text-text-3">{secondary}</div>}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("t-mono", className)}>{children}</span>;
}
