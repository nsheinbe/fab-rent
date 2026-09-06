import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "fr_session";
export const ANON_COOKIE = "fr_anon";
const SESSION_DAYS = 30;

function secret() {
  return process.env.APP_SECRET ?? "dev-secret-not-for-production";
}

export interface DemoSession {
  userId: string;
  email: string | null;
  issuedAt: number;
  expiresAt: number;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** `base64url(json).signature` */
export function encodeSession(s: DemoSession): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined | null): DemoSession | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as DemoSession;
    if (!s.userId || s.expiresAt < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function newSession(userId: string, email: string | null): DemoSession {
  const now = Date.now();
  return { userId, email, issuedAt: now, expiresAt: now + SESSION_DAYS * 86_400_000 };
}

export function newAnonymousKey() {
  return randomBytes(16).toString("base64url");
}

/** Short-lived signed token used for local "signed URLs" (private storage) and OTP codes. */
export function signToken(parts: string[], ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = [...parts, String(exp)].join("|");
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifyToken(token: string): string[] | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = Buffer.from(token.slice(0, dot), "base64url").toString();
  const expected = sign(payload);
  const sig = token.slice(dot + 1);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const parts = payload.split("|");
  const exp = Number(parts.pop());
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return parts;
}
