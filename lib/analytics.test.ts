import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyseHabit,
  automaticityAt,
  AUTOMATICITY_MEDIAN_REPS,
  consistencyTrend,
  momentum,
  periodHistory,
  recovery,
  runs,
  weekdayRates,
} from "./analytics";
import { addDays, dateKey, today } from "./date";
import type { CompletionLog } from "./log";
import type { Habit } from "./types";

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
    startDate: dateKey(addDays(today(), -29)),
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

/**
 * Builds a log from a pattern read left to right ending *yesterday*, so the
 * period in progress never muddies a fixture. "1" is a completed day.
 */
function logFrom(pattern: string, id = "h", perDay = 1): CompletionLog {
  const days: Record<string, { n: number; t: number }> = {};
  const len = pattern.length;
  pattern.split("").forEach((ch, i) => {
    if (ch === "1") {
      const d = addDays(today(), -(len - i));
      days[dateKey(d)] = { n: perDay, t: 1 };
    }
  });
  return { [id]: days };
}

describe("periodHistory", () => {
  it("marks the period in progress so it is never counted as a miss", () => {
    const h = habit({ startDate: dateKey(addDays(today(), -3)) });
    const points = periodHistory(h, {});
    assert.equal(points.length, 4);
    assert.equal(points.filter((p) => p.current).length, 1);
    assert.equal(points[points.length - 1].current, true);
  });

  it("marks rest days of a weekday-limited habit as unscheduled", () => {
    const h = habit({ weekdays: [1, 2, 3, 4, 5], startDate: dateKey(addDays(today(), -13)) });
    const points = periodHistory(h, {});
    // Two weeks always contain exactly four weekend days.
    assert.equal(points.filter((p) => !p.scheduled).length, 4);
  });
});

describe("automaticity", () => {
  it("reads 95% at the median repetition count from Lally et al.", () => {
    // The curve is calibrated so the published median lands on 95% of the
    // asymptote; if that drifts, the whole framing is wrong.
    assert.ok(Math.abs(automaticityAt(AUTOMATICITY_MEDIAN_REPS) - 0.95) < 0.001);
    assert.equal(automaticityAt(0), 0);
    assert.ok(automaticityAt(254) > automaticityAt(66));
  });

  it("counts repetitions, not elapsed days", () => {
    // 30 days elapsed, 15 done. A habit at half consistency is not halfway.
    // The start date has to span the whole pattern, or the first day of it
    // falls before the habit existed and is correctly ignored.
    const h = habit({ startDate: dateKey(addDays(today(), -30)) });
    const a = analyseHabit(h, logFrom("101010101010101010101010101010")).automaticity;
    assert.equal(a.repetitions, 15);
    assert.equal(a.remaining, AUTOMATICITY_MEDIAN_REPS - 15);
    assert.ok(a.estimate < 0.6, "half consistency should not read as nearly automatic");
  });

  it("does not claim to apply to weekly or monthly habits", () => {
    // Lally studied daily behaviours; the curve has no meaning elsewhere.
    assert.equal(analyseHabit(habit(), {}).automaticity.applicable, true);
    assert.equal(
      analyseHabit(habit({ cadence: "weekly", target: 3 }), {}).automaticity.applicable,
      false,
    );
  });
});

describe("recovery", () => {
  it("separates a miss that was recovered from one that became two", () => {
    //            ...1 0 1 1 0 0 1  (ends yesterday)
    const points = periodHistory(habit({ startDate: dateKey(addDays(today(), -7)) }), logFrom("1011001"));
    const r = recovery(points);
    assert.equal(r.misses, 3);
    assert.equal(r.recovered, 2, "the isolated miss and the end of the slide");
    assert.equal(r.slipped, 1, "the first of the two consecutive misses");
    assert.equal(r.rate, 2 / 3);
    assert.equal(r.worstSlide, 2);
  });

  it("reports no rate rather than a fake 100% when nothing was missed", () => {
    const points = periodHistory(habit({ startDate: dateKey(addDays(today(), -5)) }), logFrom("11111"));
    const r = recovery(points);
    assert.equal(r.misses, 0);
    assert.equal(r.rate, null);
  });

  it("does not judge the most recent miss, which has no next period yet", () => {
    const points = periodHistory(habit({ startDate: dateKey(addDays(today(), -4)) }), logFrom("1110"));
    const r = recovery(points);
    assert.equal(r.misses, 1);
    assert.equal(r.recovered + r.slipped, 0, "a verdict here would be invented");
    assert.equal(r.rate, null);
  });
});

describe("consistency trend", () => {
  it("is a trailing rate, so improvement shows as a rising line", () => {
    const h = habit({ startDate: dateKey(addDays(today(), -20)) });
    // Ten poor days followed by ten perfect ones.
    const points = periodHistory(h, logFrom("00000000001111111111"));
    const trend = consistencyTrend(points, 5);
    assert.ok(trend[4].rate === 0, "first window is the poor stretch");
    assert.equal(trend[trend.length - 1].rate, 1, "last window is the good stretch");
  });

  it("compares the recent window against the one before it", () => {
    const h = habit({ startDate: dateKey(addDays(today(), -20)) });
    const points = periodHistory(h, logFrom("00000000001111111111"));
    const m = momentum(points, 10);
    assert.equal(m.recent, 1);
    assert.equal(m.prior, 0);
    assert.equal(m.delta, 1);
  });

  it("gives no delta when there is not yet a prior window to compare", () => {
    const points = periodHistory(habit({ startDate: dateKey(addDays(today(), -3)) }), logFrom("111"));
    assert.equal(momentum(points, 28).delta, null);
  });
});

describe("weekday rates", () => {
  it("only counts days the habit was actually scheduled on", () => {
    const h = habit({ weekdays: [1, 2, 3, 4, 5], startDate: dateKey(addDays(today(), -27)) });
    const rates = weekdayRates(h, {});
    assert.equal(rates[0].scheduled, 0, "Sunday is a rest day here");
    assert.equal(rates[6].scheduled, 0, "Saturday is a rest day here");
    assert.equal(rates[0].rate, null, "an unscheduled day has no rate, not 0%");
    assert.ok(rates[1].scheduled > 0);
  });
});

describe("runs", () => {
  it("reports the typical run alongside the record", () => {
    // Runs of 3, 1 and 2 — a best of 3 alone would flatter this.
    const points = periodHistory(habit({ startDate: dateKey(addDays(today(), -9)) }), logFrom("111010110"));
    const r = runs(points);
    assert.deepEqual(r.lengths, [3, 1, 2]);
    assert.equal(r.best, 3);
    assert.equal(r.median, 2);
  });

  it("has no runs to report for an untouched habit", () => {
    const r = runs(periodHistory(habit(), {}));
    assert.deepEqual(r.lengths, []);
    assert.equal(r.best, 0);
    assert.equal(r.median, 0);
  });
});
