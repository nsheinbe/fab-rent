import { RenterShell } from "@/components/domain/renter-shell";
import { getActor, withActor } from "@/lib/auth";
import { getUnreadCount } from "@/lib/queries/renter";

export default async function RenterLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const unread = actor.userId ? await withActor((trx) => getUnreadCount(trx, "renter", actor.userId!)) : 0;
  return <RenterShell unread={unread}>{children}</RenterShell>;
}
