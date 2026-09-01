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
import type { Result } from "@/lib/groups/api";
import type { GroupDetail } from "@/lib/groups/types";

interface GroupEditSheetProps {
  open: boolean;
  detail: GroupDetail | null;
  onClose: () => void;
  onSave: (
    groupId: string,
    input: { name: string; icon: string; accent: string },
  ) => Promise<Result<null>>;
}

/**
 * Renaming and restyling a group.
 *
 * The rhythm is shown but not editable, and that is the substantive decision
 * here rather than an omission. Every member republishes their recent periods
 * on each refresh, so changing the target would re-score history everyone has
 * already seen — periods people remember completing would quietly flip to
 * missed. A group that wants a different rhythm is a different group.
 */
export function GroupEditSheet({ open, detail, onClose, onSave }: GroupEditSheetProps) {
  const [name, setName] = useState(detail?.group.name ?? "");
  const [icon, setIcon] = useState<HabitIconKey>(
    (detail?.group.icon as HabitIconKey) ?? "fire",
  );
  const [accent, setAccent] = useState<AccentKey>(
    (detail?.group.accent as AccentKey) ?? "fresh",
  );
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!detail) return null;

  const tone = accentOf(accent);
  const periodWord =
    detail.group.cadence === "daily"
      ? "day"
      : detail.group.cadence === "weekly"
        ? "week"
        : "month";

  async function submit() {
    if (!detail) return;
    if (!name.trim()) {
      setProblem("Give the group a name.");
      return;
    }
    setSaving(true);
    setProblem(null);
    const result = await onSave(detail.group.id, { name: name.trim(), icon, accent });
    setSaving(false);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit group"
      description="Changes show for everyone in the group."
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="w-full rounded-2xl px-5 py-3.5 text-base font-bold transition active:scale-[0.98] disabled:opacity-60"
          style={{ background: tone.hex, color: tone.ink }}
        >
          {saving ? "Saving…" : "Save changes"}
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
              maxLength={60}
              aria-label="Group name"
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3.5 text-base font-semibold text-bone outline-none transition focus:border-white/30"
            />
          </div>
          {problem && <p className="mt-1.5 text-xs font-medium text-hyperpink">{problem}</p>}
        </div>

        <div className="max-h-44 space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-white/4 p-3">
          {HABIT_ICON_GROUPS.map((groupName) => (
            <div key={groupName}>
              <p className="mb-1.5 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-bone/35">
                {groupName}
              </p>
              <div className="grid grid-cols-6 gap-1.5">
                {HABIT_ICON_KEYS.filter((k) => HABIT_ICONS[k].group === groupName).map(
                  (key) => {
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
                  },
                )}
              </div>
            </div>
          ))}
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

        <div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
          <p className="text-[0.9375rem] font-semibold text-bone">
            {detail.group.target > 1
              ? `${detail.group.target}× a ${periodWord}`
              : `Every ${periodWord}`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-bone/45">
            The rhythm cannot be changed. Everyone republishes their recent
            periods each time they open the app, so a new target would re-score
            history the group has already seen — periods people remember
            completing would turn into misses. Start a new group instead.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
