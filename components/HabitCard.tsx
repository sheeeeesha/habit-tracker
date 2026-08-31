"use client";

import { useRef } from "react";
import { Check, Fire, ICON_WEIGHT } from "./icons";
import { HabitTile } from "./HabitGlyph";
import { burstConfetti, haptic } from "@/lib/confetti";
import { accentOf } from "@/lib/palette";
import { describeCadence, periodNoun, streakNoun } from "@/lib/habits";
import {
  currentStreak,
  dayStatuses,
  isOnDutyToday,
  periodProgress,
  recentDays,
} from "@/lib/streak";
import { useStore } from "@/lib/store";
import type { Habit } from "@/lib/types";

interface HabitCardProps {
  habit: Habit;
  onOpen: (habit: Habit) => void;
  index?: number;
}

export function HabitCard({ habit, onOpen, index = 0 }: HabitCardProps) {
  const { state, bumpCheckIn } = useStore();
  const accent = accentOf(habit.accent);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { done, target, complete, ratio } = periodProgress(habit, state.log);
  const streak = currentStreak(habit, state.log);
  const onDuty = isOnDutyToday(habit);
  const history = dayStatuses(habit, state.log, recentDays(7));

  function check() {
    if (!onDuty || complete) return;
    bumpCheckIn(habit.id, 1);
    const finishes = done + 1 >= target;
    haptic(finishes ? [14, 40, 22] : 10);
    if (finishes && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      burstConfetti({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, [
        accent.hex,
        accent.hex2,
        "#F6F2E9",
      ]);
    }
  }

  const progressLabel = `${done} of ${target} ${periodNoun(habit)}`;

  return (
    <li
      className="animate-rise"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div
        className="card relative overflow-hidden p-4 transition-colors sm:p-5"
        style={
          complete
            ? {
                borderColor: `color-mix(in srgb, ${accent.hex} 45%, transparent)`,
                background: `linear-gradient(160deg, color-mix(in srgb, ${accent.hex} 16%, transparent), rgba(255,255,255,.03))`,
              }
            : undefined
        }
      >
        <div className="flex items-start gap-3 sm:gap-4">
          {/* The whole body is one tap target that opens the detail sheet. */}
          <button
            type="button"
            onClick={() => onOpen(habit)}
            className="min-w-0 flex-1 text-left"
            aria-label={`Open ${habit.name}`}
          >
            <span className="flex items-center gap-3">
              <HabitTile icon={habit.icon} accent={habit.accent} size={46} glow />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[1.0625rem] font-semibold leading-tight text-bone sm:text-lg">
                  {habit.name}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-bone/55">
                  <span>{describeCadence(habit)}</span>
                  {streak > 0 && (
                    <span
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color: accent.hex }}
                    >
                      <Fire size={13} weight="fill" aria-hidden />
                      {streakNoun(habit, streak)}
                    </span>
                  )}
                </span>
              </span>
            </span>
          </button>

          <div className="flex shrink-0 flex-col items-center gap-1">
            <button
              ref={buttonRef}
              type="button"
              onClick={check}
              disabled={!onDuty || complete}
              aria-label={
                !onDuty
                  ? `${habit.name}: rest day, nothing due`
                  : complete
                    ? `${habit.name} complete, ${progressLabel}`
                    : `Check off ${habit.name}, ${progressLabel}`
              }
              className="grid h-14 w-14 place-items-center rounded-2xl border-2 font-bold transition active:scale-90 disabled:cursor-default sm:h-16 sm:w-16"
              style={
                complete
                  ? {
                      background: accent.hex,
                      borderColor: accent.hex,
                      color: accent.ink,
                      animation: "pop .45s cubic-bezier(.34,1.56,.64,1)",
                    }
                  : onDuty
                    ? {
                        borderColor: `color-mix(in srgb, ${accent.hex} 55%, transparent)`,
                        color: accent.hex,
                        background: `color-mix(in srgb, ${accent.hex} 8%, transparent)`,
                      }
                    : {
                        borderColor: "rgba(246,242,233,.14)",
                        color: "rgba(246,242,233,.35)",
                      }
              }
            >
              {complete || target === 1 ? (
                <Check size={26} weight={ICON_WEIGHT} aria-hidden />
              ) : !onDuty ? (
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wide">
                  Rest
                </span>
              ) : (
                <span className="text-lg tabular-nums">
                  {done}
                  <span className="text-bone/40">/{target}</span>
                </span>
              )}
            </button>

            {done > 0 && (
              <button
                type="button"
                onClick={() => {
                  bumpCheckIn(habit.id, -1);
                  haptic(8);
                }}
                aria-label={`Undo one check-in for ${habit.name}`}
                className="rounded-full px-3 py-1 text-xs font-semibold text-bone/45 transition hover:bg-white/10 hover:text-bone active:scale-90"
              >
                Undo
              </button>
            )}
          </div>
        </div>

        {/* Multi-target periods get a segmented bar; once-a-day habits get a
            seven-day history strip, which is far more motivating. */}
        <div className="mt-3.5">
          {target > 1 ? (
            <div className="flex items-center gap-2">
              <div
                className="flex h-2 flex-1 gap-1"
                role="progressbar"
                aria-valuenow={done}
                aria-valuemin={0}
                aria-valuemax={target}
                aria-label={progressLabel}
              >
                {target <= 12 ? (
                  Array.from({ length: target }, (_, i) => (
                    <span
                      key={i}
                      className="h-full flex-1 rounded-full transition-colors duration-300"
                      style={{
                        background: i < done ? accent.hex : "rgba(246,242,233,.13)",
                      }}
                    />
                  ))
                ) : (
                  <span className="h-full flex-1 overflow-hidden rounded-full bg-white/12">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${ratio * 100}%`, background: accent.hex }}
                    />
                  </span>
                )}
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-bone/50">
                {done}/{target}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5" aria-hidden>
              {history.map((d) => (
                <span
                  key={d.key}
                  className="h-2 flex-1 rounded-full transition-colors duration-300"
                  style={{
                    background: d.complete
                      ? accent.hex
                      : d.scheduled
                        ? "rgba(246,242,233,.13)"
                        : "rgba(246,242,233,.05)",
                  }}
                />
              ))}
              <span className="ml-1 shrink-0 text-[0.6875rem] font-medium uppercase tracking-wide text-bone/35">
                7d
              </span>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
