import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  currentTally,
  groupNote,
  groupTimeline,
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
