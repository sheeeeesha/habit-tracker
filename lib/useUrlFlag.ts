"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/**
 * Reads a query-string flag as external state.
 *
 * The URL is a browser-only system just like localStorage, so reading it
 * through `useSyncExternalStore` keeps render pure and needs no effect: the
 * server snapshot is simply `false`, and the client picks up the real value
 * on hydration.
 */
export function useUrlFlag(name: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).has(name),
    () => false,
  );
}

/** Reads a query param's value as external state, like `useUrlFlag`. */
export function useUrlValue(name: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}

/** Drops a query param without a navigation — safe to call from a handler. */
export function clearUrlFlag(name: string) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}
