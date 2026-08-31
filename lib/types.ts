import type { Cadence } from "./date";
import type { AccentKey } from "./palette";

export type { Cadence };

export type TimeOfDay = "anytime" | "morning" | "afternoon" | "evening";

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  accent: AccentKey;
  /** Which calendar bucket the target applies to. */
  cadence: Cadence;
  /** How many check-ins complete one period (e.g. 3 for "3x a week"). */
  target: number;
  /**
   * Only meaningful for `daily` habits: the weekdays it is scheduled on
   * (0 = Sunday … 6 = Saturday). All seven means "every day".
   */
  weekdays: number[];
  timeOfDay: TimeOfDay;
  /** Local date key; periods before this never count toward streaks. */
  startDate: string;
  createdAt: number;
  archivedAt?: number;
}

/** habitId -> local date key -> number of check-ins that day. */
export type CompletionLog = Record<string, Record<string, number>>;

export interface Prefs {
  /** Epoch ms; the install CTA stays hidden until this moment. */
  installDismissedUntil: number;
  /** Set once the app has actually been installed to the home screen. */
  installed: boolean;
  /** Lets the user re-summon the CTA from the menu after dismissing it. */
  installRequested: boolean;
  reduceMotion: boolean;
}

export interface AppState {
  version: number;
  name: string;
  habits: Habit[];
  log: CompletionLog;
  prefs: Prefs;
}

export type HabitDraft = Omit<Habit, "id" | "createdAt">;
