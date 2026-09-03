"use client";

import { Sheet } from "./Sheet";
import { HabitTile } from "./HabitGlyph";
import { Check, ICON_WEIGHT } from "./icons";
import { burstConfetti, haptic } from "@/lib/confetti";
import { addDays, today } from "@/lib/date";
import { describeCadence } from "@/lib/habits";
import { accentOf } from "@/lib/palette";
import { yesterdayProgress } from "@/lib/streak";
import { useStore } from "@/lib/store";
import type { Habit } from "@/lib/types";

interface YesterdaySheetProps {
  open: boolean;
  habits: Habit[];
  onClose: () => void;
}

/**
 * Logging what you did yesterday but forgot to tick.
 *
 * The calendar in a habit's detail sheet has always allowed this — you can tap
 * any past day. The problem was that it is three taps deep in a habit you have
 * to pick first, which is no use for the one case that actually happens: you
 * open the app in the morning and remember you did two things yesterday.
 *
 * Deliberately capped at yesterday. Anything further back is a correction and
 * belongs in the calendar, where you can see what you are changing; a
 * one-tap-per-day list stretching backwards is an invitation to invent a
 * history rather than record one.
 */
export function YesterdaySheet({ open, habits, onClose }: YesterdaySheetProps) {
  const { state, bumpCheckIn } = useStore();
  const yesterday = addDays(today(), -1);

  const label = yesterday.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Yesterday"
      description={`${label} — tick anything you did but forgot to log.`}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl bg-bone px-5 py-3.5 text-base font-bold text-ink transition active:scale-[0.98]"
        >
          Done
        </button>
      }
    >
      <ul className="space-y-2.5">
        {habits.map((habit) => {
          const accent = accentOf(habit.accent);
          const { key, done, target, complete } = yesterdayProgress(
            habit,
            state.log,
          );
          return (
            <li
              key={habit.id}
              className="flex items-center gap-3 rounded-2xl border p-3.5 transition-colors"
              style={
                complete
                  ? {
                      borderColor: `color-mix(in srgb, ${accent.hex} 45%, transparent)`,
                      background: `color-mix(in srgb, ${accent.hex} 12%, transparent)`,
                    }
                  : { borderColor: "rgba(246,242,233,.1)", background: "rgba(255,255,255,.04)" }
              }
            >
              <HabitTile icon={habit.icon} accent={habit.accent} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-semibold text-bone">
                  {habit.name}
                </span>
                <span className="block text-xs text-bone/45">
                  {target > 1 ? `${done}/${target} logged` : describeCadence(habit)}
                </span>
              </span>

              <div className="flex shrink-0 items-center gap-1.5">
                {done > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      bumpCheckIn(habit.id, -1, key);
                      haptic(8);
                    }}
                    aria-label={`Undo one check-in for ${habit.name} yesterday`}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold text-bone/40 transition hover:bg-white/10 hover:text-bone"
                  >
                    Undo
                  </button>
                )}
                <button
                  type="button"
                  disabled={complete}
                  onClick={(e) => {
                    bumpCheckIn(habit.id, 1, key);
                    const finishes = done + 1 >= target;
                    haptic(finishes ? [14, 40, 22] : 10);
                    if (finishes) {
                      const r = e.currentTarget.getBoundingClientRect();
                      burstConfetti(
                        { x: r.left + r.width / 2, y: r.top + r.height / 2 },
                        [accent.hex, accent.hex2, "#F6F2E9"],
                      );
                    }
                  }}
                  aria-label={
                    complete
                      ? `${habit.name} already logged for yesterday`
                      : `Log ${habit.name} for yesterday`
                  }
                  className="grid h-11 w-11 place-items-center rounded-xl border-2 font-bold transition active:scale-90 disabled:cursor-default"
                  style={
                    complete
                      ? { background: accent.hex, borderColor: accent.hex, color: accent.ink }
                      : {
                          borderColor: `color-mix(in srgb, ${accent.hex} 55%, transparent)`,
                          color: accent.hex,
                          background: `color-mix(in srgb, ${accent.hex} 8%, transparent)`,
                        }
                  }
                >
                  {complete || target === 1 ? (
                    <Check size={20} weight={ICON_WEIGHT} aria-hidden />
                  ) : (
                    <span className="text-sm tabular-nums">
                      {done}
                      <span className="text-bone/40">/{target}</span>
                    </span>
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-bone/35">
        Backfilling counts properly: streaks, rates and the automaticity curve
        all re-read from the log, so a run you actually kept is restored rather
        than forgiven. For anything older than yesterday, open the habit and use
        its calendar.
      </p>
    </Sheet>
  );
}
