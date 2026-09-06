import { NextResponse } from "next/server";
import { getActor, withActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Stripe mode only: creates (or reuses) the Stripe customer for the signed-in renter and returns a
 * SetupIntent client secret. Card details go straight from the browser to Stripe; fab.rent stores the
 * payment method id plus brand / last4 / expiry.
 */
export async function POST() {
  if (process.env.PAYMENTS_PROVIDER !== "stripe" || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Stripe is not enabled" }, { status: 400 });
  const actor = await getActor();
  if (!actor.userId || !actor.profile) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const existing = await withActor((trx) => trx.selectFrom("profiles").select("stripe_customer_id").where("id", "=", actor.userId!).executeTakeFirst());
  let customer = existing?.stripe_customer_id ?? null;
  if (!customer) {
    const c = await stripe.customers.create({ name: actor.profile.name, email: actor.profile.email ?? undefined, phone: actor.profile.phone ?? undefined, metadata: { profile_id: actor.userId } });
    customer = c.id;
    await withActor((trx) => trx.updateTable("profiles").set({ stripe_customer_id: customer }).where("id", "=", actor.userId!).execute());
  }
  const si = await stripe.setupIntents.create({ customer, usage: "off_session", payment_method_types: ["card"], metadata: { profile_id: actor.userId } });
  return NextResponse.json({ client_secret: si.client_secret, customer });
}
