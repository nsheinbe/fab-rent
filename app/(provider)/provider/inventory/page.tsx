import type { Metadata } from "next";
import Link from "next/link";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now } from "@/lib/time";
import { providerInventory } from "@/lib/queries/provider";
import { formatDate } from "@/lib/format";
import { Pill } from "@/components/ui/pill";
import { StatCard } from "@/components/domain/shells";

export const metadata: Metadata = { title: "Inventory" };

const TONE: Record<string, "ok" | "warn" | "error" | "neutral"> = { rentable: "ok", service_due: "warn", in_maintenance: "error", retired: "neutral" };

/** Every unit across listings by serial, with service dates and what it's out on right now. */
export default async function InventoryPage() {
  const [actor, config] = await Promise.all([requireProvider(), getLiveConfig()]);
  const nowAt = now();
  const units = await withActor((trx) => providerInventory(trx, actor.provider.id, nowAt));
  const tz = config.market.timezone;
  const soon = new Date(nowAt.getTime() + 7 * 86_400_000);
  const counts = { total: units.filter((u) => u.status !== "retired").length, out: units.filter((u) => u.current).length, maint: units.filter((u) => u.status === "in_maintenance").length, due: units.filter((u) => u.status === "service_due" || (u.next_service_at && u.next_service_at <= soon)).length };
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 lg:px-7">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Units" value={counts.total} sub="excluding retired" />
        <StatCard label="Out on rentals" value={counts.out} sub="active right now" />
        <StatCard label="In maintenance" value={counts.maint} subTone={counts.maint ? "error" : "default"} sub={counts.maint ? "unavailable to renters" : "all units serviceable"} />
        <StatCard label="Service due ≤ 7 days" value={counts.due} subTone={counts.due ? "warn" : "default"} sub="by next-service date" />
      </div>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(0,1.6fr)_56px_150px_120px_120px_minmax(0,1.2fr)_120px] gap-3 border-b border-border bg-paper px-4 py-2.5 t-label text-text-3"><span>Listing</span><span>Unit</span><span>Serial</span><span>Hours</span><span>Next service</span><span>Currently</span><span>Status</span></div>
            {units.map((u) => (
              <div key={u.id} className="grid grid-cols-[minmax(0,1.6fr)_56px_150px_120px_120px_minmax(0,1.2fr)_120px] items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0">
                <Link href={`/provider/listings/${u.listing_id}#units`} className="truncate-1 font-semibold text-charcoal no-underline hover:text-cobalt">{u.title}</Link>
                <span>{u.unit_number}</span>
                <span className="t-mono text-[12px]">{u.serial}</span>
                <span className="text-text-2">{u.hours != null ? `${u.hours} h` : "—"}</span>
                <span className={u.next_service_at && u.next_service_at <= soon ? "font-semibold text-warn-text" : "text-text-2"}>{u.next_service_at ? formatDate(u.next_service_at, tz) : "—"}</span>
                <span className="truncate-1 text-text-2">{u.current ?? "In stock"}</span>
                <Pill tone={TONE[u.status] ?? "neutral"} size="xs" dot={u.status !== "retired"}>{u.status.replace("_", " ")}</Pill>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
