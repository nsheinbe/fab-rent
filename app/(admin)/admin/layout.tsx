import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now, fmt } from "@/lib/time";
import { sql } from "@/lib/db";
import { Shell, StaffBlock, type NavItem } from "@/components/domain/shells";
import { AdminHeader } from "@/components/domain/admin-header";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/domain/logo";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · fab.rent Admin" } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor.userId) redirect(`/auth?next=${encodeURIComponent("/admin")}`);
  if (!actor.staff) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ivory p-6">
        <Logo size={24} />
        <EmptyState icon="shield" title="Staff only" body="The ops console is limited to fab.rent staff accounts. If you should have access, ask an admin to add you to the staff table." action={<Button size="md" href="/">Back to fab.rent</Button>} className="w-full max-w-[420px]" />
      </main>
    );
  }
  const config = await getLiveConfig();
  const nowAt = now();
  const tz = config.market.timezone;
  const counts = await withActor(async (trx) => {
    const [disputes, reviews, payouts, users, today] = await Promise.all([
      trx.selectFrom("disputes").select((eb) => eb.fn.countAll<number>().as("n")).where("status", "in", ["awaiting_decision", "more_evidence", "appealed"]).executeTakeFirst(),
      trx.selectFrom("listing_reviews").select((eb) => eb.fn.countAll<number>().as("n")).where("decision", "is", null).executeTakeFirst(),
      trx.selectFrom("payouts").select((eb) => eb.fn.countAll<number>().as("n")).where("status", "in", ["failed", "paused"]).executeTakeFirst(),
      trx.selectFrom("profiles").select((eb) => ["role", eb.fn.countAll<number>().as("n")]).groupBy("role").execute(),
      sql<{ n: number; providers: number }>`select count(*)::int as n, count(distinct provider_id)::int as providers from public.bookings where status <> 'cancelled' and start_at >= date_trunc('day', ${nowAt.toISOString()}::timestamptz at time zone ${tz}) at time zone ${tz} and start_at < (date_trunc('day', ${nowAt.toISOString()}::timestamptz at time zone ${tz}) + interval '1 day') at time zone ${tz}`.execute(trx),
    ]);
    const byRole = Object.fromEntries(users.map((u) => [u.role, Number(u.n)]));
    return { disputes: Number(disputes?.n ?? 0), reviews: Number(reviews?.n ?? 0), payouts: Number(payouts?.n ?? 0), renters: byRole.renter ?? 0, providers: byRole.provider ?? 0, staff: byRole.staff ?? 0, today: today.rows[0]! };
  });
  const nav: NavItem[] = [
    { href: "/admin", label: "Overview", icon: "grid", exact: true },
    { href: "/admin/disputes", label: "Disputes", icon: "shield", count: counts.disputes, countTone: "error" },
    { href: "/admin/listing-review", label: "Listing review", icon: "tag", count: counts.reviews },
    { href: "/admin/users", label: "Users", icon: "users" },
    { href: "/admin/bookings", label: "Bookings", icon: "box" },
    { href: "/admin/payouts", label: "Payouts", icon: "coins", count: counts.payouts, countTone: "error" },
    { href: "/admin/reports", label: "Reports", icon: "alert" },
    { href: "/admin/settings", label: "Settings", icon: "gear" },
  ];
  const weekend = ["Sat", "Sun"].includes(fmt(nowAt, "EEE", tz));
  return (
    <Shell
      variant="admin"
      nav={nav}
      collapseOn={["/admin/users", "/admin/listing-review", "/admin/disputes/", "/admin/settings"]}
      header={<AdminHeader dateLine={`${config.market.name} · ${fmt(nowAt, "EEEE d MMM", tz)}`} peakLine={`${weekend ? "Weekend peak" : "Weekday"} · ${counts.today.n} handoffs scheduled today across ${counts.today.providers} providers`} userCounts={{ renters: counts.renters, providers: counts.providers, staff: counts.staff }} reviewCount={counts.reviews} />}
      footer={<StaffBlock name={actor.profile?.name ?? "Staff"} sub={`${actor.staff.role === "trust_safety" ? "Trust & safety" : "Marketplace ops"} · ${actor.staff.permissions.length >= 5 ? "full access" : actor.staff.permissions.join(", ")}`} />}
    >
      {children}
    </Shell>
  );
}
