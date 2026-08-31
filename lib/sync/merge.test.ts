import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { habitFromRow, habitToRow, isPushable, logFromRows, merge } from "./merge";
import type { CompletionLog } from "../log";
import type { Habit } from "../types";

function habit(id: string, updatedAt: number, extra: Partial<Habit> = {}): Habit {
  return {
    id,
    name: `Habit ${id}`,
    icon: "fire",
    accent: "hyperpink",
    cadence: "daily",
    target: 1,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: "anytime",
    startDate: "2026-01-01",
    createdAt: 1_000,
    updatedAt,
    ...extra,
  };
}

const log = (entries: Record<string, Record<string, [number, number]>>): CompletionLog => {
  const out: CompletionLog = {};
  for (const [habitId, days] of Object.entries(entries)) {
    out[habitId] = {};
    for (const [day, [n, t]] of Object.entries(days)) out[habitId][day] = { n, t };
  }
  return out;
};

describe("merge — habits", () => {
  it("keeps a habit only one side has, and pushes the local one", () => {
    const result = merge({
      localHabits: [habit("local", 5)],
      localLog: {},
      remoteHabits: [habit("remote", 5)],
      remoteLog: {},
    });

    assert.deepEqual(result.habits.map((h) => h.id).sort(), ["local", "remote"]);
    assert.deepEqual(
      result.habitsToPush.map((h) => h.id),
      ["local"],
      "only the habit the server lacks should be pushed",
    );
  });

  it("takes the newer edit when both sides changed the same habit", () => {
    const newer = merge({
      localHabits: [habit("a", 200, { name: "local wins" })],
      localLog: {},
      remoteHabits: [habit("a", 100, { name: "remote" })],
      remoteLog: {},
    });
    assert.equal(newer.habits[0].name, "local wins");
    assert.deepEqual(newer.habitsToPush.map((h) => h.id), ["a"]);

    const older = merge({
      localHabits: [habit("a", 50, { name: "local" })],
      localLog: {},
      remoteHabits: [habit("a", 100, { name: "remote wins" })],
      remoteLog: {},
    });
    assert.equal(older.habits[0].name, "remote wins");
    assert.deepEqual(older.habitsToPush, [], "a losing local row must not be pushed");
  });

  it("gives ties to the server so the two sides cannot trade writes forever", () => {
    const result = merge({
      localHabits: [habit("a", 100, { name: "local" })],
      localLog: {},
      remoteHabits: [habit("a", 100, { name: "remote" })],
      remoteLog: {},
    });
    assert.equal(result.habits[0].name, "remote");
    assert.deepEqual(result.habitsToPush, []);
  });

  it("propagates a remote deletion over an older local copy", () => {
    const result = merge({
      localHabits: [habit("a", 100)],
      localLog: log({ a: { "2026-03-01": [1, 100] } }),
      remoteHabits: [habit("a", 500, { deletedAt: 500 })],
      remoteLog: {},
    });

    assert.equal(result.habits[0].deletedAt, 500);
    assert.equal(
      result.log.a,
      undefined,
      "check-ins for a deleted habit are dropped, not resurrected",
    );
    assert.deepEqual(result.checkinsToPush, []);
  });

  it("lets a newer local edit win over a stale remote deletion", () => {
    const result = merge({
      localHabits: [habit("a", 900, { name: "still alive" })],
      localLog: {},
      remoteHabits: [habit("a", 500, { deletedAt: 500 })],
      remoteLog: {},
    });
    assert.equal(result.habits[0].deletedAt, undefined);
    assert.equal(result.habits[0].name, "still alive");
  });
});

describe("merge — check-ins", () => {
  it("keeps both sides when two devices edited different days", () => {
    const result = merge({
      localHabits: [habit("a", 1)],
      localLog: log({ a: { "2026-03-01": [1, 100] } }),
      remoteHabits: [habit("a", 1)],
      remoteLog: log({ a: { "2026-03-02": [1, 100] } }),
    });

    assert.deepEqual(Object.keys(result.log.a).sort(), ["2026-03-01", "2026-03-02"]);
    assert.deepEqual(
      result.checkinsToPush.map((c) => c.day),
      ["2026-03-01"],
      "only the day the server lacks needs pushing",
    );
  });

  it("resolves the same day last-write-wins", () => {
    const localNewer = merge({
      localHabits: [habit("a", 1)],
      localLog: log({ a: { "2026-03-01": [7, 300] } }),
      remoteHabits: [habit("a", 1)],
      remoteLog: log({ a: { "2026-03-01": [2, 100] } }),
    });
    assert.equal(localNewer.log.a["2026-03-01"].n, 7);
    assert.equal(localNewer.checkinsToPush.length, 1);

    const remoteNewer = merge({
      localHabits: [habit("a", 1)],
      localLog: log({ a: { "2026-03-01": [7, 100] } }),
      remoteHabits: [habit("a", 1)],
      remoteLog: log({ a: { "2026-03-01": [2, 300] } }),
    });
    assert.equal(remoteNewer.log.a["2026-03-01"].n, 2);
    assert.deepEqual(remoteNewer.checkinsToPush, []);
  });

  it("treats a cleared day as a real value that can win", () => {
    // Clearing a day locally must beat an older check-in on the server,
    // otherwise an undo silently comes back on the next sync.
    const result = merge({
      localHabits: [habit("a", 1)],
      localLog: log({ a: { "2026-03-01": [0, 500] } }),
      remoteHabits: [habit("a", 1)],
      remoteLog: log({ a: { "2026-03-01": [3, 100] } }),
    });
    assert.equal(result.log.a["2026-03-01"].n, 0);
    assert.equal(result.checkinsToPush[0].cell.n, 0);
  });

  it("converges: merging a second time pushes nothing new", () => {
    const first = merge({
      localHabits: [habit("a", 200), habit("b", 100)],
      localLog: log({ a: { "2026-03-01": [5, 300] }, b: { "2026-03-02": [1, 50] } }),
      remoteHabits: [habit("a", 100), habit("c", 100)],
      remoteLog: log({ a: { "2026-03-01": [1, 100] }, c: { "2026-03-03": [1, 10] } }),
    });

    // Simulate the server having accepted everything we pushed.
    const second = merge({
      localHabits: first.habits,
      localLog: first.log,
      remoteHabits: first.habits,
      remoteLog: first.log,
    });

    assert.deepEqual(second.habitsToPush, []);
    assert.deepEqual(second.checkinsToPush, []);
    assert.deepEqual(
      second.habits.map((h) => h.id).sort(),
      first.habits.map((h) => h.id).sort(),
    );
  });

  it("adopts purely local history on a first sync into an empty account", () => {
    const result = merge({
      localHabits: [habit("a", 10), habit("b", 20)],
      localLog: log({
        a: { "2026-03-01": [1, 10], "2026-03-02": [1, 20] },
        b: { "2026-03-01": [4, 30] },
      }),
      remoteHabits: [],
      remoteLog: {},
    });

    assert.equal(result.habitsToPush.length, 2);
    assert.equal(result.checkinsToPush.length, 3);
    assert.equal(result.log.a["2026-03-02"].n, 1);
  });
});

describe("incremental pulls", () => {
  // An incremental pull returns only what changed since the cursor, so most
  // local rows are absent from the remote side while the server has them
  // perfectly well. Treating that as "missing upstream" made every sync
  // re-upload the whole history.
  const local = {
    localHabits: [habit("a", 1_000)],
    localLog: log({ a: { "2026-03-01": [1, 1_000], "2026-03-02": [1, 1_100] } }),
  };

  it("does not re-push rows that merely did not change since the last sync", () => {
    const result = merge({
      ...local,
      remoteHabits: [],
      remoteLog: {},
      pushedThrough: 5_000,
    });

    assert.deepEqual(result.habitsToPush, [], "an unchanged habit was re-pushed");
    assert.deepEqual(result.checkinsToPush, [], "unchanged check-ins were re-pushed");
    // Nothing is lost from the merged state — only the push list shrinks.
    assert.equal(result.habits.length, 1);
    assert.deepEqual(Object.keys(result.log.a).sort(), ["2026-03-01", "2026-03-02"]);
  });

  it("still pushes rows edited since the last sync", () => {
    const result = merge({
      localHabits: [habit("a", 9_000)],
      localLog: log({ a: { "2026-03-01": [1, 1_000], "2026-03-03": [2, 9_500] } }),
      remoteHabits: [],
      remoteLog: {},
      pushedThrough: 5_000,
    });

    assert.deepEqual(result.habitsToPush.map((h) => h.id), ["a"]);
    assert.deepEqual(
      result.checkinsToPush.map((c) => c.day),
      ["2026-03-03"],
      "only the day edited after the last sync should be pushed",
    );
  });

  it("pushes everything when the remote side is a full snapshot", () => {
    const result = merge({ ...local, remoteHabits: [], remoteLog: {}, pushedThrough: null });
    assert.equal(result.habitsToPush.length, 1);
    assert.equal(result.checkinsToPush.length, 2);
  });

  it("still pushes a local row that genuinely won a comparison", () => {
    // Losing to nothing is different from beating something: if local wins on
    // timestamps it must be pushed regardless of the watermark.
    const result = merge({
      localHabits: [habit("a", 2_000, { name: "local wins" })],
      localLog: log({ a: { "2026-03-01": [7, 2_000] } }),
      remoteHabits: [habit("a", 1_000, { name: "remote" })],
      remoteLog: log({ a: { "2026-03-01": [1, 1_000] } }),
      pushedThrough: 9_999_999,
    });
    assert.deepEqual(result.habitsToPush.map((h) => h.id), ["a"]);
    assert.deepEqual(result.checkinsToPush.map((c) => c.day), ["2026-03-01"]);
  });
});

describe("row conversion", () => {
  it("round-trips a habit through the Postgres row shape", () => {
    const original = habit("a", 1_700_000_000_000, {
      archivedAt: 1_700_000_500_000,
      weekdays: [1, 3, 5],
      cadence: "weekly",
      target: 3,
      timeOfDay: "morning",
      startDate: "2026-02-14",
    });

    const back = habitFromRow({ ...habitToRow(original), synced_at: "2026-01-01T00:00:00Z" });

    assert.deepEqual(back, original);
  });

  it("normalises a Postgres date column back to a plain day key", () => {
    const log = logFromRows([
      { habit_id: "a", day: "2026-03-01", count: 2, updated_at: "2026-03-01T10:00:00.000Z" },
    ]);
    assert.deepEqual(Object.keys(log.a), ["2026-03-01"]);
    assert.equal(log.a["2026-03-01"].n, 2);
  });
});

describe("push validation", () => {
  it("accepts a well-formed habit", () => {
    assert.equal(isPushable(habit("a", 1)), true);
  });

  it("rejects records that would trip a server CHECK and wedge the batch", () => {
    const bad: Array<[string, Habit]> = [
      ["target above the allowed range", habit("a", 1, { target: 500 })],
      ["target of zero", habit("a", 1, { target: 0 })],
      ["unknown cadence", habit("a", 1, { cadence: "yearly" as Habit["cadence"] })],
      ["unknown time of day", habit("a", 1, { timeOfDay: "midnight" as Habit["timeOfDay"] })],
      ["weekday out of range", habit("a", 1, { weekdays: [0, 9] })],
      ["malformed start date", habit("a", 1, { startDate: "01/02/2026" })],
      ["empty id", habit("", 1)],
    ];
    for (const [why, h] of bad) {
      assert.equal(isPushable(h), false, `should reject: ${why}`);
    }
  });
});
