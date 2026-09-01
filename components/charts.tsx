"use client";

import { useId } from "react";
import {
  AUTOMATICITY_FAST_REPS,
  AUTOMATICITY_MEDIAN_REPS,
  AUTOMATICITY_SLOW_REPS,
  automaticityAt,
  type TrendPoint,
  type WeekdayRate,
} from "@/lib/analytics";
import { WEEKDAY_LABELS, WEEKDAY_NAMES } from "@/lib/date";

/**
 * Charts are hand-drawn SVG on a fixed viewBox, scaled by CSS. No charting
 * library: every one of these is a handful of points, and the axis and legend
 * conventions a library brings are the wrong ones for a phone.
 */

const INK_SOFT = "rgba(246,242,233,.14)";
const INK_TEXT = "rgba(246,242,233,.45)";

/* ------------------------------------------------------------------ *
 * Automaticity — Lally et al. (2010)
 * ------------------------------------------------------------------ */

interface AutomaticityChartProps {
  repetitions: number;
  color: string;
}

export function AutomaticityChart({ repetitions, color }: AutomaticityChartProps) {
  const W = 320;
  const H = 150;
  const PAD_L = 4;
  const PAD_B = 22;
  const plotW = W - PAD_L - 8;
  const plotH = H - PAD_B - 10;

  // The x axis runs to the slow end of the published range, so the enormous
  // individual variation is visible rather than implied.
  const maxReps = AUTOMATICITY_SLOW_REPS;
  const x = (reps: number) => PAD_L + (Math.min(reps, maxReps) / maxReps) * plotW;
  const y = (value: number) => 10 + (1 - value) * plotH;

  const path = Array.from({ length: 121 }, (_, i) => {
    const reps = (i / 120) * maxReps;
    return `${i === 0 ? "M" : "L"}${x(reps).toFixed(1)},${y(automaticityAt(reps)).toFixed(1)}`;
  }).join(" ");

  const here = Math.min(repetitions, maxReps);
  const gradientId = useId();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label={`Modelled automaticity curve. You are at ${repetitions} repetitions; the median to near-automatic is ${AUTOMATICITY_MEDIAN_REPS}.`}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 95% of asymptote — the line the published figures refer to. Labelled
          on the left, where the curve is nowhere near it. */}
      <line x1={PAD_L} x2={W - 8} y1={y(0.95)} y2={y(0.95)}
        stroke={INK_SOFT} strokeWidth="1" strokeDasharray="3 3" />
      <text x={PAD_L + 2} y={y(0.95) - 5} textAnchor="start" fontSize="9" fill={INK_TEXT}>
        near-automatic
      </text>

      {/* The individual range, as guides rather than a filled band: shading
          18-254 covers nearly the whole plot and reads as an area series. */}
      {[AUTOMATICITY_FAST_REPS, AUTOMATICITY_MEDIAN_REPS, AUTOMATICITY_SLOW_REPS].map((reps) => (
        <line key={reps} x1={x(reps)} x2={x(reps)} y1={10} y2={y(0)}
          stroke={INK_SOFT} strokeWidth="1" />
      ))}

      <path d={`${path} L${x(maxReps)},${y(0)} L${PAD_L},${y(0)} Z`} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />

      {repetitions > 0 && (
        <>
          <line x1={x(here)} x2={x(here)} y1={y(automaticityAt(here))} y2={y(0)}
            stroke={color} strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
          <circle cx={x(here)} cy={y(automaticityAt(here))} r="5" fill={color}
            stroke="#08070a" strokeWidth="2.5" />
        </>
      )}

      {[
        { reps: AUTOMATICITY_FAST_REPS, label: "18", anchor: "start" as const },
        { reps: AUTOMATICITY_MEDIAN_REPS, label: "66 median", anchor: "middle" as const },
        { reps: AUTOMATICITY_SLOW_REPS, label: "254 reps", anchor: "end" as const },
      ].map(({ reps, label, anchor }) => (
        <text key={label} x={x(reps)} y={H - 6} textAnchor={anchor} fontSize="9" fill={INK_TEXT}>
          {label}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Consistency trend
 * ------------------------------------------------------------------ */

export function TrendChart({ points, color }: { points: TrendPoint[]; color: string }) {
  const W = 320;
  const H = 110;
  const gradientId = useId();

  if (points.length < 2) return null;

  const x = (i: number) => (i / (points.length - 1)) * (W - 8) + 4;
  const y = (rate: number) => 8 + (1 - rate) * (H - 26);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label={`Rolling consistency, currently ${Math.round(last.rate * 100)} percent.`}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[1, 0.5, 0].map((v) => (
        <line key={v} x1="4" x2={W - 4} y1={y(v)} y2={y(v)} stroke={INK_SOFT} strokeWidth="1" />
      ))}
      <text x="4" y={y(1) - 4} fontSize="9" fill={INK_TEXT}>100%</text>

      <path d={`${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(last.rate)} r="4.5" fill={color}
        stroke="#08070a" strokeWidth="2.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Weekday pattern
 * ------------------------------------------------------------------ */

export function WeekdayChart({ rates, color }: { rates: WeekdayRate[]; color: string }) {
  // Monday first: a week that starts on Sunday puts the weekend either side.
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((d) => rates[d]);
  const active = ordered.filter((r) => r.rate !== null);
  const weakest = active.length
    ? active.reduce((lo, r) => ((r.rate ?? 1) < (lo.rate ?? 1) ? r : lo))
    : null;

  return (
    <div className="flex items-end gap-1.5" role="img"
      aria-label={ordered
        .filter((r) => r.rate !== null)
        .map((r) => `${WEEKDAY_NAMES[r.day]} ${Math.round((r.rate ?? 0) * 100)} percent`)
        .join(", ")}>
      {ordered.map((r) => {
        const rest = r.rate === null;
        const pct = Math.round((r.rate ?? 0) * 100);
        const isWeak = !rest && weakest?.day === r.day && active.length > 2;
        return (
          <div key={r.day} className="flex flex-1 flex-col items-center gap-1.5">
            <span className={`text-[0.625rem] font-bold tabular-nums ${isWeak ? "text-hyperpink" : "text-bone/45"}`}>
              {rest ? "—" : `${pct}`}
            </span>
            <div className="flex h-20 w-full items-end rounded-md bg-white/5">
              <div
                className="w-full rounded-md transition-[height] duration-500"
                style={{
                  height: rest ? "0%" : `${Math.max(4, pct)}%`,
                  background: isWeak ? "#FF2E88" : color,
                  opacity: rest ? 0 : 1,
                }}
              />
            </div>
            <span className="text-[0.625rem] font-semibold uppercase text-bone/35">
              {WEEKDAY_LABELS[r.day]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Recovery — one miss versus two
 * ------------------------------------------------------------------ */

export function RecoveryBar({
  recovered,
  slipped,
  color,
}: {
  recovered: number;
  slipped: number;
  color: string;
}) {
  const total = recovered + slipped;
  if (!total) return null;
  const pct = (recovered / total) * 100;

  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-white/8" role="img"
      aria-label={`Came back after ${recovered} of ${total} misses.`}>
      <div style={{ width: `${pct}%`, background: color }} />
      <div style={{ width: `${100 - pct}%`, background: "#FF2E88", opacity: 0.55 }} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Year heatmap
 * ------------------------------------------------------------------ */

export interface HeatCell {
  key: string;
  /** 0-1, or null when the habit was not scheduled that day. */
  level: number | null;
}

export function YearHeatmap({ cells, color }: { cells: HeatCell[]; color: string }) {
  // Columns of seven, oldest first — the shape everyone already reads.
  const weeks: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="edge-rail overflow-x-auto py-1">
      <div className="flex gap-[3px]">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell) => (
              <span
                key={cell.key}
                title={cell.key}
                className="h-[9px] w-[9px] rounded-[2px]"
                style={{
                  background:
                    cell.level === null
                      ? "rgba(246,242,233,.04)"
                      : cell.level === 0
                        ? "rgba(246,242,233,.09)"
                        : color,
                  opacity: cell.level === null || cell.level === 0 ? 1 : 0.35 + cell.level * 0.65,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
