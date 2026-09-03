"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Aurora } from "@/components/Aurora";
import { InsightReading } from "@/components/InsightReading";
import { HabitTile } from "@/components/HabitGlyph";
import { CaretLeft, ICON_WEIGHT } from "@/components/icons";
import {
  AutomaticityChart,
  RecoveryBar,
  TrendChart,
  WeekdayChart,
  YearHeatmap,
  type HeatCell,
} from "@/components/charts";
import {
  analyseHabit,
  AUTOMATICITY_MEDIAN_REPS,
  type HabitAnalytics,
} from "@/lib/analytics";
import { addDays, dateKey, today } from "@/lib/date";
import { describeCadence } from "@/lib/habits";
import { countOn } from "@/lib/log";
import { accentOf } from "@/lib/palette";
import { isScheduledOn } from "@/lib/streak";
import { useStore } from "@/lib/store";
import { isActive, type Habit } from "@/lib/types";

/**
 * Below this there is not enough history for a rate to mean anything, and a
 * chart drawn from four data points invites conclusions the data cannot carry.
 */
const MIN_PERIODS = 10;

function Card({
  title,
  source,
  children,
  note,
}: {
  title: string;
  /** The finding this panel exists because of. */
  source?: string;
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
          {title}
        </h2>
        {source && (
          <span className="shrink-0 text-[0.625rem] text-bone/25">{source}</span>
        )}
      </div>
      {children}
      {note && (
        <p className="mt-3 text-xs leading-relaxed text-bone/45">{note}</p>
      )}
    </section>
  );
}

function Figure({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <div>
      <div
        className="font-display text-3xl leading-none tabular-nums sm:text-4xl"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[0.625rem] font-semibold uppercase leading-tight tracking-wider text-bone/40">
        {label}
      </div>
    </div>
  );
}

export default function InsightsPage() {
  const { state, habits, hydrated } = useStore();
  const active = useMemo(() => habits.filter(isActive), [habits]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const habit: Habit | null =
    active.find((h) => h.id === selectedId) ?? active[0] ?? null;

  const stats: HabitAnalytics | null = useMemo(
    () => (habit ? analyseHabit(habit, state.log) : null),
    [habit, state.log],
  );

  const heat: HeatCell[] = useMemo(() => {
    if (!habit) return [];
    // A whole year, aligned so each column is a Monday-to-Sunday week.
    const end = today();
    const start = addDays(end, -363);
    const lead = (start.getDay() + 6) % 7;
    const from = addDays(start, -lead);
    const cells: HeatCell[] = [];
    for (let d = from; d <= end; d = addDays(d, 1)) {
      const key = dateKey(d);
      if (key < habit.startDate || !isScheduledOn(habit, d)) {
        cells.push({ key, level: null });
        continue;
      }
      const need = habit.cadence === "daily" ? habit.target : 1;
      cells.push({ key, level: Math.min(1, countOn(state.log, habit.id, key) / need) });
    }
    return cells;
  }, [habit, state.log]);

  if (!hydrated) {
    return (
      <>
        <Aurora />
        <div className="grid min-h-svh place-items-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-hyperpink" />
        </div>
      </>
    );
  }

  const accent = accentOf(habit?.accent ?? "hyperpink");

  return (
    <>
      <Aurora />
      <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 pt-safe sm:px-6">
        <header className="flex items-center gap-3 py-4">
          <Link
            href="/"
            aria-label="Back"
            className="tap-target -ml-2 grid place-items-center rounded-full text-bone/60 transition hover:bg-white/10 hover:text-bone active:scale-90"
          >
            <CaretLeft size={22} weight={ICON_WEIGHT} aria-hidden />
          </Link>
          <h1 className="display-md">Insights</h1>
        </header>

        <main className="flex-1 pb-16">
          {!habit ? (
            <p className="card p-8 text-center text-sm text-bone/50">
              Track a habit for a couple of weeks and this fills in.
            </p>
          ) : (
            <>
              {active.length > 1 && (
                <div className="edge-rail mb-4 py-1" role="tablist" aria-label="Choose a habit">
                  {active.map((h) => {
                    const on = h.id === habit.id;
                    return (
                      <button
                        key={h.id}
                        role="tab"
                        aria-selected={on}
                        onClick={() => setSelectedId(h.id)}
                        className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition active:scale-95 ${
                          on ? "bg-bone text-ink" : "border border-white/12 text-bone/55 hover:bg-white/8"
                        }`}
                      >
                        <HabitTile icon={h.icon} accent={h.accent} size={24} />
                        {h.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mb-4 flex items-center gap-3">
                <HabitTile icon={habit.icon} accent={habit.accent} size={44} glow />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold leading-tight">{habit.name}</p>
                  <p className="text-sm text-bone/50">{describeCadence(habit)}</p>
                </div>
              </div>

              {stats && stats.judgedPeriods < MIN_PERIODS ? (
                <div className="card p-6 text-center sm:p-8">
                  <p className="display-md text-bone">Too early to say</p>
                  <p className="mx-auto mt-2 max-w-[38ch] text-sm leading-relaxed text-bone/55">
                    {stats.judgedPeriods} of {MIN_PERIODS} periods tracked. Rates
                    drawn from fewer than that swing wildly on a single day, and
                    a chart that looks confident about noise is worse than no
                    chart.
                  </p>
                </div>
              ) : (
                stats && (
                  <Panels
                    habit={habit}
                    stats={stats}
                    heat={heat}
                    color={accent.hex}
                    aiEnabled={state.prefs.aiInsights}
                  />
                )
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

function Panels({
  habit,
  stats,
  heat,
  color,
  aiEnabled,
}: {
  habit: Habit;
  stats: HabitAnalytics;
  heat: HeatCell[];
  color: string;
  aiEnabled: boolean;
}) {
  const { automaticity, recovery, trend, momentum, weekdays, runs } = stats;
  const unit =
    habit.cadence === "daily" ? "day" : habit.cadence === "weekly" ? "week" : "month";

  return (
    <div className="space-y-3">
      {/* Headline: how far from automatic ------------------------------- */}
      {automaticity.applicable && (
        <Card
          title="On the way to automatic"
          source="Lally et al., 2010"
          note={
            <>
              Automaticity climbs with <em>repetitions</em>, not days elapsed, and
              flattens as it goes. The median person reached near-automatic at{" "}
              {AUTOMATICITY_MEDIAN_REPS} repetitions — but the range ran from 18 to
              254, which is why this is a position on a curve and not a promise.
            </>
          }
        >
          <div className="mb-2 flex items-end justify-between gap-4">
            <Figure
              value={String(automaticity.repetitions)}
              label="repetitions logged"
              color={color}
            />
            <Figure
              value={
                automaticity.remaining > 0
                  ? String(automaticity.remaining)
                  : "past it"
              }
              label={
                automaticity.remaining > 0 ? "to the median" : "beyond the median"
              }
            />
          </div>
          <AutomaticityChart repetitions={automaticity.repetitions} color={color} />
        </Card>
      )}

      {/* The failure mode that actually matters ------------------------- */}
      <Card
        title="When you miss"
        source="Abstinence violation effect"
        note={
          <>
            One missed {unit} does not measurably harm a forming habit. What does
            the damage is the second one in a row — the point where the goal
            starts to feel already broken. So the number worth watching is not
            how often you miss, it is how often you come straight back.
          </>
        }
      >
        {recovery.rate === null ? (
          <p className="text-sm text-bone/55">
            {recovery.misses === 0
              ? `No missed ${unit}s yet.`
              : `Only one missed ${unit} so far, and it is too recent to judge.`}
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-end justify-between gap-4">
              <Figure
                value={`${Math.round(recovery.rate * 100)}%`}
                label="came back next time"
                color={color}
              />
              <Figure value={String(recovery.slipped)} label={`slid into two`} />
              <Figure value={String(recovery.worstSlide)} label="longest slide" />
            </div>
            <RecoveryBar
              recovered={recovery.recovered}
              slipped={recovery.slipped}
              color={color}
            />
          </>
        )}
      </Card>

      {/* Direction of travel -------------------------------------------- */}
      <Card
        title="Consistency, rolling"
        source="Harkin et al., 2016"
        note={
          <>
            A trailing rate over the last 28 {unit}s, so a bad week shows as a dip
            rather than being averaged into invisibility.
            {momentum.delta !== null && (
              <>
                {" "}
                Against the 28 before:{" "}
                <span
                  className="font-semibold"
                  style={{ color: momentum.delta >= 0 ? color : "#FF2E88" }}
                >
                  {momentum.delta >= 0 ? "up" : "down"}{" "}
                  {Math.abs(Math.round(momentum.delta * 100))} points
                </span>
                .
              </>
            )}
          </>
        }
      >
        <div className="mb-2">
          <Figure
            value={
              momentum.recent !== null
                ? `${Math.round(momentum.recent * 100)}%`
                : "—"
            }
            label={`last ${momentum.sample} ${unit}s`}
            color={color}
          />
        </div>
        <TrendChart points={trend} color={color} />
      </Card>

      {/* Where the routine gives way ------------------------------------ */}
      {habit.cadence === "daily" && (
        <Card
          title="By day of the week"
          source="Context stability"
          note="Habits attach to a stable context. An uneven profile points at the day whose routine does not hold — usually the one worth planning rather than pushing harder on."
        >
          <WeekdayChart rates={weekdays} color={color} />
        </Card>
      )}

      {/* Runs ------------------------------------------------------------ */}
      <Card
        title="Runs"
        note="Your typical run is the honest read; a record is a single good fortnight and everyone has one."
      >
        <div className="flex items-end justify-between gap-4">
          <Figure value={String(runs.median)} label={`typical run (${unit}s)`} color={color} />
          <Figure value={String(runs.best)} label="best run" />
          <Figure value={String(runs.lengths.length)} label="runs started" />
        </div>
      </Card>

      {/* The record itself ---------------------------------------------- */}
      <Card
        title="The last year"
        note="Every tracked day. Faded squares are rest days for this habit."
      >
        <YearHeatmap cells={heat} color={color} />
      </Card>

      <InsightReading habit={habit} stats={stats} color={color} enabled={aiEnabled} />

      <p className="px-1 pt-2 text-xs leading-relaxed text-bone/30">
        Everything here is computed on this device from your own check-ins.
        There is deliberately no chart correlating one habit against another:
        over a few habits and a few hundred days, those correlations are mostly
        noise, and a confident-looking scatter plot would be inventing a finding
        rather than reporting one.
      </p>
    </div>
  );
}
