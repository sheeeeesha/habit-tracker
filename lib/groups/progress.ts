import { dateKey, periodStart, shiftPeriod, today, type Cadence } from "../date";
import { periodHistory } from "../analytics";
import type { CompletionLog } from "../log";
import type { Habit } from "../types";
import type { GroupMember, ProgressRow } from "./types";

/**
 * Turning a group's shared rows into something to look at.
 *
 * Everything here is pure. The rule the shapes follow is that a group reports
 * on the group: how many of us showed up, how the group is doing over time,
 * and each person's own rate. There is deliberately no ranking — see
 * `groupTimeline` for why.
 */

/**
 * Whether a member is actually tracking this group's habit right now.
 *
 * `habit_id` on the membership row is the only part of this the *other*
 * members can see, so it has to mean exactly one thing: "I am currently
 * tracking this." Everything below decides when to clear it.
 *
 * The distinction that matters is `deleted` versus `unknown`. A tombstone is
 * proof the habit was deleted — the store keeps deleted habits around so the
 * deletion can reach other devices. A habit that is simply *absent* proves
 * nothing: this may be a second device that has not pulled it yet. Acting on
 * an absence would let a phone that just signed in erase a group history it
 * has never seen.
 */
export type LinkState =
  | { kind: "tracking"; habit: Habit }
  /** Paused, and restorable — so the published history is left alone. */
  | { kind: "archived"; habit: Habit }
  /** Gone for good, along with its local history. */
  | { kind: "deleted"; habitId: string }
  /** Already detached; nothing to do. */
  | { kind: "unlinked" }
  /** Not on this device. Could be anything, so say nothing. */
  | { kind: "unknown" };

export function linkState(habitId: string | null, habits: Habit[]): LinkState {
  if (!habitId) return { kind: "unlinked" };
  const habit = habits.find((h) => h.id === habitId);
  if (!habit) return { kind: "unknown" };
  if (habit.deletedAt) return { kind: "deleted", habitId };
  if (habit.archivedAt) return { kind: "archived", habit };
  return { kind: "tracking", habit };
}

/** How many periods of history a member publishes on each refresh. */
export const PUBLISH_WINDOW = 30;

export interface PublishRow {
  period_start: string;
  completed: boolean;
}

/**
 * The caller's own completion for the recent periods, ready to publish.
 *
 * Includes the period in progress: "three of us so far today" is the single
 * most useful thing a group screen can say, and it only works if today is
 * published as it happens.
 */
export function myProgressRows(habit: Habit, log: CompletionLog): PublishRow[] {
  return periodHistory(habit, log)
    .filter((p) => p.scheduled)
    .slice(-PUBLISH_WINDOW)
    .map((p) => ({ period_start: p.start, completed: p.complete }));
}

/** The last `count` period start keys for a cadence, oldest first. */
export function recentPeriods(cadence: Cadence, count: number): string[] {
  const start = periodStart(today(), cadence);
  return Array.from({ length: count }, (_, i) =>
    dateKey(shiftPeriod(start, cadence, i - (count - 1))),
  );
}

export interface PeriodTally {
  periodStart: string;
  completed: number;
  members: number;
  /** completed / members, 0-1. */
  ratio: number;
  current: boolean;
}

/**
 * How many of the group completed each recent period.
 *
 * A collective count rather than a leaderboard, and that is a deliberate
 * choice rather than a simpler one. Social visibility sharpens the abstinence
 * violation effect: rank people by streak and whoever slips is publicly last,
 * which is the moment they quit. "Four of us showed up" gives the group
 * something to be part of and gives the person who missed nothing to flee.
 */
export function groupTimeline(
  members: GroupMember[],
  progress: ProgressRow[],
  cadence: Cadence,
  count = 14,
): PeriodTally[] {
  const periods = recentPeriods(cadence, count);
  const now = periods[periods.length - 1];
  const byPeriod = new Map<string, Set<string>>();

  for (const row of progress) {
    if (!row.completed) continue;
    const key = row.periodStart.slice(0, 10);
    let set = byPeriod.get(key);
    if (!set) byPeriod.set(key, (set = new Set()));
    set.add(row.userId);
  }

  // Counted against who is *currently tracking*, not who is on the roster.
  // Somebody who has left, or whose habit is gone, would otherwise sit in the
  // denominator forever and put "everyone showed up" permanently out of
  // reach — which is exactly the note a group most wants to earn.
  //
  // Applied to past periods too, for the same reason it always was: per-period
  // membership is not recorded, so the choice is this or letting a departed
  // member inflate a period they are no longer part of.
  const present = new Set(members.filter((m) => m.habitId).map((m) => m.userId));

  return periods.map((p) => {
    const done = [...(byPeriod.get(p) ?? [])].filter((id) => present.has(id)).length;
    return {
      periodStart: p,
      completed: done,
      members: present.size,
      ratio: present.size ? done / present.size : 0,
      current: p === now,
    };
  });
}

export interface MemberStanding {
  member: GroupMember;
  /** Completion rate across the window, 0-1, or null with nothing published. */
  rate: number | null;
  /** Whether they have completed the period in progress. */
  doneThisPeriod: boolean;
  published: number;
  /**
   * Whether they are still linked to a habit. Someone who is not stays on the
   * list — they are in the group — but is not counted against it.
   */
  tracking: boolean;
}

/**
 * Each member's own rate over the window.
 *
 * Returned in join order. Sorting by rate would rebuild the leaderboard that
 * `groupTimeline` exists to avoid, so callers get a stable order and the
 * decision is not left to a component.
 */
export function memberStandings(
  members: GroupMember[],
  progress: ProgressRow[],
  cadence: Cadence,
  count = 28,
): MemberStanding[] {
  const window = new Set(recentPeriods(cadence, count));
  const current = dateKey(periodStart(today(), cadence));

  const byUser = new Map<string, ProgressRow[]>();
  for (const row of progress) {
    const list = byUser.get(row.userId);
    if (list) list.push(row);
    else byUser.set(row.userId, [row]);
  }

  return [...members]
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map((member) => {
      const rows = (byUser.get(member.userId) ?? []).filter((r) =>
        window.has(r.periodStart.slice(0, 10)),
      );
      const done = rows.filter((r) => r.completed).length;
      return {
        member,
        rate: rows.length ? done / rows.length : null,
        doneThisPeriod: rows.some(
          (r) => r.periodStart.slice(0, 10) === current && r.completed,
        ),
        published: rows.length,
        tracking: !!member.habitId,
      };
    });
}

/** Headline for the period in progress. */
export function currentTally(
  members: GroupMember[],
  progress: ProgressRow[],
  cadence: Cadence,
): PeriodTally {
  const timeline = groupTimeline(members, progress, cadence, 1);
  return timeline[0];
}

/**
 * A collective win, or null when there is nothing honest to say.
 *
 * Only ever about the group as a whole — naming who is struggling would be
 * the leaderboard by another route.
 */
export function groupNote(tallies: PeriodTally[]): string | null {
  const finished = tallies.filter((t) => !t.current);
  if (finished.length < 3) return null;

  const perfect = finished.filter((t) => t.members > 0 && t.completed === t.members);
  if (perfect.length === finished.length) {
    return "Everyone has shown up every period so far.";
  }

  const recent = finished.slice(-7);
  const nobodyBlank = recent.every((t) => t.completed > 0);
  if (nobodyBlank && recent.length >= 5) {
    return "At least one of you has shown up every period this week.";
  }

  if (perfect.length > 0) {
    return `${perfect.length} period${perfect.length === 1 ? "" : "s"} where every single one of you showed up.`;
  }
  return null;
}
