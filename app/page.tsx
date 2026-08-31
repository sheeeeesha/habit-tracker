"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Aurora } from "@/components/Aurora";
import { HabitTile } from "@/components/HabitGlyph";
import {
  ArrowRight,
  Check,
  DotsThreeVertical,
  Fire,
  ICON_WEIGHT,
  Plus,
} from "@/components/icons";
import { HabitCard } from "@/components/HabitCard";
import { HabitDetailSheet } from "@/components/HabitDetailSheet";
import { HabitSheet } from "@/components/HabitSheet";
import { InstallCTA } from "@/components/InstallCTA";
import { MenuSheet } from "@/components/MenuSheet";
import { ProgressRing } from "@/components/ProgressRing";
import { prettyDate, today } from "@/lib/date";
import { STARTER_HABITS, streakNoun } from "@/lib/habits";
import type { AccentKey } from "@/lib/palette";
import { isOnDutyToday, periodProgress, todaySummary } from "@/lib/streak";
import { useStore } from "@/lib/store";
import { clearUrlFlag, useUrlFlag } from "@/lib/useUrlFlag";
import { isActive, type Habit, type HabitDraft } from "@/lib/types";

type Filter = "today" | "all" | "daily" | "weekly" | "monthly";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "today", label: "Today" },
  { key: "all", label: "All" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

/** Keeps the starter grid from putting two of the same colour side by side. */
const STARTER_ACCENTS: AccentKey[] = [
  "hyperpink",
  "acid",
  "electric",
  "ultra",
  "sunburn",
  "fresh",
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { state, habits, hydrated, suggestAccent } = useStore();
  const [filter, setFilter] = useState<Filter>("today");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [detail, setDetail] = useState<Habit | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [seed, setSeed] = useState<Partial<HabitDraft> | null>(null);

  // The manifest shortcut "New habit" deep-links to /?new=1, which opens the
  // composer straight away without any effect.
  const deepLinkNew = useUrlFlag("new");
  const [deepLinkUsed, setDeepLinkUsed] = useState(false);
  const composerVisible = composerOpen || (deepLinkNew && !deepLinkUsed);

  const active = useMemo(() => habits.filter(isActive), [habits]);

  const summary = useMemo(
    () => todaySummary(habits, state.log),
    [habits, state.log],
  );

  const visible = useMemo(() => {
    const list = active.filter((h) => {
      if (filter === "all") return true;
      if (filter === "today") return isOnDutyToday(h);
      return h.cadence === filter;
    });
    // Unfinished work floats to the top; finished habits settle underneath.
    return list.sort((a, b) => {
      const ac = periodProgress(a, state.log).complete ? 1 : 0;
      const bc = periodProgress(b, state.log).complete ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return a.createdAt - b.createdAt;
    });
  }, [active, filter, state.log]);

  const allDone = summary.total > 0 && summary.done === summary.total;
  const heroColor = allDone ? "#C7F94E" : "#FF2E88";

  function openComposer(prefill?: Partial<HabitDraft>) {
    setEditing(null);
    setSeed(prefill ?? null);
    setComposerOpen(true);
  }

  // Avoid a flash of the empty state while localStorage is still being read.
  if (!hydrated) {
    return (
      <>
        <Aurora />
        <div className="grid min-h-svh place-items-center">
          <span className="sr-only">Loading your habits</span>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-hyperpink" />
        </div>
      </>
    );
  }

  return (
    <>
      <Aurora />

      <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-4 pt-safe sm:px-6">
        {/* Header ------------------------------------------------------ */}
        <header className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-sunburn via-hyperpink to-ultra"
            >
              <Check size={17} weight="bold" color="#ffffff" aria-hidden />
            </span>
            <span className="text-[0.9375rem] font-bold tracking-tight">
              Streak<span className="text-hyperpink">Wrapped</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Settings"
            className="tap-target grid place-items-center rounded-full text-bone/55 transition hover:bg-white/10 hover:text-bone active:scale-90"
          >
            <DotsThreeVertical size={22} weight="fill" aria-hidden />
          </button>
        </header>

        <main className="flex-1 pb-32">
          {/* Greeting + hero ------------------------------------------ */}
          <section className="mb-5">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-bone/40">
              {prettyDate(today())}
            </p>
            <h1 className="display-lg mt-1.5">
              {greeting()}
              {state.name ? (
                <>
                  ,<br />
                  <span className="text-hyperpink">{state.name}</span>
                </>
              ) : null}
            </h1>
          </section>

          {active.length > 0 && (
            <section
              className="card mb-4 flex items-center gap-4 p-4 sm:p-5"
              aria-label="Today's progress"
            >
              <ProgressRing
                ratio={summary.ratio}
                size={84}
                stroke={8}
                color={heroColor}
              >
                <span className="font-display text-xl tabular-nums leading-none">
                  {Math.round(summary.ratio * 100)}
                  <span className="text-xs">%</span>
                </span>
              </ProgressRing>

              <div className="min-w-0 flex-1">
                {summary.total === 0 ? (
                  <>
                    <p className="text-lg font-bold leading-tight">Rest day</p>
                    <p className="mt-1 text-sm text-bone/50">
                      Nothing scheduled today. Streaks stay safe.
                    </p>
                  </>
                ) : allDone ? (
                  <>
                    <p className="display-md text-acid">All done</p>
                    <p className="mt-1 text-sm text-bone/55">
                      {summary.done} of {summary.total} finished. Go enjoy the rest of it.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold leading-none tabular-nums">
                      {summary.done}
                      <span className="text-bone/35"> / {summary.total}</span>
                    </p>
                    <p className="mt-1.5 text-sm text-bone/55">checked in today</p>
                    {summary.topHabit && summary.topStreak > 0 && (
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold text-bone/80">
                        <Fire size={14} weight="fill" className="shrink-0 text-sunburn" aria-hidden />
                        <span className="truncate">
                          {streakNoun(summary.topHabit, summary.topStreak)} on{" "}
                          {summary.topHabit.name}
                        </span>
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          <InstallCTA />

          {/* Filters --------------------------------------------------- */}
          {active.length > 0 && (
            <div className="edge-rail my-4 py-1" role="tablist" aria-label="Filter habits">
              {FILTERS.map((f) => {
                const on = filter === f.key;
                return (
                  <button
                    key={f.key}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${
                      on
                        ? "bg-bone text-ink"
                        : "border border-white/12 text-bone/55 hover:bg-white/8 hover:text-bone"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Habit list ------------------------------------------------ */}
          {active.length === 0 ? (
            <EmptyState
              onPick={(s) => openComposer({ ...s, accent: suggestAccent() })}
              onBlank={() => openComposer()}
            />
          ) : visible.length === 0 ? (
            <p className="card p-8 text-center text-sm text-bone/50">
              {filter === "today"
                ? "Nothing is scheduled for today. Enjoy the rest day."
                : "No habits with this rhythm yet."}
            </p>
          ) : (
            <ul className="space-y-3">
              {visible.map((h, i) => (
                <HabitCard key={h.id} habit={h} index={i} onOpen={setDetail} />
              ))}
            </ul>
          )}

          {/* Wrapped entry point --------------------------------------- */}
          {active.length > 0 && (
            <Link
              href="/wrapped"
              className="group relative mt-6 block overflow-hidden rounded-[1.75rem] p-5 transition active:scale-[0.99]"
              style={{
                background:
                  "linear-gradient(120deg,#FF6039 0%,#FF2E88 45%,#9B5CFF 100%)",
              }}
            >
              <div className="relative flex items-center justify-between gap-4">
                <div>
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-white/70">
                    Your year, so far
                  </p>
                  <p className="display-md mt-1 text-white">See your Wrapped</p>
                  <p className="mt-1.5 text-sm font-medium text-white/75">
                    Streaks, top habits and the days you showed up.
                  </p>
                </div>
                <span
                  aria-hidden
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20 text-white transition group-hover:translate-x-1"
                >
                  <ArrowRight size={20} weight={ICON_WEIGHT} aria-hidden />
                </span>
              </div>
            </Link>
          )}
        </main>
      </div>

      {/* Floating compose button --------------------------------------- */}
      {active.length > 0 && (
        <button
          type="button"
          onClick={() => openComposer()}
          aria-label="New habit"
          className="fixed right-4 z-30 inline-flex items-center gap-2 rounded-full bg-bone px-5 py-4 font-bold text-ink shadow-2xl transition active:scale-90 inset-safe-b sm:right-6"
        >
          <Plus size={20} weight={ICON_WEIGHT} aria-hidden />
          <span className="text-sm">New habit</span>
        </button>
      )}

      <HabitSheet
        // Remounting on each open is what lets HabitSheet initialise its form
        // straight from props instead of resetting itself in an effect.
        key={editing ? `edit-${editing.id}` : composerVisible ? "new" : "closed"}
        open={composerVisible || !!editing}
        habit={editing}
        seed={seed}
        onClose={() => {
          setComposerOpen(false);
          setEditing(null);
          setSeed(null);
          setDeepLinkUsed(true);
          clearUrlFlag("new");
        }}
      />
      <HabitDetailSheet
        open={!!detail && !editing && !composerVisible}
        habit={detail}
        onClose={() => setDetail(null)}
        onEdit={(h) => {
          setDetail(null);
          setEditing(h);
        }}
      />
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

function EmptyState({
  onPick,
  onBlank,
}: {
  onPick: (seed: Partial<HabitDraft>) => void;
  onBlank: () => void;
}) {
  return (
    <div className="animate-rise">
      <div className="card p-6 text-center sm:p-8">
        <p className="display-md text-bone">Start with one</p>
        <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-relaxed text-bone/55">
          Pick a rhythm — daily, weekly or monthly — and StreakWrapped counts every
          time you show up.
        </p>
        <button
          type="button"
          onClick={onBlank}
          className="mt-5 w-full rounded-2xl bg-hyperpink px-5 py-3.5 text-base font-bold text-white transition active:scale-[0.98] sm:w-auto sm:px-8"
        >
          Create a habit
        </button>
      </div>

      <p className="mt-6 mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/40">
        Or grab a starter
      </p>
      <ul className="grid grid-cols-2 gap-2.5">
        {STARTER_HABITS.map((s, i) => {
          const accentKey = STARTER_ACCENTS[i % STARTER_ACCENTS.length];
          return (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="h-full w-full rounded-2xl border border-white/10 bg-white/4 p-3.5 text-left transition hover:bg-white/8 active:scale-95"
              >
                <HabitTile
                  icon={s.icon}
                  accent={accentKey}
                  size={40}
                  className="mb-2"
                />
                <span className="block text-sm font-semibold leading-tight text-bone">
                  {s.name}
                </span>
                <span className="mt-0.5 block text-xs text-bone/45">
                  {s.cadence === "daily"
                    ? s.target > 1
                      ? `${s.target}× a day`
                      : s.weekdays.length === 7
                        ? "Every day"
                        : "Weekdays"
                    : s.cadence === "weekly"
                      ? `${s.target}× a week`
                      : `${s.target}× a month`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
