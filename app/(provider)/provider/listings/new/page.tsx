import { redirect } from "next/navigation";
import { createListing } from "@/app/(provider)/actions";

/** Creates a draft and opens the editor (P03). */
export default async function NewListingPage() {
  const r = await createListing();
  if (!r.ok) redirect("/provider/listings");
  redirect(`/provider/listings/${r.data.id}`);
}
