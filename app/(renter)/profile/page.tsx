import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, withActor } from "@/lib/auth";
import { getPaymentMethods } from "@/lib/queries/renter";
import { formatDate } from "@/lib/format";
import { RenterPage } from "@/components/domain/renter-page";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Icon, type IconName } from "@/components/ui/icons";
import { KeyValueList } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(renter)/auth/actions";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const actor = await requireUser();
  const p = actor.profile!;
  const [methods, row] = await withActor((trx) => Promise.all([getPaymentMethods(trx, actor.userId!), trx.selectFrom("profiles").select("joined_at").where("id", "=", actor.userId!).executeTakeFirst()]));
  const joined = row?.joined_at ?? new Date();
  const user = { name: p.name };
  const links: Array<{ href: string; label: string; icon: IconName; meta?: string }> = [
    { href: "/rentals", label: "Rentals", icon: "box", meta: "Receipts, returns, extensions" },
    { href: "/saved", label: "Saved listings", icon: "heart" },
    { href: "/inbox", label: "Inbox", icon: "message" },
    ...(actor.providers.length > 0 ? [{ href: "/provider", label: "Provider dashboard", icon: "inventory" as IconName, meta: actor.providers.map((x) => x.name).join(", ") }] : [{ href: "/provider", label: "List your own gear", icon: "inventory" as IconName, meta: "Become a provider" }]),
    ...(actor.staff ? [{ href: "/admin", label: "Ops console", icon: "shield" as IconName }] : []),
  ];
  return (
    <RenterPage user={user} title="Profile" width={640}>
      <div className="flex flex-col gap-4 px-5 pt-4 pb-10 lg:px-6 lg:pt-6">
        <div className="card-sm flex items-center gap-3.5 px-4 py-4">
          <Avatar name={p.name} size={56} tone="cobalt" />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold tracking-[-0.01em]">{p.name}</div>
            <div className="text-[12px] text-text-3">Member since {formatDate(joined).replace(/^\w+ /, "")} · {p.completed_count} {p.completed_count === 1 ? "rental" : "rentals"}{p.rating_from_providers ? ` · ★ ${Number(p.rating_from_providers).toFixed(1)} from providers` : ""}</div>
          </div>
          {p.id_verified ? <Pill tone="ok" dot size="sm">ID verified</Pill> : <Pill tone="warn" size="sm">ID not verified</Pill>}
        </div>
        <section className="card-sm px-4 py-3.5">
          <div className="mb-2 text-[13px] font-bold">Contact</div>
          <KeyValueList size="sm" rows={[{ k: "Email", v: p.email ?? "—" }, { k: "Phone", v: p.phone ?? "—" }, { k: "Neighbourhood", v: p.neighbourhood ?? "—" }]} />
          <p className="mt-2 text-[12px] text-text-3">Name and phone can be changed at checkout; ID verification is offered there too.</p>
        </section>
        <section className="card-sm px-4 py-3.5">
          <div className="mb-2 text-[13px] font-bold">Payment methods</div>
          {methods.length === 0 ? <div className="text-[13px] text-text-3">No cards yet — add one at checkout.</div> : (
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {methods.map((m) => <li key={m.id} className="flex items-center justify-between"><span>{m.brand} •••• {m.last4}{m.is_default ? <span className="ml-2 text-[11px] font-semibold text-text-3">default</span> : null}</span><span className="text-text-3">Expires {String(m.exp_month).padStart(2, "0")}/{String(m.exp_year).slice(-2)}</span></li>)}
            </ul>
          )}
          <p className="mt-2 text-[12px] text-text-3">fab.rent stores only the brand, last four digits and expiry. Holds are authorizations, never charges.</p>
        </section>
        <section className="card-sm overflow-hidden">
          {links.map((l, i) => (
            <Link key={l.href} href={l.href} className={`flex items-center gap-3 px-3.5 py-3 text-charcoal no-underline hover:bg-ivory/60 ${i < links.length - 1 ? "border-b border-border" : ""}`}>
              <Icon name={l.icon} size={18} className="text-text-2" />
              <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">{l.label}</div>{l.meta && <div className="text-[12px] text-text-3">{l.meta}</div>}</div>
              <Icon name="chevron-right" size={16} className="text-text-3" />
            </Link>
          ))}
        </section>
        <form action={signOut}><Button type="submit" variant="secondary" size="lg" block leading={<Icon name="logout" size={16} />}>Sign out</Button></form>
      </div>
    </RenterPage>
  );
}
