import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  addHabit,
  applyMerged,
  bumpCheckIn,
  readState,
  resetAll,
  resetForAccount,
  setPrefs,
  subscribeToLocalChanges,
} from "./store";
import { emptyDraft } from "./habits";

/**
 * The store's notification behaviour, which sync depends on.
 *
 * There is one non-obvious rule here and it is the reason this file exists: a
 * completed sync writes its merged result back into the store, and that write
 * must not look like a local edit. If it does, every sync schedules the next
 * one and the app talks to the network forever at the debounce interval,
 * behaving perfectly correctly the whole time.
 */

function trackLocalChanges() {
  let count = 0;
  const stop = subscribeToLocalChanges(() => {
    count += 1;
  });
  return { count: () => count, stop };
}

describe("local change notifications", () => {
  beforeEach(() => {
    resetAll();
  });

  it("fires when this device edits something", () => {
    const seen = trackLocalChanges();
    const before = seen.count();

    const habit = addHabit({ ...emptyDraft("acid"), name: "Read" });
    assert.ok(seen.count() > before, "adding a habit did not notify");

    const afterAdd = seen.count();
    bumpCheckIn(habit.id, 1);
    assert.ok(seen.count() > afterAdd, "checking in did not notify");

    const afterCheck = seen.count();
    setPrefs({ reduceMotion: true });
    assert.ok(seen.count() > afterCheck, "changing a preference did not notify");

    seen.stop();
  });

  it("does NOT fire when a sync result is written back", () => {
    // The regression this guards: applyMerged notifying local subscribers
    // means each completed sync schedules another one, indefinitely.
    const habit = addHabit({ ...emptyDraft("acid"), name: "Read" });
    const seen = trackLocalChanges();
    const before = seen.count();

    applyMerged([habit], { [habit.id]: { "2026-03-01": { n: 1, t: 1 } } }, {
      lastSyncedAt: Date.now(),
      cursor: "2026-03-01T00:00:00.000Z",
    });

    assert.equal(
      seen.count(),
      before,
      "a sync write-back notified local subscribers, which loops sync forever",
    );
    // The state itself must still have changed — suppressing the notification
    // must not suppress the write.
    assert.equal(readState().log[habit.id]["2026-03-01"].n, 1);
    seen.stop();
  });

  it("does NOT fire when switching accounts mid-sync", () => {
    addHabit({ ...emptyDraft("acid"), name: "Read" });
    const seen = trackLocalChanges();
    const before = seen.count();

    resetForAccount("11111111-1111-1111-1111-111111111111");

    assert.equal(seen.count(), before, "an account switch scheduled a sync");
    assert.equal(readState().habits.length, 0, "the previous account's habits survived");
    assert.equal(readState().sync.ownerId, "11111111-1111-1111-1111-111111111111");
    seen.stop();
  });

  it("resumes notifying local edits after a sync write-back", () => {
    // The suppression must be scoped to the write, not left latched on.
    const habit = addHabit({ ...emptyDraft("acid"), name: "Read" });
    applyMerged([habit], {}, { lastSyncedAt: Date.now() });

    const seen = trackLocalChanges();
    const before = seen.count();
    bumpCheckIn(habit.id, 1);
    assert.ok(seen.count() > before, "local edits stopped notifying after a sync");
    seen.stop();
  });

  it("stops notifying once unsubscribed", () => {
    const seen = trackLocalChanges();
    seen.stop();
    const after = seen.count();
    addHabit({ ...emptyDraft("acid"), name: "Read" });
    assert.equal(seen.count(), after);
  });
});
