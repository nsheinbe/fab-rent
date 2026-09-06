import { NextResponse, type NextRequest } from "next/server";
import { ANON_COOKIE, SESSION_COOKIE, decodeSession } from "@/lib/auth/session";

/**
 * Edge guard for /provider/* and /admin/*: signed-in users only. Role checks (provider_members / staff)
 * happen again in the route layouts and in every server action via requireProvider()/requireStaff().
 * Also issues the anonymous draft cookie so booking drafts survive the sign-in interstitial.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // lets server components know the current URL (requireUserPage builds its /auth?next= from it)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname + search);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (!request.cookies.get(ANON_COOKIE)) {
    const key = crypto.randomUUID().replace(/-/g, "");
    response.cookies.set(ANON_COOKIE, key, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }

  const guarded = pathname.startsWith("/provider") || pathname.startsWith("/admin");
  if (!guarded) return response;

  let signedIn = false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    // Supabase stores its session in sb-<ref>-auth-token cookies; presence is enough at the edge,
    // the server verifies the JWT on every request.
    signedIn = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
  }
  if (!signedIn) {
    const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
    signedIn = !!session;
  }
  if (!signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/storage).*)"],
};
