import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  currentTally,
  groupNote,
  groupTimeline,
  linkState,
  memberStandings,
  myProgressRows,
  recentPeriods,
} from "./progress";
import { addDays, dateKey, today } from "../date";
import type { CompletionLog } from "../log";
import type { Habit } from "../types";
import type { GroupMember, ProgressRow } from "./types";

const day = (n: number) => dateKey(addDays(today(), n));

function member(userId: string, joinedAt: string, displayName = userId): GroupMember {
  return { userId, habitId: `habit-${userId}`, displayName, joinedAt };
}

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: "h",
    name: "Read",
    icon: "book",
    accent: "acid",
    cadence: "daily",
    target: 1,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: "anytime",
    startDate: day(-5),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("myProgressRows", () => {
  it("includes the period in progress, so today can be counted live", () => {
    const log: CompletionLog = { h: { [day(0)]: { n: 1, t: 1 } } };
    const rows = myProgressRows(habit(), log);
    const todayRow = rows.find((r) => r.period_start === day(0));
    assert.ok(todayRow, "today should be published");
    assert.equal(todayRow.completed, true);
  });

  it("reports uncompleted periods as false rather than omitting them", () => {
    // An absent row and a false row mean different things to the group view:
    // one is "not published", the other is "published, and they missed".
    const rows = myProgressRows(habit(), {});
    assert.ok(rows.length >= 5);
    assert.ok(rows.every((r) => r.completed === false));
  });

  it("skips rest days of a weekday-limited habit", () => {
    const h = habit({ weekdays: [1, 2, 3, 4, 5], startDate: day(-13) });
    const rows = myProgressRows(h, {});
    const weekendPublished = rows.filter((r) => {
      const d = new Date(r.period_start + "T00:00:00");
      return d.getDay() === 0 || d.getDay() === 6;
    });
    assert.equal(weekendPublished.length, 0);
  });
});

describe("groupTimeline", () => {
  const members = [member("a", "2026-01-01"), member("b", "2026-01-02")];

  it("counts how many of the group completed each period", () => {
    const progress: ProgressRow[] = [
      { userId: "a", periodStart: day(-1), completed: true },
      { userId: "b", periodStart: day(-1), completed: true },
      { userId: "a", periodStart: day(0), completed: true },
      { userId: "b", periodStart: day(0), completed: false },
    ];
    const timeline = groupTimeline(members, progress, "daily", 2);
    assert.deepEqual(
      timeline.map((t) => [t.periodStart, t.completed, t.members]),
      [
        [day(-1), 2, 2],
        [day(0), 1, 2],
      ],
    );
    assert.equal(timeline[1].current, true);
  });

  it("ignores progress from someone who has since left", () => {
    // Otherwise a departed member keeps padding past periods, and the group
    // looks like it is falling apart when nothing changed.
    const progress: ProgressRow[] = [
      { userId: "a", periodStart: day(0), completed: true },
      { userId: "gone", periodStart: day(0), completed: true },
    ];
    const timeline = groupTimeline([members[0]], progress, "daily", 1);
    assert.equal(timeline[0].completed, 1);
    assert.equal(timeline[0].members, 1);
  });

  it("tolerates a timestamp where a date was expected", () => {
    // Postgres hands back a date column as YYYY-MM-DD, but a client that
    // round-trips it through JSON can widen it.
    const progress: ProgressRow[] = [
      { userId: "a", periodStart: `${day(0)}T00:00:00.000Z`, completed: true },
    ];
    assert.equal(currentTally(members, progress, "daily").completed, 1);
  });
});

describe("memberStandings", () => {
  const members = [member("a", "2026-01-02", "Ana"), member("b", "2026-01-01", "Ben")];

  it("returns join order, never performance order", () => {
    // Sorting by rate here would rebuild the leaderboard the group view
    // deliberately avoids.
    const progress: ProgressRow[] = [
      { userId: "a", periodStart: day(-1), completed: true },
      { userId: "b", periodStart: day(-1), completed: false },
    ];
    const standings = memberStandings(members, progress, "daily");
    assert.deepEqual(standings.map((s) => s.member.displayName), ["Ben", "Ana"]);
  });

  it("computes each member's own rate over the window", () => {
    const progress: ProgressRow[] = [
      { userId: "a", periodStart: day(-1), completed: true },
      { userId: "a", periodStart: day(-2), completed: false },
      { userId: "b", periodStart: day(-1), completed: true },
    ];
    const standings = memberStandings(members, progress, "daily");
    const ana = standings.find((s) => s.member.userId === "a");
    assert.equal(ana?.rate, 0.5);
    assert.equal(standings.find((s) => s.member.userId === "b")?.rate, 1);
  });

  it("reports no rate rather than zero for a member who has published nothing", () => {
    const standings = memberStandings(members, [], "daily");
    assert.ok(standings.every((s) => s.rate === null));
    assert.ok(standings.every((s) => s.published === 0));
  });

  it("flags whether each member has completed the period in progress", () => {
    const progress: ProgressRow[] = [{ userId: "a", periodStart: day(0), completed: true }];
    const standings = memberStandings(members, progress, "daily");
    assert.equal(standings.find((s) => s.member.userId === "a")?.doneThisPeriod, true);
    assert.equal(standings.find((s) => s.member.userId === "b")?.doneThisPeriod, false);
  });
});

describe("recentPeriods", () => {
  it("ends on the period in progress and runs oldest first", () => {
    const days = recentPeriods("daily", 3);
    assert.deepEqual(days, [day(-2), day(-1), day(0)]);
  });
});

describe("groupNote", () => {
  const tally = (completed: number, members: number, current = false) => ({
    periodStart: "x",
    completed,
    members,
    ratio: members ? completed / members : 0,
    current,
  });

  it("says nothing until there is enough history to say it about", () => {
    assert.equal(groupNote([tally(2, 2), tally(2, 2, true)]), null);
  });

  it("celebrates the group, never singling anyone out", () => {
    const note = groupNote([tally(2, 2), tally(2, 2), tally(2, 2), tally(1, 2, true)]);
    assert.ok(note && /Everyone/.test(note));
  });

  it("has nothing to say when the group has genuinely gone quiet", () => {
    const quiet = Array.from({ length: 8 }, () => tally(0, 3));
    assert.equal(groupNote([...quiet, tally(0, 3, true)]), null);
  });
});

/**
 * What happens to a group when a member's habit goes away.
 *
 * The failure this covers is quiet rather than loud: the member stops
 * publishing but stays on the roster, so the count sticks permanently below
 * the membership and "everyone showed up" becomes unreachable. Nothing throws;
 * the group just looks like it is failing.
 */
describe("linkState", () => {
  it("reads a live habit as tracking", () => {
    const h = habit({ id: "h1" });
    const state = linkState("h1", [h]);
    assert.equal(state.kind, "tracking");
  });

  it("reads a tombstone as deleted", () => {
    const state = linkState("h1", [habit({ id: "h1", deletedAt: 123 })]);
    assert.equal(state.kind, "deleted");
    assert.equal(state.kind === "deleted" && state.habitId, "h1");
  });

  it("reads an archived habit as archived, not deleted", () => {
    // The two are treated differently on the wire: one erases the group's
    // copy of the history, the other keeps it for when the habit comes back.
    const state = linkState("h1", [habit({ id: "h1", archivedAt: 123 })]);
    assert.equal(state.kind, "archived");
  });

  it("prefers deleted when a habit is both archived and deleted", () => {
    const state = linkState("h1", [
      habit({ id: "h1", archivedAt: 1, deletedAt: 2 }),
    ]);
    assert.equal(state.kind, "deleted");
  });

  it("reads an ABSENT habit as unknown, never as deleted", () => {
    // This is the one that would do damage. A second device that has not
    // pulled this habit yet also sees nothing — and "deleted" erases the
    // group's published history. Absence is not evidence.
    const state = linkState("h1", []);
    assert.equal(state.kind, "unknown");
  });

  it("reads a cleared link as unlinked", () => {
    assert.equal(linkState(null, []).kind, "unlinked");
  });
});

describe("a member who is no longer tracking", () => {
  const joined = "2026-01-01T00:00:00Z";
  const linked = (id: string): GroupMember => member(id, joined);
  const unlinked = (id: string): GroupMember => ({ ...member(id, joined), habitId: null });

  it("leaves the denominator, so the group can be whole again", () => {
    // Two of three published today; the third deleted their habit. Counting
    // them keeps this group at 2/3 forever, however well the others do.
    const members = [linked("a"), linked("b"), unlinked("c")];
    const progress: ProgressRow[] = [
      { userId: "a", periodStart: day(0), completed: true },
      { userId: "b", periodStart: day(0), completed: true },
    ];
    const now = currentTally(members, progress, "daily");
    assert.equal(now.members, 2);
    assert.equal(now.completed, 2);
    assert.equal(now.ratio, 1);
  });

  it("stops dragging down 'everyone showed up'", () => {
    const members = [linked("a"), unlinked("c")];
    const progress: ProgressRow[] = Array.from({ length: 5 }, (_, i) => ({
      userId: "a",
      periodStart: day(i - 5),
      completed: true,
    }));
    const timeline = groupTimeline(members, progress, "daily", 6);
    assert.equal(groupNote(timeline), "Everyone has shown up every period so far.");
  });

  it("does not count leftover rows from someone who has unlinked", () => {
    // Archiving keeps the published rows on the server on purpose. They must
    // not go on counting while the habit is put away.
    const members = [linked("a"), unlinked("c")];
    const progress: ProgressRow[] = [
      { userId: "a", periodStart: day(0), completed: true },
      { userId: "c", periodStart: day(0), completed: true },
    ];
    const now = currentTally(members, progress, "daily");
    assert.equal(now.completed, 1, "a stale row was still counted");
    assert.equal(now.members, 1);
  });

  it("stays on the member list, marked as not tracking", () => {
    // Still in the group, and can relink. Dropping them from the list would
    // read as having been removed.
    const standings = memberStandings(
      [linked("a"), unlinked("c")],
      [{ userId: "a", periodStart: day(0), completed: true }],
      "daily",
    );
    assert.equal(standings.length, 2);
    assert.equal(standings.find((s) => s.member.userId === "a")?.tracking, true);
    assert.equal(standings.find((s) => s.member.userId === "c")?.tracking, false);
  });

  it("counts again as soon as they relink", () => {
    const members = [linked("a"), linked("c")];
    const progress: ProgressRow[] = [
      { userId: "a", periodStart: day(0), completed: true },
      { userId: "c", periodStart: day(0), completed: true },
    ];
    const now = currentTally(members, progress, "daily");
    assert.equal(now.members, 2);
    assert.equal(now.completed, 2);
  });

  it("reports 0 of 0 rather than dividing by zero", () => {
    const now = currentTally([unlinked("a")], [], "daily");
    assert.equal(now.members, 0);
    assert.equal(now.ratio, 0);
  });
});
