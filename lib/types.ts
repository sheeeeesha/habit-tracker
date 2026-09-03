import type { Cadence } from "./date";
import type { HabitIconKey } from "./habitIcons";
import type { CompletionLog } from "./log";
import type { AccentKey } from "./palette";

export type { Cadence, CompletionLog };

export type TimeOfDay = "anytime" | "morning" | "afternoon" | "evening";

export interface Habit {
  id: string;
  name: string;
  /** Key into the curated Phosphor set — never a literal emoji. */
  icon: HabitIconKey;
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
  /** Epoch ms of the last edit — the sort key for last-write-wins sync. */
  updatedAt: number;
  /** User archived it: hidden from Today, kept in Settings, still syncs. */
  archivedAt?: number;
  /**
   * Tombstone. The row is kept so the deletion can propagate to other
   * devices, and is purged locally once every device has certainly seen it.
   */
  deletedAt?: number;
}

export interface Prefs {
  /** Epoch ms; the install CTA stays hidden until this moment. */
  installDismissedUntil: number;
  /** Set once the app has actually been installed to the home screen. */
  installed: boolean;
  /** Lets the user re-summon the CTA from the menu after dismissing it. */
  installRequested: boolean;
  reduceMotion: boolean;
  /** Show the number of outstanding habits on the installed app's icon. */
  iconBadge: boolean;
  /**
   * Local date key the "you missed yesterday" prompt was last dismissed on.
   * Scoped to a day so declining it once does not hide it forever.
   */
  backfillDismissedOn: string;
  /**
   * Send this habit's computed figures to Claude for a written reading.
   * Off by default: it is the one feature that sends anything about a habit
   * off the device, so it waits to be asked for.
   */
  aiInsights: boolean;
}

export interface SyncState {
  /**
   * Which account this local database belongs to. Survives signing out, so
   * signing back in as somebody else can be detected and the previous
   * person's habits cleared instead of being merged into the new account.
   */
  ownerId: string | null;
  /** The currently signed-in user, or null when signed out. */
  userId: string | null;
  /** Epoch ms of the last successful pull+push round trip. */
  lastSyncedAt: number | null;
  /** Server-side timestamp watermark; rows newer than this need pulling. */
  cursor: string | null;
}

export interface AppState {
  version: number;
  name: string;
  /** Epoch ms of the last edit to `name`, for last-write-wins across devices. */
  nameUpdatedAt: number;
  habits: Habit[];
  log: CompletionLog;
  prefs: Prefs;
  sync: SyncState;
}

export type HabitDraft = Omit<Habit, "id" | "createdAt" | "updatedAt">;

/** Exists at all — excludes deleted tombstones. */
export function isLive(habit: Habit): boolean {
  return !habit.deletedAt;
}

/** Shown on the Today screen — excludes deleted and archived. */
export function isActive(habit: Habit): boolean {
  return !habit.deletedAt && !habit.archivedAt;
}
