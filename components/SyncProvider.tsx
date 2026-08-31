"use client";

import { createContext, useContext } from "react";
import { useSync, type SyncView } from "@/lib/sync/useSync";

/**
 * Runs the sync runtime for the whole app.
 *
 * This has to live above the page, not inside a sheet. `useSync` is what
 * creates the Supabase client, and creating it is what makes supabase-js look
 * at the URL for a `?code=` returned by a magic link. It also owns the auth
 * subscription and the background sync triggers.
 *
 * While all of that hung off the Settings sheet, it only existed for as long
 * as the sheet was open: clicking a sign-in link landed on the app and nothing
 * exchanged the code, so the user stayed signed out, and check-ins never
 * synced unless Settings happened to be open at the time.
 *
 * One instance only — a second `useSync()` elsewhere would mean two auth
 * subscriptions and two sync loops racing each other, which is why consumers
 * read the shared value through `useSyncView` instead of calling the hook.
 */
const SyncContext = createContext<SyncView | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const view = useSync();
  return <SyncContext.Provider value={view}>{children}</SyncContext.Provider>;
}

export function useSyncView(): SyncView {
  const view = useContext(SyncContext);
  if (!view) {
    throw new Error("useSyncView must be used inside <SyncProvider>");
  }
  return view;
}
