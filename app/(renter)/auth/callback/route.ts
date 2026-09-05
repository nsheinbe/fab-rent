import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Supabase OAuth / magic-link callback: exchanges the code for a session, then continues to `next`. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/rentals";
  const code = url.searchParams.get("code");
  if (isSupabaseConfigured() && code) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/auth?error=oauth&next=${encodeURIComponent(next)}`, url.origin));
  }
  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/rentals", url.origin));
}
