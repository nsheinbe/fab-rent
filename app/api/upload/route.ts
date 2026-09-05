import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/auth";
import { getStorage, type Bucket } from "@/lib/storage";

const schema = z.object({
  bucket: z.enum(["listing-photos", "condition-photos", "evidence"]),
  path: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\-\/.]+$/),
});

const MAX_BYTES = 10 * 1024 * 1024;

/** File uploads (the one place route handlers are used besides webhooks/cron). Signed-in users only. */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor.userId) return NextResponse.json({ error: "Sign in to upload photos" }, { status: 401 });
  const form = await req.formData();
  const parsed = schema.safeParse({ bucket: form.get("bucket"), path: form.get("path") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Images only" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Max 10 MB" }, { status: 413 });
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const objectPath = `${parsed.data.path.replace(/\/+$/, "")}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const storage = getStorage();
  const stored = await storage.put(parsed.data.bucket as Bucket, objectPath, Buffer.from(await file.arrayBuffer()), file.type);
  const url = await storage.url(stored.bucket, stored.path);
  return NextResponse.json({ path: stored.path, url });
}
