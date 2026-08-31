import {
  addDays,
  dateKey,
  MONTH_SHORT,
  parseKey,
  periodStart,
  shiftPeriod,
  startOfMonth,
  today,
  WEEKDAY_NAMES,
} from "./date";
import type { AccentKey } from "./palette";
import {
  bestStreak,
  completionRate,
  currentStreak,
  isScheduledOn,
  periodProgress,
} from "./streak";
import type { CompletionLog, Habit } from "./types";

export interface HabitTotal {
  habit: Habit;
  /** Raw check-ins — an 8×-a-day habit racks these up fast. */
  count: number;
  /** Periods where the target was actually met: the honest "you did it" number. */
  completedPeriods: number;
  rate: number;
  best: number;
  current: number;
}

export interface Archetype {
  title: string;
  blurb: string;
  accent: AccentKey;
}

export interface WrappedStats {
  /** False until there is enough history for the slides to say anything. */
  ready: boolean;
  checkInsNeeded: number;
  rangeLabel: string;
  daysTracked: number;
  totalCheckIns: number;
  activeDays: number;
  perfectDays: number;
  longestStreak: { habit: Habit; length: number } | null;
  topHabits: HabitTotal[];
  weekdayCounts: number[];
  bestWeekday: number;
  months: Array<{ label: string; count: number }>;
  bestMonth: { label: string; count: number } | null;
  busiestDay: { key: string; count: number } | null;
  consistency: number;
  archetype: Archetype;
  habitCount: number;
}

/** Minimum check-ins before Wrapped has a story worth telling. */
const MIN_CHECK_INS = 10;

function pickArchetype(input: {
  consistency: number;
  longest: number;
  habitCount: number;
  weekdayCounts: number[];
  activeRatio: number;
}): Archetype {
  const { consistency, longest, habitCount, weekdayCounts, activeRatio } = input;

  const weekend = weekdayCounts[0] + weekdayCounts[6];
  const weekdays = weekdayCounts.slice(1, 6).reduce((a, b) => a + b, 0);
  const total = weekend + weekdays || 1;

  if (consistency >= 0.85 && longest >= 21) {
    return {
      title: "The Metronome",
      blurb:
        "You barely miss. Same energy, every single period — the kind of consistency most people only plan for.",
      accent: "acid",
    };
  }
  if (longest >= 30) {
    return {
      title: "The Streak Architect",
      blurb:
        "You build runs that last. Once you get going, stopping simply isn't on the table.",
      accent: "hyperpink",
    };
  }
  if (weekend / total > 0.38) {
    return {
      title: "The Weekend Warrior",
      blurb:
        "Saturdays and Sundays carry your whole operation. Rest days are for other people.",
      accent: "sunburn",
    };
  }
  if (weekdays / total > 0.85) {
    return {
      title: "The Nine-to-Fiver",
      blurb:
        "Monday to Friday you are unstoppable. The weekend is officially off the clock.",
      accent: "electric",
    };
  }
  if (habitCount >= 5) {
    return {
      title: "The Juggler",
      blurb:
        "You keep more plates spinning than anyone should, and most of them are still in the air.",
      accent: "ultra",
    };
  }
  if (activeRatio < 0.5 && consistency > 0.5) {
    return {
      title: "The Comeback Kid",
      blurb:
        "You have missed days. You came back anyway — which is the entire trick.",
      accent: "bubblegum",
    };
  }
  return {
    title: "The Steady Builder",
    blurb:
      "No drama, no burnout. Just quiet progress stacking up week after week.",
    accent: "fresh",
  };
}

/** How many periods this habit actually hit its target, start date to now. */
function countCompletedPeriods(
  habit: Habit,
  log: CompletionLog,
  now: Date,
): number {
  let cursor = periodStart(parseKey(habit.startDate), habit.cadence);
  const last = periodStart(now, habit.cadence);
  let done = 0;
  for (let i = 0; i < 4000 && cursor <= last; i++) {
    if (isScheduledOn(habit, cursor) && periodProgress(habit, log, cursor).complete) {
      done++;
    }
    cursor = shiftPeriod(cursor, habit.cadence, 1);
  }
  return done;
}

export function buildWrapped(habits: Habit[], log: CompletionLog): WrappedStats {
  const live = habits.filter((h) => !h.archivedAt);
  const now = today();

  // ---- Totals ------------------------------------------------------------
  const dayTotals = new Map<string, number>();
  let totalCheckIns = 0;
  for (const h of habits) {
    for (const [key, count] of Object.entries(log[h.id] ?? {})) {
      if (!count) continue;
      totalCheckIns += count;
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + count);
    }
  }

  const earliestStart = habits.reduce<string | null>(
    (min, h) => (min === null || h.startDate < min ? h.startDate : min),
    null,
  );
  const start = earliestStart ? parseKey(earliestStart) : now;
  const daysTracked =
    Math.max(0, Math.round((now.getTime() - start.getTime()) / 86_400_000)) + 1;

  const rangeLabel = earliestStart
    ? start.getFullYear() === now.getFullYear()
      ? `${MONTH_SHORT[start.getMonth()]} – ${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`
      : `${MONTH_SHORT[start.getMonth()]} ${start.getFullYear()} – ${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`
    : "";

  // ---- Per-habit ---------------------------------------------------------
  const topHabits: HabitTotal[] = live
    .map((habit) => ({
      habit,
      count: Object.values(log[habit.id] ?? {}).reduce((a, b) => a + b, 0),
      completedPeriods: countCompletedPeriods(habit, log, now),
      rate: completionRate(habit, log),
      best: bestStreak(habit, log),
      current: currentStreak(habit, log),
    }))
    .sort((a, b) => b.count - a.count);

  const longestStreak = topHabits.reduce<{ habit: Habit; length: number } | null>(
    (top, t) =>
      !top || t.best > top.length ? { habit: t.habit, length: t.best } : top,
    null,
  );

  // ---- Day-of-week and month shape --------------------------------------
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const [key, count] of dayTotals) {
    weekdayCounts[parseKey(key).getDay()] += count;
  }
  const bestWeekday = weekdayCounts.indexOf(Math.max(...weekdayCounts));

  const monthBuckets = new Map<string, number>();
  const firstMonth = startOfMonth(start);
  for (
    let m = new Date(firstMonth);
    m <= now;
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1)
  ) {
    monthBuckets.set(`${m.getFullYear()}-${m.getMonth()}`, 0);
  }
  for (const [key, count] of dayTotals) {
    const d = parseKey(key);
    const bucket = `${d.getFullYear()}-${d.getMonth()}`;
    if (monthBuckets.has(bucket)) {
      monthBuckets.set(bucket, (monthBuckets.get(bucket) ?? 0) + count);
    }
  }
  // Twelve months is the most that stays legible as a bar row on a phone.
  const months = Array.from(monthBuckets.entries())
    .slice(-12)
    .map(([bucket, count]) => ({
      label: MONTH_SHORT[Number(bucket.split("-")[1])],
      count,
    }));
  const bestMonth =
    months.length > 0
      ? months.reduce((top, m) => (m.count > top.count ? m : top), months[0])
      : null;

  let busiestDay: { key: string; count: number } | null = null;
  for (const [key, count] of dayTotals) {
    if (!busiestDay || count > busiestDay.count) busiestDay = { key, count };
  }

  // ---- Perfect days ------------------------------------------------------
  // Only daily habits have a per-day notion of "done", so weekly and monthly
  // ones sit this stat out rather than distorting it.
  const dailyHabits = live.filter((h) => h.cadence === "daily");
  let perfectDays = 0;
  if (dailyHabits.length) {
    for (let d = new Date(start); d <= now; d = addDays(d, 1)) {
      const due = dailyHabits.filter(
        (h) => dateKey(d) >= h.startDate && isScheduledOn(h, d),
      );
      if (!due.length) continue;
      if (due.every((h) => periodProgress(h, log, d).complete)) perfectDays++;
    }
  }

  const activeDays = dayTotals.size;
  const consistency = topHabits.length
    ? topHabits.reduce((sum, t) => sum + t.rate, 0) / topHabits.length
    : 0;

  const archetype = pickArchetype({
    consistency,
    longest: longestStreak?.length ?? 0,
    habitCount: live.length,
    weekdayCounts,
    activeRatio: daysTracked ? activeDays / daysTracked : 0,
  });

  return {
    ready: live.length > 0 && totalCheckIns >= MIN_CHECK_INS,
    checkInsNeeded: Math.max(0, MIN_CHECK_INS - totalCheckIns),
    rangeLabel,
    daysTracked,
    totalCheckIns,
    activeDays,
    perfectDays,
    longestStreak,
    topHabits,
    weekdayCounts,
    bestWeekday,
    months,
    bestMonth,
    busiestDay,
    consistency,
    archetype,
    habitCount: live.length,
  };
}

export function weekdayName(index: number): string {
  return WEEKDAY_NAMES[index] ?? "";
}

/** "1 in every 3 days" style phrasing for the active-days slide. */
export function frequencyPhrase(active: number, total: number): string {
  if (!total || !active) return "";
  const ratio = total / active;
  if (ratio <= 1.15) return "Basically every single day.";
  return `You showed up on 1 in every ${ratio.toFixed(1)} days.`;
}
