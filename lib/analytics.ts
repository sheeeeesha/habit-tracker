import { addDays, dateKey, periodStart, shiftPeriod, today, type Cadence } from "./date";
import { countOn, type CompletionLog } from "./log";
import { countInPeriod, firstPeriod, isScheduledOn } from "./streak";
import type { Habit } from "./types";

/**
 * Analytics derived from the check-in log.
 *
 * Every figure here is chosen because a specific finding says it changes
 * behaviour, not because it is easy to chart. The reasoning is recorded
 * against each function so a future change can tell what is decorative and
 * what is load-bearing.
 */

/** Matches the loop guards in streak.ts — a corrupt start date cannot hang. */
const MAX_PERIODS = 4000;

export interface PeriodPoint {
  /** Local date key of the period's first day. */
  start: string;
  /** False on a weekday-limited habit's rest day. */
  scheduled: boolean;
  count: number;
  target: number;
  complete: boolean;
  /** The period still in progress — a miss here is not yet a miss. */
  current: boolean;
}

/**
 * Every period from the habit's start date to now, which everything else on
 * this page derives from. Computing it once keeps the charts consistent with
 * each other; deriving each separately is how two numbers on one screen end up
 * disagreeing.
 */
export function periodHistory(habit: Habit, log: CompletionLog): PeriodPoint[] {
  const last = periodStart(today(), habit.cadence);
  const points: PeriodPoint[] = [];
  let cursor = firstPeriod(habit);

  for (let i = 0; i < MAX_PERIODS && cursor <= last; i++) {
    const count = countInPeriod(habit, log, cursor);
    points.push({
      start: dateKey(cursor),
      scheduled: isScheduledOn(habit, cursor),
      count,
      target: habit.target,
      complete: count >= habit.target,
      current: cursor.getTime() === last.getTime(),
    });
    cursor = shiftPeriod(cursor, habit.cadence, 1);
  }
  return points;
}

/** Periods that actually counted: scheduled, and finished. */
function judged(points: PeriodPoint[]): PeriodPoint[] {
  return points.filter((p) => p.scheduled && !p.current);
}

/* ------------------------------------------------------------------ *
 * Automaticity
 *
 * Lally et al. (2010) fitted an asymptotic curve to daily automaticity
 * ratings and found a median of 66 days to reach 95% of the asymptote,
 * with an individual range of 18 to 254 days.
 *
 * Two things follow that most habit apps get wrong. Repetitions drive the
 * curve, not elapsed time, so consistency is what moves it — a habit done
 * half the days is not halfway through, it is 66 *repetitions* away. And
 * because the individual range is enormous, a single number would be false
 * precision; the band is the honest presentation.
 * ------------------------------------------------------------------ */

/** Repetitions to 95% of asymptote: median and the observed individual range. */
export const AUTOMATICITY_MEDIAN_REPS = 66;
export const AUTOMATICITY_FAST_REPS = 18;
export const AUTOMATICITY_SLOW_REPS = 254;

/** Chosen so the curve reads 95% at the median of 66 repetitions. */
const DECAY = Math.log(20) / AUTOMATICITY_MEDIAN_REPS;

export function automaticityAt(repetitions: number): number {
  return 1 - Math.exp(-DECAY * Math.max(0, repetitions));
}

export interface Automaticity {
  /** Completed periods so far — the input the curve actually responds to. */
  repetitions: number;
  /** Modelled fraction of the way to automatic, 0-1. */
  estimate: number;
  /** Repetitions still needed at the median rate. */
  remaining: number;
  /**
   * False for weekly and monthly habits: Lally studied daily behaviours, and
   * the curve has no established meaning at other cadences.
   */
  applicable: boolean;
}

export function automaticity(habit: Habit, points: PeriodPoint[]): Automaticity {
  const repetitions = points.filter((p) => p.complete).length;
  return {
    repetitions,
    estimate: automaticityAt(repetitions),
    remaining: Math.max(0, AUTOMATICITY_MEDIAN_REPS - repetitions),
    applicable: habit.cadence === "daily",
  };
}

/* ------------------------------------------------------------------ *
 * Recovery
 *
 * Lally found that missing a single opportunity did not materially affect
 * habit formation. What does the damage is the abstinence violation effect
 * (Polivy & Herman): one lapse reframes the goal as already broken, and the
 * second miss is where people stop.
 *
 * So the number that matters is not how many days were missed. It is how
 * often a miss became two — which is both the real failure mode and the one
 * thing a person can act on tomorrow.
 * ------------------------------------------------------------------ */

export interface Recovery {
  /** Scheduled, finished periods that were not completed. */
  misses: number;
  /** Misses where the next scheduled period was completed. */
  recovered: number;
  /** Misses that ran straight into another miss. */
  slipped: number;
  /** recovered / (recovered + slipped); null when nothing has been missed. */
  rate: number | null;
  /** Longest unbroken run of misses. */
  worstSlide: number;
}

export function recovery(points: PeriodPoint[]): Recovery {
  const seq = judged(points);
  let misses = 0;
  let recovered = 0;
  let slipped = 0;
  let slide = 0;
  let worstSlide = 0;

  for (let i = 0; i < seq.length; i++) {
    if (seq[i].complete) {
      slide = 0;
      continue;
    }
    misses++;
    slide++;
    if (slide > worstSlide) worstSlide = slide;

    const next = seq[i + 1];
    if (!next) continue; // The last miss has no verdict yet.
    if (next.complete) recovered++;
    else slipped++;
  }

  const decided = recovered + slipped;
  return {
    misses,
    recovered,
    slipped,
    rate: decided ? recovered / decided : null,
    worstSlide,
  };
}

/* ------------------------------------------------------------------ *
 * Consistency over time
 *
 * Harkin et al. (2016), 138 studies and ~20,000 participants: monitoring
 * progress raises attainment (d+ = 0.40), and the effect is mediated by how
 * often progress is actually monitored. A trend line is the monitoring.
 *
 * Rolling rather than per-calendar-month, because a monthly bar chart makes
 * the 1st of the month meaningful when nothing about a habit is.
 * ------------------------------------------------------------------ */

export interface TrendPoint {
  start: string;
  /** Completion rate across the trailing window, 0-1. */
  rate: number;
  /** Scheduled periods inside the window — small windows are noisy. */
  sample: number;
}

export function consistencyTrend(points: PeriodPoint[], window = 28): TrendPoint[] {
  const seq = judged(points);
  if (!seq.length) return [];

  const out: TrendPoint[] = [];
  for (let i = 0; i < seq.length; i++) {
    const from = Math.max(0, i - window + 1);
    const slice = seq.slice(from, i + 1);
    const done = slice.filter((p) => p.complete).length;
    out.push({ start: seq[i].start, rate: done / slice.length, sample: slice.length });
  }
  return out;
}

/** Completion rate over the trailing `window` periods, and the shift from the one before. */
export function momentum(points: PeriodPoint[], window = 28) {
  const seq = judged(points);
  const recent = seq.slice(-window);
  const prior = seq.slice(-window * 2, -window);
  const rateOf = (s: PeriodPoint[]) =>
    s.length ? s.filter((p) => p.complete).length / s.length : null;

  const now = rateOf(recent);
  const before = rateOf(prior);
  return {
    recent: now,
    prior: before,
    delta: now !== null && before !== null ? now - before : null,
    sample: recent.length,
  };
}

/* ------------------------------------------------------------------ *
 * Weekday pattern
 *
 * Context stability predicts both automaticity and goal attainment
 * (Wood & Neal; and a 2022 study of 218 app users across 308 habits).
 * A weekday is a coarse proxy for context, but it is the one this app can
 * measure honestly, and an uneven profile points straight at the day whose
 * routine does not hold.
 * ------------------------------------------------------------------ */

export interface WeekdayRate {
  /** 0 = Sunday. */
  day: number;
  rate: number | null;
  scheduled: number;
  completed: number;
}

export function weekdayRates(habit: Habit, log: CompletionLog): WeekdayRate[] {
  const buckets = Array.from({ length: 7 }, (_, day) => ({
    day,
    scheduled: 0,
    completed: 0,
  }));

  const todayKey = dateKey(today());
  let cursor = new Date(
    Math.max(firstPeriod(habit).getTime(), addDays(today(), -365).getTime()),
  );

  for (let i = 0; i < MAX_PERIODS; i++) {
    const key = dateKey(cursor);
    if (key > todayKey) break;
    if (key >= habit.startDate && isScheduledOn(habit, cursor)) {
      const bucket = buckets[cursor.getDay()];
      bucket.scheduled++;
      // Per-day, so a multi-target habit counts a day as done when it hit
      // its share — the period bar carries the real target.
      const need = habit.cadence === "daily" ? habit.target : 1;
      if (countOn(log, habit.id, key) >= need) bucket.completed++;
    }
    cursor = addDays(cursor, 1);
  }

  return buckets.map((b) => ({
    ...b,
    rate: b.scheduled ? b.completed / b.scheduled : null,
  }));
}

/* ------------------------------------------------------------------ *
 * Run lengths
 * ------------------------------------------------------------------ */

export interface Runs {
  lengths: number[];
  best: number;
  /** Typical run, which is a fairer read of a habit than the record. */
  median: number;
}

export function runs(points: PeriodPoint[]): Runs {
  const seq = judged(points);
  const lengths: number[] = [];
  let run = 0;

  for (const p of seq) {
    if (p.complete) run++;
    else if (run) {
      lengths.push(run);
      run = 0;
    }
  }
  if (run) lengths.push(run);

  const sorted = [...lengths].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : 0;

  return { lengths, best: sorted.length ? sorted[sorted.length - 1] : 0, median };
}

/* ------------------------------------------------------------------ *
 * Roll-up
 * ------------------------------------------------------------------ */

export interface HabitAnalytics {
  points: PeriodPoint[];
  automaticity: Automaticity;
  recovery: Recovery;
  trend: TrendPoint[];
  momentum: ReturnType<typeof momentum>;
  weekdays: WeekdayRate[];
  runs: Runs;
  /** Scheduled, finished periods — the denominator behind every rate here. */
  judgedPeriods: number;
  cadence: Cadence;
}

export function analyseHabit(habit: Habit, log: CompletionLog): HabitAnalytics {
  const points = periodHistory(habit, log);
  return {
    points,
    automaticity: automaticity(habit, points),
    recovery: recovery(points),
    trend: consistencyTrend(points),
    momentum: momentum(points),
    weekdays: weekdayRates(habit, log),
    runs: runs(points),
    judgedPeriods: judged(points).length,
    cadence: habit.cadence,
  };
}
