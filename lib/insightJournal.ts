import type { InsightPayload } from "./insightPayload";

/**
 * What the last few readings were written about, so the next one can say what
 * has changed since.
 *
 * The deltas are computed here rather than by the model, and that is the whole
 * point of the file. Handing a model two snapshots and asking it to compare
 * them invites exactly the failure this app avoids everywhere else: a
 * confident, wrong, unverifiable number in the middle of an otherwise accurate
 * page. It is given the subtraction already done and asked to narrate it.
 *
 * Kept in its own localStorage key and never synced. It is derived and
 * disposable — and it is model output, which has no business in the habit
 * store or in anybody's database. A new device starts with no memory, which is
 * the right trade for not storing this anywhere but here.
 */

const JOURNAL_KEY = "streakwrapped.insights.journal.v1";

/** How many past readings to keep per habit. */
const MAX_ENTRIES = 6;

/** The figures a reading is compared against next time. */
export interface JournalSnapshot {
  trackedPeriods: number;
  repetitions: number;
  /**
   * Both are whole percentages, not fractions — `buildInsightPayload` has
   * already rounded them through `pct`. Scaling them again here would report a
   * five-point move to the model as five hundred.
   */
  recentRate: number | null;
  recoveryRate: number | null;
  bestRun: number;
  typicalRun: number;
}

export interface JournalEntry {
  at: number;
  snapshot: JournalSnapshot;
  /** Observation titles, so the next reading can avoid repeating them. */
  titles: string[];
}

export interface SinceLast {
  daysAgo: number;
  then: JournalSnapshot;
  /** Already subtracted. Positive means it went up. */
  change: {
    trackedPeriods: number;
    repetitions: number;
    /** Percentage points, or null when either side had no rate. */
    recentRatePoints: number | null;
    recoveryRatePoints: number | null;
    bestRun: number;
    typicalRun: number;
  };
  /** Titles from the last few readings — things not to say again. */
  alreadySaid: string[];
}

export function snapshotOf(payload: InsightPayload): JournalSnapshot {
  return {
    trackedPeriods: payload.trackedPeriods,
    repetitions: payload.automaticity.repetitions,
    recentRate: payload.momentum.recentRate,
    recoveryRate: payload.recovery.recoveryRate,
    bestRun: payload.runs.best,
    typicalRun: payload.runs.typical,
  };
}

type JournalShape = Record<string, JournalEntry[]>;

function readAll(): JournalShape {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(JOURNAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as JournalShape) : {};
  } catch {
    return {};
  }
}

export function readJournal(habitId: string): JournalEntry[] {
  const all = readAll();
  return Array.isArray(all[habitId]) ? all[habitId] : [];
}

export function appendToJournal(habitId: string, entry: JournalEntry) {
  try {
    const all = readAll();
    const next = [...readJournal(habitId), entry].slice(-MAX_ENTRIES);
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify({ ...all, [habitId]: next }));
  } catch {
    // Full or unavailable. Readings still work, they just have no memory.
  }
}

/** Forgets one habit's readings — for when the habit itself is deleted. */
export function forgetJournal(habitId: string) {
  try {
    const all = readAll();
    if (!(habitId in all)) return;
    delete all[habitId];
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(all));
  } catch {
    // Nothing to do; this is a cache.
  }
}

const points = (now: number | null, then: number | null): number | null =>
  now === null || then === null ? null : Math.round((now - then) * 10) / 10;

/**
 * What changed since the last reading, or null if there wasn't one.
 *
 * Null is a real answer and the caller has to handle it: told nothing, a model
 * asked to compare will invent a previous state to compare against.
 */
export function sinceLast(
  habitId: string,
  now: JournalSnapshot,
  at: number = Date.now(),
): SinceLast | null {
  const entries = readJournal(habitId);
  const last = entries[entries.length - 1];
  if (!last) return null;

  return {
    daysAgo: Math.max(0, Math.round((at - last.at) / 86_400_000)),
    then: last.snapshot,
    change: {
      trackedPeriods: now.trackedPeriods - last.snapshot.trackedPeriods,
      repetitions: now.repetitions - last.snapshot.repetitions,
      recentRatePoints: points(now.recentRate, last.snapshot.recentRate),
      recoveryRatePoints: points(now.recoveryRate, last.snapshot.recoveryRate),
      bestRun: now.bestRun - last.snapshot.bestRun,
      typicalRun: now.typicalRun - last.snapshot.typicalRun,
    },
    // Only the recent ones: a title from five readings ago is fair to revisit
    // if the figure behind it has moved.
    alreadySaid: entries.slice(-3).flatMap((e) => e.titles),
  };
}
