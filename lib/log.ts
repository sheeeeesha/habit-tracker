/**
 * The check-in log.
 *
 * Every cell carries the moment it was written, because sync resolves
 * conflicts last-write-wins per (habit, day) rather than per whole document.
 * Two phones editing different days of the same habit therefore both keep
 * their edit, which is the common case and the one a whole-document merge
 * would get wrong.
 *
 * Keys are short (`n`, `t`) because this whole structure is serialised into
 * localStorage on every check-in.
 */

export interface Cell {
  /** Check-ins recorded that day. Always >= 1; zero is stored as absence. */
  n: number;
  /** Epoch ms of the write that produced this value. */
  t: number;
}

/** habitId -> local date key -> cell */
export type CompletionLog = Record<string, Record<string, Cell>>;

export function cell(n: number, t: number = Date.now()): Cell {
  return { n, t };
}

export function countOn(log: CompletionLog, habitId: string, day: string): number {
  return log[habitId]?.[day]?.n ?? 0;
}

export function cellOn(
  log: CompletionLog,
  habitId: string,
  day: string,
): Cell | undefined {
  return log[habitId]?.[day];
}

export function entriesFor(
  log: CompletionLog,
  habitId: string,
): Array<[string, Cell]> {
  return Object.entries(log[habitId] ?? {});
}

/** Every check-in ever recorded for one habit. */
export function totalFor(log: CompletionLog, habitId: string): number {
  let total = 0;
  for (const c of Object.values(log[habitId] ?? {})) total += c.n;
  return total;
}

/**
 * Migrates the v1 shape, where a cell was a bare count. Everything gets the
 * same timestamp, so a first sync treats pre-existing history as older than
 * anything written afterwards.
 */
export function migrateLegacyLog(
  raw: unknown,
  stamp: number,
): CompletionLog {
  const out: CompletionLog = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [habitId, days] of Object.entries(raw as Record<string, unknown>)) {
    if (!days || typeof days !== "object") continue;
    const forHabit: Record<string, Cell> = {};
    for (const [day, value] of Object.entries(days as Record<string, unknown>)) {
      if (typeof value === "number") {
        if (value > 0) forHabit[day] = { n: value, t: stamp };
      } else if (
        value &&
        typeof value === "object" &&
        typeof (value as Cell).n === "number"
      ) {
        const c = value as Cell;
        if (c.n > 0) forHabit[day] = { n: c.n, t: typeof c.t === "number" ? c.t : stamp };
      }
    }
    out[habitId] = forHabit;
  }
  return out;
}
