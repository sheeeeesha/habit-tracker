"use client";

import { useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { todayKey, WEEKDAY_LABELS, WEEKDAY_NAMES } from "@/lib/date";
import { ACCENT_KEYS, accentOf } from "@/lib/palette";
import {
  HABIT_ICON_GROUPS,
  HABIT_ICON_KEYS,
  HABIT_ICONS,
} from "@/lib/habitIcons";
import { HabitIconSvg, HabitTile } from "./HabitGlyph";
import {
  ALL_WEEKDAYS,
  describeCadence,
  emptyDraft,
  TIME_OF_DAY_LABEL,
} from "@/lib/habits";
import { useStore } from "@/lib/store";
import type { Cadence, Habit, HabitDraft, TimeOfDay } from "@/lib/types";

interface HabitSheetProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing; omitted when creating. */
  habit?: Habit | null;
  /** Prefills the form from a starter suggestion. */
  seed?: Partial<HabitDraft> | null;
}

const CADENCES: Array<{ value: Cadence; label: string; hint: string }> = [
  { value: "daily", label: "Daily", hint: "resets nightly" },
  { value: "weekly", label: "Weekly", hint: "resets Mondays" },
  { value: "monthly", label: "Monthly", hint: "resets on the 1st" },
];

const TIMES: TimeOfDay[] = ["anytime", "morning", "afternoon", "evening"];

const WEEKDAY_PRESETS: Array<{ label: string; days: number[] }> = [
  { label: "Every day", days: ALL_WEEKDAYS },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [0, 6] },
];

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
        {children}
      </span>
      {hint && <span className="text-xs text-bone/35">{hint}</span>}
    </div>
  );
}

export function HabitSheet({ open, onClose, habit, seed }: HabitSheetProps) {
  const { addHabit, updateHabit, deleteHabit, suggestAccent } = useStore();
  const isEdit = !!habit;

  // The caller remounts this component on every open (see the `key` on
  // <HabitSheet>), so initialising from props here is enough — no reset effect,
  // and a cancelled edit can never leak into the next one.
  const [draft, setDraft] = useState<HabitDraft>(() => {
    if (habit) {
      const { id: _id, createdAt: _createdAt, ...rest } = habit;
      return rest;
    }
    return { ...emptyDraft(suggestAccent()), ...(seed ?? {}) };
  });
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const accent = accentOf(draft.accent);
  const nameError = touched && !draft.name.trim() ? "Give it a name" : "";
  const daysError =
    touched && draft.cadence === "daily" && draft.weekdays.length === 0
      ? "Pick at least one day"
      : "";
  const valid = !!draft.name.trim() && (draft.cadence !== "daily" || draft.weekdays.length > 0);

  const preview = useMemo(
    () =>
      describeCadence({
        ...draft,
        id: "preview",
        createdAt: 0,
      } as Habit),
    [draft],
  );

  const periodWord =
    draft.cadence === "daily" ? "day" : draft.cadence === "weekly" ? "week" : "month";

  function set<K extends keyof HabitDraft>(key: K, value: HabitDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleWeekday(day: number) {
    setDraft((d) => ({
      ...d,
      weekdays: d.weekdays.includes(day)
        ? d.weekdays.filter((x) => x !== day)
        : [...d.weekdays, day].sort((a, b) => a - b),
    }));
  }

  function submit() {
    setTouched(true);
    if (!valid) return;
    const clean: HabitDraft = {
      ...draft,
      name: draft.name.trim(),
      target: Math.max(1, Math.min(99, Math.round(draft.target))),
    };
    if (isEdit && habit) updateHabit(habit.id, clean);
    else addHabit(clean);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit habit" : "New habit"}
      description={
        isEdit
          ? "Changing the rhythm re-scores your history against the new rule."
          : "The rhythm you pick decides when this resets and how streaks count."
      }
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={submit}
            className="w-full rounded-2xl px-5 py-3.5 text-base font-bold transition active:scale-[0.98]"
            style={{ background: accent.hex, color: accent.ink }}
          >
            {isEdit ? "Save changes" : "Start tracking"}
          </button>
          {isEdit && habit && (
            <button
              type="button"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                deleteHabit(habit.id);
                onClose();
              }}
              className="w-full rounded-2xl px-5 py-3 text-sm font-semibold text-bone/50 transition hover:bg-white/5 hover:text-hyperpink"
            >
              {confirmDelete
                ? "Tap again to delete this habit and its history"
                : "Delete habit"}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-7">
        {/* Name + icon ------------------------------------------------- */}
        <div>
          <Label>What are you tracking?</Label>
          <div className="flex items-center gap-3">
            <HabitTile icon={draft.icon} accent={draft.accent} size={56} glow />
            <div className="min-w-0 flex-1">
              <input
                data-autofocus
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="Read 10 pages"
                maxLength={60}
                enterKeyHint="done"
                aria-label="Habit name"
                aria-invalid={!!nameError}
                className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3.5 text-base font-semibold text-bone outline-none transition placeholder:font-normal placeholder:text-bone/30 focus:border-white/30 focus:bg-white/8"
              />
              {nameError && (
                <p className="mt-1.5 text-xs font-medium text-hyperpink">{nameError}</p>
              )}
            </div>
          </div>

          {/* Icon picker. Grouped and scrollable rather than a long rail:
              48 icons in one horizontal strip is unnavigable on a phone. */}
          <div className="mt-3 max-h-56 space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-white/4 p-3">
            {HABIT_ICON_GROUPS.map((group) => (
              <div key={group}>
                <p className="mb-1.5 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-bone/35">
                  {group}
                </p>
                <div className="grid grid-cols-6 gap-1.5">
                  {HABIT_ICON_KEYS.filter((k) => HABIT_ICONS[k].group === group).map(
                    (key) => {
                      const active = draft.icon === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => set("icon", key)}
                          title={HABIT_ICONS[key].label}
                          aria-label={HABIT_ICONS[key].label}
                          aria-pressed={active}
                          className={`grid aspect-square place-items-center rounded-xl transition active:scale-90 ${
                            active ? "" : "bg-white/6 hover:bg-white/14"
                          }`}
                          style={
                            active
                              ? { background: accent.hex, color: accent.ink }
                              : undefined
                          }
                        >
                          <HabitIconSvg
                            icon={key}
                            size={20}
                            color={active ? accent.ink : "rgba(246,242,233,.7)"}
                          />
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cadence ----------------------------------------------------- */}
        <div>
          <Label hint={preview}>How often?</Label>
          <div className="grid grid-cols-3 gap-2">
            {CADENCES.map((c) => {
              const active = draft.cadence === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set("cadence", c.value)}
                  aria-pressed={active}
                  className={`rounded-2xl border px-2 py-3 text-center transition active:scale-95 ${
                    active
                      ? "border-transparent"
                      : "border-white/12 bg-white/4 hover:bg-white/8"
                  }`}
                  style={active ? { background: accent.hex, color: accent.ink } : undefined}
                >
                  <span className="block text-sm font-bold">{c.label}</span>
                  <span
                    className={`mt-0.5 block text-[0.625rem] leading-tight ${
                      active ? "opacity-70" : "text-bone/40"
                    }`}
                  >
                    {c.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Target ------------------------------------------------------ */}
        <div>
          <Label hint={`per ${periodWord}`}>How many times?</Label>
          <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/5 p-2">
            <button
              type="button"
              onClick={() => set("target", Math.max(1, draft.target - 1))}
              disabled={draft.target <= 1}
              aria-label="Decrease target"
              className="tap-target grid place-items-center rounded-xl bg-white/8 text-xl font-bold transition hover:bg-white/14 active:scale-90 disabled:opacity-30"
            >
              &minus;
            </button>
            <div className="flex-1 text-center">
              <span className="display-md block tabular-nums" style={{ color: accent.hex }}>
                {draft.target}
              </span>
              <span className="text-xs text-bone/45">
                {draft.target === 1 ? "time" : "times"} a {periodWord}
              </span>
            </div>
            <button
              type="button"
              onClick={() => set("target", Math.min(99, draft.target + 1))}
              disabled={draft.target >= 99}
              aria-label="Increase target"
              className="tap-target grid place-items-center rounded-xl bg-white/8 text-xl font-bold transition hover:bg-white/14 active:scale-90 disabled:opacity-30"
            >
              +
            </button>
          </div>
        </div>

        {/* Weekdays — only meaningful for daily habits ------------------ */}
        {draft.cadence === "daily" && (
          <div>
            <Label hint={`${draft.weekdays.length} of 7`}>On which days?</Label>
            <div className="flex gap-1.5">
              {WEEKDAY_LABELS.map((letter, day) => {
                const active = draft.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    aria-pressed={active}
                    aria-label={WEEKDAY_NAMES[day]}
                    className={`h-11 flex-1 rounded-xl text-sm font-bold transition active:scale-90 ${
                      active ? "" : "bg-white/6 text-bone/40 hover:bg-white/12"
                    }`}
                    style={active ? { background: accent.hex, color: accent.ink } : undefined}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEEKDAY_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => set("weekdays", [...p.days])}
                  className="rounded-full border border-white/12 px-3 py-1.5 text-xs font-semibold text-bone/60 transition hover:bg-white/10 hover:text-bone active:scale-95"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {daysError && (
              <p className="mt-1.5 text-xs font-medium text-hyperpink">{daysError}</p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-bone/35">
              Days you leave off are rest days &mdash; they never break a streak.
            </p>
          </div>
        )}

        {/* Time of day ------------------------------------------------- */}
        <div>
          <Label>When in the day?</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {TIMES.map((t) => {
              const active = draft.timeOfDay === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("timeOfDay", t)}
                  aria-pressed={active}
                  className={`rounded-xl px-1 py-2.5 text-xs font-semibold transition active:scale-95 ${
                    active
                      ? "bg-white/18 text-bone ring-1 ring-white/25"
                      : "bg-white/5 text-bone/45 hover:bg-white/10"
                  }`}
                >
                  {TIME_OF_DAY_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Colour ------------------------------------------------------ */}
        <div>
          <Label hint={accent.label}>Colour</Label>
          <div className="flex flex-wrap gap-2.5">
            {ACCENT_KEYS.map((key) => {
              const a = accentOf(key);
              const active = draft.accent === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => set("accent", key)}
                  aria-label={a.label}
                  aria-pressed={active}
                  className={`h-10 w-10 rounded-full transition active:scale-90 ${
                    active ? "ring-2 ring-bone ring-offset-2 ring-offset-ink-2" : ""
                  }`}
                  style={{ background: a.hex }}
                />
              );
            })}
          </div>
        </div>

        {/* Start date -------------------------------------------------- */}
        <div>
          <Label hint="History before this is ignored">Start from</Label>
          <input
            type="date"
            value={draft.startDate}
            max={todayKey()}
            onChange={(e) => set("startDate", e.target.value || todayKey())}
            aria-label="Start date"
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-base text-bone outline-none transition focus:border-white/30"
          />
        </div>
      </div>
    </Sheet>
  );
}
