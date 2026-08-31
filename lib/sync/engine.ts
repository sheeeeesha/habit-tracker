"use client";

import { getSupabase, isSyncConfigured } from "../supabase/client";
import { applyMerged, readState, resetAll, setSync } from "../store";
import {
  checkinToRow,
  habitFromRow,
  habitToRow,
  isPushable,
  logFromRows,
  merge,
  type CheckinRow,
  type HabitRow,
} from "./merge";

/**
 * The pull cursor is a server timestamp, and rows can commit slightly after
 * the clock value they were stamped with. Rewinding the cursor a little on
 * every pull means a row can be fetched twice — which the merge handles as a
 * no-op tie — rather than missed once, which would lose it forever.
 */
const CURSOR_SAFETY_MS = 10_000;

/** Supabase caps a single response; page through rather than truncating. */
const PAGE_SIZE = 1000;

export type SyncOutcome =
  | { status: "ok"; pulled: number; pushed: number }
  | { status: "not-configured" }
  | { status: "signed-out" }
  | { status: "offline" }
  | { status: "error"; message: string };

let inFlight: Promise<SyncOutcome> | null = null;

async function pullAll<T>(
  table: "habits" | "checkins",
  since: string | null,
): Promise<T[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select("*")
      .order("synced_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (since) query = query.gt("synced_at", since);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function pushChunked<T>(
  fn: "push_habits" | "push_checkins",
  rows: T[],
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !rows.length) return;

  // Keep each request comfortably inside the request body limit.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.rpc(fn, { payload: rows.slice(i, i + CHUNK) });
    if (error) throw new Error(error.message);
  }
}

/**
 * One full round trip: pull what changed, merge it against local state, adopt
 * the result, then push whatever local still wins.
 *
 * Local writes are never blocked on this. If it fails the user keeps working
 * offline and the next attempt picks up where this one left off, because the
 * cursor only advances on success.
 */
async function runSync(): Promise<SyncOutcome> {
  if (!isSyncConfigured) return { status: "not-configured" };
  const supabase = getSupabase();
  if (!supabase) return { status: "not-configured" };

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return { status: "signed-out" };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { status: "offline" };
  }

  const state = readState();
  const userId = session.user.id;

  // Signing into a different account on the same device must not merge the
  // previous person's habits into the new one.
  if (state.sync.userId && state.sync.userId !== userId) {
    resetAll();
    setSync({ userId, cursor: null, lastSyncedAt: null });
  }

  const before = readState();
  const cursor = before.sync.userId === userId ? before.sync.cursor : null;
  const pullStartedAt = Date.now();

  try {
    const [habitRows, checkinRows] = await Promise.all([
      pullAll<HabitRow>("habits", cursor),
      pullAll<CheckinRow>("checkins", cursor),
    ]);

    const merged = merge({
      localHabits: before.habits,
      localLog: before.log,
      remoteHabits: habitRows.map(habitFromRow),
      remoteLog: logFromRows(checkinRows),
    });

    // A record that cannot satisfy the schema is skipped rather than retried
    // forever, and its check-ins go with it so they cannot fail a foreign key.
    const pushableHabits = merged.habitsToPush.filter(isPushable);
    const unpushable = new Set(
      merged.habitsToPush.filter((h) => !isPushable(h)).map((h) => h.id),
    );

    // Habits go first: a check-in whose habit the server has not seen yet is
    // skipped server-side rather than failing the batch.
    await pushChunked("push_habits", pushableHabits.map(habitToRow));
    await pushChunked(
      "push_checkins",
      merged.checkinsToPush
        .filter((c) => !unpushable.has(c.habitId))
        .map((c) => checkinToRow(c.habitId, c.day, c.cell)),
    );

    applyMerged(merged.habits, merged.log, {
      userId,
      lastSyncedAt: Date.now(),
      cursor: new Date(pullStartedAt - CURSOR_SAFETY_MS).toISOString(),
    });

    return {
      status: "ok",
      pulled: habitRows.length + checkinRows.length,
      pushed: pushableHabits.length + merged.checkinsToPush.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { status: "offline" };
    }
    return { status: "error", message };
  }
}

/** Coalesces concurrent callers onto a single round trip. */
export function syncNow(): Promise<SyncOutcome> {
  inFlight ??= runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function signInWithEmail(email: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "Sync is not configured on this deployment.";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
  // The local database stays on the device: signing out should not destroy
  // habits the person can still use offline. The next sign-in decides whether
  // to adopt or replace it.
  setSync({ userId: null, cursor: null, lastSyncedAt: null });
}
