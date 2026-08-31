import {
  addDays,
  dateKey,
  daysInPeriod,
  parseKey,
  periodStart,
  shiftPeriod,
  today,
} from "./date";
import type { CompletionLog, Habit } from "./types";

/** Hard stop so a corrupt startDate can never spin the loops forever. */
const MAX_PERIODS = 4000;

/** Daily habits can be limited to certain weekdays; other cadences run every period. */
export function isScheduledOn(habit: Habit, d: Date): boolean {
  if (habit.cadence !== "daily") return true;
  if (!habit.weekdays.length || habit.weekdays.length === 7) return true;
  return habit.weekdays.includes(d.getDay());
}

/** First period that counts toward this habit's history. */
export function firstPeriod(habit: Habit): Date {
  return periodStart(parseKey(habit.startDate), habit.cadence);
}

export function countOn(log: CompletionLog, habitId: string, key: string): number {
  return log[habitId]?.[key] ?? 0;
}

/** Check-ins recorded inside one period, ignoring anything before the start date. */
export function countInPeriod(
  habit: Habit,
  log: CompletionLog,
  start: Date,
): number {
  const from = habit.startDate;
  return daysInPeriod(start, habit.cadence)
    .filter((k) => k >= from)
    .reduce((sum, k) => sum + countOn(log, habit.id, k), 0);
}

export function isPeriodComplete(
  habit: Habit,
  log: CompletionLog,
  start: Date,
): boolean {
  return countInPeriod(habit, log, start) >= habit.target;
}

/** Progress through the period that contains `when` (defaults to now). */
export function periodProgress(
  habit: Habit,
  log: CompletionLog,
  when: Date = today(),
): { done: number; target: number; complete: boolean; ratio: number } {
  const start = periodStart(when, habit.cadence);
  const done = countInPeriod(habit, log, start);
  return {
    done,
    target: habit.target,
    complete: done >= habit.target,
    ratio: Math.min(1, done / Math.max(1, habit.target)),
  };
}

/**
 * Consecutive completed periods ending now.
 *
 * The period in progress is graceful: not having finished *today* yet does not
 * wipe the streak, it just isn't counted until you check in. Rest days of a
 * weekday-limited habit are skipped rather than treated as misses.
 */
export function currentStreak(habit: Habit, log: CompletionLog): number {
  const first = firstPeriod(habit);
  let cursor = periodStart(today(), habit.cadence);
  let streak = 0;
  let isCurrentPeriod = true;

  for (let i = 0; i < MAX_PERIODS && cursor >= first; i++) {
    if (!isScheduledOn(habit, cursor)) {
      cursor = shiftPeriod(cursor, habit.cadence, -1);
      isCurrentPeriod = false;
      continue;
    }
    if (isPeriodComplete(habit, log, cursor)) {
      streak++;
    } else if (!isCurrentPeriod) {
      break;
    }
    cursor = shiftPeriod(cursor, habit.cadence, -1);
    isCurrentPeriod = false;
  }
  return streak;
}

export function bestStreak(habit: Habit, log: CompletionLog): number {
  const last = periodStart(today(), habit.cadence);
  let cursor = firstPeriod(habit);
  let best = 0;
  let run = 0;

  for (let i = 0; i < MAX_PERIODS && cursor <= last; i++) {
    if (isScheduledOn(habit, cursor)) {
      if (isPeriodComplete(habit, log, cursor)) {
        run++;
        if (run > best) best = run;
      } else if (cursor.getTime() !== last.getTime()) {
        // The period still in progress is never counted as a miss.
        run = 0;
      }
    }
    cursor = shiftPeriod(cursor, habit.cadence, 1);
  }
  return best;
}

/** Completed periods ÷ elapsed periods, excluding the one still in progress. */
export function completionRate(habit: Habit, log: CompletionLog): number {
  const last = periodStart(today(), habit.cadence);
  let cursor = firstPeriod(habit);
  let done = 0;
  let total = 0;

  for (let i = 0; i < MAX_PERIODS && cursor < last; i++) {
    if (isScheduledOn(habit, cursor)) {
      total++;
      if (isPeriodComplete(habit, log, cursor)) done++;
    }
    cursor = shiftPeriod(cursor, habit.cadence, 1);
  }
  if (!total) {
    // Brand new habit: judge it on the period in progress instead of showing 0%.
    return isPeriodComplete(habit, log, last) ? 1 : 0;
  }
  return done / total;
}

/** A habit is "due" when its current period is scheduled and not yet finished. */
export function isDueNow(habit: Habit, log: CompletionLog): boolean {
  if (habit.archivedAt) return false;
  const now = today();
  if (habit.startDate > dateKey(now)) return false;
  if (!isScheduledOn(habit, now)) return false;
  return !periodProgress(habit, log, now).complete;
}

/** Scheduled today at all — false on a weekday-limited habit's rest day. */
export function isOnDutyToday(habit: Habit): boolean {
  if (habit.archivedAt) return false;
  const now = today();
  if (habit.startDate > dateKey(now)) return false;
  return isScheduledOn(habit, now);
}

/** Last N day keys ending today, oldest first — powers the dot strip on cards. */
export function recentDays(n: number): string[] {
  const now = today();
  return Array.from({ length: n }, (_, i) => dateKey(addDays(now, i - (n - 1))));
}

export interface DayStatus {
  key: string;
  scheduled: boolean;
  count: number;
  complete: boolean;
  future: boolean;
}

/** Per-day state for the mini history strip and the calendar heatmap. */
export function dayStatuses(
  habit: Habit,
  log: CompletionLog,
  keys: string[],
): DayStatus[] {
  const todayK = dateKey(today());
  return keys.map((key) => {
    const d = parseKey(key);
    const count = countOn(log, habit.id, key);
    const scheduled = key >= habit.startDate && isScheduledOn(habit, d);
    // For weekly/monthly habits a single day is "complete" once it has any
    // check-in; the period bar above it carries the real target.
    const complete =
      habit.cadence === "daily" ? count >= habit.target : count > 0;
    return { key, scheduled, count, complete, future: key > todayK };
  });
}

/** Roll-up used by the home hero. */
export function todaySummary(habits: Habit[], log: CompletionLog) {
  const active = habits.filter((h) => !h.archivedAt && isOnDutyToday(h));
  const done = active.filter((h) => periodProgress(h, log).complete).length;

  // The longest run currently alive, plus which habit owns it — the unit is
  // days/weeks/months depending on that habit's cadence, so we need both.
  let topStreak = 0;
  let topHabit: Habit | null = null;
  for (const h of habits) {
    if (h.archivedAt) continue;
    const s = currentStreak(h, log);
    if (s > topStreak) {
      topStreak = s;
      topHabit = h;
    }
  }

  return {
    total: active.length,
    done,
    ratio: active.length ? done / active.length : 0,
    topStreak,
    topHabit,
  };
}
