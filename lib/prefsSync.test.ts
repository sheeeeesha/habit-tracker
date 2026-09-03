import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  applyRemoteProfile,
  PORTABLE_PREF_KEYS,
  portablePrefs,
  readState,
  resetAll,
  setName,
  setPrefs,
  subscribeToLocalChanges,
} from "./store";

/** Lets the wall clock move, so a stamped write is distinguishable from an
 * unstamped one. Without this the two `setPrefs` calls below land in the same
 * millisecond and the assertion passes even when the guard is removed. */
const tick = () => new Promise((r) => setTimeout(r, 2));

/**
 * Which preferences travel, and when the clock that carries them moves.
 *
 * The subtle rule is the second one. Only a portable preference advances
 * `prefsUpdatedAt`. If a device-scoped edit advanced it too, dismissing a
 * banner on a laptop would carry a newer timestamp than a model chosen on a
 * phone and silently overwrite it — a bug that would look like the setting
 * "not syncing" rather than like a clobber.
 */

describe("portable preferences", () => {
  beforeEach(() => {
    resetAll();
  });

  it("carries exactly the settings that follow a person", () => {
    assert.deepEqual(
      [...PORTABLE_PREF_KEYS].sort(),
      ["aiInsights", "aiModel", "aiProvider", "reduceMotion"],
    );
  });

  it("never carries the API key", () => {
    // Syncing it would write a live key into the database at rest.
    setPrefs({ aiApiKey: "sk-secret", aiInsights: true });
    const carried = portablePrefs(readState().prefs) as Record<string, unknown>;
    assert.equal(carried.aiApiKey, undefined);
    assert.ok(!JSON.stringify(carried).includes("sk-secret"));
  });

  it("never carries device facts", () => {
    const carried = portablePrefs(readState().prefs) as Record<string, unknown>;
    for (const local of [
      "installed",
      "installRequested",
      "installDismissedUntil",
      "iconBadge",
      "backfillDismissedOn",
      "aiSessionId",
    ]) {
      assert.equal(carried[local], undefined, `${local} should stay on the device`);
    }
  });
});

describe("the preference clock", () => {
  beforeEach(() => {
    resetAll();
  });

  it("advances when a portable preference actually changes", () => {
    const before = readState().prefsUpdatedAt;
    setPrefs({ aiModel: "glm-5.3" });
    assert.ok(readState().prefsUpdatedAt > before);
  });

  it("does NOT advance for a device-scoped preference", async () => {
    // The regression this guards: dismissing a banner outranking, and
    // overwriting, a model chosen on another device.
    setPrefs({ aiModel: "glm-5.3" });
    const after = readState().prefsUpdatedAt;
    await tick();

    setPrefs({ installDismissedUntil: Date.now() + 1000 });
    setPrefs({ iconBadge: true });
    setPrefs({ backfillDismissedOn: "2026-09-03" });
    setPrefs({ aiApiKey: "sk-local-only" });

    assert.equal(readState().prefsUpdatedAt, after, "a local-only edit moved the clock");
  });

  it("does NOT advance when a portable value is set to what it already was", async () => {
    setPrefs({ aiInsights: true });
    const after = readState().prefsUpdatedAt;
    await tick();
    setPrefs({ aiInsights: true });
    assert.equal(readState().prefsUpdatedAt, after, "a no-op write moved the clock");
  });
});

describe("adopting a remote profile", () => {
  beforeEach(() => {
    resetAll();
  });

  it("applies the incoming values and keeps their timestamps", () => {
    // Restamping would make every pull look like a fresh local edit and win
    // the next comparison, ping-ponging the setting between devices.
    applyRemoteProfile({
      name: "Anmol",
      nameUpdatedAt: 5_000,
      prefs: { aiModel: "kimi-k3", aiInsights: true },
      prefsUpdatedAt: 7_000,
    });
    const s = readState();
    assert.equal(s.name, "Anmol");
    assert.equal(s.nameUpdatedAt, 5_000);
    assert.equal(s.prefs.aiModel, "kimi-k3");
    assert.equal(s.prefsUpdatedAt, 7_000);
  });

  it("leaves device-scoped preferences alone", () => {
    setPrefs({ aiApiKey: "sk-mine", iconBadge: true });
    applyRemoteProfile({ prefs: { aiModel: "glm-5.2" }, prefsUpdatedAt: 9_000 });
    const p = readState().prefs;
    assert.equal(p.aiApiKey, "sk-mine", "a pull overwrote the local key");
    assert.equal(p.iconBadge, true);
    assert.equal(p.aiModel, "glm-5.2");
  });

  it("does not schedule another sync", () => {
    // Adopting a pulled value is not a local edit; treating it as one makes
    // every sync trigger the next.
    let fired = 0;
    const stop = subscribeToLocalChanges(() => {
      fired += 1;
    });
    applyRemoteProfile({ prefs: { aiModel: "hy3" }, prefsUpdatedAt: 3_000 });
    assert.equal(fired, 0);

    // A real local edit still notifies.
    setName("Someone");
    assert.ok(fired > 0);
    stop();
  });
});
