import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { now, fmt } from "@/lib/time";
import { providerNavCounts } from "@/lib/queries/provider";
import { Shell, OrgBlock, type NavItem } from "@/components/domain/shells";
import { ProviderHeader } from "@/components/domain/provider-header";
import { AcceptingSwitch } from "./accepting-switch";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Logo } from "@/components/domain/logo";

export const metadata: Metadata = { title: { default: "Provider", template: "%s · fab.rent Provider" } };
export const dynamic = "force-dynamic";

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor.userId) redirect(`/auth?next=${encodeURIComponent("/provider")}`);
  const membership = actor.providers[0];
  if (!membership) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ivory p-6">
        <Logo size={24} />
        <EmptyState icon="inventory" title="This account isn't a provider yet" body="Listing gear on fab.rent takes a verified business or ID, a payout account and at least one listing. Provider onboarding is handled by the fab.rent team for the Port Maren pilot." action={<div className="flex gap-2"><Button size="md" href="/">Back to renting</Button><Button size="md" variant="secondary" href="mailto:providers@fab.rent">Contact us</Button></div>} className="w-full max-w-[460px]" />
        <Link href="/auth" className="text-[13px] font-semibold text-text-3">Switch account</Link>
      </main>
    );
  }
  const config = await getLiveConfig();
  const nowAt = now();
  const [provider, counts, quarter] = await withActor(async (trx) => {
    const quarterStart = new Date(Date.UTC(nowAt.getUTCFullYear(), Math.floor(nowAt.getUTCMonth() / 3) * 3, 1));
    return Promise.all([
      trx.selectFrom("providers").select(["id", "name", "accepting_bookings", "delivery_vans", "kind", "verified"]).where("id", "=", membership.id).executeTakeFirstOrThrow(),
      providerNavCounts(trx, membership.id),
      trx.selectFrom("bookings").select((eb) => eb.fn.countAll<number>().as("n")).where("provider_id", "=", membership.id).where("created_at", ">=", quarterStart).executeTakeFirst(),
    ]);
  });
  const staffOnShift = await withActor((trx) => trx.selectFrom("provider_members").select((eb) => eb.fn.countAll<number>().as("n")).where("provider_id", "=", membership.id).executeTakeFirst());
  const nav: NavItem[] = [
    { href: "/provider", label: "Dashboard", icon: "grid", exact: true },
    { href: "/provider/bookings", label: "Bookings", icon: "box", count: counts.needs_action, countTone: "cobalt" },
    { href: "/provider/calendar", label: "Calendar", icon: "calendar" },
    { href: "/provider/listings", label: "Listings", icon: "tag" },
    { href: "/provider/inventory", label: "Inventory", icon: "inventory" },
    { href: "/provider/inbox", label: "Messages", icon: "message", count: counts.unread, countTone: "cobalt" },
    { href: "/provider/earnings", label: "Earnings", icon: "coins" },
    { href: "/provider/reviews", label: "Reviews", icon: "star" },
    { href: "/provider/settings", label: "Settings", icon: "gear" },
  ];
  const first = actor.profile?.name.split(" ")[0] ?? "there";
  const hour = Number(fmt(nowAt, "H", config.market.timezone));
  const greeting = `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${first}`;
  const vans = (provider.delivery_vans as string[]) ?? [];
  const sub = `${fmt(nowAt, "EEEE d MMMM", config.market.timezone)} · ${Number(staffOnShift?.n ?? 1)} staff on shift${vans.length ? ` · ${vans[0]!.toLowerCase()} out on deliveries` : ""}`;
  return (
    <Shell
      variant="provider"
      nav={nav}
      collapseOn={["/provider/bookings", "/provider/listings/", "/provider/calendar", "/provider/earnings"]}
      header={<ProviderHeader greeting={greeting} sub={sub} bookingsThisQuarter={Number(quarter?.n ?? 0)} monthLabel={fmt(nowAt, "MMM yyyy", config.market.timezone)} />}
      footer={
        <OrgBlock name={provider.name} sub={`${actor.profile?.name ?? ""} · ${membership.role === "owner" ? "Owner" : "Staff"}`}>
          <AcceptingSwitch providerId={provider.id} accepting={provider.accepting_bookings} />
        </OrgBlock>
      }
    >
      {children}
    </Shell>
  );
}
