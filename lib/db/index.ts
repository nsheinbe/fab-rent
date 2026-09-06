import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { Pool } from "pg";
import type { DB } from "./types.generated";

export type { DB } from "./types.generated";

declare global {
  var __fabrentPool: Pool | undefined;
  var __fabrentDb: Kysely<DB> | undefined;
}

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — copy .env.example to .env.local");
  return url;
}

/** Process-wide pool (survives HMR in dev). */
export function getPool(): Pool {
  if (!globalThis.__fabrentPool) {
    globalThis.__fabrentPool = new Pool({ connectionString: connectionString(), max: 8, idleTimeoutMillis: 30_000 });
  }
  return globalThis.__fabrentPool;
}

/** Unscoped Kysely instance. Prefer `withActor()` so RLS applies; use this only for trusted system jobs. */
export function getDb(): Kysely<DB> {
  if (!globalThis.__fabrentDb) {
    globalThis.__fabrentDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: getPool() }) });
  }
  return globalThis.__fabrentDb;
}

export type Trx = Transaction<DB>;

export interface DbActor {
  /** auth.users id, or null for anonymous */
  userId: string | null;
  role: "anon" | "authenticated" | "service_role";
  /** anonymous draft key (cookie) so RLS can scope booking_drafts */
  anonymousKey?: string | null;
}

/**
 * Runs `fn` in a transaction with Postgres' role and JWT claims set, so every RLS policy applies
 * exactly as it would through Supabase's API. This is the only way app code should touch the DB.
 */
export async function runAs<T>(actor: DbActor, fn: (trx: Trx) => Promise<T>): Promise<T> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const claims = actor.userId ? { sub: actor.userId, role: actor.role } : { role: actor.role };
      await sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`.execute(trx);
      await sql`select set_config('request.jwt.claim.sub', ${actor.userId ?? ""}, true)`.execute(trx);
      await sql`select set_config('request.jwt.claim.role', ${actor.role}, true)`.execute(trx);
      await sql`select set_config('app.anonymous_key', ${actor.anonymousKey ?? ""}, true)`.execute(trx);
      await sql.raw(`set local role ${actor.role}`).execute(trx);
      return fn(trx);
    });
}

/**
 * Runs `fn` as the system inside the caller's transaction, then restores the caller's role.
 * For side effects the acting user must never write directly (provider ledger, renter credits, payouts):
 * they stay atomic with the user's own writes while RLS keeps guarding everything else.
 */
export async function asSystem<T>(trx: Trx, fn: (trx: Trx) => Promise<T>): Promise<T> {
  const { rows } = await sql<{ role: string | null; claim: string | null }>`select current_setting('role', true) as role, current_setting('request.jwt.claim.role', true) as claim`.execute(trx);
  const prevRole = rows[0]?.role && rows[0].role !== "none" ? rows[0].role : null;
  const prevClaim = rows[0]?.claim ?? "";
  await sql`set local role service_role`.execute(trx);
  await sql`select set_config('request.jwt.claim.role', 'service_role', true)`.execute(trx);
  try {
    return await fn(trx);
  } finally {
    await (prevRole ? sql.raw(`set local role ${prevRole}`) : sql`reset role`).execute(trx);
    await sql`select set_config('request.jwt.claim.role', ${prevClaim}, true)`.execute(trx);
  }
}

/** System jobs (cron, webhooks) — bypasses RLS via service_role. */
export async function runAsSystem<T>(fn: (trx: Trx) => Promise<T>): Promise<T> {
  return runAs({ userId: null, role: "service_role" }, fn);
}

export { sql };
