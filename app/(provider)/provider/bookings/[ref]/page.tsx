import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProvider, withActor } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { getProviderBooking } from "@/lib/queries/provider";
import { BookingPanel } from "../panel";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Booking ${ref}` };
}

/** Deep link to one booking (from the inbox, dashboard rows, phone): the P02 panel on its own. */
export default async function ProviderBookingPage({ params }: { params: Promise<{ ref: string }> }) {
  const [{ ref }, actor, config] = await Promise.all([params, requireProvider(), getLiveConfig()]);
  const { detail, provider } = await withActor(async (trx) => ({
    detail: await getProviderBooking(trx, actor.provider.id, ref),
    provider: await trx.selectFrom("providers").select(["payout_schedule", "delivery_vans"]).where("id", "=", actor.provider.id).executeTakeFirstOrThrow(),
  }));
  if (!detail) notFound();
  return <BookingPanel b={detail} config={config} payoutSchedule={provider.payout_schedule} van={((provider.delivery_vans as string[]) ?? [])[0] ?? "Van"} standalone />;
}
