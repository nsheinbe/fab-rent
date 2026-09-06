"use client";
import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser Supabase client, or null in demo mode. */
export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  if (!client) client = createBrowserClient(supabaseUrl(), supabaseAnonKey());
  return client;
}
