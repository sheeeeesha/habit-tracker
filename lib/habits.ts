import { WEEKDAY_NAMES, todayKey } from "./date";
import type { Habit, HabitDraft, TimeOfDay } from "./types";

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  anytime: "Anytime",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Human sentence for the tracking rule, shown under every habit name. */
export function describeCadence(habit: Habit): string {
  const { cadence, target, weekdays } = habit;

  if (cadence === "weekly") return `${target}× a week`;
  if (cadence === "monthly") return `${target}× a month`;

  const everyDay = !weekdays.length || weekdays.length === 7;
  const per = target > 1 ? `${target}× ` : "";

  if (everyDay) return target > 1 ? `${target}× every day` : "Every day";

  const weekdaysOnly = [1, 2, 3, 4, 5];
  const weekendOnly = [0, 6];
  const sorted = [...weekdays].sort((a, b) => a - b);
  const same = (other: number[]) =>
    sorted.length === other.length && sorted.every((d, i) => d === other[i]);

  if (same(weekdaysOnly)) return `${per}on weekdays`;
  if (same(weekendOnly)) return `${per}on weekends`;
  return `${per}on ${sorted.map((d) => DAY_ABBR[d]).join(", ")}`;
}

/** Short label for filter chips and the Wrapped slides. */
export function cadenceNoun(habit: Habit): string {
  return habit.cadence === "daily"
    ? "Daily"
    : habit.cadence === "weekly"
      ? "Weekly"
      : "Monthly";
}

export function periodNoun(habit: Habit): string {
  return habit.cadence === "daily"
    ? "today"
    : habit.cadence === "weekly"
      ? "this week"
      : "this month";
}

export function streakNoun(habit: Habit, n: number): string {
  const unit =
    habit.cadence === "daily" ? "day" : habit.cadence === "weekly" ? "week" : "month";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export function fullWeekdayList(weekdays: number[]): string {
  if (!weekdays.length || weekdays.length === 7) return "every day";
  return weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_NAMES[d])
    .join(", ");
}

export function emptyDraft(accent: Habit["accent"]): HabitDraft {
  return {
    name: "",
    emoji: "🔥",
    accent,
    cadence: "daily",
    target: 1,
    weekdays: [...ALL_WEEKDAYS],
    timeOfDay: "anytime",
    startDate: todayKey(),
  };
}

/** Ideas offered on the empty state so a first habit is one tap away. */
export const STARTER_HABITS: Array<
  Pick<HabitDraft, "name" | "emoji" | "cadence" | "target" | "weekdays">
> = [
  { name: "Drink water", emoji: "💧", cadence: "daily", target: 8, weekdays: ALL_WEEKDAYS },
  { name: "Read", emoji: "📚", cadence: "daily", target: 1, weekdays: ALL_WEEKDAYS },
  { name: "Move your body", emoji: "🏃", cadence: "weekly", target: 3, weekdays: ALL_WEEKDAYS },
  { name: "Deep clean", emoji: "🧹", cadence: "monthly", target: 2, weekdays: ALL_WEEKDAYS },
  { name: "Sleep by 11", emoji: "😴", cadence: "daily", target: 1, weekdays: [0, 1, 2, 3, 4] },
  { name: "Call family", emoji: "☎️", cadence: "weekly", target: 1, weekdays: ALL_WEEKDAYS },
];
