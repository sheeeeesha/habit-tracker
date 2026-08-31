"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Aurora } from "@/components/Aurora";
import { Story, type StorySlide } from "@/components/wrapped/Story";
import { buildSlides } from "@/components/wrapped/slides";
import { accentOf } from "@/lib/palette";
import { useStore } from "@/lib/store";
import { buildWrapped } from "@/lib/wrapped";
import { shareWrapped } from "@/lib/shareCard";

export default function WrappedPage() {
  const router = useRouter();
  const { state, hydrated } = useStore();
  const [shareState, setShareState] = useState<"idle" | "working" | "saved">("idle");

  const stats = useMemo(
    () => buildWrapped(state.habits, state.log),
    [state.habits, state.log],
  );

  const reduceMotion = state.prefs.reduceMotion;

  const slides = useMemo<StorySlide[]>(() => {
    if (!stats.ready) return [];
    const base = buildSlides(stats, state.name, reduceMotion);
    const arche = accentOf(stats.archetype.accent);

    // Final slide: the shareable summary. No auto-advance past the end.
    base.push({
      id: "share",
      background: "#08070a",
      ink: "#f6f2e9",
      duration: 60_000,
      content: (
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] opacity-55">
            That&rsquo;s your Wrapped
          </p>
          <h2 className="display-lg mt-3">
            Keep
            <br />
            <span style={{ color: arche.hex }}>going</span>
          </h2>
          <p className="mt-5 text-base font-medium leading-relaxed opacity-70">
            {stats.totalCheckIns} check-ins and counting. Come back any time &mdash;
            this rebuilds itself from your real history.
          </p>

          <div className="mt-7 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={async () => {
                setShareState("working");
                const result = await shareWrapped(stats, state.name);
                setShareState(result === "downloaded" ? "saved" : "idle");
              }}
              disabled={shareState === "working"}
              className="w-full rounded-2xl px-5 py-4 text-base font-bold transition active:scale-[0.98] disabled:opacity-60"
              style={{ background: arche.hex, color: arche.ink }}
            >
              {shareState === "working"
                ? "Making your card…"
                : shareState === "saved"
                  ? "Saved to your downloads"
                  : "Share your card"}
            </button>
            <Link
              href="/"
              className="w-full rounded-2xl border border-white/15 px-5 py-4 text-center text-base font-semibold text-bone/75 transition hover:bg-white/8"
            >
              Back to today
            </Link>
          </div>
        </div>
      ),
    });
    return base;
  }, [stats, state.name, reduceMotion, shareState]);

  if (!hydrated) {
    return (
      <div className="grid min-h-svh place-items-center bg-ink">
        <span className="sr-only">Loading your Wrapped</span>
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-hyperpink" />
      </div>
    );
  }

  if (!stats.ready) {
    return (
      <>
        <Aurora />
        <main className="mx-auto grid min-h-svh w-full max-w-md place-items-center px-6">
          <div className="text-center">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-bone/40">
              Not yet
            </p>
            <h1 className="display-lg mt-3">
              Your Wrapped
              <br />
              is still
              <br />
              <span className="text-hyperpink">loading up</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[32ch] text-sm leading-relaxed text-bone/55">
              {state.habits.length === 0
                ? "Create your first habit and start checking in. Once there is a story to tell, it shows up here."
                : `${stats.checkInsNeeded} more check-in${
                    stats.checkInsNeeded === 1 ? "" : "s"
                  } and your Wrapped unlocks.`}
            </p>
            <Link
              href="/"
              className="mt-7 inline-block rounded-2xl bg-hyperpink px-8 py-3.5 text-base font-bold text-white transition active:scale-95"
            >
              Back to today
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <Story slides={slides} onExit={() => router.push("/")} reduceMotion={reduceMotion} />
  );
}
