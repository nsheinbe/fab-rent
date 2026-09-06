import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, runAs, runAsSystem, type DbActor, type Trx } from "@/lib/db";
import { ANON_COOKIE, SESSION_COOKIE, decodeSession } from "./session";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type ActorRole = "anon" | "renter" | "provider" | "staff";

export interface Actor {
  /** null when browsing anonymously */
  userId: string | null;
  anonymousKey: string | null;
  profile: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    neighbourhood: string | null;
    id_verified: boolean;
    rating_from_providers: number | null;
    completed_count: number;
    status: string;
    is_business: boolean;
    avatar_path: string | null;
  } | null;
  /** providers this user is a member of (owner or staff) */
  providers: Array<{ id: string; name: string; slug: string; role: string }>;
  /** staff row when the user is an admin */
  staff: { id: string; role: string; permissions: string[] } | null;
  db: DbActor;
}

/** Resolve the current user id from either Supabase Auth (if configured) or the demo session cookie. */
async function currentUserId(): Promise<{ userId: string | null; email: string | null }> {
  const jar = await cookies();
  if (isSupabaseConfigured()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) return { userId: data.user.id, email: data.user.email ?? null };
  }
  const s = decodeSession(jar.get(SESSION_COOKIE)?.value);
  return { userId: s?.userId ?? null, email: s?.email ?? null };
}

/**
 * The actor for this request: who they are, which providers they belong to, whether they are staff.
 * Cached per request. Every server component and action goes through here.
 */
export const getActor = cache(async (): Promise<Actor> => {
  const jar = await cookies();
  const anonymousKey = jar.get(ANON_COOKIE)?.value ?? null;
  const { userId, email } = await currentUserId();
  if (!userId) {
    return { userId: null, anonymousKey, profile: null, providers: [], staff: null, db: { userId: null, role: "anon", anonymousKey } };
  }
  // Membership lookups need to bypass RLS (a user can always see their own memberships, but we
  // read as system here so a brand-new auth user with no profile row still resolves cleanly).
  const rows = await runAsSystem(async (trx) => {
    const profile = await trx
      .selectFrom("profiles")
      .select(["id", "name", "email", "phone", "neighbourhood", "id_verified", "rating_from_providers", "completed_count", "status", "is_business", "avatar_path"])
      .where("id", "=", userId)
      .executeTakeFirst();
    const providers = await trx
      .selectFrom("provider_members")
      .innerJoin("providers", "providers.id", "provider_members.provider_id")
      .select(["providers.id as id", "providers.name as name", "providers.slug as slug", "provider_members.role as role"])
      .where("provider_members.profile_id", "=", userId)
      .execute();
    const staff = await trx.selectFrom("staff").select(["id", "role", "permissions"]).where("profile_id", "=", userId).executeTakeFirst();
    return { profile, providers, staff };
  });
  return {
    userId,
    anonymousKey,
    profile: rows.profile
      ? { ...rows.profile, rating_from_providers: rows.profile.rating_from_providers == null ? null : Number(rows.profile.rating_from_providers) }
      : { id: userId, name: email ?? "New renter", email, phone: null, neighbourhood: null, id_verified: false, rating_from_providers: null, completed_count: 0, status: "active", is_business: false, avatar_path: null },
    providers: rows.providers,
    staff: rows.staff ? { id: rows.staff.id, role: rows.staff.role, permissions: rows.staff.permissions } : null,
    db: { userId, role: "authenticated", anonymousKey },
  };
});

/** Run DB work as the current actor (RLS applies). */
export async function withActor<T>(fn: (trx: Trx, actor: Actor) => Promise<T>): Promise<T> {
  const actor = await getActor();
  return runAs(actor.db, (trx) => fn(trx, actor));
}

export class AuthError extends Error {
  constructor(
    readonly code: "unauthenticated" | "forbidden",
    message?: string,
  ) {
    super(message ?? (code === "unauthenticated" ? "Please sign in" : "You don't have access to this"));
  }
}

export async function requireUser(): Promise<Actor> {
  const actor = await getActor();
  if (!actor.userId) throw new AuthError("unauthenticated");
  return actor;
}

/** Page variant of requireUser(): anonymous visitors go to /auth and come back to this page afterwards (proxy.ts sets x-pathname). */
export async function requireUserPage(): Promise<Actor> {
  const actor = await getActor();
  if (!actor.userId) {
    const h = await headers();
    redirect(`/auth?next=${encodeURIComponent(h.get("x-pathname") ?? "/")}`);
  }
  return actor;
}

/** Provider members only; returns the actor plus the provider they operate (first membership, or ?provider= later). */
export async function requireProvider(providerId?: string): Promise<Actor & { provider: Actor["providers"][number] }> {
  const actor = await requireUser();
  const provider = providerId ? actor.providers.find((p) => p.id === providerId) : actor.providers[0];
  if (!provider) throw new AuthError("forbidden", "This account is not a member of any provider");
  return { ...actor, provider };
}

export async function requireStaff(): Promise<Actor & { staff: NonNullable<Actor["staff"]> }> {
  const actor = await requireUser();
  if (!actor.staff) throw new AuthError("forbidden", "Staff access required");
  return { ...actor, staff: actor.staff };
}

export { getDb, runAs, runAsSystem };
