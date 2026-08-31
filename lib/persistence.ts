"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Browsers evict "script-writable" storage under pressure, and WebKit caps it
 * at seven days of no interaction. An origin that has been granted persistent
 * storage is skipped by that eviction pass entirely, so we ask for it.
 *
 * Chromium and Safari decide silently from engagement heuristics (no prompt);
 * Firefox shows a permission popup. A refusal is not an error — it just means
 * the data is evictable, which the Settings sheet reports honestly.
 */

export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

const UNSUPPORTED: StorageStatus = {
  supported: false,
  persisted: false,
  usageBytes: null,
  quotaBytes: null,
};

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function readStorageStatus(): Promise<StorageStatus> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) {
    return UNSUPPORTED;
  }
  try {
    const persisted = await navigator.storage.persisted();
    let usageBytes: number | null = null;
    let quotaBytes: number | null = null;
    if (navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      usageBytes = usage ?? null;
      quotaBytes = quota ?? null;
    }
    return { supported: true, persisted, usageBytes, quotaBytes };
  } catch {
    return UNSUPPORTED;
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function useStorageStatus() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    readStorageStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  /** Ask the browser again, then re-read — bumping `tick` re-runs the effect. */
  const request = useCallback(async () => {
    await requestPersistentStorage();
    setTick((t) => t + 1);
  }, []);

  return { status, request };
}
