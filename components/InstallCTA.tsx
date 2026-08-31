"use client";

import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import { useInstall } from "@/lib/useInstall";
import { useStore } from "@/lib/store";
import { haptic } from "@/lib/confetti";
import { Export, ICON_WEIGHT, PlusSquare } from "./icons";

/** How long a dismissal sticks before the banner is allowed back. */
const SNOOZE_DAYS = 14;

/** iOS renders the share action as a box with an arrow leaving it. */
const ShareIcon = () => <Export size={20} weight={ICON_WEIGHT} aria-hidden />;
const PlusSquareIcon = () => <PlusSquare size={20} weight={ICON_WEIGHT} aria-hidden />;

/**
 * Decides whether the add-to-home-screen CTA should be on screen at all.
 *
 * Once the app is actually installed the CTA never returns on its own — the
 * only way back is the menu, which flips `installRequested`.
 */
export function useInstallCTA() {
  const { state, setPrefs } = useStore();
  const install = useInstall();
  const { prefs } = state;

  // Remember an install permanently, however we found out about it.
  useEffect(() => {
    if (install.isStandalone && !prefs.installed) {
      setPrefs({ installed: true, installRequested: false });
    }
  }, [install.isStandalone, prefs.installed, setPrefs]);

  const supported = install.platform !== "unsupported";
  // `install.now` is sampled in an effect, so this stays pure during render.
  const snoozed = install.now < prefs.installDismissedUntil;
  const visible =
    install.ready &&
    supported &&
    !install.isStandalone &&
    (prefs.installRequested || (!prefs.installed && !snoozed));

  return { install, visible, prefs, setPrefs };
}

interface InstallCTAProps {
  /** Rendered inline in the habit feed. */
  variant?: "banner";
}

export function InstallCTA({ variant = "banner" }: InstallCTAProps) {
  const { install, visible, setPrefs } = useInstallCTA();
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!visible && !showIosHelp) return null;

  async function handleInstall() {
    haptic(12);
    if (install.platform === "ios") {
      setShowIosHelp(true);
      return;
    }
    setBusy(true);
    const outcome = await install.promptInstall();
    setBusy(false);
    if (outcome === "accepted") {
      setPrefs({ installed: true, installRequested: false });
    } else if (outcome === "unavailable") {
      // The queued prompt expired — fall back to manual instructions.
      setShowIosHelp(true);
    }
  }

  function dismiss() {
    setPrefs({
      installDismissedUntil: Date.now() + SNOOZE_DAYS * 86_400_000,
      installRequested: false,
    });
  }

  return (
    <>
      {visible && variant === "banner" && (
        <section
          aria-labelledby="install-cta-heading"
          className="relative overflow-hidden rounded-[1.75rem] bg-acid p-5 text-[#121a00] animate-rise"
        >
          {/* Decorative squiggle, straight out of the Wrapped poster language. */}
          <svg
            aria-hidden
            viewBox="0 0 200 200"
            className="pointer-events-none absolute -top-8 -right-10 h-44 w-44 opacity-20"
          >
            <path
              d="M10 100c0-40 30-70 60-40s30 90 70 60 40-80 50-90"
              fill="none"
              stroke="currentColor"
              strokeWidth="14"
              strokeLinecap="round"
            />
          </svg>

          <div className="relative">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] opacity-60">
              One tap away
            </p>
            <h2 id="install-cta-heading" className="display-md mt-1.5 max-w-[16ch]">
              Put it on your home screen
            </h2>
            <p className="mt-2 max-w-[38ch] text-sm font-medium leading-relaxed opacity-70">
              {install.platform === "ios"
                ? "Add StreakWrapped to your home screen and it opens full screen, works offline, and never asks again."
                : "Installs like a real app: full screen, offline-ready, one tap from your home screen."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleInstall}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[#121a00] px-5 py-3 text-sm font-bold text-acid transition active:scale-95 disabled:opacity-60"
              >
                {install.platform === "ios" ? <ShareIcon /> : <PlusSquareIcon />}
                {busy ? "Opening…" : "Add to home screen"}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full px-4 py-3 text-sm font-semibold opacity-55 transition hover:bg-black/8 hover:opacity-100 active:scale-95"
              >
                Not now
              </button>
            </div>
          </div>
        </section>
      )}

      <Sheet
        open={showIosHelp}
        onClose={() => setShowIosHelp(false)}
        title="Add to home screen"
        description="Three taps and StreakWrapped lives next to your other apps."
        footer={
          <button
            type="button"
            onClick={() => {
              // They followed the steps, so stop nagging on this device.
              setPrefs({ installed: true, installRequested: false });
              setShowIosHelp(false);
            }}
            className="w-full rounded-2xl bg-acid px-5 py-3.5 text-base font-bold text-[#121a00] transition active:scale-[0.98]"
          >
            Done, it&rsquo;s on my home screen
          </button>
        }
      >
        <ol className="space-y-3">
          {[
            {
              icon: <ShareIcon />,
              title: "Tap the Share button",
              body:
                install.iosBrowser === "safari"
                  ? "It is the square with an arrow, in the bar at the bottom of Safari."
                  : "Open your browser menu and choose Share. For the smoothest result, open this page in Safari first.",
            },
            {
              icon: <PlusSquareIcon />,
              title: "Choose “Add to Home Screen”",
              body: "Scroll down the share sheet — it sits below the row of apps.",
            },
            {
              icon: <span className="text-base font-bold">3</span>,
              title: "Tap Add",
              body: "The icon lands on your home screen and opens without any browser chrome.",
            },
          ].map((step, i) => (
            <li key={i} className="flex gap-3.5 rounded-2xl border border-white/10 bg-white/4 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-acid text-[#121a00]">
                {step.icon}
              </span>
              <span>
                <span className="block text-[0.9375rem] font-semibold text-bone">
                  {step.title}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-bone/55">
                  {step.body}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-xs leading-relaxed text-bone/35">
          Your habits are stored on this device. Adding the app to your home screen
          keeps the same data &mdash; nothing is uploaded anywhere.
        </p>
      </Sheet>
    </>
  );
}
