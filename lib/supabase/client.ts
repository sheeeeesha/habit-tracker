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
      // Implicit rather than PKCE, deliberately.
      //
      // PKCE keeps a code verifier in the localStorage of the browser that
      // *requested* the link. Mail apps routinely open links in their own
      // in-app webview, which has separate storage, so the exchange fails with
      // "both auth code and code verifier should be non-empty" — and the whole
      // promise of a magic link is that it works wherever you tap it.
      //
      // The trade is that the tokens ride in the URL fragment for an instant
      // before supabase-js consumes them and cleans the URL. Fragments are
      // never sent to a server, and this is a client-only app with no
      // server-side session to protect.
      flowType: "implicit",
    },
  });
  return client;
}
