"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase, isSyncConfigured } from "../supabase/client";
import { subscribeToLocalChanges, readState } from "../store";
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
  /**
   * Whether the session has actually been looked up yet.
   *
   * `status` starts at "signed-out" because that is the right thing to render
   * while nothing is known, but it is a guess until `getSession` answers.
   * Anything that appears *because* somebody is signed out — a prompt to sign
   * in, say — has to wait for this, or it flashes on screen for every signed-in
   * person on every cold start.
   */
  ready: boolean;
  /**
   * Whether there is a session, independent of what sync is doing.
   *
   * Deliberately separate from `status`. `status` is about the *sync* — it
   * passes through "syncing", and lands on "offline" or "error" when one
   * fails — so asking "is this person signed out?" by testing
   * `status === "signed-out"` answers no during every sync and after every
   * failure, for somebody who never signed in at all. Anything shown because
   * a person is signed out must read this instead.
   */
  signedIn: boolean;
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

/**
 * Supabase reports a failed callback by redirecting back with the reason in
 * the URL — in the fragment for the implicit flow, in the query otherwise.
 * Without this the app just renders "signed out" and the person is left
 * guessing whether the link expired or they mistyped their address.
 */
function readAuthError(): string | null {
  if (typeof window === "undefined") return null;
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromQuery = new URLSearchParams(window.location.search);
  const description =
    fromHash.get("error_description") ?? fromQuery.get("error_description");
  const code = fromHash.get("error") ?? fromQuery.get("error");
  if (!description && !code) return null;

  const message = (description ?? code ?? "").replace(/\+/g, " ");
  if (/expired/i.test(message)) {
    return "That sign-in link has expired. Request a new one.";
  }
  if (/already|used/i.test(message)) {
    return "That link has already been used. Request a new one.";
  }
  return message || "Sign-in failed.";
}

export function useSync(): SyncView {
  const [status, setStatus] = useState<SyncStatus>(
    isSyncConfigured ? "signed-out" : "disabled",
  );
  // Nothing to look up when there is no project, so that case is ready at once.
  const [ready, setReady] = useState(!isSyncConfigured);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const run = useCallback(async () => {
    if (!isSyncConfigured) return;
    setStatus("syncing");
    try {
      const outcome = await syncNow();
      setStatus(statusFrom(outcome));
      setError(outcome.status === "error" ? outcome.message : null);
      setLastSyncedAt(readState().sync.lastSyncedAt);
    } catch (err) {
      // `syncNow` reports failures in its outcome rather than throwing, but a
      // rejection here would otherwise leave the status on "syncing" for the
      // rest of the session — a spinner that never stops, and every "are we
      // syncing?" check answering yes forever.
      setStatus("error");
      setError(err instanceof Error ? err.message : "Sync failed.");
    }
  }, []);

  // Auth session. `onAuthStateChange` is an external subscription, so writing
  // state from its callback is exactly what it is for.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let active = true;

    // Read this before the session lookup, because supabase-js strips the
    // callback parameters from the URL once it has processed them. The read is
    // synchronous; the state write happens in the callback below.
    const callbackError = readAuthError();

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (callbackError) setError(callbackError);
      setSignedIn(!!data.session);
      setEmail(data.session?.user.email ?? null);
      if (data.session) void run();
      else setStatus(callbackError ? "error" : "signed-out");
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
      setEmail(session?.user.email ?? null);
      if (session) {
        setError(null);
        void run();
      } else {
        setStatus("signed-out");
        setLastSyncedAt(null);
      }
      setReady(true);
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

    const unsubscribe = subscribeToLocalChanges(schedule);
    window.addEventListener("online", immediate);
    document.addEventListener("visibilitychange", immediate);

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("online", immediate);
      document.removeEventListener("visibilitychange", immediate);
    };
  }, [run]);

  return { status, ready, signedIn, email, lastSyncedAt, error, sync: () => void run() };
}
