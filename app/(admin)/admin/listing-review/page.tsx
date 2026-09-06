import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff, withActor } from "@/lib/auth";
import { now } from "@/lib/time";
import { adminReviewQueue } from "@/lib/queries/admin";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Listing review" };

/** A03 entry: opens the oldest item in the queue. */
export default async function ListingReviewIndex() {
  await requireStaff();
  const queue = await withActor((trx) => adminReviewQueue(trx, now()));
  if (queue[0]) redirect(`/admin/listing-review/${queue[0].id}`);
  return <div className="p-8"><EmptyState icon="tag" title="Review queue is empty" body="New, edited and reported listings that need a human land here." /></div>;
}
