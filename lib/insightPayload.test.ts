import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInsightPayload, payloadKey, worthAsking } from "./insightPayload";
import { analyseHabit } from "./analytics";
import { addDays, dateKey, today } from "./date";
import type { CompletionLog } from "./log";
import type { Habit } from "./types";

/**
 * The contract with the model.
 *
 * The claim the whole feature rests on is that Claude receives figures this
 * app already computed and nothing else — no check-ins, no dates, nothing it
 * could total up itself. If that stops being true, a written insight can start
 * inventing statistics, so it is asserted here rather than trusted.
 */

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: "h",
    name: "Meditate",
    icon: "meditate",
    accent: "ultra",
    cadence: "daily",
    target: 1,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: "anytime",
    startDate: dateKey(addDays(today(), -40)),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

/** A log with a check-in on each of the last `n` days. */
function streak(n: number, id = "h"): CompletionLog {
  const days: Record<string, { n: number; t: number }> = {};
  for (let i = 1; i <= n; i++) days[dateKey(addDays(today(), -i))] = { n: 1, t: 1 };
  return { [id]: days };
}

const build = (h: Habit, log: CompletionLog) =>
  buildInsightPayload(h, analyseHabit(h, log));

describe("insight payload", () => {
  it("sends no check-ins, no dates and no raw log", () => {
    const json = JSON.stringify(build(habit(), streak(20)));

    // Any date key would let the model reason about specific days, which is
    // exactly the thing it must not be able to do.
    assert.ok(
      !/\d{4}-\d{2}-\d{2}/.test(json),
      `a date leaked into the payload: ${json}`,
    );
    for (const forbidden of ["log", "checkins", "startDate", "createdAt", "updatedAt"]) {
      assert.ok(!json.includes(`"${forbidden}"`), `payload contains ${forbidden}`);
    }
  });

  it("sends the habit's name, which is the one personal field in it", () => {
    // Included deliberately - without it the advice degrades to "your daily
    // habit" - and it is why the whole feature is off until switched on.
    const payload = build(habit({ name: "Therapy" }), streak(20));
    assert.equal(payload.habit.name, "Therapy");
  });

  it("carries percentages, not fractions, so nothing needs converting", () => {
    const payload = build(habit(), streak(30));
    for (const w of payload.weekdays ?? []) {
      assert.ok(w.rate >= 0 && w.rate <= 100, `weekday rate out of range: ${w.rate}`);
      assert.equal(w.rate, Math.round(w.rate), "rates should be whole numbers");
    }
    if (payload.momentum.recentRate !== null) {
      assert.ok(payload.momentum.recentRate <= 100);
    }
  });

  it("omits weekdays for a habit where they mean nothing", () => {
    const weekly = habit({ cadence: "weekly", target: 3 });
    assert.equal(build(weekly, streak(30)).weekdays, null);
    assert.notEqual(build(habit(), streak(30)).weekdays, null);
  });

  it("marks automaticity inapplicable rather than sending a misleading number", () => {
    const weekly = habit({ cadence: "weekly", target: 3 });
    assert.equal(build(weekly, streak(30)).automaticity.applicable, false);
  });

  it("passes null for a rate that does not exist yet", () => {
    // A habit with no misses has no recovery rate. Sending 0 or 100 would both
    // be inventions, and the model would happily write a sentence about it.
    // The start date has to match the streak, or the days before it are misses.
    const payload = build(habit({ startDate: dateKey(addDays(today(), -30)) }), streak(30));
    assert.equal(payload.recovery.misses, 0);
    assert.equal(payload.recovery.recoveryRate, null);
  });
});

describe("payload key", () => {
  it("is stable for identical figures", () => {
    const a = build(habit(), streak(20));
    const b = build(habit(), streak(20));
    assert.equal(payloadKey(a), payloadKey(b));
  });

  it("changes when a check-in changes the numbers", () => {
    // This is what stops a cached reading being shown beside figures it was
    // not written about.
    const before = payloadKey(build(habit(), streak(20)));
    const after = payloadKey(build(habit(), streak(21)));
    assert.notEqual(before, after);
  });

  it("changes when the habit is renamed", () => {
    const a = payloadKey(build(habit({ name: "Meditate" }), streak(20)));
    const b = payloadKey(build(habit({ name: "Sit quietly" }), streak(20)));
    assert.notEqual(a, b);
  });
});

describe("worthAsking", () => {
  it("refuses to spend a request on noise", () => {
    const thin = analyseHabit(habit({ startDate: dateKey(addDays(today(), -4)) }), {});
    assert.equal(worthAsking(thin), false);
    assert.equal(worthAsking(analyseHabit(habit(), streak(30))), true);
  });
});
