import type { SyncStatus } from "./sync/useSync";

/**
 * Whether to offer signing in.
 *
 * Pulled out of the component so the rule can be tested, because the version
 * that shipped was wrong in a way that only appeared on a real device: it
 * asked `status === "signed-out"`.
 *
 * `status` is about the *sync*, not the person. It passes through "syncing" on
 * every run and lands on "offline" or "error" when one fails, and none of
 * those equal "signed-out" — so the offer disappeared mid-sync and stayed gone
 * after any failure, for somebody who had never signed in at all. On screen it
 * looked like the banner flashing up and vanishing.
 *
 * Whether there is a session is a separate fact that does not move while a
 * sync runs, so it is now asked separately. The only thing `status` is still
 * consulted for is "disabled", which means this deployment has no Supabase
 * project and there is nothing behind the button.
 */
export function shouldOfferSignIn(input: {
  /** False until `getSession` has answered; nothing is known before then. */
  ready: boolean;
  status: SyncStatus;
  signedIn: boolean;
  dismissed: boolean;
}): boolean {
  const { ready, status, signedIn, dismissed } = input;
  return ready && status !== "disabled" && !signedIn && !dismissed;
}
