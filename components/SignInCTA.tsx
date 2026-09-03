"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useSyncView } from "./SyncProvider";
import { haptic } from "@/lib/confetti";
import { CloudArrowUp, ICON_WEIGHT } from "./icons";

/** How long a dismissal sticks before the banner is allowed back. */
const SNOOZE_DAYS = 21;

/**
 * Whether to offer signing in.
 *
 * Three things have to be true, and each rules out a way of getting this
 * wrong:
 *
 * `ready` — `status` reads "signed-out" before the session has been looked up,
 * because that is the right thing to render while nothing is known. Acting on
 * it early would flash this at every signed-in person on every cold start.
 *
 * `status === "signed-out"` — not merely "no `userId` locally". A session can
 * be revoked or expire server-side, and the status is what actually knows.
 * Signing out puts the offer back, which is why nothing needs to re-arm it the
 * way the install CTA does.
 *
 * Not snoozed — dismissing it is an answer, and asking again tomorrow would
 * make it noise rather than an offer.
 *
 * `status` is also "disabled" on a deployment with no Supabase project, which
 * excludes it here: there would be nothing behind the button.
 */
export function useSignInCTA() {
  const { state, setPrefs } = useStore();
  const { status, ready } = useSyncView();

  // Sampled in an effect rather than read during render: `Date.now()` is
  // impure, and a component that renders differently depending on when React
  // happened to call it is a bug waiting for a slow frame. Re-sampled when the
  // tab comes back, because an installed app is often left open for weeks and
  // would otherwise compare against the clock from whenever it was launched.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const sample = () => setNow(Date.now());
    sample();
    document.addEventListener("visibilitychange", sample);
    return () => document.removeEventListener("visibilitychange", sample);
  }, []);

  const visible =
    ready && status === "signed-out" && now >= state.prefs.signInDismissedUntil;
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
      <div className="flex items-start gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/8 text-bone/70">
          <CloudArrowUp size={20} weight={ICON_WEIGHT} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-bone/40">
            Only on this device
          </p>
          <h2 id="signin-cta-heading" className="mt-1 text-lg font-bold leading-tight text-bone">
            Keep your streaks if this phone doesn&rsquo;t
          </h2>
          <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-bone/55">
            Your habits live in this browser and nowhere else, so clearing site
            data takes them with it. Signing in mirrors them to an account only
            you can read.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                haptic(12);
                onSignIn();
              }}
              className="rounded-full bg-bone px-5 py-2.5 text-sm font-bold text-ink transition active:scale-95"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() =>
                setPrefs({
                  signInDismissedUntil: Date.now() + SNOOZE_DAYS * 86_400_000,
                })
              }
              className="rounded-full px-4 py-2.5 text-sm font-semibold text-bone/45 transition hover:bg-white/8 hover:text-bone/80 active:scale-95"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
