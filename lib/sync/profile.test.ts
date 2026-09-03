import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveProfile, type LocalProfile } from "./profile";
import type { Prefs } from "../types";

const PREFS: Prefs = {
  reduceMotion: false,
  installed: false,
  installRequested: false,
  installDismissedUntil: 0,
  signInDismissedUntil: 0,
  iconBadge: false,
  backfillDismissedOn: "",
  aiInsights: false,
  aiProvider: "anthropic",
  aiModel: "",
  aiApiKey: "",
  aiSessionId: "",
};

function local(
  over: Omit<Partial<LocalProfile>, "prefs"> & { prefs?: Partial<Prefs> } = {},
): LocalProfile {
  return {
    name: "",
    nameUpdatedAt: 0,
    prefsUpdatedAt: 0,
    ...over,
    prefs: { ...PREFS, ...over.prefs },
  };
}

describe("resolving a profile against the account", () => {
  it("pushes when this device edited more recently", () => {
    const r = resolveProfile(
      { portable_prefs: { aiModel: "old" }, portable_prefs_updated_at: 100 },
      local({ prefs: { aiModel: "new" }, prefsUpdatedAt: 200 }),
    );
    assert.deepEqual(r.outgoing?.portable_prefs, {
      reduceMotion: false,
      aiInsights: false,
      aiProvider: "anthropic",
      aiModel: "new",
    });
    assert.equal(r.outgoing?.portable_prefs_updated_at, 200);
    assert.equal(r.incoming, null);
  });

  it("adopts when the account is newer", () => {
    // The reported symptom: a setting changed on the desktop that never
    // appears on the phone, however many times it syncs.
    const r = resolveProfile(
      {
        portable_prefs: { aiModel: "chosen-elsewhere", aiInsights: true },
        portable_prefs_updated_at: 900,
      },
      local({ prefs: { aiModel: "stale" }, prefsUpdatedAt: 100 }),
    );
    assert.equal(r.outgoing, null);
    assert.equal(r.incoming?.prefs?.aiModel, "chosen-elsewhere");
    assert.equal(r.incoming?.prefs?.aiInsights, true);
    assert.equal(r.incoming?.prefsUpdatedAt, 900, "must keep the remote stamp");
  });

  it("does nothing when both sides already agree", () => {
    const r = resolveProfile(
      {
        display_name: "Anmol",
        display_name_updated_at: 10,
        portable_prefs: {
          reduceMotion: false,
          aiInsights: true,
          aiProvider: "anthropic",
          aiModel: "m",
        },
        portable_prefs_updated_at: 20,
      },
      local({
        name: "Anmol",
        nameUpdatedAt: 10,
        prefs: { aiInsights: true, aiModel: "m" },
        prefsUpdatedAt: 20,
      }),
    );
    assert.equal(r.outgoing, null);
    assert.equal(r.incoming, null);
  });

  it("writes nothing for a fresh device against a fresh account", () => {
    // Defaults on both sides. Pushing them would stamp an account that has
    // never had a preference set, and then outrank a real edit made later
    // somewhere else.
    const r = resolveProfile({}, local());
    assert.equal(r.outgoing, null);
    assert.equal(r.incoming, null);
  });

  it("adopts the account's settings on a device that has never set one", () => {
    const r = resolveProfile(
      { portable_prefs: { aiInsights: true, aiModel: "m" }, portable_prefs_updated_at: 5 },
      local(),
    );
    assert.equal(r.incoming?.prefs?.aiInsights, true);
    assert.equal(r.outgoing, null);
  });

  it("lets the account break an exact tie", () => {
    // Same millisecond, different values. Some rule has to decide, and it has
    // to be the same rule on every device or they will trade writes forever.
    const r = resolveProfile(
      { portable_prefs: { aiModel: "theirs" }, portable_prefs_updated_at: 500 },
      local({ prefs: { aiModel: "mine" }, prefsUpdatedAt: 500 }),
    );
    assert.equal(r.outgoing, null);
    assert.equal(r.incoming?.prefs?.aiModel, "theirs");
  });

  it("ignores fields a newer client may have added", () => {
    const r = resolveProfile(
      {
        portable_prefs: { aiModel: "m", futureSetting: "???" },
        portable_prefs_updated_at: 5,
      },
      local(),
    );
    assert.deepEqual(Object.keys(r.incoming?.prefs ?? {}).sort(), ["aiModel"]);
  });

  it("never sends the API key", () => {
    const r = resolveProfile(
      {},
      local({ prefs: { aiApiKey: "sk-live-secret", aiModel: "m" }, prefsUpdatedAt: 9 }),
    );
    assert.ok(r.outgoing, "expected a push to inspect");
    assert.ok(!JSON.stringify(r.outgoing).includes("sk-live-secret"));
  });

  it("never sends device facts", () => {
    const r = resolveProfile(
      {},
      local({
        prefs: { installed: true, iconBadge: true, backfillDismissedOn: "2026-09-03" },
        prefsUpdatedAt: 9,
      }),
    );
    const sent = JSON.stringify(r.outgoing ?? {});
    for (const k of ["installed", "iconBadge", "backfillDismissedOn", "aiSessionId"]) {
      assert.ok(!sent.includes(k), `${k} should not leave the device`);
    }
  });

  it("settles the name and the preferences in one write", () => {
    const r = resolveProfile(
      {},
      local({ name: "Anmol", nameUpdatedAt: 7, prefs: { aiModel: "m" }, prefsUpdatedAt: 8 }),
    );
    assert.equal(r.outgoing?.display_name, "Anmol");
    assert.ok(r.outgoing?.portable_prefs);
  });

  it("can push one side while adopting the other", () => {
    // A device that renamed itself yesterday but is behind on preferences.
    const r = resolveProfile(
      {
        display_name: "Old",
        display_name_updated_at: 1,
        portable_prefs: { aiModel: "theirs" },
        portable_prefs_updated_at: 999,
      },
      local({ name: "New", nameUpdatedAt: 500, prefs: { aiModel: "mine" }, prefsUpdatedAt: 2 }),
    );
    assert.equal(r.outgoing?.display_name, "New");
    assert.equal(r.outgoing?.portable_prefs, undefined);
    assert.equal(r.incoming?.prefs?.aiModel, "theirs");
    assert.equal(r.incoming?.name, undefined);
  });

  it("does not overwrite a real name with an empty one", () => {
    const r = resolveProfile({ display_name: "Anmol", display_name_updated_at: 5 }, local());
    assert.equal(r.outgoing, null);
    assert.equal(r.incoming?.name, "Anmol");
  });

  it("survives metadata of the wrong shape", () => {
    // user_metadata is a free-form JSON column; nothing stops another tool
    // from putting a string where an object belongs.
    const r = resolveProfile(
      {
        display_name: 42,
        display_name_updated_at: "yesterday",
        portable_prefs: "not-an-object",
        portable_prefs_updated_at: null,
      },
      local({ name: "Anmol", nameUpdatedAt: 5, prefsUpdatedAt: 6 }),
    );
    assert.equal(r.outgoing?.display_name, "Anmol");
    assert.equal(r.incoming, null);
  });
});
