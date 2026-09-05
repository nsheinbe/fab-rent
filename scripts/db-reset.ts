/**
 * Creates the local database (if needed), applies supabase/local/*.sql (plain-Postgres shim),
 * supabase/migrations/*.sql and supabase/seed.sql. Idempotent: drops and recreates schema `public`.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/fabrent pnpm db:reset
 *   pnpm db:reset --no-seed
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { loadEnv } from "./env";

loadEnv();

const url = new URL(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/fabrent");
const dbName = url.pathname.replace(/^\//, "");
const isSupabaseLocal = url.port === "54322";
const noSeed = process.argv.includes("--no-seed");

async function ensureDatabase() {
  const admin = new URL(url.toString());
  admin.pathname = "/postgres";
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  const r = await c.query("select 1 from pg_database where datname = $1", [dbName]);
  if (r.rowCount === 0) {
    console.log(`creating database ${dbName}`);
    await c.query(`create database "${dbName}"`);
  }
  await c.end();
}

function sqlFiles(dir: string) {
  if (!existsSync(dir)) return [] as string[];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

async function main() {
  await ensureDatabase();
  const c = new Client({ connectionString: url.toString() });
  await c.connect();
  console.log(`resetting ${dbName} (${url.host})`);
  await c.query("drop schema if exists public cascade; create schema public;");
  await c.query("grant all on schema public to public;");
  if (!isSupabaseLocal) {
    // drop the shim's auth schema too so a rerun starts clean
    await c.query("drop schema if exists auth cascade; drop schema if exists storage cascade;");
    for (const f of sqlFiles(path.resolve("supabase/local"))) {
      console.log(`  shim  ${path.basename(f)}`);
      await c.query(readFileSync(f, "utf8"));
    }
  }
  for (const f of sqlFiles(path.resolve("supabase/migrations"))) {
    console.log(`  apply ${path.basename(f)}`);
    await c.query(readFileSync(f, "utf8"));
  }
  if (!noSeed) {
    const seed = path.resolve("supabase/seed.sql");
    if (existsSync(seed)) {
      console.log("  seed  seed.sql");
      await c.query(readFileSync(seed, "utf8"));
    } else {
      console.log("  (no seed.sql — run pnpm seed:generate)");
    }
  }
  await c.end();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
