import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldOfferSignIn } from "./signInOffer";
import type { SyncStatus } from "./sync/useSync";

/**
 * The rule behind the sign-in banner.
 *
 * Written after the first version failed on a real device in a way no test
 * here would have caught: it asked whether the *sync* said "signed-out", which
 * is false during every sync and after every failure. The banner appeared on
 * load and then vanished for good.
 */

const base = {
  ready: true,
  status: "signed-out" as SyncStatus,
  signedIn: false,
  dismissed: false,
};

describe("offering to sign in", () => {
  it("offers to somebody who is signed out", () => {
    assert.equal(shouldOfferSignIn(base), true);
  });

  it("keeps offering while a sync is in flight", () => {
    // The regression. A sync fires on every foreground and 2.5s after any
    // local change, so a rule that fails here is a banner that disappears
    // seconds after it appears.
    assert.equal(shouldOfferSignIn({ ...base, status: "syncing" }), true);
  });

  it("keeps offering after a sync fails", () => {
    // Worse than the flicker: these stick. The banner never came back.
    for (const status of ["error", "offline", "idle"] as SyncStatus[]) {
      assert.equal(shouldOfferSignIn({ ...base, status }), true, status);
    }
  });

  it("never offers to somebody who is signed in", () => {
    // Whatever the sync is doing, including failing.
    for (const status of [
      "signed-out",
      "syncing",
      "idle",
      "offline",
      "error",
    ] as SyncStatus[]) {
      assert.equal(
        shouldOfferSignIn({ ...base, signedIn: true, status }),
        false,
        status,
      );
    }
  });

  it("stays quiet until the session has actually been looked up", () => {
    // Nothing is known before `getSession` answers, and the default reads as
    // signed out — so acting early flashes this at every signed-in person on
    // every cold start.
    assert.equal(shouldOfferSignIn({ ...base, ready: false }), false);
  });

  it("stays quiet once dismissed", () => {
    assert.equal(shouldOfferSignIn({ ...base, dismissed: true }), false);
  });

  it("takes a dismissal as final", () => {
    // A cross is an answer. No status, and no amount of time, brings it back.
    for (const status of ["signed-out", "error", "offline"] as SyncStatus[]) {
      assert.equal(shouldOfferSignIn({ ...base, dismissed: true, status }), false);
    }
  });

  it("says nothing on a deployment with no account to offer", () => {
    // "disabled" is the one thing status is still consulted for: no Supabase
    // project, so there is nothing behind the button.
    assert.equal(shouldOfferSignIn({ ...base, status: "disabled" }), false);
  });
});
