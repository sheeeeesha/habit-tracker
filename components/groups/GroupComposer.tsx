"use client";

import { useState } from "react";
import { Sheet } from "../Sheet";
import { HabitIconSvg, HabitTile } from "../HabitGlyph";
import { ACCENT_KEYS, accentOf, type AccentKey } from "@/lib/palette";
import {
  HABIT_ICON_GROUPS,
  HABIT_ICON_KEYS,
  HABIT_ICONS,
  type HabitIconKey,
} from "@/lib/habitIcons";
import type { Cadence } from "@/lib/date";
import type { Result } from "@/lib/groups/api";

interface GroupComposerProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    icon: HabitIconKey;
    accent: AccentKey;
    cadence: Cadence;
    target: number;
  }) => Promise<Result<string>>;
}

const CADENCES: Array<{ value: Cadence; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function GroupComposer({ open, onClose, onCreate }: GroupComposerProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<HabitIconKey>("fire");
  const [accent, setAccent] = useState<AccentKey>("fresh");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [target, setTarget] = useState(1);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const tone = accentOf(accent);
  const periodWord = cadence === "daily" ? "day" : cadence === "weekly" ? "week" : "month";

  async function submit() {
    if (!name.trim()) {
      setProblem("Give the group a name.");
      return;
    }
    setSaving(true);
    setProblem(null);
    const result = await onCreate({ name: name.trim(), icon, accent, cadence, target });
    setSaving(false);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    setName("");
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New group"
      description="One goal, tracked separately. You will get your own copy of this habit to check off."
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="w-full rounded-2xl px-5 py-3.5 text-base font-bold transition active:scale-[0.98] disabled:opacity-60"
          style={{ background: tone.hex, color: tone.ink }}
        >
          {saving ? "Creating…" : "Create group"}
        </button>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <HabitTile icon={icon} accent={accent} size={56} glow />
            <input
              data-autofocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Morning run club"
              maxLength={60}
              aria-label="Group name"
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3.5 text-base font-semibold text-bone outline-none transition placeholder:font-normal placeholder:text-bone/30 focus:border-white/30"
            />
          </div>
          {problem && (
            <p className="mt-1.5 text-xs font-medium text-hyperpink">{problem}</p>
          )}
        </div>

        <div className="max-h-44 space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-white/4 p-3">
          {HABIT_ICON_GROUPS.map((groupName) => (
            <div key={groupName}>
              <p className="mb-1.5 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-bone/35">
                {groupName}
              </p>
              <div className="grid grid-cols-6 gap-1.5">
                {HABIT_ICON_KEYS.filter((k) => HABIT_ICONS[k].group === groupName).map((key) => {
                  const on = icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIcon(key)}
                      aria-label={HABIT_ICONS[key].label}
                      aria-pressed={on}
                      className={`grid aspect-square place-items-center rounded-xl transition active:scale-90 ${
                        on ? "" : "bg-white/6 hover:bg-white/14"
                      }`}
                      style={on ? { background: tone.hex } : undefined}
                    >
                      <HabitIconSvg
                        icon={key}
                        size={20}
                        color={on ? tone.ink : "rgba(246,242,233,.7)"}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
            Everyone tracks
          </p>
          <div className="grid grid-cols-3 gap-2">
            {CADENCES.map((c) => {
              const on = cadence === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCadence(c.value)}
                  aria-pressed={on}
                  className={`rounded-2xl border px-2 py-3 text-sm font-bold transition active:scale-95 ${
                    on ? "border-transparent" : "border-white/12 bg-white/4 hover:bg-white/8"
                  }`}
                  style={on ? { background: tone.hex, color: tone.ink } : undefined}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/12 bg-white/5 p-2">
            <button
              type="button"
              onClick={() => setTarget((t) => Math.max(1, t - 1))}
              disabled={target <= 1}
              aria-label="Decrease target"
              className="tap-target grid place-items-center rounded-xl bg-white/8 text-xl font-bold transition hover:bg-white/14 active:scale-90 disabled:opacity-30"
            >
              &minus;
            </button>
            <div className="flex-1 text-center">
              <span className="display-md block tabular-nums" style={{ color: tone.hex }}>
                {target}
              </span>
              <span className="text-xs text-bone/45">
                {target === 1 ? "time" : "times"} a {periodWord}, each
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTarget((t) => Math.min(99, t + 1))}
              aria-label="Increase target"
              className="tap-target grid place-items-center rounded-xl bg-white/8 text-xl font-bold transition hover:bg-white/14 active:scale-90"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
            Colour
          </p>
          <div className="flex flex-wrap gap-2.5">
            {ACCENT_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setAccent(key)}
                aria-label={accentOf(key).label}
                aria-pressed={accent === key}
                className={`h-10 w-10 rounded-full transition active:scale-90 ${
                  accent === key ? "ring-2 ring-bone ring-offset-2 ring-offset-ink-2" : ""
                }`}
                style={{ background: accentOf(key).hex }}
              />
            ))}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-bone/40">
          You will invite people once the group exists. Nobody sees anything
          until they accept.
        </p>
      </div>
    </Sheet>
  );
}
