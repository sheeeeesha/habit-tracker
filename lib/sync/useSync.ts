"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase, isSyncConfigured } from "../supabase/client";
import { subscribeToStore, readState } from "../store";
import { syncNow, type SyncOutcome } from "./engine";

export type SyncStatus =
  /** No Supabase project configured — the app is local-only. */
  | "disabled"
  | "signed-out"
  | "idle"
  | "syncing"
  | "offline"
  | "error";

/** How long to wait after the last local edit before syncing it up. */
const DEBOUNCE_MS = 2_500;

export interface SyncView {
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: number | null;
  error: string | null;
  sync: () => void;
}

function statusFrom(outcome: SyncOutcome): SyncStatus {
  switch (outcome.status) {
    case "ok":
      return "idle";
    case "not-configured":
      return "disabled";
    case "signed-out":
      return "signed-out";
    case "offline":
      return "offline";
    default:
      return "error";
  }
}

export function useSync(): SyncView {
  const [status, setStatus] = useState<SyncStatus>(
    isSyncConfigured ? "signed-out" : "disabled",
  );
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const run = useCallback(async () => {
    if (!isSyncConfigured) return;
    setStatus("syncing");
    const outcome = await syncNow();
    setStatus(statusFrom(outcome));
    setError(outcome.status === "error" ? outcome.message : null);
    setLastSyncedAt(readState().sync.lastSyncedAt);
  }, []);

  // Auth session. `onAuthStateChange` is an external subscription, so writing
  // state from its callback is exactly what it is for.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setEmail(data.session?.user.email ?? null);
      if (data.session) void run();
      else setStatus("signed-out");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      if (session) void run();
      else {
        setStatus("signed-out");
        setLastSyncedAt(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [run]);

  // Re-sync when the app comes back to the foreground or regains a network,
  // and (debounced) whenever local state changes.
  useEffect(() => {
    if (!isSyncConfigured) return;

    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), DEBOUNCE_MS);
    };
    const immediate = () => {
      if (document.visibilityState === "visible") void run();
    };

    const unsubscribe = subscribeToStore(schedule);
    window.addEventListener("online", immediate);
    document.addEventListener("visibilitychange", immediate);

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("online", immediate);
      document.removeEventListener("visibilitychange", immediate);
    };
  }, [run]);

  return { status, email, lastSyncedAt, error, sync: () => void run() };
}
