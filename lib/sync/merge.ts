import type { Cell, CompletionLog } from "../log";
import { habitIcon } from "../habitIcons";
import type { Habit, TimeOfDay } from "../types";
import type { AccentKey } from "../palette";
import type { Cadence } from "../date";

/* ------------------------------------------------------------------ *
 * Row shapes as they exist in Postgres.
 * ------------------------------------------------------------------ */

export interface HabitRow {
  id: string;
  name: string;
  icon: string;
  accent: string;
  cadence: string;
  target: number;
  weekdays: number[];
  time_of_day: string;
  start_date: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  synced_at?: string;
}

export interface CheckinRow {
  habit_id: string;
  day: string;
  count: number;
  updated_at: string;
  synced_at?: string;
}

/* ------------------------------------------------------------------ *
 * Conversion. Local timestamps are epoch ms; Postgres wants ISO.
 * ------------------------------------------------------------------ */

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (value: string | null) => (value ? Date.parse(value) : undefined);

const CADENCES = new Set(["daily", "weekly", "monthly"]);
const TIMES = new Set(["anytime", "morning", "afternoon", "evening"]);

/**
 * The push RPCs insert a whole batch in one statement, so one row that trips a
 * CHECK constraint aborts every row alongside it — and, since the client would
 * retry the same batch forever, would wedge sync permanently. A record that
 * cannot satisfy the schema is therefore dropped here rather than sent.
 */
export function isPushable(h: Habit): boolean {
  return (
    typeof h.id === "string" &&
    h.id.length > 0 &&
    typeof h.name === "string" &&
    CADENCES.has(h.cadence) &&
    TIMES.has(h.timeOfDay) &&
    Number.isInteger(h.target) &&
    h.target >= 1 &&
    h.target <= 99 &&
    Array.isArray(h.weekdays) &&
    h.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    /^\d{4}-\d{2}-\d{2}$/.test(h.startDate) &&
    Number.isFinite(h.createdAt) &&
    Number.isFinite(h.updatedAt)
  );
}

export function habitToRow(h: Habit): Omit<HabitRow, "synced_at"> {
  return {
    id: h.id,
    name: h.name,
    icon: h.icon,
    accent: h.accent,
    cadence: h.cadence,
    target: h.target,
    weekdays: h.weekdays,
    time_of_day: h.timeOfDay,
    start_date: h.startDate,
    created_at: iso(h.createdAt),
    updated_at: iso(h.updatedAt),
    archived_at: h.archivedAt ? iso(h.archivedAt) : null,
    deleted_at: h.deletedAt ? iso(h.deletedAt) : null,
  };
}

export function habitFromRow(r: HabitRow): Habit {
  const archivedAt = ms(r.archived_at);
  const deletedAt = ms(r.deleted_at);
  return {
    id: r.id,
    name: r.name,
    icon: habitIcon(r.icon).key,
    accent: r.accent as AccentKey,
    cadence: r.cadence as Cadence,
    target: r.target,
    // Postgres hands back smallint[]; be tolerant of a null column.
    weekdays: Array.isArray(r.weekdays) ? r.weekdays.map(Number) : [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: r.time_of_day as TimeOfDay,
    // `date` comes back as YYYY-MM-DD, which is already the local key format.
    startDate: r.start_date.slice(0, 10),
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
    // Spread rather than assign undefined: an absent key and a key holding
    // undefined are different things once this is compared or serialised.
    ...(archivedAt === undefined ? {} : { archivedAt }),
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

export function checkinToRow(
  habitId: string,
  day: string,
  cell: Cell,
): CheckinRow {
  return {
    habit_id: habitId,
    day,
    count: cell.n,
    updated_at: iso(cell.t),
  };
}

export function logFromRows(rows: CheckinRow[]): CompletionLog {
  const log: CompletionLog = {};
  for (const r of rows) {
    const day = r.day.slice(0, 10);
    (log[r.habit_id] ??= {})[day] = { n: r.count, t: Date.parse(r.updated_at) };
  }
  return log;
}

/* ------------------------------------------------------------------ *
 * The merge.
 * ------------------------------------------------------------------ */

export interface MergeInput {
  localHabits: Habit[];
  localLog: CompletionLog;
  remoteHabits: Habit[];
  remoteLog: CompletionLog;
}

export interface PendingCheckin {
  habitId: string;
  day: string;
  cell: Cell;
}

export interface MergeResult {
  habits: Habit[];
  log: CompletionLog;
  /** Rows the server does not have, or has an older copy of. */
  habitsToPush: Habit[];
  checkinsToPush: PendingCheckin[];
}

/**
 * Last-write-wins, resolved per habit row and per (habit, day) check-in cell
 * rather than over the document as a whole. Two phones that touched different
 * days of the same habit therefore both keep their edit.
 *
 * Ties go to the remote copy. That is arbitrary but it must be *consistent*:
 * if ties went to local, every sync would re-push rows the server already has
 * and the two sides would trade writes forever.
 */
export function merge({
  localHabits,
  localLog,
  remoteHabits,
  remoteLog,
}: MergeInput): MergeResult {
  const habits = new Map<string, Habit>();
  const habitsToPush: Habit[] = [];

  for (const h of remoteHabits) habits.set(h.id, h);

  for (const local of localHabits) {
    const remote = habits.get(local.id);
    if (!remote) {
      habits.set(local.id, local);
      habitsToPush.push(local);
    } else if (local.updatedAt > remote.updatedAt) {
      habits.set(local.id, local);
      habitsToPush.push(local);
    }
  }

  // A deleted habit's check-ins can never be displayed again, so they are
  // dropped from the merged log rather than carried around forever.
  const deleted = new Set(
    [...habits.values()].filter((h) => h.deletedAt).map((h) => h.id),
  );

  const log: CompletionLog = {};
  const checkinsToPush: PendingCheckin[] = [];
  const habitIds = new Set([...Object.keys(localLog), ...Object.keys(remoteLog)]);

  for (const habitId of habitIds) {
    if (deleted.has(habitId)) continue;

    const localDays = localLog[habitId] ?? {};
    const remoteDays = remoteLog[habitId] ?? {};
    const merged: Record<string, Cell> = {};

    for (const day of new Set([
      ...Object.keys(localDays),
      ...Object.keys(remoteDays),
    ])) {
      const l = localDays[day];
      const r = remoteDays[day];

      if (l && r) {
        if (l.t > r.t) {
          merged[day] = l;
          checkinsToPush.push({ habitId, day, cell: l });
        } else {
          merged[day] = r;
        }
      } else if (l) {
        merged[day] = l;
        checkinsToPush.push({ habitId, day, cell: l });
      } else if (r) {
        merged[day] = r;
      }
    }

    log[habitId] = merged;
  }

  return {
    habits: [...habits.values()],
    log,
    habitsToPush,
    checkinsToPush,
  };
}
