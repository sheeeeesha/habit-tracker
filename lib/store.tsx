"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { todayKey } from "./date";
import { iconKeyFromEmoji, type HabitIconKey } from "./habitIcons";
import { type Cell, type CompletionLog, migrateLegacyLog } from "./log";
import { nextAccent } from "./palette";
import { isLive, type AppState, type Habit, type HabitDraft, type Prefs, type SyncState } from "./types";

const STORAGE_KEY = "streakwrapped.v1";
const SCHEMA_VERSION = 3;

/** Tombstones are dropped once no device could still be unaware of them. */
const TOMBSTONE_TTL_MS = 90 * 86_400_000;

const DEFAULT_PREFS: Prefs = {
  installDismissedUntil: 0,
  installed: false,
  installRequested: false,
  reduceMotion: false,
  iconBadge: false,
};

const DEFAULT_SYNC: SyncState = {
  ownerId: null,
  userId: null,
  lastSyncedAt: null,
  cursor: null,
};

function emptyState(): AppState {
  return {
    version: SCHEMA_VERSION,
    name: "",
    nameUpdatedAt: 0,
    habits: [],
    log: {},
    prefs: { ...DEFAULT_PREFS },
    sync: { ...DEFAULT_SYNC },
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function reviveHabit(raw: unknown, stamp: number): Habit | null {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Partial<Habit> & { emoji?: unknown };
  if (typeof h.id !== "string" || typeof h.name !== "string") return null;

  // v3 replaced the literal emoji with a key into the curated icon set.
  const icon: HabitIconKey =
    typeof h.icon === "string" && h.icon
      ? (h.icon as HabitIconKey)
      : iconKeyFromEmoji(h.emoji);
  const { emoji: _dropped, ...rest } = h;

  return {
    ...(rest as Habit),
    icon,
    // v1 habits predate sync and carry no timestamp.
    updatedAt: typeof h.updatedAt === "number" ? h.updatedAt : (h.createdAt ?? stamp),
  };
}

interface Revived {
  state: AppState;
  /** True when the payload was an older schema and had to be upgraded. */
  migrated: boolean;
}

/** Tolerant parse — a half-written or older payload degrades to defaults. */
function reviveState(raw: string | null): Revived {
  if (!raw) return { state: emptyState(), migrated: false };
  try {
    const parsed = JSON.parse(raw) as Partial<AppState> | null;
    if (!parsed || typeof parsed !== "object") {
      return { state: emptyState(), migrated: false };
    }

    // v1 stored a bare count per day and had no sync metadata. Stamping the
    // migration with the moment it happened keeps existing history "older"
    // than anything written after it.
    const stamp = Date.now();
    const migrated = parsed.version !== SCHEMA_VERSION;

    const state: AppState = {
      version: SCHEMA_VERSION,
      name: typeof parsed.name === "string" ? parsed.name : "",
      nameUpdatedAt:
        typeof parsed.nameUpdatedAt === "number" ? parsed.nameUpdatedAt : 0,
      habits: Array.isArray(parsed.habits)
        ? parsed.habits
            .map((h) => reviveHabit(h, stamp))
            .filter((h): h is Habit => h !== null)
        : [],
      log: migrateLegacyLog(parsed.log, stamp),
      prefs: { ...DEFAULT_PREFS, ...(parsed.prefs ?? {}) },
      sync: { ...DEFAULT_SYNC, ...(parsed.sync ?? {}) },
    };
    return { state, migrated };
  } catch {
    return { state: emptyState(), migrated: false };
  }
}

/* ------------------------------------------------------------------ *
 * The store lives outside React.
 *
 * localStorage is a browser-only external system, so this is a plain
 * subscribable store read through `useSyncExternalStore`. That keeps the
 * server render and the hydration pass in agreement, avoids the cascading
 * re-render an effect-based load would cause, and gives cross-tab sync for
 * free.
 * ------------------------------------------------------------------ */

interface Snapshot {
  state: AppState;
  /** False until localStorage has actually been read on the client. */
  hydrated: boolean;
}

// Frozen and reused: `getServerSnapshot` must return a stable reference.
const SERVER_SNAPSHOT: Snapshot = Object.freeze({
  state: Object.freeze(emptyState()) as AppState,
  hydrated: false,
});

let snapshot: Snapshot = SERVER_SNAPSHOT;
let loaded = false;
let storageBound = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** The motion preference is consumed by CSS, so mirror it onto <html>. */
function syncMotionAttribute(state: AppState) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.reduceMotion = String(state.prefs.reduceMotion);
}

function adopt(state: AppState, { persist }: { persist: boolean }) {
  snapshot = { state, hydrated: true };
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded or private mode: the session still works in memory.
    }
  }
  syncMotionAttribute(state);
  emit();
}

/** Drops tombstones old enough that every device has certainly synced them. */
function purgeTombstones(state: AppState): AppState {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const stale = state.habits.filter((h) => h.deletedAt && h.deletedAt < cutoff);
  if (!stale.length) return state;
  const log = { ...state.log };
  for (const h of stale) delete log[h.id];
  return {
    ...state,
    habits: state.habits.filter((h) => !stale.includes(h)),
    log,
  };
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const { state, migrated } = reviveState(window.localStorage.getItem(STORAGE_KEY));
  const purged = purgeTombstones(state);
  // An upgraded payload must be written back straight away. Otherwise the
  // migration re-runs on every load and re-stamps every cell with a fresh
  // timestamp, which would make local data permanently look newer than the
  // server and quietly win every sync conflict.
  adopt(purged, { persist: migrated || purged !== state });
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  if (!storageBound) {
    storageBound = true;
    window.addEventListener("storage", (e) => {
      // Another tab of the same app wrote — adopt its state without echoing
      // it straight back to storage.
      if (e.key !== STORAGE_KEY) return;
      loaded = true;
      adopt(reviveState(e.newValue).state, { persist: false });
    });
  }

  // React calls subscribe after commit, so this is the right moment to read
  // the browser's copy.
  ensureLoaded();

  return () => {
    listeners.delete(onChange);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_SNAPSHOT;

/** Every mutation funnels through here: update memory, persist, notify. */
function update(fn: (state: AppState) => AppState) {
  adopt(fn(snapshot.state), { persist: true });
}

/** Read-only access for non-React callers such as the sync engine. */
export function readState(): AppState {
  return snapshot.state;
}

export function isHydrated(): boolean {
  return snapshot.hydrated;
}

/** Lets the sync engine subscribe without going through React. */
export function subscribeToStore(onChange: () => void): () => void {
  return subscribe(onChange);
}

export interface StoreValue {
  state: AppState;
  /** False during the first paint, before localStorage has been read. */
  hydrated: boolean;
  /** Excludes deleted tombstones. */
  habits: Habit[];
  addHabit: (draft: HabitDraft) => Habit;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  setArchived: (id: string, archived: boolean) => void;
  /** Add (or subtract) check-ins for one day. Never drops below zero. */
  bumpCheckIn: (habitId: string, delta: number, key?: string) => void;
  setCheckIn: (habitId: string, count: number, key?: string) => void;
  setName: (name: string) => void;
  setPrefs: (patch: Partial<Prefs>) => void;
  resetAll: () => void;
  suggestAccent: () => Habit["accent"];
}

export function addHabit(draft: HabitDraft): Habit {
  const now = Date.now();
  const habit: Habit = { ...draft, id: newId(), createdAt: now, updatedAt: now };
  update((s) => ({ ...s, habits: [...s.habits, habit] }));
  return habit;
}

export function updateHabit(id: string, patch: Partial<Habit>) {
  update((s) => ({
    ...s,
    habits: s.habits.map((h) =>
      h.id === id ? { ...h, ...patch, updatedAt: Date.now() } : h,
    ),
  }));
}

/**
 * Soft delete. The row survives as a tombstone so the deletion reaches other
 * devices; the log is cleared immediately since nothing can read it again.
 */
export function deleteHabit(id: string) {
  update((s) => {
    const log = { ...s.log };
    delete log[id];
    return {
      ...s,
      habits: s.habits.map((h) =>
        h.id === id ? { ...h, deletedAt: Date.now(), updatedAt: Date.now() } : h,
      ),
      log,
    };
  });
}

export function setArchived(id: string, archived: boolean) {
  update((s) => ({
    ...s,
    habits: s.habits.map((h) =>
      h.id === id
        ? { ...h, archivedAt: archived ? Date.now() : undefined, updatedAt: Date.now() }
        : h,
    ),
  }));
}

function writeCount(habitId: string, day: string, next: number) {
  update((s) => {
    const forHabit: Record<string, Cell> = { ...(s.log[habitId] ?? {}) };
    // A zero is stored as absence, but the write still needs a timestamp for
    // sync — so a cleared day becomes {n: 0} rather than vanishing outright.
    forHabit[day] = { n: Math.max(0, next), t: Date.now() };
    return { ...s, log: { ...s.log, [habitId]: forHabit } };
  });
}

export function bumpCheckIn(habitId: string, delta: number, key?: string) {
  const k = key ?? todayKey();
  const current = snapshot.state.log[habitId]?.[k]?.n ?? 0;
  writeCount(habitId, k, Math.max(0, current + delta));
}

export function setCheckIn(habitId: string, count: number, key?: string) {
  writeCount(habitId, key ?? todayKey(), Math.max(0, count));
}

/**
 * `at` is supplied when adopting a name pulled from the account, so the
 * incoming timestamp is preserved rather than the value looking freshly
 * edited on this device and winning the next comparison.
 */
export function setName(name: string, at: number = Date.now()) {
  update((s) => ({ ...s, name, nameUpdatedAt: at }));
}

export function setPrefs(patch: Partial<Prefs>) {
  update((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }));
}

export function setSync(patch: Partial<SyncState>) {
  update((s) => ({ ...s, sync: { ...s.sync, ...patch } }));
}

export function resetAll() {
  update(() => emptyState());
}

/** Applies a merged result from the sync engine. */
export function applyMerged(habits: Habit[], log: CompletionLog, sync: Partial<SyncState>) {
  update((s) => ({ ...s, habits, log, sync: { ...s.sync, ...sync } }));
}

/**
 * Clears the habits belonging to a previous account without disturbing
 * device-level preferences. Whether the install CTA was dismissed or motion is
 * reduced has nothing to do with who is signed in.
 */
export function resetForAccount(ownerId: string) {
  update((s) => ({
    ...emptyState(),
    prefs: s.prefs,
    sync: { ...DEFAULT_SYNC, ownerId, userId: ownerId },
  }));
}

/** Replaces everything — used by the backup importer. */
export function replaceAll(next: unknown) {
  loaded = true;
  adopt(reviveState(JSON.stringify(next)).state, { persist: true });
}

export function useStore(): StoreValue {
  const { state, hydrated } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // Tombstones exist for sync only; nothing in the UI should ever see them.
  const habits = useMemo(() => state.habits.filter(isLive), [state.habits]);

  const suggestAccent = useCallback(
    () => nextAccent(habits.length),
    [habits.length],
  );

  return useMemo(
    () => ({
      state,
      hydrated,
      habits,
      addHabit,
      updateHabit,
      deleteHabit,
      setArchived,
      bumpCheckIn,
      setCheckIn,
      setName,
      setPrefs,
      resetAll,
      suggestAccent,
    }),
    [state, hydrated, habits, suggestAccent],
  );
}
