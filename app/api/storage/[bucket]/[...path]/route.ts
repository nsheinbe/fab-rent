import { NextResponse } from "next/server";
import { LocalDiskStorage, type Bucket } from "@/lib/storage";
import { verifyToken } from "@/lib/auth/session";
import { getActor } from "@/lib/auth";

const PUBLIC: string[] = ["listing-photos"];

/** Serves demo-mode files. Public bucket: open. Private buckets: HMAC-signed URL or a signed-in party. */
export async function GET(req: Request, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await ctx.params;
  const objectPath = path.join("/");
  if (!["listing-photos", "condition-photos", "evidence"].includes(bucket)) return new NextResponse("Not found", { status: 404 });
  if (!PUBLIC.includes(bucket)) {
    const token = new URL(req.url).searchParams.get("token");
    const parts = token ? verifyToken(token) : null;
    const ok = parts && parts[0] === bucket && parts[1] === objectPath;
    if (!ok) {
      const actor = await getActor();
      if (!actor.userId) return new NextResponse("Forbidden", { status: 403 });
    }
  }
  const file = await new LocalDiskStorage().get(bucket as Bucket, objectPath);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(file.data), { headers: { "content-type": file.contentType, "cache-control": PUBLIC.includes(bucket) ? "public, max-age=31536000, immutable" : "private, max-age=300" } });
}
