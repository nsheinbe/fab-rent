import type { Metadata } from "next";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { SettingsForm } from "./settings-form";
import { NotificationPrefsCard } from "@/components/domain/notification-prefs";
import { parsePrefs } from "@/lib/notifications/catalogue";

export const metadata: Metadata = { title: "Settings" };

export default async function ProviderSettingsPage() {
  const [actor, config] = await Promise.all([requireProvider(), getLiveConfig()]);
  const [p, members, me] = await withActor((trx) => Promise.all([
    trx.selectFrom("providers").selectAll().where("id", "=", actor.provider.id).executeTakeFirstOrThrow(),
    trx.selectFrom("provider_members as m").innerJoin("profiles as pr", "pr.id", "m.profile_id").select(["m.role", "pr.name", "pr.email"]).where("m.provider_id", "=", actor.provider.id).execute(),
    trx.selectFrom("profiles").select(["email", "notification_prefs"]).where("id", "=", actor.userId!).executeTakeFirst(),
  ]));
  const owner = members.find((m) => m.role === "owner");
  const isOwner = actor.provider.role === "owner";
  return (
    <SettingsForm
      notifications={
        <NotificationPrefsCard
          audience="provider"
          initial={parsePrefs(me?.notification_prefs)}
          email={me?.email ?? null}
          note={isOwner ? `Booking messages for ${p.name} go to you as the owner (${me?.email ?? "no email on file"}).` : `Booking messages for ${p.name} go to the owner, ${owner?.name ?? "the owner"}${owner?.email ? ` (${owner.email})` : ""}; these switches apply to messages addressed to you.`}
        />
      }
      providerId={p.id}
      isOwner={actor.provider.role === "owner"}
      provider={{ name: p.name, about: p.about ?? "", address: p.address ?? "", neighbourhood: p.neighbourhood ?? "", response_minutes: p.response_minutes ?? 60, hours_label: ((p.opening_hours as { label?: string } | null)?.label ?? ""), delivery_vans: (p.delivery_vans as string[]) ?? [], kind: p.kind, verified: p.verified, insurance_valid_until: p.insurance_valid_until?.toISOString() ?? null, accepting: p.accepting_bookings, tax_id: p.tax_id, tax_id_verified: p.tax_id_verified, payout_account_masked: p.payout_account_masked, payout_account_verified: p.payout_account_verified }}
      members={members}
      neighbourhoods={config.market.neighbourhoods.map((n) => n.name)}
    />
  );
}
