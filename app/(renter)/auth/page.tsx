import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor, runAsSystem } from "@/lib/auth";
import { getLiveConfig } from "@/lib/settings/live";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { marketLocal } from "@/lib/time";
import { formatDateRange, formatMoney } from "@/lib/format";
import { quoteBooking } from "@/lib/pricing";
import { getListingBySlug } from "@/lib/queries/listings";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { Icon } from "@/components/ui/icons";
import { AuthForm } from "./auth-form";
import { demoAccounts } from "./actions";
import type { DraftPayload } from "../actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/rentals";
  const actor = await getActor();
  if (actor.userId) redirect(next);
  const config = await getLiveConfig();
  const tz = config.market.timezone;

  // Sign-in interstitial: show the draft that brought the renter here so they can see nothing is lost.
  let summary: { title: string; line: string; cover_url: string | null; provider: string } | null = null;
  const m = next.match(/^\/checkout\/([0-9a-f-]{36})/);
  if (m) {
    const draft = await runAsSystem((trx) => trx.selectFrom("booking_drafts").select("payload").where("id", "=", m[1]!).executeTakeFirst());
    if (draft) {
      const p = draft.payload as unknown as DraftPayload;
      const listing = await runAsSystem((trx) => getListingBySlug(trx, p.listing_slug));
      if (listing) {
        const start = marketLocal(p.from, tz);
        const end = marketLocal(p.to, tz);
        const extras = p.extras.map((e) => ({ extra: listing.extras.find((x) => x.id === e.id)!, qty: e.qty })).filter((e) => e.extra);
        let total = "";
        try {
          const q = quoteBooking({ pricing: listing.pricing, delivery: listing.delivery }, { start, end, qty: p.qty, fulfillment: p.fulfillment, delivery_km: p.delivery_km ?? undefined, extras, tz }, config);
          total = formatMoney(q.charged_cents);
        } catch {
          /* leave blank */
        }
        summary = { title: listing.title.split(" ").slice(0, 3).join(" ") + (listing.title.split(" ").length > 3 ? ` ${listing.title.split(" ").slice(3, 5).join(" ").toLowerCase()}` : ""), line: [formatDateRange(start, end, { tz }), p.fulfillment, extras.length ? `${extras.length} ${extras.length === 1 ? "extra" : "extras"}` : null, total].filter(Boolean).join(" · "), cover_url: listing.photos[0]?.url ?? null, provider: listing.provider.name.split(" ")[0]! };
      }
    }
  }
  const accounts = await demoAccounts();
  return (
    <main className="relative flex min-h-screen flex-col justify-end bg-[#6B675F] lg:items-center lg:justify-center">
      <div className="absolute inset-0 bg-ivory opacity-35" />
      <div className="relative w-full rounded-t-[24px] bg-ivory px-5 pb-[max(40px,env(safe-area-inset-bottom))] shadow-sheet lg:max-w-[440px] lg:rounded-[24px] lg:px-7 lg:pb-8">
        <div className="mx-auto mt-2 h-[5px] w-10 rounded-pill bg-border-strong lg:hidden" />
        <h1 className="pt-[22px] text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em]">{summary ? "Sign in to finish booking" : "Sign in to fab.rent"}</h1>
        <p className="pt-1.5 text-[14px] leading-[1.5] text-text-2">{summary ? `An account lets ${summary.provider} verify your ID at handoff and keeps your receipts and messages in one place.` : "Your rentals, receipts and messages in one place. Browsing never needs an account."}</p>
        {summary && (
          <div className="card-sm mt-[18px] flex items-center gap-3 p-3">
            <div className="relative size-14 flex-none overflow-hidden rounded-control"><PhotoSlot src={summary.cover_url} placeholder="" className="absolute inset-0" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold leading-[1.3]">{summary.title}</div>
              <div className="text-[12px] text-text-2">{summary.line}</div>
              <span className="mt-[5px] inline-flex h-[22px] items-center gap-[5px] rounded-pill bg-cobalt-tint px-2 text-[11px] font-semibold text-cobalt-hover"><Icon name="check" size={11} strokeWidth={3} />Your selections are saved</span>
            </div>
          </div>
        )}
        <AuthForm next={next} error={sp.error} demo={!isSupabaseConfigured()} accounts={accounts.map((a) => ({ id: a.id, name: a.name, email: a.email ?? "", role: a.staff_role ? `Staff · ${a.staff_role === "trust_safety" ? "trust & safety" : "marketplace ops"}` : a.provider_name ? `Provider · ${a.provider_name}` : a.is_business ? "Business renter" : "Renter" }))} />
      </div>
    </main>
  );
}
