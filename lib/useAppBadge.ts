"use client";

import { useCallback, useEffect } from "react";

/**
 * The count of outstanding habits, on the installed app's icon.
 *
 * This is as close as a web app gets to a home-screen widget. Widgets proper
 * are native extensions — WidgetKit on iOS, App Widgets on Android — and there
 * is no web API for them on either platform. The badge is the one piece of
 * live data a website can put on a home screen.
 *
 * Platform differences worth knowing, because they change what the number is
 * worth:
 *
 *  - iOS 16.4+ shows the actual number, but only for a web app added to the
 *    home screen, and only once notification permission has been granted.
 *    Safari tabs never show it.
 *  - Android Chrome shows a dot, not the number.
 *  - Desktop Chrome and Edge show the number.
 */

export function badgingSupported(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}

/**
 * iOS gates the badge behind notification permission even though nothing is
 * ever notified. Asking has to come from a user gesture, so this is called
 * from the Settings toggle rather than on load.
 */
export async function requestBadgePermission(): Promise<boolean> {
  if (!badgingSupported()) return false;
  if (typeof Notification === "undefined") return true; // Nothing to ask.
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/**
 * Keeps the badge in step with `count`.
 *
 * Silently does nothing where badging is unsupported or the app is only open
 * in a browser tab — there is no failure state worth surfacing for a
 * decoration on an icon that may not exist.
 */
export function useAppBadge(count: number, enabled: boolean) {
  const apply = useCallback(async (value: number, on: boolean) => {
    // The DOM types declare these unconditionally; the runtime does not.
    if (!badgingSupported()) return;
    try {
      if (!on || value <= 0) await navigator.clearAppBadge();
      else await navigator.setAppBadge(value);
    } catch {
      // Permission refused, or a platform that exposes the method and then
      // declines to honour it. Not worth reporting.
    }
  }, []);

  useEffect(() => {
    void apply(count, enabled);
  }, [count, enabled, apply]);

  // Clear on unmount so a stale number cannot outlive the app being closed
  // with everything already done.
  useEffect(() => {
    return () => {
      if (!badgingSupported()) return;
      void navigator.clearAppBadge().catch(() => {});
    };
  }, []);
}
