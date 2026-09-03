"use client";

import { useCallback, useMemo, useState } from "react";
import { ensureAiSessionId, readState } from "./store";
import { buildInsightPayload, payloadKey, type InsightPayload } from "./insightPayload";
import type { HabitAnalytics } from "./analytics";
import type { Habit } from "./types";

/**
 * A written reading of one habit's statistics.
 *
 * Cached against a hash of the exact numbers that produced it. Two things fall
 * out of that, and both matter more than the saved request: opening the page
 * repeatedly costs one call rather than one per visit, and a reading can never
 * be displayed beside figures it was not written about — when a check-in
 * changes the numbers, the key changes and the stale reading is simply gone
 * rather than quietly describing yesterday.
 *
 * Cached in its own localStorage key, well away from the habit store. This is
 * derived, disposable, and safe to lose.
 */

const CACHE_KEY = "streakwrapped.insights.v1";
const MAX_CACHED = 40;

export interface AiInsight {
  headline: string;
  reading: string;
  suggestion: string;
  basis: string;
}

type CacheShape = Record<string, AiInsight>;

function readCache(): CacheShape {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheShape) : {};
  } catch {
    return {};
  }
}

function writeCache(next: CacheShape) {
  try {
    // Bounded: this is a convenience cache, not a record of anything.
    const entries = Object.entries(next).slice(-MAX_CACHED);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Full or unavailable. The reading still works, it just re-asks.
  }
}

export type InsightStatus = "idle" | "loading" | "ready" | "error";

/**
 * Flat rather than a discriminated union on purpose: a cached reading stays on
 * screen while a re-read is in flight, so `insight` and a non-idle `status`
 * legitimately coexist and narrowing on status would hide the cached one.
 */
export interface InsightState {
  status: InsightStatus;
  insight: AiInsight | null;
  error: string | null;
}

export function useAiInsight(habit: Habit | null, stats: HabitAnalytics | null) {
  /**
   * The result of a request, tagged with the numbers it was written about.
   *
   * Tagging is what makes the effect unnecessary. When a check-in changes the
   * figures the key changes, this result stops matching, and the reading falls
   * away on its own — no synchronisation step, and no window in which a
   * paragraph about yesterday sits above today's charts.
   */
  const [result, setResult] = useState<{ key: string; state: InsightState } | null>(
    null,
  );

  // The model is part of the key: switching model must not show the previous
  // model's reading as though it were the new one's.
  const model = readState().prefs.aiModel;
  const key =
    habit && stats ? `${model}:${payloadKey(buildInsightPayload(habit, stats))}` : null;

  // Safe to read storage during render here: this component only mounts once
  // the store has hydrated, so it never takes part in hydration itself.
  const cached = useMemo(() => (key ? (readCache()[key] ?? null) : null), [key]);

  const current = result?.key === key ? result.state : null;
  const insight = current?.insight ?? cached;
  const status: InsightStatus = current?.status ?? "idle";
  const error = current?.error ?? null;

  const request = useCallback(async () => {
    if (!habit || !stats || !key) return;

    const payload: InsightPayload = buildInsightPayload(habit, stats);
    const previous = readCache()[key] ?? null;
    // A cached reading stays on screen while the new one is fetched.
    setResult({ key, state: { status: "loading", insight: previous, error: null } });

    const fail = (message: string) =>
      setResult({ key, state: { status: "error", insight: previous, error: message } });

    try {
      // The key travels in a header rather than the body so it cannot land
      // in a request-body log next to the statistics.
      const prefs = readState().prefs;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (prefs.aiApiKey) {
        headers["x-insight-key"] = prefs.aiApiKey;
        headers["x-insight-provider"] = prefs.aiProvider;
        headers["x-insight-model"] = prefs.aiModel;
        headers["x-insight-session"] = ensureAiSessionId();
      }

      const res = await fetch("/api/insight", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        fail(typeof body?.error === "string" ? body.error : "That didn't work.");
        return;
      }

      const fresh = body as AiInsight;
      writeCache({ ...readCache(), [key]: fresh });
      setResult({ key, state: { status: "ready", insight: fresh, error: null } });
    } catch {
      fail("Couldn't reach the server.");
    }
  }, [habit, stats, key]);

  return { status, insight, error, request };
}
