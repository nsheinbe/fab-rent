/** Regenerates lib/db/types.generated.ts from the live schema with kysely-codegen. */
import { execSync } from "node:child_process";
import { loadEnv } from "./env";

loadEnv();
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/fabrent";
execSync(
  `pnpm exec kysely-codegen --dialect postgres --url "${url}" --out-file lib/db/types.generated.ts --camel-case=false --include-pattern "public.*" --numeric-parser number --log-level warn`,
  { stdio: "inherit" },
);
console.log("wrote lib/db/types.generated.ts");
