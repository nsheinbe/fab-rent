"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, runAsSystem } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { ANON_COOKIE, SESSION_COOKIE, encodeSession, newSession } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { now } from "@/lib/time";

const nextSchema = z.string().regex(/^\/(?!\/)/).max(400).optional();

function safeNext(next: string | undefined | null): string {
  const parsed = nextSchema.safeParse(next ?? undefined);
  return parsed.success && parsed.data ? parsed.data : "/rentals";
}

async function setSessionCookie(userId: string, email: string | null) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encodeSession(newSession(userId, email)), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production" });
}

/** Booking drafts built before signing in are attached to the profile so nothing is lost. */
async function attachAnonymousDrafts(userId: string) {
  const jar = await cookies();
  const key = jar.get(ANON_COOKIE)?.value;
  if (!key) return;
  await runAsSystem((trx) => trx.updateTable("booking_drafts").set({ profile_id: userId }).where("anonymous_key", "=", key).where("profile_id", "is", null).execute());
}

async function ensureProfile(userId: string, email: string | null, name: string | null) {
  await runAsSystem(async (trx) => {
    const exists = await trx.selectFrom("profiles").select("id").where("id", "=", userId).executeTakeFirst();
    if (exists) return;
    await trx.insertInto("profiles").values({ id: userId, name: name ?? (email ? email.split("@")[0]! : "New renter"), email, role: "renter", joined_at: now() }).execute();
  });
}

/** Demo mode only: sign in as a seeded account (used by the Apple/Google buttons and the account picker). */
export async function demoSignIn(formData: FormData) {
  if (isSupabaseConfigured()) redirect("/auth");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(formData.get("next") ?? ""));
  const user = await runAsSystem((trx) => trx.selectFrom("auth.users" as never).select(["id", "email"] as never).where("email" as never, "=", email as never).executeTakeFirst()) as { id: string; email: string | null } | undefined;
  if (!user) redirect(`/auth?next=${encodeURIComponent(next)}&error=unknown`);
  await ensureProfile(user.id, user.email, null);
  await setSessionCookie(user.id, user.email);
  await attachAnonymousDrafts(user.id);
  redirect(next);
}

/** Google / Apple: Supabase OAuth when configured; in demo mode signs in as the demo renter. */
export async function oauthSignIn(formData: FormData) {
  const provider = String(formData.get("provider")) === "apple" ? "apple" : "google";
  const next = safeNext(String(formData.get("next") ?? ""));
  if (isSupabaseConfigured()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const h = await headers();
    const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    if (error || !data.url) redirect(`/auth?next=${encodeURIComponent(next)}&error=oauth`);
    redirect(data.url);
  }
  const fd = new FormData();
  fd.set("email", "priya.nair@example.com");
  fd.set("next", next);
  await demoSignIn(fd);
}

const identifierSchema = z.string().trim().min(3).max(120);

/** Sends a one-time code. Real email/SMS delivery is out of scope: the code is logged to the console (and shown inline in demo mode). */
export async function sendOtp(formData: FormData): Promise<{ ok: true; identifier: string; demoCode: string | null } | { ok: false; error: string }> {
  const parsed = identifierSchema.safeParse(formData.get("identifier"));
  if (!parsed.success) return { ok: false, error: "Enter an email address or phone number" };
  const identifier = parsed.data.toLowerCase();
  if (isSupabaseConfigured()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const isEmail = identifier.includes("@");
    const { error } = isEmail ? await supabase.auth.signInWithOtp({ email: identifier }) : await supabase.auth.signInWithOtp({ phone: identifier });
    if (error) return { ok: false, error: error.message };
    return { ok: true, identifier, demoCode: null };
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await runAsSystem((trx) => trx.insertInto("otp_codes").values({ identifier, code, expires_at: new Date(Date.now() + 10 * 60_000) }).execute());
  console.info(`[auth] one-time code for ${identifier}: ${code}`);
  return { ok: true, identifier, demoCode: code };
}

const verifySchema = z.object({ identifier: identifierSchema, code: z.string().trim().regex(/^\d{6}$/), name: z.string().trim().max(80).optional(), next: nextSchema });

export async function verifyOtp(formData: FormData): Promise<{ ok: false; error: string } | never> {
  const parsed = verifySchema.safeParse({ identifier: formData.get("identifier"), code: formData.get("code"), name: formData.get("name") || undefined, next: formData.get("next") || undefined });
  if (!parsed.success) return { ok: false, error: "Enter the 6-digit code" };
  const { identifier, code, name } = parsed.data;
  const next = safeNext(parsed.data.next);
  const id = identifier.toLowerCase();
  if (isSupabaseConfigured()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const isEmail = id.includes("@");
    const { data, error } = isEmail ? await supabase.auth.verifyOtp({ email: id, token: code, type: "email" }) : await supabase.auth.verifyOtp({ phone: id, token: code, type: "sms" });
    if (error || !data.user) return { ok: false, error: error?.message ?? "That code didn't work" };
    await ensureProfile(data.user.id, data.user.email ?? null, name ?? null);
    await attachAnonymousDrafts(data.user.id);
    redirect(next);
  }
  const row = await runAsSystem((trx) => trx.selectFrom("otp_codes").selectAll().where("identifier", "=", id).where("code", "=", code).where("consumed_at", "is", null).where("expires_at", ">", new Date()).orderBy("created_at", "desc").executeTakeFirst());
  if (!row) return { ok: false, error: "That code didn't work — check it and try again" };
  const isEmail = id.includes("@");
  const userId = await runAsSystem(async (trx) => {
    await trx.updateTable("otp_codes").set({ consumed_at: new Date() }).where("id", "=", row.id).execute();
    const existing = await trx.selectFrom("profiles").select("id").where(isEmail ? "email" : "phone", "=", id).executeTakeFirst();
    if (existing) return existing.id;
    const db = getDb();
    const created = await db.insertInto("auth.users" as never).values({ email: isEmail ? id : null, phone: isEmail ? null : id, raw_user_meta_data: JSON.stringify({ name }) } as never).returning("id" as never).executeTakeFirstOrThrow() as unknown as { id: string };
    await trx.insertInto("profiles").values({ id: created.id, name: name ?? (isEmail ? id.split("@")[0]! : "New renter"), email: isEmail ? id : null, phone: isEmail ? null : id, role: "renter", joined_at: now() }).execute();
    return created.id;
  });
  await setSessionCookie(userId, isEmail ? id : null);
  await attachAnonymousDrafts(userId);
  redirect(next);
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  if (isSupabaseConfigured()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

/** Demo account list for the picker (never shown when Supabase Auth is configured). */
export async function demoAccounts() {
  if (isSupabaseConfigured()) return [];
  const actor = await getActor();
  void actor;
  return runAsSystem((trx) =>
    trx
      .selectFrom("profiles as p")
      .leftJoin("staff as s", "s.profile_id", "p.id")
      .select((eb) => ["p.id", "p.name", "p.email", "p.role", "p.is_business", "s.role as staff_role", eb.selectFrom("provider_members as pm").innerJoin("providers as pr", "pr.id", "pm.provider_id").select("pr.name").whereRef("pm.profile_id", "=", "p.id").limit(1).as("provider_name")])
      .where("p.email", "in", ["priya.nair@example.com", "jonas.k@example.com", "elena.v@example.com", "dana@northlandstoolhire.example.com", "femi@saltwaymarine.example.com", "tomas.r@example.com", "ines@fab.rent", "ola@fab.rent"])
      .orderBy("p.role")
      .execute(),
  );
}
