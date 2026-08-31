"use client";

import { CountUp } from "./CountUp";
import type { StorySlide } from "./Story";
import { accentOf } from "@/lib/palette";
import { MONTH_SHORT, parseKey } from "@/lib/date";
import { frequencyPhrase, weekdayName, type WrappedStats } from "@/lib/wrapped";
import { streakNoun } from "@/lib/habits";
import {
  ArcsMotif,
  BlobMotif,
  ChevronMotif,
  DotGridMotif,
  SquiggleMotif,
  StarMotif,
} from "./Motifs";

const INK = "#08070a";
const BONE = "#f6f2e9";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] opacity-55">
      {children}
    </p>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 text-base font-medium leading-relaxed opacity-70">
      {children}
    </p>
  );
}

/** Vertical bar chart used by the weekday and month slides. */
function Bars({
  data,
  highlight,
  ink,
}: {
  data: Array<{ label: string; value: number }>;
  highlight: number;
  ink: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div
      className="mt-7 flex items-end gap-1.5"
      role="img"
      aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}
    >
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex flex-1 flex-col items-center gap-2">
          {/* The track needs an explicit height or the bar's percentage has
              nothing to resolve against and collapses to zero. */}
          <div className="flex h-32 w-full items-end sm:h-36">
            <span
              className="w-full origin-bottom rounded-t-md"
              style={{
                height: `${Math.max(3, (d.value / max) * 100)}%`,
                background: ink,
                opacity: i === highlight ? 1 : 0.3,
                animationName: "grow-bar",
                animationDuration: "600ms",
                animationTimingFunction: "cubic-bezier(.16,1,.3,1)",
                animationFillMode: "both",
                animationDelay: `${i * 45}ms`,
              }}
            />
          </div>
          <span
            className="text-[0.625rem] font-bold uppercase"
            style={{ opacity: i === highlight ? 0.9 : 0.4 }}
          >
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function buildSlides(
  stats: WrappedStats,
  name: string,
  reduceMotion: boolean,
): StorySlide[] {
  const slides: StorySlide[] = [];
  const arche = accentOf(stats.archetype.accent);

  // 1 — Intro. Type-as-pattern: the word repeated and knocked back.
  slides.push({
    id: "intro",
    background: INK,
    ink: BONE,
    duration: 4200,
    motif: <StarMotif />,
    content: (
      <div>
        <Eyebrow>{stats.rangeLabel}</Eyebrow>
        <div className="mt-4 -space-y-3">
          {[0.12, 0.28, 1].map((o, i) => (
            <h2
              key={i}
              className="display-xl"
              style={{
                opacity: o,
                background:
                  o === 1
                    ? "linear-gradient(96deg,#FF6039,#FF2E88 45%,#9B5CFF)"
                    : undefined,
                backgroundClip: o === 1 ? "text" : undefined,
                WebkitBackgroundClip: o === 1 ? "text" : undefined,
                color: o === 1 ? "transparent" : BONE,
              }}
            >
              Wrapped
            </h2>
          ))}
        </div>
        <Kicker>
          {name ? `${name}, here` : "Here"} is everything you showed up for across{" "}
          {stats.daysTracked} days.
        </Kicker>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] opacity-40">
          Tap to keep going &rarr;
        </p>
      </div>
    ),
  });

  // 2 — Total check-ins.
  slides.push({
    id: "total",
    background: "#FF2E88",
    ink: INK,
    motif: <SquiggleMotif />,
    content: (
      <div>
        <Eyebrow>You checked in</Eyebrow>
        <p className="display-xl mt-3">
          <CountUp to={stats.totalCheckIns} reduceMotion={reduceMotion} />
        </p>
        <p className="display-md mt-3">times</p>
        <Kicker>
          Every one of them was a decision to do the thing instead of not doing it.
        </Kicker>
      </div>
    ),
  });

  // 3 — Active days.
  slides.push({
    id: "days",
    background: "#C7F94E",
    ink: "#121a00",
    motif: <DotGridMotif />,
    content: (
      <div>
        <Eyebrow>You showed up on</Eyebrow>
        <p className="display-xl mt-3">
          <CountUp to={stats.activeDays} reduceMotion={reduceMotion} />
        </p>
        <p className="display-md mt-3">
          {stats.activeDays === 1 ? "day" : "days"}
        </p>
        <Kicker>
          {frequencyPhrase(stats.activeDays, stats.daysTracked)}
          {stats.perfectDays > 0 && (
            <>
              {" "}
              <span className="font-bold">{stats.perfectDays}</span> of them were
              perfect &mdash; every daily habit done.
            </>
          )}
        </Kicker>
      </div>
    ),
  });

  // 4 — Longest streak.
  if (stats.longestStreak && stats.longestStreak.length > 1) {
    const { habit, length } = stats.longestStreak;
    slides.push({
      id: "streak",
      background: "#9B5CFF",
      ink: "#ffffff",
      motif: <ArcsMotif />,
      content: (
        <div>
          <Eyebrow>Your longest run</Eyebrow>
          <p className="display-xl mt-3">
            <CountUp to={length} reduceMotion={reduceMotion} />
          </p>
          <p className="display-md mt-3">
            {habit.cadence === "daily"
              ? length === 1
                ? "day"
                : "days"
              : habit.cadence === "weekly"
                ? length === 1
                  ? "week"
                  : "weeks"
                : length === 1
                  ? "month"
                  : "months"}{" "}
            straight
          </p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3">
            <span aria-hidden className="text-2xl">
              {habit.emoji}
            </span>
            <span className="text-base font-bold">{habit.name}</span>
          </div>
          <Kicker>
            Not once did you let it drop. That is the hard part, and you did it.
          </Kicker>
        </div>
      ),
    });
  }

  // 5 — Top habits.
  if (stats.topHabits.length > 0 && stats.topHabits[0].count > 0) {
    const top = stats.topHabits[0];
    const topAccent = accentOf(top.habit.accent);
    slides.push({
      id: "top",
      background: INK,
      ink: BONE,
      duration: 6200,
      content: (
        <div>
          <Eyebrow>Your number one</Eyebrow>
          <div className="mt-4 flex items-center gap-4">
            <span
              aria-hidden
              className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl text-3xl"
              style={{ background: topAccent.hex }}
            >
              {top.habit.emoji}
            </span>
            <div className="min-w-0">
              <p className="display-md" style={{ color: topAccent.hex }}>
                {top.habit.name}
              </p>
              <p className="mt-1 text-sm opacity-60">
                Goal hit {top.completedPeriods}&times; &middot; {top.count} check-ins
              </p>
            </div>
          </div>

          {stats.topHabits.length > 1 && (
            <ol className="mt-7 space-y-2.5">
              {stats.topHabits.slice(1, 5).map((t, i) => {
                const a = accentOf(t.habit.accent);
                return (
                  <li key={t.habit.id} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-sm font-bold tabular-nums opacity-35">
                      {i + 2}
                    </span>
                    <span aria-hidden className="text-lg">
                      {t.habit.emoji}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
                      {t.habit.name}
                    </span>
                    <span
                      className="shrink-0 text-sm font-bold tabular-nums"
                      style={{ color: a.hex }}
                    >
                      {t.count}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ),
    });
  }

  // 6 — Best weekday.
  if (stats.weekdayCounts.some((c) => c > 0)) {
    const order = [1, 2, 3, 4, 5, 6, 0]; // Monday-first
    slides.push({
      id: "weekday",
      background: "#3DE0FF",
      ink: "#001820",
      motif: <ChevronMotif />,
      content: (
        <div>
          <Eyebrow>Your strongest day</Eyebrow>
          <h2 className="display-lg mt-3">{weekdayName(stats.bestWeekday)}</h2>
          <Bars
            data={order.map((d) => ({
              label: weekdayName(d).slice(0, 3),
              value: stats.weekdayCounts[d],
            }))}
            highlight={order.indexOf(stats.bestWeekday)}
            ink="#001820"
          />
          <Kicker>
            {stats.weekdayCounts[stats.bestWeekday]} check-ins landed on a{" "}
            {weekdayName(stats.bestWeekday)}. Something about that day works for you.
          </Kicker>
        </div>
      ),
    });
  }

  // 7 — Month shape.
  if (stats.months.length > 1 && stats.bestMonth) {
    slides.push({
      id: "months",
      background: "#FF6039",
      ink: "#1e0400",
      content: (
        <div>
          <Eyebrow>Month by month</Eyebrow>
          <h2 className="display-lg mt-3">{stats.bestMonth.label} won</h2>
          <Bars
            data={stats.months.map((m) => ({ label: m.label, value: m.count }))}
            highlight={stats.months.findIndex((m) => m.count === stats.bestMonth?.count)}
            ink="#1e0400"
          />
          <Kicker>
            {stats.bestMonth.count} check-ins in {stats.bestMonth.label} alone &mdash;
            your busiest stretch yet.
          </Kicker>
        </div>
      ),
    });
  }

  // 8 — Consistency.
  slides.push({
    id: "consistency",
    background: "#FFD93D",
    ink: "#1c1400",
    motif: <BlobMotif />,
    content: (
      <div>
        <Eyebrow>You hit your target</Eyebrow>
        <p className="display-xl mt-3">
          <CountUp
            to={Math.round(stats.consistency * 100)}
            suffix="%"
            reduceMotion={reduceMotion}
          />
        </p>
        <p className="display-md mt-3">of the time</p>
        <Kicker>
          {stats.consistency >= 0.8
            ? "That is elite territory. Most habits die well before this."
            : stats.consistency >= 0.55
              ? "Solidly more on than off — the direction that actually compounds."
              : "Every miss you came back from still counts as showing up."}
        </Kicker>
      </div>
    ),
  });

  // 9 — Archetype.
  slides.push({
    id: "archetype",
    background: `linear-gradient(160deg, ${arche.hex} 0%, ${arche.hex2} 100%)`,
    ink: arche.key === "ultra" ? "#ffffff" : arche.ink,
    duration: 6500,
    content: (
      <div>
        <Eyebrow>Your habit personality</Eyebrow>
        {/* Bold type sits on a flat panel, never straight on the gradient. */}
        <div
          className="mt-4 rounded-3xl px-5 py-6"
          // Wrapped's rule: bold type sits on a flat field, never straight on
          // a gradient, so knock a solid panel out of the background first.
          style={{ background: arche.ink === "#ffffff" ? "rgba(0,0,0,.32)" : "rgba(0,0,0,.16)" }}
        >
          <h2 className="display-lg">{stats.archetype.title}</h2>
          <p className="mt-4 text-base font-medium leading-relaxed opacity-80">
            {stats.archetype.blurb}
          </p>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            { v: stats.totalCheckIns, l: "check-ins" },
            { v: stats.longestStreak?.length ?? 0, l: "best streak" },
            { v: stats.habitCount, l: "habits" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl bg-black/20 px-2 py-3">
              <p className="font-display text-2xl leading-none tabular-nums">
                {s.v.toLocaleString()}
              </p>
              <p className="mt-1 text-[0.625rem] font-bold uppercase tracking-wide opacity-65">
                {s.l}
              </p>
            </div>
          ))}
        </div>
      </div>
    ),
  });

  return slides;
}

/** Extra context line used by the final share slide. */
export function busiestDayLabel(stats: WrappedStats): string | null {
  if (!stats.busiestDay) return null;
  const d = parseKey(stats.busiestDay.key);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function topStreakLabel(stats: WrappedStats): string {
  if (!stats.longestStreak) return "0";
  return streakNoun(stats.longestStreak.habit, stats.longestStreak.length);
}
