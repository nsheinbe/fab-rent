import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { adminBookings } from "@/lib/queries/admin";
import { formatDateTime, formatMoney } from "@/lib/format";
import { StatusPill } from "@/components/domain/pills";
import type { BookingStatus } from "@/lib/booking-state/status";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Bookings" };

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [sp, , config] = await Promise.all([searchParams, requireStaff(), getLiveConfig()]);
  const rows = await withActor((trx) => adminBookings(trx, sp.q));
  const tz = config.market.timezone;
  return (
    <div className="px-4 py-4 md:px-6 lg:px-7">
      {rows.length === 0 ? <EmptyState icon="box" title="No bookings match" body={sp.q ? `Nothing for “${sp.q}”.` : undefined} /> : (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto"><div className="min-w-[900px]">
            <div className="grid grid-cols-[110px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_90px_120px] gap-3 border-b border-border bg-paper px-4 py-2.5 t-label text-text-3"><span>Ref</span><span>Item</span><span>Renter</span><span>Provider</span><span>Dates</span><span className="text-right">Charged</span><span>Status</span></div>
            {rows.map((b) => (
              <div key={b.ref} className="grid grid-cols-[110px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_90px_120px] items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0">
                <Link href={`/rentals/${b.ref}`} className="t-mono text-[12px] font-medium text-charcoal no-underline hover:text-cobalt">{b.ref}</Link>
                <span className="truncate-1 font-semibold">{b.title}</span>
                <span className="truncate-1 text-text-2">{b.renter}</span>
                <span className="truncate-1 text-text-2">{b.provider}</span>
                <span className="truncate-1 text-text-2">{formatDateTime(b.start_at, tz).replace(" · ", " ")} → {formatDateTime(b.end_at, tz).replace(" · ", " ")}</span>
                <span className="t-mono text-right">{formatMoney(b.charged_cents)}</span>
                <StatusPill status={b.status as BookingStatus} size="xs" compact />
              </div>
            ))}
          </div></div>
        </section>
      )}
    </div>
  );
}
