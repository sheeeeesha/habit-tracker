"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Sync is optional. With no Supabase project configured the app runs exactly
 * as before — local-only, no account, no network — and every sync entry point
 * simply reports "not configured" instead of failing.
 */
export const isSyncConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSyncConfigured) return null;
  client ??= createClient(url as string, anonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Magic-link callbacks come back with the token in the URL fragment.
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return client;
}
