/**
 * Date helpers. Everything is computed in the user's LOCAL timezone and keyed by
 * a "YYYY-MM-DD" string so a check-in never drifts across a UTC boundary.
 */

export type Cadence = "daily" | "weekly" | "monthly";

/** Local calendar key, e.g. "2026-08-31". */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a "YYYY-MM-DD" key back into a local-midnight Date. */
export function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function todayKey(): string {
  return dateKey(today());
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addMonths(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Monday-based start of week. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay(); // 0=Sun … 6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + delta);
  return out;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * The first day of the tracking period `d` falls into. Periods are identified by
 * their start date everywhere else in the app, which sidesteps ISO-week/year
 * boundary bugs entirely.
 */
export function periodStart(d: Date, cadence: Cadence): Date {
  if (cadence === "weekly") return startOfWeek(d);
  if (cadence === "monthly") return startOfMonth(d);
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Move `n` whole periods from a period start (negative = backwards). */
export function shiftPeriod(start: Date, cadence: Cadence, n: number): Date {
  if (cadence === "weekly") return addDays(start, 7 * n);
  if (cadence === "monthly") return addMonths(start, n);
  return addDays(start, n);
}

/** Every local date key inside a period, clamped so we never walk into the future. */
export function daysInPeriod(start: Date, cadence: Cadence): string[] {
  const keys: string[] = [];
  const end =
    cadence === "weekly"
      ? addDays(start, 6)
      : cadence === "monthly"
        ? new Date(start.getFullYear(), start.getMonth() + 1, 0)
        : start;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) keys.push(dateKey(d));
  return keys;
}

export const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function prettyDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** "3 days ago", "today", "in 2 days" — used on habit cards. */
export function relativeDays(fromKey: string): string {
  const diff = Math.round(
    (parseKey(fromKey).getTime() - today().getTime()) / 86_400_000,
  );
  if (diff === 0) return "today";
  if (diff === -1) return "yesterday";
  if (diff < 0) return `${Math.abs(diff)} days ago`;
  if (diff === 1) return "tomorrow";
  return `in ${diff} days`;
}
