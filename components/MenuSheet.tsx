"use client";

import { useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { replaceAll, useStore } from "@/lib/store";
import { useInstall } from "@/lib/useInstall";
import { accentOf } from "@/lib/palette";
import { describeCadence } from "@/lib/habits";

interface MenuSheetProps {
  open: boolean;
  onClose: () => void;
}

function Row({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-semibold text-bone">{title}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs leading-relaxed text-bone/45">{subtitle}</p>
        )}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition-colors ${
        checked ? "bg-acid" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-[left] duration-200 ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export function MenuSheet({ open, onClose }: MenuSheetProps) {
  const { state, setName, setPrefs, setArchived, resetAll } = useStore();
  const install = useInstall();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importNote, setImportNote] = useState("");

  const archived = state.habits.filter((h) => h.archivedAt);

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `streakwrapped-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed?.habits)) throw new Error("bad shape");
      replaceAll(parsed);
      setImportNote("");
      onClose();
    } catch {
      setImportNote("That file didn't look like a StreakWrapped backup.");
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-6">
        <div>
          <label
            htmlFor="display-name"
            className="mb-2 block text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45"
          >
            Your name
          </label>
          <input
            id="display-name"
            value={state.name}
            onChange={(e) => setName(e.target.value.slice(0, 24))}
            placeholder="Used in greetings and your Wrapped"
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-base text-bone outline-none transition placeholder:text-bone/30 focus:border-white/30"
          />
        </div>

        <div className="space-y-2">
          <Row
            title="Home screen shortcut"
            subtitle={
              install.isStandalone
                ? "You're running the installed app."
                : state.prefs.installed
                  ? "Already added on this device."
                  : install.platform === "unsupported"
                    ? "This browser can't install web apps. Try Chrome on Android or Safari on iOS."
                    : "Opens full screen, works offline."
            }
            action={
              install.isStandalone ? (
                <span className="rounded-full bg-acid/20 px-3 py-1.5 text-xs font-bold text-acid">
                  Installed
                </span>
              ) : install.platform === "unsupported" ? (
                <span className="text-xs text-bone/30">—</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // Re-arm the CTA even if it was dismissed or already installed.
                    setPrefs({ installRequested: true, installDismissedUntil: 0 });
                    onClose();
                  }}
                  className="rounded-full bg-acid px-4 py-2 text-xs font-bold text-[#121a00] transition active:scale-95"
                >
                  {state.prefs.installed ? "Show again" : "Add"}
                </button>
              )
            }
          />

          <Row
            title="Reduce motion"
            subtitle="Turns off the background drift, confetti and slide animations."
            action={
              <Toggle
                checked={state.prefs.reduceMotion}
                onChange={(v) => setPrefs({ reduceMotion: v })}
                label="Reduce motion"
              />
            }
          />
        </div>

        {archived.length > 0 && (
          <div>
            <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
              Archived ({archived.length})
            </p>
            <ul className="space-y-2">
              {archived.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-3 py-2.5"
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base opacity-60"
                    style={{ background: accentOf(h.accent).hex }}
                  >
                    {h.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-bone/70">
                      {h.name}
                    </span>
                    <span className="block text-xs text-bone/35">
                      {describeCadence(h)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setArchived(h.id, false)}
                    className="shrink-0 rounded-full border border-white/12 px-3 py-1.5 text-xs font-semibold text-bone/60 transition hover:bg-white/10 hover:text-bone active:scale-95"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-bone/45">
            Your data
          </p>
          <p className="mb-3 text-xs leading-relaxed text-bone/40">
            Everything lives in this browser on this device — no account, no server.
            Clearing site data wipes it, so export a backup if it matters.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportData}
              className="rounded-full border border-white/12 px-4 py-2.5 text-sm font-semibold text-bone/70 transition hover:bg-white/10 hover:text-bone active:scale-95"
            >
              Export backup
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-white/12 px-4 py-2.5 text-sm font-semibold text-bone/70 transition hover:bg-white/10 hover:text-bone active:scale-95"
            >
              Import backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importData(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (!confirmReset) {
                  setConfirmReset(true);
                  return;
                }
                resetAll();
                onClose();
              }}
              className="rounded-full border border-hyperpink/30 px-4 py-2.5 text-sm font-semibold text-hyperpink/80 transition hover:bg-hyperpink/10 active:scale-95"
            >
              {confirmReset ? "Tap again to erase everything" : "Erase all data"}
            </button>
          </div>
          {importNote && (
            <p className="mt-2 text-xs font-medium text-hyperpink">{importNote}</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
