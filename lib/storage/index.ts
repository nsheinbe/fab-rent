import "server-only";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { signToken } from "@/lib/auth/session";

export type Bucket = "listing-photos" | "condition-photos" | "evidence";
const PUBLIC_BUCKETS: Bucket[] = ["listing-photos"];

export interface StoredObject {
  bucket: Bucket;
  path: string;
}

export interface StorageAdapter {
  put(bucket: Bucket, objectPath: string, data: Buffer, contentType: string): Promise<StoredObject>;
  /** Public URL for public buckets; short-lived signed URL for private ones. */
  url(bucket: Bucket, objectPath: string, ttlSeconds?: number): Promise<string>;
  get?(bucket: Bucket, objectPath: string): Promise<{ data: Buffer; contentType: string } | null>;
}

const LOCAL_ROOT = process.env.LOCAL_STORAGE_DIR ? path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_STORAGE_DIR) : path.join(process.cwd(), ".data", "storage");

/** Demo-mode adapter: files on local disk, served by /api/storage/[bucket]/[...path]. */
export class LocalDiskStorage implements StorageAdapter {
  async put(bucket: Bucket, objectPath: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const safe = objectPath.replace(/\.\./g, "").replace(/^\/+/, "");
    const file = path.join(LOCAL_ROOT, bucket, safe);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
    return { bucket, path: safe };
  }
  async url(bucket: Bucket, objectPath: string, ttlSeconds = 600): Promise<string> {
    if (PUBLIC_BUCKETS.includes(bucket)) return `/api/storage/${bucket}/${objectPath}`;
    const token = signToken([bucket, objectPath], ttlSeconds);
    return `/api/storage/${bucket}/${objectPath}?token=${encodeURIComponent(token)}`;
  }
  async get(bucket: Bucket, objectPath: string) {
    const safe = objectPath.replace(/\.\./g, "").replace(/^\/+/, "");
    const file = path.join(LOCAL_ROOT, bucket, safe);
    try {
      await stat(file);
    } catch {
      return null;
    }
    const data = await readFile(file);
    let contentType = "application/octet-stream";
    try {
      contentType = (JSON.parse(await readFile(`${file}.meta.json`, "utf8")) as { contentType: string }).contentType;
    } catch {
      /* default */
    }
    return { data, contentType };
  }
}

/** Supabase Storage adapter (used when NEXT_PUBLIC_SUPABASE_URL is configured). */
export class SupabaseStorage implements StorageAdapter {
  async put(bucket: Bucket, objectPath: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const { createSupabaseServiceClient } = await import("@/lib/supabase/server");
    const sb = createSupabaseServiceClient();
    const { error } = await sb.storage.from(bucket).upload(objectPath, data, { contentType, upsert: true });
    if (error) throw new Error(error.message);
    return { bucket, path: objectPath };
  }
  async url(bucket: Bucket, objectPath: string, ttlSeconds = 600): Promise<string> {
    const { createSupabaseServiceClient } = await import("@/lib/supabase/server");
    const sb = createSupabaseServiceClient();
    if (PUBLIC_BUCKETS.includes(bucket)) return sb.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(objectPath, ttlSeconds);
    if (error || !data) throw new Error(error?.message ?? "could not sign url");
    return data.signedUrl;
  }
}

export function getStorage(): StorageAdapter {
  return isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? new SupabaseStorage() : new LocalDiskStorage();
}

/** Resolve a stored path (or null) to a URL the browser can load, or null for a placeholder. */
export async function photoUrl(bucket: Bucket, objectPath: string | null | undefined): Promise<string | null> {
  if (!objectPath) return null;
  return getStorage().url(bucket, objectPath);
}
