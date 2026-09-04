"use client";

import { Sparkle, ICON_WEIGHT } from "./icons";
import { AutomaticityChart, RecoveryBar, TrendChart, WeekdayChart } from "./charts";
import { chartAvailable } from "@/lib/insightCharts";
import type { ChartKind } from "@/lib/insightRequest";
import { useAiInsight } from "@/lib/useAiInsight";
import { useStore } from "@/lib/store";
import { findModel } from "@/lib/insightModels";
import { worthAsking } from "@/lib/insightPayload";
import type { HabitAnalytics } from "@/lib/analytics";
import type { Habit } from "@/lib/types";

interface InsightReadingProps {
  habit: Habit;
  stats: HabitAnalytics;
  color: string;
  /** Off until someone turns it on in Settings — nothing leaves the device otherwise. */
  enabled: boolean;
}

/**
 * Draws the chart an observation asked for.
 *
 * Every one of these is fed from `stats` — the same figures the panels above
 * are drawn from. The model's only input is which of the four to show.
 */
function Chart({
  kind,
  stats,
  color,
}: {
  kind: ChartKind;
  stats: HabitAnalytics;
  color: string;
}) {
  switch (kind) {
    case "automaticity":
      return <AutomaticityChart repetitions={stats.automaticity.repetitions} color={color} />;
    case "trend":
      return <TrendChart points={stats.trend} color={color} />;
    case "weekday":
      return <WeekdayChart rates={stats.weekdays} color={color} />;
    case "recovery":
      return (
        <RecoveryBar
          recovered={stats.recovery.recovered}
          slipped={stats.recovery.slipped}
          color={color}
        />
      );
  }
}

/**
 * A written reading of the panels above it.
 *
 * Asked for, never automatic. It costs a request and it sends the habit's name
 * off the device, so it happens when someone presses the button and not
 * because they opened a page.
 */
export function InsightReading({ habit, stats, color, enabled }: InsightReadingProps) {
  const { status, insight, error, request } = useAiInsight(
    enabled ? habit : null,
    enabled ? stats : null,
  );
  const { state } = useStore();
  // Name the model that actually wrote it, rather than assuming Claude.
  const modelLabel =
    findModel(state.prefs.aiModel)?.label ?? state.prefs.aiModel ?? "a model";

  if (!enabled || !worthAsking(stats)) return null;

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
          What this looks like
        </h2>
        <span className="shrink-0 text-[0.625rem] text-bone/25">written by {modelLabel}</span>
      </div>

      {insight ? (
        <>
          <p className="display-md" style={{ color }}>
            {insight.headline}
          </p>

          <ul className="mt-3 space-y-2.5">
            {insight.observations.map((o, i) => (
              <li
                key={i}
                className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3.5"
              >
                <p className="text-[0.9375rem] font-semibold leading-snug text-bone">
                  {o.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-bone/65">{o.body}</p>

                {/* Drawn here from the same figures as the panels above, never
                    from anything the model sent. It picked which chart; the
                    numbers in it are the app's own. */}
                {o.chart && chartAvailable(o.chart, stats) && (
                  <div className="mt-3">
                    <Chart kind={o.chart} stats={stats} color={color} />
                  </div>
                )}

                {/* The figure it leaned on, so each point can be checked
                    against the charts rather than taken on trust. */}
                <p className="mt-2.5 text-xs leading-relaxed text-bone/35">
                  Based on: {o.basis}
                </p>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => void request()}
            disabled={status === "loading"}
            className="mt-3 rounded-full border border-white/12 px-3.5 py-1.5 text-xs font-semibold text-bone/55 transition hover:bg-white/10 hover:text-bone active:scale-95 disabled:opacity-50"
          >
            {status === "loading" ? "Reading…" : "Read it again"}
          </button>
        </>
      ) : status === "loading" ? (
        <div className="space-y-2.5" aria-live="polite">
          <span className="sr-only">Reading your numbers</span>
          <div className="h-6 w-2/3 animate-pulse rounded-lg bg-white/10" />
          <div className="h-4 w-full animate-pulse rounded bg-white/8" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-white/8" />
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-bone/55">
            Everything above is computed on this device. This asks {modelLabel}{" "}
            to read those same figures back and pick out two or three things
            that stand out. It is given the numbers, never your check-ins; each
            point cites the figure it rests on, and any chart beside it is
            drawn here from that same figure rather than by the model.
          </p>
          {status === "error" && (
            <p className="mt-2 text-xs font-medium text-hyperpink">{error}</p>
          )}
          <button
            type="button"
            onClick={() => void request()}
            className="mt-3 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition active:scale-95"
            style={{ background: color, color: "#08070a" }}
          >
            <Sparkle size={16} weight={ICON_WEIGHT} aria-hidden />
            {status === "error" ? "Try again" : "Read my numbers"}
          </button>
        </>
      )}
    </section>
  );
}
