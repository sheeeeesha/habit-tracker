import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  appendToJournal,
  forgetJournal,
  readJournal,
  sinceLast,
  snapshotOf,
  type JournalSnapshot,
} from "./insightJournal";
import { chartAvailable } from "./insightCharts";
import type { InsightPayload } from "./insightPayload";
import type { HabitAnalytics } from "./analytics";

/**
 * The comparison across readings, and the gate on what may be drawn.
 *
 * Both exist for the same reason: a model handed the chance to do arithmetic,
 * or to pick a chart it cannot see, produces something confident and wrong in
 * the middle of an otherwise accurate page.
 */

/** node:test has no DOM; the journal only needs these two methods. */
function fakeStorage() {
  const map = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    },
  };
  return map;
}

const snap = (over: Partial<JournalSnapshot> = {}): JournalSnapshot => ({
  trackedPeriods: 30,
  repetitions: 20,
  recentRate: 50,
  recoveryRate: 60,
  bestRun: 7,
  typicalRun: 3,
  ...over,
});

const DAY = 86_400_000;

describe("the reading journal", () => {
  beforeEach(() => {
    fakeStorage();
  });

  it("has no memory before the first reading", () => {
    // Null is a real answer the caller must handle. A model told nothing about
    // a previous state, but asked what changed, will invent one.
    assert.equal(sinceLast("h1", snap()), null);
  });

  it("subtracts the figures itself", () => {
    appendToJournal("h1", { at: 0, snapshot: snap(), titles: ["Sundays"] });
    const since = sinceLast("h1", snap({ repetitions: 26, bestRun: 9 }), 3 * DAY);

    assert.equal(since?.daysAgo, 3);
    assert.equal(since?.change.repetitions, 6);
    assert.equal(since?.change.bestRun, 2);
    assert.equal(since?.then.repetitions, 20, "the old figures travel too");
  });

  it("subtracts rates without rescaling them", () => {
    // The payload has already rounded these to whole percentages. Scaling them
    // again here reported an eleven-point move as eleven hundred, and only
    // running it caught that — the first version of this test assumed
    // fractions and so agreed with the bug.
    appendToJournal("h1", { at: 0, snapshot: snap({ recentRate: 50 }), titles: [] });
    const since = sinceLast("h1", snap({ recentRate: 61 }), DAY);
    assert.equal(since?.change.recentRatePoints, 11);
  });

  it("keeps both rate deltas on the same scale", () => {
    // recoveryRate was always a whole percentage and recentRate is too; if one
    // were scaled and the other not, the two numbers in the same block would
    // silently disagree by a factor of a hundred.
    appendToJournal("h1", {
      at: 0,
      snapshot: snap({ recentRate: 40, recoveryRate: 40 }),
      titles: [],
    });
    const since = sinceLast("h1", snap({ recentRate: 55, recoveryRate: 55 }), DAY);
    assert.equal(since?.change.recentRatePoints, 15);
    assert.equal(since?.change.recoveryRatePoints, 15);
  });

  it("reports no change rather than a made-up one when a rate is missing", () => {
    // Nothing had been missed at the time of the last reading, so there is no
    // recovery rate to compare against. Zero would read as "unchanged".
    appendToJournal("h1", { at: 0, snapshot: snap({ recoveryRate: null }), titles: [] });
    const since = sinceLast("h1", snap({ recoveryRate: 60 }), DAY);
    assert.equal(since?.change.recoveryRatePoints, null);
  });

  it("compares against the most recent reading, not the first", () => {
    appendToJournal("h1", { at: 0, snapshot: snap({ repetitions: 5 }), titles: ["old"] });
    appendToJournal("h1", { at: DAY, snapshot: snap({ repetitions: 15 }), titles: ["new"] });
    const since = sinceLast("h1", snap({ repetitions: 20 }), 2 * DAY);
    assert.equal(since?.change.repetitions, 5);
  });

  it("carries recent titles so the next reading does not repeat them", () => {
    appendToJournal("h1", { at: 0, snapshot: snap(), titles: ["A", "B"] });
    appendToJournal("h1", { at: DAY, snapshot: snap(), titles: ["C"] });
    assert.deepEqual(sinceLast("h1", snap(), 2 * DAY)?.alreadySaid, ["A", "B", "C"]);
  });

  it("keeps one habit's readings out of another's", () => {
    appendToJournal("h1", { at: 0, snapshot: snap({ repetitions: 99 }), titles: [] });
    assert.equal(sinceLast("h2", snap()), null);
  });

  it("does not grow without bound", () => {
    for (let i = 0; i < 20; i++) {
      appendToJournal("h1", { at: i * DAY, snapshot: snap(), titles: [`t${i}`] });
    }
    const kept = readJournal("h1");
    assert.equal(kept.length, 6);
    assert.equal(kept[kept.length - 1].titles[0], "t19", "the newest must survive");
  });

  it("forgets a habit on request", () => {
    appendToJournal("h1", { at: 0, snapshot: snap(), titles: [] });
    forgetJournal("h1");
    assert.deepEqual(readJournal("h1"), []);
  });

  it("survives storage holding something that is not a journal", () => {
    const map = fakeStorage();
    map.set("streakwrapped.insights.journal.v1", "{not json");
    assert.deepEqual(readJournal("h1"), []);
    map.set("streakwrapped.insights.journal.v1", '"a string"');
    assert.deepEqual(readJournal("h1"), []);
  });

  it("snapshots only the figures a comparison needs", () => {
    const payload = {
      habit: { name: "Read", rhythm: "every day", cadence: "daily" },
      trackedPeriods: 40,
      automaticity: { applicable: true, repetitions: 31, toMedian: 35 },
      recovery: { misses: 4, cameBack: 3, slidIntoTwo: 1, recoveryRate: 75, longestSlide: 2 },
      momentum: { recentRate: 80, priorRate: 60, changeInPoints: 20, sample: 14 },
      weekdays: null,
      runs: { typical: 4, best: 11, started: 5 },
    } satisfies InsightPayload;

    const s = snapshotOf(payload);
    assert.deepEqual(s, {
      trackedPeriods: 40,
      repetitions: 31,
      recentRate: 80,
      recoveryRate: 75,
      bestRun: 11,
      typicalRun: 4,
    });
    // The name is not in it. The journal is figures, and it outlives the
    // reading that produced it.
    assert.ok(!JSON.stringify(s).includes("Read"));
  });
});

describe("the chart gate", () => {
  const AUTO = { repetitions: 20, estimate: 0.4, remaining: 46, applicable: true };
  const stats = (over: Partial<HabitAnalytics> = {}): HabitAnalytics =>
    ({
      points: [],
      automaticity: AUTO,
      recovery: { misses: 3, recovered: 2, slipped: 1, rate: 0.66, worstSlide: 2 },
      trend: [
        { start: "2026-01-01", rate: 0.5, sample: 7 },
        { start: "2026-01-08", rate: 0.7, sample: 7 },
      ],
      momentum: { recentRate: 0.7, priorRate: 0.5, changeInPoints: 20, sample: 14 },
      weekdays: [
        { day: 1, rate: 0.9, scheduled: 10, completed: 9 },
        { day: 2, rate: 0.2, scheduled: 10, completed: 2 },
      ],
      runs: { lengths: [2, 3, 9], best: 9, median: 3 },
      judgedPeriods: 30,
      cadence: "daily",
      ...over,
    }) as HabitAnalytics;

  it("allows a chart the figures support", () => {
    for (const kind of ["automaticity", "trend", "weekday", "recovery"] as const) {
      assert.equal(chartAvailable(kind, stats()), true, kind);
    }
  });

  it("refuses a weekday breakdown for a habit that has no weekdays", () => {
    assert.equal(chartAvailable("weekday", stats({ cadence: "weekly" })), false);
    assert.equal(chartAvailable("weekday", stats({ cadence: "monthly" })), false);
  });

  it("refuses a weekday breakdown with nothing to see", () => {
    // Seven identical bars illustrate nothing, and reading a pattern into them
    // is the model doing exactly what it should not.
    const flat = stats({
      weekdays: [
        { day: 1, rate: 0.5, scheduled: 10, completed: 5 },
        { day: 2, rate: 0.5, scheduled: 10, completed: 5 },
      ],
    });
    assert.equal(chartAvailable("weekday", flat), false);
  });

  it("refuses a recovery split with nothing missed", () => {
    const clean = stats({
      recovery: { misses: 0, recovered: 0, slipped: 0, rate: null, worstSlide: 0 },
    });
    assert.equal(chartAvailable("recovery", clean), false);
  });

  it("refuses a trend from a single point", () => {
    assert.equal(chartAvailable("trend", stats({ trend: [] })), false);
    assert.equal(
      chartAvailable("trend", stats({ trend: [{ start: "2026-01-01", rate: 1, sample: 7 }] })),
      false,
    );
  });

  it("refuses the automaticity curve where repetitions are too sparse to mean anything", () => {
    const monthly = stats({
      automaticity: { ...AUTO, applicable: false, repetitions: 3 },
    });
    assert.equal(chartAvailable("automaticity", monthly), false);
  });
});
