"use client";

import { useStore } from "@/lib/store";
import { shouldOfferSignIn } from "@/lib/signInOffer";
import { useSyncView } from "./SyncProvider";
import { haptic } from "@/lib/confetti";
import { CloudArrowUp, X, ICON_WEIGHT } from "./icons";

/**
 * Whether to offer signing in.
 *
 * Two things have to be true, and the first one is the whole lesson of this
 * file.
 *
 * `signedIn` — not `status === "signed-out"`, which is what this used to ask
 * and which was wrong in a way that only showed up on a real device. `status`
 * describes the *sync*: it passes through "syncing" on every run, and lands on
 * "offline" or "error" when one fails. None of those equal "signed-out", so
 * the offer vanished mid-sync and stayed gone after any failure — for somebody
 * who had never signed in at all. It looked like the banner flashing up and
 * disappearing. Whether there is a session is a separate, stable fact, so it
 * is now a separate, stable flag.
 *
 * Not dismissed — a cross is an answer, and it is taken as final. Signing out
 * later does not bring it back, which is the point of dismissing it.
 *
 * `ready` still gates the whole thing: nothing is known until `getSession`
 * answers, and acting early would flash this at every signed-in person on
 * every cold start.
 *
 * Deliberately *not* conditional on the install banner. It used to be, and on
 * a phone that had not installed the app yet, that hid this permanently.
 */
export function useSignInCTA() {
  const { state, setPrefs } = useStore();
  const { signedIn, ready, status } = useSyncView();

  const visible = shouldOfferSignIn({
    ready,
    status,
    signedIn,
    dismissed: state.prefs.signInDismissed,
  });

  return { visible, setPrefs };
}

export function SignInCTA({ onSignIn }: { onSignIn: () => void }) {
  const { visible, setPrefs } = useSignInCTA();
  if (!visible) return null;

  return (
    <section
      aria-labelledby="signin-cta-heading"
      className="relative overflow-hidden rounded-[1.75rem] border border-white/12 bg-white/5 p-5 animate-rise"
    >
      <button
        type="button"
        onClick={() => setPrefs({ signInDismissed: true })}
        aria-label="Dismiss"
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-bone/35 transition hover:bg-white/10 hover:text-bone/80 active:scale-90"
      >
        <X size={16} weight={ICON_WEIGHT} aria-hidden />
      </button>

      <div className="flex items-start gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/8 text-bone/70">
          <CloudArrowUp size={20} weight={ICON_WEIGHT} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-bone/40">
            Only on this device
          </p>
          {/* Room for the cross, so a long heading cannot run under it. */}
          <h2
            id="signin-cta-heading"
            className="mt-1 pr-6 text-lg font-bold leading-tight text-bone"
          >
            Keep your streaks if this phone doesn&rsquo;t
          </h2>
          <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-bone/55">
            Your habits live in this browser and nowhere else, so clearing site
            data takes them with it. Signing in mirrors them to an account only
            you can read.
          </p>

          <button
            type="button"
            onClick={() => {
              haptic(12);
              onSignIn();
            }}
            className="mt-4 rounded-full bg-bone px-5 py-2.5 text-sm font-bold text-ink transition active:scale-95"
          >
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}
