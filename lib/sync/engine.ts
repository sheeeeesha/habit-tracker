"use client";

import { getSupabase, isSyncConfigured } from "../supabase/client";
import { applyMerged, applyRemoteProfile, readState, resetForAccount, setSync } from "../store";
import { resolveProfile, type LocalProfile } from "./profile";
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
  // previous person's habits into the new one. This checks `ownerId`, which
  // survives signing out — `userId` does not, so a sign-out between the two
  // accounts would otherwise slip straight past this.
  if (state.sync.ownerId && state.sync.ownerId !== userId) {
    resetForAccount(userId);
  }

  const before = readState();
  const sameAccount = before.sync.ownerId === userId;
  const cursor = sameAccount ? before.sync.cursor : null;
  // Only meaningful alongside a cursor: with a full pull every local-only row
  // genuinely needs pushing.
  const pushedThrough = cursor ? before.sync.lastSyncedAt : null;
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
      pushedThrough,
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

    await syncProfile({
      name: before.name,
      nameUpdatedAt: before.nameUpdatedAt,
      prefs: before.prefs,
      prefsUpdatedAt: before.prefsUpdatedAt,
    });

    applyMerged(merged.habits, merged.log, {
      ownerId: userId,
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

/**
 * Settles the name and the portable preferences against the account.
 *
 * They ride on the auth user's metadata rather than a table of their own: a
 * handful of fields that change about once each, where a table with its own
 * policies and conflict resolution would be a lot of machinery. Both are
 * settled together, so a device behind on both does not make two round trips.
 *
 * `getUser` rather than the session already in hand, and that costs a request.
 * `getSession` returns whatever is in local storage without asking the server,
 * so its `user_metadata` is a snapshot taken when the access token was last
 * issued — up to an hour old. Deciding against that snapshot is not merely
 * late: a device whose snapshot predates another device's change would read
 * its own older edit as the newer one and push it straight over the top.
 *
 * If the fetch fails there is no safe decision to make, so this does nothing
 * and the next sync tries again. Habits are unaffected either way.
 */
async function syncProfile(local: LocalProfile) {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return;

  const { outgoing, incoming } = resolveProfile(data.user.user_metadata, local);
  if (outgoing) await supabase.auth.updateUser({ data: outgoing });
  if (incoming) applyRemoteProfile(incoming);
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

/**
 * What the app accepts out of a sign-in email.
 *
 * A six-digit code only exists if the email template asks for `{{ .Token }}`,
 * which the stock template does not. The link is always present and carries
 * the same token as a query parameter, so accepting a pasted link works
 * whatever the template says — no dashboard edit required.
 */
export function extractSignInToken(
  input: string,
): { token: string; type: "email" | "magiclink" } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Supabase's OTP length is configurable (6 to 10), so do not assume six.
  const digits = trimmed.replace(/[\s-]/g, "");
  if (/^\d{6,10}$/.test(digits)) return { token: digits, type: "email" };

  // Supabase's link is .../auth/v1/verify?token=<hash>&type=magiclink&...
  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("token") ?? url.searchParams.get("token_hash");
    if (token) {
      const linkType = url.searchParams.get("type");
      return {
        token,
        type: linkType === "signup" || linkType === "email" ? "email" : "magiclink",
      };
    }
  } catch {
    // Not a URL; fall through to the failure below.
  }
  return null;
}

/**
 * Completes sign-in from a code or a pasted link.
 *
 * This is the path that works from an installed app. Tapping a link hands the
 * session to whichever browser the OS opens, and an installed web app keeps
 * its own storage — so the browser ends up signed in and the app the person is
 * actually holding does not. Verifying here creates the session in whichever
 * copy they are looking at, which is by definition the right one.
 */
export async function verifyEmailCode(
  email: string,
  input: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "Sync is not configured on this deployment.";

  const parsed = extractSignInToken(input);
  if (!parsed) {
    return "Paste the six-digit code, or the whole sign-in link from the email.";
  }

  const attempt = (type: "email" | "magiclink") =>
    type === "magiclink"
      ? supabase.auth.verifyOtp({ token_hash: parsed.token, type: "magiclink" })
      : supabase.auth.verifyOtp({ email, token: parsed.token, type: "email" });

  let { error } = await attempt(parsed.type);
  if (error && parsed.type === "magiclink") {
    // A link can be issued as a signup rather than a magiclink depending on
    // whether the address had been seen before. A rejected attempt does not
    // consume the token, so trying the other reading is free.
    ({ error } = await supabase.auth.verifyOtp({ token_hash: parsed.token, type: "signup" }));
  }

  if (!error) return null;

  // Supabase answers "Email link is invalid or has expired" with error_code
  // otp_expired for *any* rejected token — including one that never existed.
  // Repeating "expired" back would be asserting something it never said, and
  // sends people off re-sending mail when the real cause is usually that the
  // token was already spent.
  if (/expired|invalid|not found/i.test(error.message)) {
    return parsed.type === "magiclink"
      ? "That link did not work. Single-use links are often opened by email link scanners before you get to them — send a new one and use the code instead."
      : "That code did not work. Check it against the newest email, then send a new one if needed.";
  }
  return error.message;
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
  // The local database stays on the device: signing out should not destroy
  // habits the person can still use offline. `ownerId` is deliberately kept so
  // the next sign-in can tell "same person coming back" from "somebody else on
  // a shared device" and clear the data in the second case.
  setSync({ userId: null, cursor: null, lastSyncedAt: null });
}
