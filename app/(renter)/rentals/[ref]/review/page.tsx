import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUserPage, withActor } from "@/lib/auth";
import { getBookingByRef } from "@/lib/queries/bookings";
import { formatDate, formatDateRangeCompact, itemNoun } from "@/lib/format";
import { RenterPage } from "@/components/domain/renter-page";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Leave a review" };
export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ ref: string }> }) {
  const [{ ref }, actor] = await Promise.all([params, requireUserPage()]);
  const b = await withActor((trx) => getBookingByRef(trx, ref));
  if (!b || b.renter.id !== actor.userId) notFound();
  if (b.status !== "completed" || b.has_review) redirect(`/rentals/${ref}`);
  const user = actor.profile ? { name: actor.profile.name } : null;
  const noun = itemNoun(b.listing.title);
  const providerShort = b.provider.name.split(" ").slice(0, 2).join(" ").replace(/ &$/, "");
  return (
    <RenterPage user={user} title={`How was the ${noun}?`} subtitle={`${b.listing.title} · ${formatDateRangeCompact(b.start_at, b.end_at)} · ${b.provider.name}${b.hold_released_at ? ` · hold released ${formatDate(b.hold_released_at).replace(/^\w+ /, "")}` : ""}`} back={`/rentals/${ref}`} width={560}>
      <ReviewForm bookingRef={b.ref} providerName={b.provider.name} providerShort={providerShort} />
    </RenterPage>
  );
}
