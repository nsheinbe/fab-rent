"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Pill } from "@/components/ui/pill";
import { CheckDot, RadioDot } from "@/components/ui/controls";
import { Input, Field, Select } from "@/components/ui/field";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { DialogRoot, DialogContent, SheetContent } from "@/components/ui/dialog";
import { PriceBreakdown } from "@/components/domain/price-breakdown";
import { BackLink } from "@/components/domain/renter-header";
import { useToast } from "@/components/ui/toast";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { formatDateRange, formatDateTime, formatMoney } from "@/lib/format";
import type { Quote } from "@/lib/pricing";
import type { MarketplaceConfig } from "@/lib/settings/schema";
import { addPaymentMethod, checkout, updateContact, verifyIdentity } from "@/app/(renter)/actions";
import { StepBar } from "@/app/(renter)/book/[listingId]/builder";

interface Method { id: string; brand: string; last4: string; exp: string | null; is_default: boolean }
interface Props {
  draftId: string;
  listing: { id: string; slug: string; title: string; short_title: string; provider: string; provider_short: string; provider_rating: number | null; cover_url: string | null; hold_without_waiver_cents: number; rules_count: number };
  booking: { start: Date; end: Date; qty: number; fulfillment: "pickup" | "delivery"; address: string | null; area: string | null; drop: { start: string; end: string } | null; collect: { start: string; end: string } | null; extras: string[] };
  quote: Quote;
  config: MarketplaceConfig;
  policy: { name: string; free_until: Date };
  contact: { name: string; phone: string; email: string; id_verified: boolean };
  methods: Method[];
  instant: boolean;
}

function brandFor(number: string): "Visa" | "Mastercard" | "Amex" | null {
  const n = number.replace(/\s+/g, "");
  if (/^4\d{12,18}$/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])\d{12,14}$/.test(n)) return "Mastercard";
  if (/^3[47]\d{13}$/.test(n)) return "Amex";
  return null;
}

function BrandMark({ brand }: { brand: string }) {
  if (brand === "Visa") return <span className="flex h-[22px] w-[34px] items-center justify-center rounded-[4px] bg-[#1A1F71] text-[9px] font-extrabold tracking-[.04em] text-white">VISA</span>;
  if (brand === "Mastercard") return <span className="flex h-[22px] w-[34px] items-center justify-center rounded-[4px] bg-[#EB001B]"><span className="ml-2 size-3.5 rounded-full bg-[#F79E1B]" /></span>;
  return <span className="flex h-[22px] w-[34px] items-center justify-center rounded-[4px] bg-[#2E77BC] text-[9px] font-extrabold text-white">{brand.toUpperCase().slice(0, 4)}</span>;
}

/** Booking · 2 of 3 — details & payment (M08 mobile, W04 desktop). The full breakdown is shown before paying. */
export function CheckoutForm(props: Props) {
  const { draftId, listing, booking, quote, config, policy, methods: initialMethods, instant } = props;
  const router = useRouter();
  const toast = useToast();
  const desktop = useIsDesktop();
  const tz = config.market.timezone;
  const [contact, setContact] = useState(props.contact);
  const [methods, setMethods] = useState(initialMethods);
  const [selected, setSelected] = useState<string>(initialMethods.find((m) => m.is_default)?.id ?? initialMethods[0]?.id ?? "");
  const [agree, setAgree] = useState(true);
  const [pending, start] = useTransition();
  const [verifying, setVerifying] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [addCard, setAddCard] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pay = () =>
    start(async () => {
      setErr(null);
      if (!agree) {
        setErr("Please agree to the rental rules to continue");
        return;
      }
      const r = await checkout({ draftId, paymentMethodId: selected === "apple-pay" ? undefined : selected || undefined, applePay: selected === "apple-pay", agree: true }).catch(() => ({ ok: false as const, error: "Something went wrong on our side — you haven't been charged. Try again." }));
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      router.push(`/bookings/${r.data.ref}/confirmed`);
    });

  const verify = async () => {
    setVerifying(true);
    const r = await verifyIdentity();
    setVerifying(false);
    if (r.ok && r.data.verified) {
      setContact((c) => ({ ...c, id_verified: true }));
      toast({ title: "Photo ID verified", tone: "ok" });
    } else toast({ title: "We couldn't verify that ID", description: "Try again with a clearer photo.", tone: "error" });
  };

  const holdLabel = booking.fulfillment === "delivery" ? "delivery" : "handoff";
  const waiverBought = quote.waiver_bought && quote.hold_without_waiver_cents !== quote.hold_cents;
  const dateLine = `${formatDateRange(booking.start, booking.end, { tz })} · ${booking.fulfillment === "delivery" ? `delivery to ${booking.area ?? "you"}` : "pickup"}`;
  const method = methods.find((m) => m.id === selected);
  const chargedSub = method ? `${method.brand} •••• ${method.last4}` : selected === "apple-pay" ? "Apple Pay" : undefined;

  const contactRows = (
    <div className="card-sm overflow-hidden rounded-panel text-[14px]">
      {[["Name", contact.name], ["Phone", contact.phone || "—"], ["Email", contact.email]].map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-border px-3.5 py-3"><span className="text-text-3">{k}</span><span className="font-semibold">{v}</span></div>
      ))}
      <div className="flex items-center justify-between px-3.5 py-3">
        <span className="text-text-3">Photo ID</span>
        {contact.id_verified ? <Pill tone="ok" size="xs" leading={<Icon name="check" size={11} strokeWidth={3} />}>Verified</Pill> : <Button size="sm" variant="secondary" onClick={verify} loading={verifying}>Verify now</Button>}
      </div>
    </div>
  );
  // the mobile and desktop layouts both render a trigger, but the dialogs themselves mount once (below) so ids and test hooks stay unique
  const contactDialog = <button type="button" onClick={() => setEditContact(true)} className="text-[12px] font-semibold text-cobalt lg:text-[13px]">Edit</button>;
  const dialogs = (
    <>
      <DialogRoot open={editContact} onOpenChange={setEditContact}>
        <ContactDialog contact={contact} onSaved={(c) => { setContact((x) => ({ ...x, ...c })); setEditContact(false); }} desktop={desktop} />
      </DialogRoot>
      <DialogRoot open={addCard} onOpenChange={setAddCard}>
        <AddCardDialog desktop={desktop} onAdded={(m) => { setMethods((ms) => [...ms, m]); setSelected(m.id); setAddCard(false); }} />
      </DialogRoot>
    </>
  );

  const paymentList = (grid?: boolean) => (
    <div className={cn(grid ? "grid grid-cols-2 gap-2.5" : "card-sm overflow-hidden rounded-panel")} role="radiogroup" aria-label="Payment method">
      {methods.map((m, i) => {
        const on = selected === m.id;
        return (
          <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => setSelected(m.id)} className={cn("flex w-full items-center gap-2.5 text-left", grid ? (on ? "rounded-panel border-2 border-cobalt bg-cobalt-wash px-[13px] py-[11px]" : "rounded-panel border border-border px-3.5 py-3") : cn("px-3.5 py-3", i < methods.length - 1 || true ? "border-b border-border" : "", on && "bg-cobalt-wash"))}>
            <RadioDot selected={on} /><BrandMark brand={m.brand} />
            <div><div className="text-[14px] font-semibold">{m.brand} •••• {m.last4}</div><div className="text-[12px] text-text-3">{m.exp ? `Expires ${m.exp}` : ""}{m.is_default && grid ? " · default" : ""}</div></div>
          </button>
        );
      })}
      <button type="button" role="radio" aria-checked={selected === "apple-pay"} onClick={() => setSelected("apple-pay")} className={cn("flex w-full items-center gap-2.5 text-left", grid ? (selected === "apple-pay" ? "rounded-panel border-2 border-cobalt bg-cobalt-wash px-[13px] py-[11px]" : "rounded-panel border border-border px-3.5 py-3") : cn("border-b border-border px-3.5 py-3", selected === "apple-pay" && "bg-cobalt-wash"))}>
        <RadioDot selected={selected === "apple-pay"} /><div className="text-[14px] font-semibold">Apple Pay</div>
      </button>
      <button type="button" onClick={() => setAddCard(true)} className={cn("flex w-full items-center gap-2.5 text-left text-[14px] font-semibold text-cobalt", grid ? "rounded-panel border border-dashed border-border-strong px-3.5 py-3" : "px-3.5 py-3")}><Icon name="plus" size={18} strokeWidth={2.2} />Add a {grid ? "new " : ""}card</button>
    </div>
  );

  const holdExplainer = (desktopStyle?: boolean) => (
    <div className={cn("flex gap-3 rounded-panel border border-dashed border-border-strong px-3.5 py-3", desktopStyle ? "bg-ivory" : "bg-white")}>
      <Icon name="lock" size={20} className="mt-px flex-none text-text-2" />
      <div className="text-[12px] leading-[1.5] text-text-2 lg:text-[13px]">
        <b className="text-charcoal">{desktopStyle ? `${formatMoney(quote.hold_cents, { whole: true })} authorization hold on this card at ${holdLabel}.` : `About the ${formatMoney(quote.hold_cents, { whole: true })} hold.`}</b>{" "}
        {desktopStyle ? "Not a charge. " : `When the ${listing.short_title.split(" ").pop()?.toLowerCase() ?? "item"} is ${booking.fulfillment === "delivery" ? "delivered" : "handed over"} we place a temporary authorization on this card — not a charge. `}
        It&apos;s released within {config.holds.auto_release_business_days} business days of return check-in{desktopStyle ? "; it" : ". It"} only becomes a charge if damage or late-return fees are agreed or upheld.{waiverBought && ` Reduced from ${formatMoney(quote.hold_without_waiver_cents, { whole: true })} because you added the damage waiver.`}
      </div>
    </div>
  );
  const agreement = (
    <label className="flex cursor-pointer items-start gap-2.5">
      <span className="mt-px"><CheckDot checked={agree} /></span>
      <input type="checkbox" className="sr-only" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
      <span className="text-[13px] leading-[1.5] text-text-2">I agree to {listing.provider_short}&apos;s rental rules, the <span className="font-semibold text-cobalt">{policy.name} cancellation policy</span> (free until {formatDateTime(policy.free_until).replace(" · ", " ")}) and fab.rent&apos;s <span className="font-semibold text-cobalt">rental agreement</span>.</span>
    </label>
  );
  const breakdown = (size: "md" | "sm") => (
    <PriceBreakdown size={size} bare={size === "md"} lines={quote.lines.filter((l) => l.kind !== "delivery" || l.cents > 0).map((l) => ({ label: l.label, cents: l.cents }))} charged={{ label: "Charged now", cents: quote.charged_cents, sub: chargedSub }} held={{ label: `Held at ${holdLabel}`, cents: quote.hold_cents, explanation: waiverBought ? `Reduced from ${formatMoney(quote.hold_without_waiver_cents, { whole: true })} by the damage waiver` : `Not charged · released ≤${config.holds.auto_release_business_days} business days after return` }} />
  );
  const payNote = instant ? `Instant book — confirmed immediately.${desktop ? " Receipt emailed." : ` ${formatMoney(quote.hold_cents, { whole: true })} held later, not now.`}` : `${listing.provider_short} confirms your request — usually within an hour. Nothing is held until ${holdLabel}.`;

  return (
    <>
      {dialogs}
      {/* ---------- mobile (M08) */}
      <main className="flex min-h-screen flex-col lg:hidden">
        <div className="flex items-center gap-3 px-5 pt-[max(14px,env(safe-area-inset-top))]">
          <BackLink href={`/listings/${listing.slug}`} />
          <div className="flex-1"><div className="text-[17px] font-extrabold tracking-[-0.01em]">Details &amp; payment</div><div className="text-[12px] text-text-3">{dateLine}</div></div>
        </div>
        <StepBar step={2} />
        <section className="flex flex-col gap-2 px-5 pt-5">
          <div className="flex items-baseline justify-between"><div className="t-label text-text-3">Contact</div>{contactDialog}</div>
          {contactRows}
        </section>
        <section className="flex flex-col gap-2 px-5 pt-5">
          <div className="t-label text-text-3">Payment method</div>
          {paymentList(false)}
        </section>
        <div className="px-5 pt-4">{holdExplainer(false)}</div>
        <section className="flex flex-col gap-2 px-5 pt-5">
          <div className="t-label text-text-3">Price</div>
          {breakdown("sm")}
        </section>
        <div className="px-5 pt-4">{agreement}</div>
        {err && <div role="alert" className="mx-5 mt-3 rounded-control bg-error-bg px-3 py-2 text-[13px] font-semibold text-error-text">{err}</div>}
        <div className="h-4" />
        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-border bg-paper px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
          <Button size="xl" block className="!rounded-[12px]" onClick={pay} loading={pending} disabled={!agree || (!selected && methods.length > 0)} leading={<Icon name="lock" size={16} strokeWidth={2.2} />} data-testid="pay-button">Pay {formatMoney(quote.charged_cents)}</Button>
          <div className="text-center text-[11px] text-text-3">{payNote}</div>
        </div>
      </main>

      {/* ---------- desktop (W04) */}
      <main className="hidden lg:grid items-start gap-12 px-10 pb-12 pt-8 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex flex-col gap-3.5">
          <div className="card-sm flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3.5"><span className={cn("flex size-7 items-center justify-center rounded-full", contact.id_verified ? "bg-ok" : "bg-cobalt text-[13px] font-bold text-white")}>{contact.id_verified ? <Icon name="check" size={14} strokeWidth={3} className="text-white" /> : "1"}</span><div><div className="text-[15px] font-bold">Contact</div><div className="text-[13px] text-text-2">{contact.name} · {contact.phone || "no phone"} · {contact.email}{contact.id_verified ? " · Photo ID verified" : ""}{!contact.id_verified && <> · <button type="button" onClick={verify} className="font-semibold text-cobalt">{verifying ? "Verifying…" : "Verify photo ID"}</button></>}</div></div></div>
            {contactDialog}
          </div>
          <div className="card-sm flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3.5"><span className="flex size-7 items-center justify-center rounded-full bg-ok"><Icon name="check" size={14} strokeWidth={3} className="text-white" /></span><div><div className="text-[15px] font-bold">{booking.fulfillment === "delivery" ? "Delivery & collection" : "Pickup"}</div><div className="text-[13px] text-text-2">{booking.fulfillment === "delivery" ? `${booking.address}, ${booking.area} · drop ${formatDateTime(booking.start).split(" · ")[0]} ${booking.drop?.start}–${booking.drop?.end} · collect ${formatDateTime(booking.end).split(" · ")[0]} ${booking.collect?.start}–${booking.collect?.end}` : `${formatDateTime(booking.start)} → ${formatDateTime(booking.end)} · ${booking.qty} unit${booking.qty === 1 ? "" : "s"}`}</div></div></div>
            <a href={`/book/${listing.id}`} className="text-[13px] font-semibold no-underline">Edit</a>
          </div>
          <div className="card-sm flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3.5"><span className="flex size-7 items-center justify-center rounded-full bg-cobalt text-[13px] font-bold text-white">3</span><div className="text-[15px] font-bold">Payment</div></div>
            {paymentList(true)}
            {holdExplainer(true)}
            {agreement}
            {err && <div role="alert" className="rounded-control bg-error-bg px-3 py-2 text-[13px] font-semibold text-error-text">{err}</div>}
            <div className="flex items-center justify-between gap-4">
              <Button size="xl" className="!rounded-[12px] !px-7" onClick={pay} loading={pending} disabled={!agree || (!selected && methods.length > 0)} leading={<Icon name="lock" size={16} strokeWidth={2.2} />} data-testid="pay-button">Pay {formatMoney(quote.charged_cents)}</Button>
              <div className="text-[12px] text-text-3">{payNote}</div>
            </div>
          </div>
        </div>
        <aside className="sticky top-5 overflow-hidden rounded-[18px] border border-border bg-white">
          <div className="flex gap-3.5 border-b border-border p-4">
            <div className="relative size-[84px] flex-none overflow-hidden rounded-panel"><PhotoSlot src={listing.cover_url} placeholder="Photo" className="absolute inset-0" /></div>
            <div className="flex flex-col gap-[3px]">
              <div className="text-[15px] font-bold leading-[1.3]">{listing.title}</div>
              <div className="text-[12px] text-text-2">{listing.provider}{listing.provider_rating ? ` · ★ ${listing.provider_rating.toFixed(1)}` : ""}</div>
              <div className="text-[12px] text-text-2">{formatDateTime(booking.start).replace(" · ", " ")} → {formatDateTime(booking.end).replace(" · ", " ")} · {quote.billed_days} {quote.billed_days === 1 ? "day" : "days"} · {booking.qty} unit{booking.qty === 1 ? "" : "s"}</div>
              <div className="text-[12px] text-text-2">{booking.fulfillment === "delivery" ? `Delivery to ${booking.area}` : "Pickup"}{booking.extras.length ? ` · ${booking.extras.map((e) => e.toLowerCase().replace("diablo ", "").replace(" fine-finish", "")).join(" · ")}` : ""}</div>
            </div>
          </div>
          {breakdown("md")}
          <div className="border-t border-border px-4 py-3 text-[12px] leading-[1.5] text-text-3">Free cancellation until {formatDateTime(policy.free_until).replace(" · ", " ")} · Questions? <a href={`/listings/${listing.slug}`} className="font-semibold no-underline">Message {listing.provider_short}</a></div>
        </aside>
      </main>
    </>
  );
}

function ContactDialog({ contact, onSaved, desktop }: { contact: { name: string; phone: string }; onSaved: (c: { name: string; phone: string }) => void; desktop: boolean }) {
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const [pending, start] = useTransition();
  const toast = useToast();
  const save = () => start(async () => { const r = await updateContact({ name, phone }); if (r.ok) onSaved({ name, phone }); else toast({ title: r.error, tone: "error" }); });
  const body = (
    <div className="flex flex-col gap-3">
      <Field label="Name" id="c-name"><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
      <Field label="Phone" id="c-phone" hint="for the driver on the day"><Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="+1 555 014 2290" /></Field>
    </div>
  );
  const footer = <Button size="md" onClick={save} loading={pending}>Save</Button>;
  return desktop ? <DialogContent title="Contact details" size="sm" footer={footer}>{body}</DialogContent> : <SheetContent title="Contact details" footer={<Button size="xl" block onClick={save} loading={pending}>Save</Button>}>{body}</SheetContent>;
}

function AddCardDialog({ onAdded, desktop }: { onAdded: (m: Method) => void; desktop: boolean }) {
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const brand = brandFor(number);
  const [mm, yy] = exp.split("/");
  const valid = !!brand && /^\d{2}\/\d{2}$/.test(exp);
  const save = () =>
    start(async () => {
      if (!brand) return;
      // only masked data leaves the browser: brand, last4, expiry
      const r = await addPaymentMethod({ brand, last4: number.replace(/\s+/g, "").slice(-4), exp_month: Number(mm), exp_year: 2000 + Number(yy), makeDefault });
      if (r.ok) onAdded({ id: r.data.id, brand, last4: number.replace(/\s+/g, "").slice(-4), exp, is_default: makeDefault });
      else toast({ title: r.error, tone: "error" });
    });
  const body = (
    <div className="flex flex-col gap-3">
      <Field label="Card number" id="card-number" hint={brand ?? undefined}>
        <Input id="card-number" value={number} onChange={(e) => setNumber(e.target.value.replace(/[^\d ]/g, "").slice(0, 19))} inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" mono data-testid="card-number" />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Expiry" id="card-exp"><Input id="card-exp" value={exp} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, "").slice(0, 4); setExp(v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v); }} placeholder="MM/YY" inputMode="numeric" autoComplete="cc-exp" mono data-testid="card-exp" /></Field>
        <Field label="CVC" id="card-cvc"><Input id="card-cvc" placeholder="123" inputMode="numeric" autoComplete="cc-csc" mono maxLength={4} /></Field>
      </div>
      <label className="flex items-center gap-2.5 text-[13px]"><CheckDot checked={makeDefault} size="sm" /><input type="checkbox" className="sr-only" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />Make this my default card</label>
      <div className="text-[11px] text-text-3">Card details are tokenised by the payment provider; fab.rent only keeps the brand, last four digits and expiry.</div>
      <Select className="hidden" aria-hidden><option>x</option></Select>
    </div>
  );
  return desktop ? <DialogContent title="Add a card" size="sm" footer={<Button size="md" onClick={save} loading={pending} disabled={!valid} data-testid="save-card">Save card</Button>}>{body}</DialogContent> : <SheetContent title="Add a card" footer={<Button size="xl" block onClick={save} loading={pending} disabled={!valid} data-testid="save-card">Save card</Button>}>{body}</SheetContent>;
}
