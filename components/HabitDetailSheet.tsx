"use client";

import { useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import {
  addMonths,
  dateKey,
  MONTH_SHORT,
  parseKey,
  startOfMonth,
  today,
} from "@/lib/date";
import { accentOf } from "@/lib/palette";
import { cadenceNoun, describeCadence, streakNoun, TIME_OF_DAY_LABEL } from "@/lib/habits";
import {
  bestStreak,
  completionRate,
  countOn,
  currentStreak,
  isScheduledOn,
  periodProgress,
} from "@/lib/streak";
import { useStore } from "@/lib/store";
import { haptic } from "@/lib/confetti";
import type { Habit } from "@/lib/types";

interface HabitDetailSheetProps {
  habit: Habit | null;
  open: boolean;
  onClose: () => void;
  onEdit: (habit: Habit) => void;
}

function Stat({
  value,
  label,
  color,
}: {
  value: string | number;
  label: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-3 text-center">
      <div
        className="font-display text-2xl leading-none tabular-nums sm:text-3xl"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      <div className="mt-1.5 truncate text-[0.625rem] font-semibold uppercase leading-tight tracking-wider text-bone/40">
        {label}
      </div>
    </div>
  );
}

export function HabitDetailSheet({ habit, open, onClose, onEdit }: HabitDetailSheetProps) {
  const { state, bumpCheckIn, setArchived } = useStore();
  const [monthOffset, setMonthOffset] = useState(0);

  const accent = accentOf(habit?.accent ?? "hyperpink");

  const stats = useMemo(() => {
    if (!habit) return null;
    const log = state.log;
    const total = Object.values(log[habit.id] ?? {}).reduce((a, b) => a + b, 0);
    return {
      current: currentStreak(habit, log),
      best: bestStreak(habit, log),
      rate: Math.round(completionRate(habit, log) * 100),
      total,
      period: periodProgress(habit, log),
    };
  }, [habit, state.log]);

  /** Month grid, Monday-first, padded to whole weeks. */
  const grid = useMemo(() => {
    if (!habit) return null;
    const monthStart = addMonths(startOfMonth(today()), monthOffset);
    const daysInMonth = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    ).getDate();
    const lead = (monthStart.getDay() + 6) % 7; // shift Sunday-first to Monday-first
    const cells: Array<{ key: string; day: number } | null> = Array.from(
      { length: lead },
      () => null,
    );
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), d);
      cells.push({ key: dateKey(date), day: d });
    }
    return { monthStart, cells };
  }, [habit, monthOffset]);

  if (!habit || !stats || !grid) return null;

  const todayK = dateKey(today());
  const canGoForward = monthOffset < 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={habit.name}
      description={describeCadence(habit)}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(habit)}
            className="flex-1 rounded-2xl px-5 py-3.5 text-base font-bold transition active:scale-[0.98]"
            style={{ background: accent.hex, color: accent.ink }}
          >
            Edit habit
          </button>
          <button
            type="button"
            onClick={() => {
              setArchived(habit.id, !habit.archivedAt);
              onClose();
            }}
            className="rounded-2xl border border-white/12 px-5 py-3.5 text-sm font-semibold text-bone/70 transition hover:bg-white/8 active:scale-95"
          >
            {habit.archivedAt ? "Restore" : "Archive"}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl"
            style={{ background: accent.hex }}
          >
            {habit.emoji}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-bone">
              {cadenceNoun(habit)} &middot; {TIME_OF_DAY_LABEL[habit.timeOfDay]}
            </p>
            <p className="text-sm text-bone/50">
              {stats.period.done}/{stats.period.target} done{" "}
              {habit.cadence === "daily"
                ? "today"
                : habit.cadence === "weekly"
                  ? "this week"
                  : "this month"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <Stat value={stats.current} label="Streak" color={accent.hex} />
          <Stat value={stats.best} label="Best" />
          <Stat value={`${stats.rate}%`} label="Rate" />
          <Stat value={stats.total} label="Logged" />
        </div>

        {stats.current > 0 && (
          <p className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm leading-relaxed text-bone/60">
            You&rsquo;re on a{" "}
            <span className="font-bold" style={{ color: accent.hex }}>
              {streakNoun(habit, stats.current)}
            </span>{" "}
            run
            {stats.best > stats.current
              ? ` — ${stats.best - stats.current} more to beat your record.`
              : stats.current > 1
                ? " — that is your personal best."
                : "."}
          </p>
        )}

        {/* Calendar — tap any past day to fix a missed check-in. */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
              History
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMonthOffset((m) => m - 1)}
                aria-label="Previous month"
                className="tap-target grid place-items-center rounded-lg text-bone/50 transition hover:bg-white/10 hover:text-bone active:scale-90"
              >
                &#8249;
              </button>
              <span className="min-w-[5.5rem] text-center text-sm font-semibold tabular-nums">
                {MONTH_SHORT[grid.monthStart.getMonth()]} {grid.monthStart.getFullYear()}
              </span>
              <button
                type="button"
                onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
                disabled={!canGoForward}
                aria-label="Next month"
                className="tap-target grid place-items-center rounded-lg text-bone/50 transition hover:bg-white/10 hover:text-bone active:scale-90 disabled:opacity-25"
              >
                &#8250;
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5" aria-hidden>
            {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
              <div
                key={i}
                className="text-center text-[0.625rem] font-bold uppercase text-bone/30"
              >
                {l}
              </div>
            ))}
          </div>

          <div className="mt-1.5 grid grid-cols-7 gap-1.5">
            {grid.cells.map((cell, i) => {
              if (!cell) return <div key={`pad-${i}`} />;
              const count = countOn(state.log, habit.id, cell.key);
              const date = parseKey(cell.key);
              const scheduled =
                cell.key >= habit.startDate && isScheduledOn(habit, date);
              const future = cell.key > todayK;
              const isToday = cell.key === todayK;
              const filled = count > 0;
              const hit = habit.cadence === "daily" ? count >= habit.target : count > 0;

              return (
                <button
                  key={cell.key}
                  type="button"
                  disabled={future}
                  onClick={() => {
                    bumpCheckIn(habit.id, filled ? -count : 1, cell.key);
                    haptic(10);
                  }}
                  aria-label={`${date.toDateString()}: ${count} check-in${count === 1 ? "" : "s"}. ${
                    filled ? "Tap to clear" : "Tap to mark done"
                  }`}
                  aria-pressed={filled}
                  className="grid aspect-square place-items-center rounded-lg text-xs font-semibold tabular-nums transition active:scale-90 disabled:cursor-default disabled:opacity-25"
                  style={{
                    background: filled
                      ? hit
                        ? accent.hex
                        : `color-mix(in srgb, ${accent.hex} 40%, transparent)`
                      : scheduled
                        ? "rgba(246,242,233,.08)"
                        : "rgba(246,242,233,.03)",
                    color: filled && hit ? accent.ink : "rgba(246,242,233,.5)",
                    boxShadow: isToday ? `inset 0 0 0 2px ${accent.hex}` : undefined,
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-bone/35">
            Tap a day to add or clear a check-in. Faded squares are rest days for
            this habit.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
