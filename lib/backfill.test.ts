import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { missedYesterday, yesterdayProgress } from "./streak";
import { addDays, dateKey, today } from "./date";
import type { CompletionLog } from "./log";
import type { Habit } from "./types";

const yKey = dateKey(addDays(today(), -1));

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
    startDate: dateKey(addDays(today(), -30)),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const logged = (n: number, id = "h"): CompletionLog => ({
  [id]: { [yKey]: { n, t: 1 } },
});

describe("missedYesterday", () => {
  it("finds a daily habit that went unticked", () => {
    assert.deepEqual(
      missedYesterday([habit()], {}).map((h) => h.id),
      ["h"],
    );
  });

  it("ignores one that was completed", () => {
    assert.deepEqual(missedYesterday([habit()], logged(1)), []);
  });

  it("still offers a multi-target habit that fell short", () => {
    const h = habit({ target: 8 });
    assert.equal(missedYesterday([h], logged(5)).length, 1);
    assert.equal(missedYesterday([h], logged(8)).length, 0);
  });

  it("never offers weekly or monthly habits", () => {
    // Their period is still open today, so there is nothing to backfill —
    // checking in normally already counts toward it.
    assert.deepEqual(missedYesterday([habit({ cadence: "weekly", target: 3 })], {}), []);
    assert.deepEqual(missedYesterday([habit({ cadence: "monthly", target: 2 })], {}), []);
  });

  it("skips a rest day", () => {
    // A habit not scheduled yesterday was not missed yesterday.
    const yesterdayDow = addDays(today(), -1).getDay();
    const everyDayBut = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== yesterdayDow);
    assert.deepEqual(missedYesterday([habit({ weekdays: everyDayBut })], {}), []);
    assert.equal(missedYesterday([habit({ weekdays: [yesterdayDow] })], {}).length, 1);
  });

  it("skips archived and deleted habits", () => {
    assert.deepEqual(missedYesterday([habit({ archivedAt: 1 })], {}), []);
    assert.deepEqual(missedYesterday([habit({ deletedAt: 1 })], {}), []);
  });

  it("skips a habit that did not exist yesterday", () => {
    assert.deepEqual(missedYesterday([habit({ startDate: dateKey(today()) })], {}), []);
  });
});

describe("yesterdayProgress", () => {
  it("reports yesterday's count against the target", () => {
    const p = yesterdayProgress(habit({ target: 8 }), logged(3));
    assert.equal(p.key, yKey);
    assert.equal(p.done, 3);
    assert.equal(p.target, 8);
    assert.equal(p.complete, false);
    assert.equal(yesterdayProgress(habit({ target: 8 }), logged(8)).complete, true);
  });
});
