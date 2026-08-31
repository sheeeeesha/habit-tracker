"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * `beforeinstallprompt` is a Chromium-only event and it can fire before React
 * has mounted, so `app/layout.tsx` stashes it on `window` from an inline script
 * and re-broadcasts it as `installpromptready`. This hook just reads that.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

declare global {
  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __appInstalled?: boolean;
  }
}

export type InstallPlatform =
  | "chromium" // Android / desktop Chrome, Edge, Samsung Internet — one-tap install
  | "ios" // iOS & iPadOS — manual Share ▸ Add to Home Screen
  | "unsupported"; // Firefox desktop, Safari macOS, …

export interface InstallState {
  /** True once the app is running from the home-screen icon. */
  isStandalone: boolean;
  /** True when a native install prompt is queued and ready to fire. */
  canPrompt: boolean;
  platform: InstallPlatform;
  /** iOS shows different share affordances in Safari vs Chrome/Firefox. */
  iosBrowser: "safari" | "other";
  /**
   * Wall clock sampled on mount and whenever the tab is shown again. Reading
   * `Date.now()` during render is impure, so snooze windows compare against
   * this instead.
   */
  now: number;
  ready: boolean;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    // iOS Safari's non-standard flag.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, so fall back to touch-point sniffing.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function useInstall() {
  const [state, setState] = useState<InstallState>({
    isStandalone: false,
    canPrompt: false,
    platform: "unsupported",
    iosBrowser: "safari",
    now: 0,
    ready: false,
  });

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = detectIOS();
    const iosBrowser: "safari" | "other" =
      ios && /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "other" : "safari";

    const sync = () => {
      const standalone = detectStandalone() || window.__appInstalled === true;
      const hasPrompt = !!window.__deferredInstallPrompt;
      setState({
        isStandalone: standalone,
        canPrompt: hasPrompt && !standalone,
        platform: hasPrompt ? "chromium" : ios ? "ios" : "unsupported",
        iosBrowser,
        now: Date.now(),
        ready: true,
      });
    };

    sync();

    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener("change", sync);
    window.addEventListener("installpromptready", sync);
    window.addEventListener("installcompleted", sync);
    // Coming back from the OS install sheet is a visibility change.
    document.addEventListener("visibilitychange", sync);

    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("installpromptready", sync);
      window.removeEventListener("installcompleted", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  /**
   * Fires the real Chromium install sheet. Returns the user's choice, or
   * `unavailable` when there was no queued prompt (e.g. on iOS).
   */
  const promptInstall = useCallback(async (): Promise<
    "accepted" | "dismissed" | "unavailable"
  > => {
    const evt = window.__deferredInstallPrompt;
    if (!evt) return "unavailable";
    try {
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      // The event is single-use — Chromium will hand us a fresh one if the
      // user dismisses and stays eligible.
      window.__deferredInstallPrompt = null;
      setState((s) => ({ ...s, canPrompt: false }));
      return outcome;
    } catch {
      return "dismissed";
    }
  }, []);

  return { ...state, promptInstall };
}
