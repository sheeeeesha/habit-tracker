"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { todayKey } from "./date";
import { nextAccent } from "./palette";
import type { AppState, Habit, HabitDraft, Prefs } from "./types";

const STORAGE_KEY = "streakwrapped.v1";
const SCHEMA_VERSION = 1;

const DEFAULT_PREFS: Prefs = {
  installDismissedUntil: 0,
  installed: false,
  installRequested: false,
  reduceMotion: false,
};

function emptyState(): AppState {
  return {
    version: SCHEMA_VERSION,
    name: "",
    habits: [],
    log: {},
    prefs: { ...DEFAULT_PREFS },
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Tolerant parse — a half-written or older payload degrades to defaults. */
function reviveState(raw: string | null): AppState {
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const base = emptyState();
    return {
      version: SCHEMA_VERSION,
      name: typeof parsed.name === "string" ? parsed.name : base.name,
      habits: Array.isArray(parsed.habits)
        ? parsed.habits.filter((h): h is Habit => !!h && typeof h.id === "string")
        : [],
      log: parsed.log && typeof parsed.log === "object" ? parsed.log : {},
      prefs: { ...DEFAULT_PREFS, ...(parsed.prefs ?? {}) },
    };
  } catch {
    return emptyState();
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

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  adopt(reviveState(window.localStorage.getItem(STORAGE_KEY)), { persist: false });
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
      adopt(reviveState(e.newValue), { persist: false });
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

export interface StoreValue {
  state: AppState;
  /** False during the first paint, before localStorage has been read. */
  hydrated: boolean;
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
  const habit: Habit = { ...draft, id: newId(), createdAt: Date.now() };
  update((s) => ({ ...s, habits: [...s.habits, habit] }));
  return habit;
}

export function updateHabit(id: string, patch: Partial<Habit>) {
  update((s) => ({
    ...s,
    habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)),
  }));
}

export function deleteHabit(id: string) {
  update((s) => {
    const log = { ...s.log };
    delete log[id];
    return { ...s, habits: s.habits.filter((h) => h.id !== id), log };
  });
}

export function setArchived(id: string, archived: boolean) {
  update((s) => ({
    ...s,
    habits: s.habits.map((h) =>
      h.id === id ? { ...h, archivedAt: archived ? Date.now() : undefined } : h,
    ),
  }));
}

function writeCount(habitId: string, key: string, next: number) {
  update((s) => {
    const forHabit = { ...(s.log[habitId] ?? {}) };
    if (next <= 0) delete forHabit[key];
    else forHabit[key] = next;
    return { ...s, log: { ...s.log, [habitId]: forHabit } };
  });
}

export function bumpCheckIn(habitId: string, delta: number, key?: string) {
  const k = key ?? todayKey();
  const current = snapshot.state.log[habitId]?.[k] ?? 0;
  writeCount(habitId, k, Math.max(0, current + delta));
}

export function setCheckIn(habitId: string, count: number, key?: string) {
  writeCount(habitId, key ?? todayKey(), Math.max(0, count));
}

export function setName(name: string) {
  update((s) => ({ ...s, name }));
}

export function setPrefs(patch: Partial<Prefs>) {
  update((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }));
}

export function resetAll() {
  update(() => emptyState());
}

/** Replaces everything — used by the backup importer. */
export function replaceAll(next: AppState) {
  loaded = true;
  adopt(reviveState(JSON.stringify(next)), { persist: true });
}

export function useStore(): StoreValue {
  const { state, hydrated } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const suggestAccent = useCallback(
    () => nextAccent(state.habits.length),
    [state.habits.length],
  );

  return useMemo(
    () => ({
      state,
      hydrated,
      habits: state.habits,
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
    [state, hydrated, suggestAccent],
  );
}
