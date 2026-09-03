import { WEEKDAY_NAMES } from "./date";
import { describeCadence } from "./habits";
import type { HabitAnalytics } from "./analytics";
import type { Habit } from "./types";

/**
 * What gets sent when someone asks for a written reading of their numbers.
 *
 * Two rules shape this file.
 *
 * The model receives **only figures this app has already computed** — never
 * the check-in log, never a date, never a raw count it could total up itself.
 * Everything it can say a number about is a number that came out of
 * `lib/analytics.ts` and is already on screen beside it. It is interpreting
 * arithmetic, not doing any, which is the only way a written insight can be
 * trusted not to invent a statistic.
 *
 * And it is the smallest payload that supports a useful reading. The habit's
 * name is the one genuinely personal field in here, and it is included because
 * without it the advice degrades to "your daily habit"; that is exactly why
 * the whole feature is off until someone turns it on.
 */

export interface InsightPayload {
  habit: {
    name: string;
    rhythm: string;
    cadence: string;
  };
  trackedPeriods: number;
  automaticity: {
    applicable: boolean;
    repetitions: number;
    toMedian: number;
  };
  recovery: {
    misses: number;
    cameBack: number;
    slidIntoTwo: number;
    /** Percentage, or null when nothing has been missed yet. */
    recoveryRate: number | null;
    longestSlide: number;
  };
  momentum: {
    recentRate: number | null;
    priorRate: number | null;
    changeInPoints: number | null;
    sample: number;
  };
  /** Daily habits only; percentages, omitting days it is not scheduled on. */
  weekdays: Array<{ day: string; rate: number }> | null;
  runs: {
    typical: number;
    best: number;
    started: number;
  };
}

const pct = (v: number | null) => (v === null ? null : Math.round(v * 100));

export function buildInsightPayload(
  habit: Habit,
  stats: HabitAnalytics,
): InsightPayload {
  const { automaticity, recovery, momentum, weekdays, runs } = stats;

  return {
    habit: {
      name: habit.name,
      rhythm: describeCadence(habit),
      cadence: habit.cadence,
    },
    trackedPeriods: stats.judgedPeriods,
    automaticity: {
      applicable: automaticity.applicable,
      repetitions: automaticity.repetitions,
      toMedian: automaticity.remaining,
    },
    recovery: {
      misses: recovery.misses,
      cameBack: recovery.recovered,
      slidIntoTwo: recovery.slipped,
      recoveryRate: pct(recovery.rate),
      longestSlide: recovery.worstSlide,
    },
    momentum: {
      recentRate: pct(momentum.recent),
      priorRate: pct(momentum.prior),
      changeInPoints: momentum.delta === null ? null : Math.round(momentum.delta * 100),
      sample: momentum.sample,
    },
    weekdays:
      habit.cadence === "daily"
        ? weekdays
            .filter((w) => w.rate !== null)
            .map((w) => ({ day: WEEKDAY_NAMES[w.day], rate: pct(w.rate) as number }))
        : null,
    runs: {
      typical: runs.median,
      best: runs.best,
      started: runs.lengths.length,
    },
  };
}

/**
 * A stable key for one payload.
 *
 * Readings are cached against this so opening the page twice costs one
 * request rather than two. The numbers only move when a check-in does, so a
 * content hash is exactly the right cache key — and it means a reading can
 * never be shown next to figures it was not written about.
 */
export function payloadKey(payload: InsightPayload): string {
  const json = JSON.stringify(payload);
  // FNV-1a. Not a security hash — it only needs to change when the input does.
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Whether there is enough history for a reading to be worth asking for.
 *
 * Same floor the charts use. Below it the rates swing on a single day, and a
 * confident paragraph about noise is worse than a confident chart about noise.
 */
export function worthAsking(stats: HabitAnalytics): boolean {
  return stats.judgedPeriods >= 10;
}
