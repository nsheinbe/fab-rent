import { NextResponse } from "next/server";
import { runAsSystem } from "@/lib/db";
import { now } from "@/lib/time";
import { runJob, type JobName } from "@/lib/jobs";

export const dynamic = "force-dynamic";
const JOBS: JobName[] = ["returns", "holds", "claims", "reviews", "hold-expiry", "all"];

/**
 * Scheduled jobs (Vercel cron / Supabase pg_cron / curl). Protected by CRON_SECRET as a bearer token
 * or `?secret=`. Each job is idempotent: it only moves rows that are past their deadline.
 *   /api/cron/returns     active → return_due (24 h before end) · return_due → overdue (after grace)
 *   /api/cron/holds       release holds 3 business days after check-in when no claim is open
 *   /api/cron/claims      escalate claims the renter didn't answer to a dispute
 *   /api/cron/reviews     publish double-blind reviews after the waiting period
 *   /api/cron/hold-expiry mark lapsed card authorisations
 */
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const url = new URL(req.url);
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || provided !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!JOBS.includes(job as JobName)) return NextResponse.json({ error: `Unknown job. One of: ${JOBS.join(", ")}` }, { status: 404 });
  const at = now();
  const result = await runAsSystem((trx) => runJob(trx, job as JobName, at));
  return NextResponse.json({ job, at: at.toISOString(), ...result });
}

export const POST = GET;
