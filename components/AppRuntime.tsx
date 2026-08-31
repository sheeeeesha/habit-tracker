"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "@/lib/persistence";

/**
 * One-time browser setup: register the offline shell (Chromium needs a service
 * worker with a fetch handler to consider the app installable) and ask for
 * persistent storage so the habit history is skipped by eviction.
 */
export function AppRuntime() {
  useEffect(() => {
    const start = () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
          // Unsupported context (some in-app browsers) — the app still works.
        });
      }
      // Fire and forget: a refusal just means the data stays evictable, which
      // Settings reports rather than hiding.
      void requestPersistentStorage();
    };

    // After load, to keep this off the critical path.
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }, []);

  return null;
}
