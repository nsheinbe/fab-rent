import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProvider, withActor } from "@/lib/auth";
import { PAYOUT_ACCOUNT_STATUS_LABEL, payoutProviderName } from "@/lib/payouts";
import { providerPayoutState } from "@/lib/payouts/connect";
import { appUrl } from "@/lib/notifications/events";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { MockOnboardingForm } from "./form";

export const metadata: Metadata = { title: "Payout account · verification" };

function safeReturnUrl(u: string | undefined): string {
  const fallback = "/provider/earnings?onboarding=return";
  if (!u) return fallback;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  return u.startsWith(appUrl()) ? u : fallback;
}

/**
 * Demo stand-in for the payout provider's hosted onboarding (with Stripe this step happens on
 * stripe.com and this page is never shown). The provider picks how the verification ends; the
 * account state is then read back through the same sync path a real return uses. No design frame:
 * built from the style guide, recorded in CLAUDE.md.
 */
export default async function MockOnboardingPage({ searchParams }: { searchParams: Promise<{ account?: string; return_url?: string; refresh_url?: string }> }) {
  const [actor, sp] = await Promise.all([requireProvider(), searchParams]);
  if (payoutProviderName() !== "mock") redirect("/provider/earnings");
  const state = await withActor((trx) => providerPayoutState(trx, actor.provider.id));
  const returnUrl = safeReturnUrl(sp.return_url);
  if (!state.account || (sp.account && sp.account !== state.account.account_ref)) {
    return (
      <div className="px-4 py-5 md:px-6 lg:px-7">
        <EmptyState icon="alert" title="This onboarding link doesn't match your payout account" body="Links are single-use. Start again from Earnings → Payout account." action={<Button size="md" href="/provider/earnings">Back to earnings</Button>} className="mx-auto w-full max-w-[520px]" />
      </div>
    );
  }
  return (
    <div className="px-4 py-5 md:px-6 lg:px-7">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="mb-4">
          <div className="t-label text-text-3">Demo payout provider · test mode</div>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-[-0.02em]">Verify {state.provider.name} for payouts</h1>
          <p className="mt-1 text-[13px] leading-[1.5] text-text-2">This page stands in for the payout provider&apos;s hosted onboarding — with Stripe, this step happens on stripe.com and nothing typed here would reach fab.rent. Choose how the verification ends; fab.rent then reads the account&apos;s state back exactly as it does after a real return.</p>
        </div>
        <MockOnboardingForm providerId={actor.provider.id} businessType={state.account.business_type === "company" ? "company" : "individual"} currentStatus={PAYOUT_ACCOUNT_STATUS_LABEL[state.derived.status]} last4={state.account.external_account?.last4 ?? ""} bankName={state.account.external_account?.bank_name ?? "Maren Bank"} returnUrl={returnUrl} isOwner={actor.provider.role === "owner"} />
      </div>
    </div>
  );
}
