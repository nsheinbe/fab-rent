"use client";
import { useEffect, useRef, useState } from "react";
import type { Stripe, StripeCardElement } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { CheckDot } from "@/components/ui/controls";

export interface SavedCard {
  brand: "Visa" | "Mastercard" | "Amex";
  last4: string;
  exp_month: number;
  exp_year: number;
  /** Stripe payment method id (pm_…) attached to the renter's customer */
  provider_ref: string;
  makeDefault: boolean;
}

const BRANDS: Record<string, SavedCard["brand"]> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex" };

/**
 * Stripe Card Element (PAYMENTS_PROVIDER=stripe + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY). Card data goes
 * browser → Stripe; a SetupIntent from /api/payments/setup-intent attaches the payment method to the
 * renter's Stripe customer so later charges and holds can run off-session. fab.rent receives only the
 * payment method id plus brand / last4 / expiry, and the server re-reads those from Stripe before saving.
 */
export function StripeCard({ onSaved, size = "md" }: { onSaved: (card: SavedCard) => Promise<void> | void; size?: "md" | "xl" }) {
  const host = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const cardRef = useRef<StripeCardElement | null>(null);
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const el = host.current;
    if (!key || !el) return;
    (async () => {
      const { loadStripe } = await import("@stripe/stripe-js");
      const stripe = await loadStripe(key);
      if (cancelled || !stripe) return;
      stripeRef.current = stripe;
      const elements = stripe.elements({ fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap" }] });
      const card = elements.create("card", {
        hidePostalCode: true,
        style: { base: { fontFamily: '"DM Mono", ui-monospace, monospace', fontSize: "14px", color: "#1e1e1c", "::placeholder": { color: "#a8a49b" } }, invalid: { color: "#b42318" } },
      });
      card.mount(el);
      card.on("ready", () => setReady(true));
      card.on("change", (e) => {
        setComplete(e.complete);
        setError(e.error?.message ?? null);
      });
      cardRef.current = card;
    })();
    return () => {
      cancelled = true;
      cardRef.current?.destroy();
      cardRef.current = null;
    };
  }, []);

  const save = async () => {
    const stripe = stripeRef.current;
    const card = cardRef.current;
    if (!stripe || !card) return;
    setPending(true);
    setError(null);
    try {
      const created = await stripe.createPaymentMethod({ type: "card", card });
      if (created.error || !created.paymentMethod) throw new Error(created.error?.message ?? "Couldn't read the card");
      const pm = created.paymentMethod;
      const brand = BRANDS[pm.card?.brand ?? ""];
      if (!brand || !pm.card) throw new Error("fab.rent accepts Visa, Mastercard and American Express");
      const res = await fetch("/api/payments/setup-intent", { method: "POST" });
      const body = (await res.json()) as { client_secret?: string; error?: string };
      if (!res.ok || !body.client_secret) throw new Error(body.error ?? "Couldn't start card setup");
      const confirmed = await stripe.confirmCardSetup(body.client_secret, { payment_method: pm.id });
      if (confirmed.error) throw new Error(confirmed.error.message ?? "The card was declined");
      await onSaved({ brand, last4: pm.card.last4, exp_month: pm.card.exp_month, exp_year: pm.card.exp_year, provider_ref: pm.id, makeDefault });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1.5 text-[12px] font-semibold text-text-2">Card</div>
        <div ref={host} className="min-h-[46px] rounded-control border border-border-strong bg-white px-3.5 py-3.5" data-testid="stripe-card-element" />
        {!ready && <div className="mt-1.5 text-[11px] text-text-3">Loading secure card form…</div>}
      </div>
      <label className="flex items-center gap-2.5 text-[13px]">
        <CheckDot checked={makeDefault} size="sm" />
        <input type="checkbox" className="sr-only" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
        Make this my default card
      </label>
      {error && <div className="text-[12px] font-semibold text-error" role="alert">{error}</div>}
      <div className="text-[11px] text-text-3">Card details go straight to Stripe. fab.rent keeps only the brand, last four digits and expiry.</div>
      <Button size={size} block={size === "xl"} onClick={save} loading={pending} disabled={!ready || !complete} data-testid="save-card">Save card</Button>
    </div>
  );
}
