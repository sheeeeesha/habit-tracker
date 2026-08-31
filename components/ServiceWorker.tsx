"use client";

import { useEffect } from "react";

/** Registers the offline shell. Installability in Chromium needs this. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Unsupported context (some in-app browsers) — the app still works.
      });
    };
    // Registering after load keeps the SW off the critical path.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
