"use client";

import { accentOf } from "./palette";
import type { WrappedStats } from "./wrapped";

const W = 1080;
const H = 1920;

/**
 * next/font rewrites family names at build time, so read the real name back out
 * of the CSS variable rather than hard-coding "Anton".
 */
function fontStack(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the 9:16 poster and hands back a PNG blob. */
export async function renderShareCard(
  stats: WrappedStats,
  name: string,
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  // Without this the first render falls back to a system face.
  try {
    await document.fonts.ready;
  } catch {
    /* older browsers: draw with whatever is loaded */
  }

  const display = fontStack("--font-anton", "Impact, sans-serif");
  const sans = fontStack("--font-outfit", "system-ui, sans-serif");
  const accent = accentOf(stats.archetype.accent);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background --------------------------------------------------------------
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#FF6039");
  bg.addColorStop(0.45, "#FF2E88");
  bg.addColorStop(1, "#9B5CFF");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // A soft dark vignette at the bottom so the footer text stays readable.
  const veil = ctx.createLinearGradient(0, H * 0.55, 0, H);
  veil.addColorStop(0, "rgba(8,7,10,0)");
  veil.addColorStop(1, "rgba(8,7,10,0.42)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, H);

  const PAD = 88;
  ctx.textBaseline = "alphabetic";

  // Header ------------------------------------------------------------------
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `600 30px ${sans}`;
  ctx.letterSpacing = "6px";
  ctx.fillText("STREAKWRAPPED", PAD, 150);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `500 30px ${sans}`;
  ctx.fillText(stats.rangeLabel.toUpperCase(), PAD, 200);

  // Archetype ---------------------------------------------------------------
  ctx.fillStyle = "#ffffff";
  ctx.font = `400 120px ${display}`;
  const title = stats.archetype.title.toUpperCase();
  const words = title.split(" ");
  let line = "";
  let y = 360;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > W - PAD * 2 && line) {
      ctx.fillText(line, PAD, y);
      y += 112;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, PAD, y);
  y += 70;

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `400 34px ${sans}`;
  // Wrap the blurb to the card width.
  const blurbWords = stats.archetype.blurb.split(" ");
  let bl = "";
  for (const word of blurbWords) {
    const test = bl ? `${bl} ${word}` : word;
    if (ctx.measureText(test).width > W - PAD * 2 && bl) {
      ctx.fillText(bl, PAD, y);
      y += 48;
      bl = word;
    } else {
      bl = test;
    }
  }
  if (bl) ctx.fillText(bl, PAD, y);

  // Stat tiles --------------------------------------------------------------
  // A squiggle fills the space between the blurb and the tiles, which varies
  // with how many lines the archetype title wrapped to.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 46;
  ctx.lineCap = "round";
  ctx.beginPath();
  const sy = Math.max(y + 120, 700);
  ctx.moveTo(-40, sy + 90);
  ctx.bezierCurveTo(180, sy - 130, 340, sy + 200, 560, sy + 40);
  ctx.bezierCurveTo(760, sy - 110, 900, sy + 120, 1140, sy - 40);
  ctx.stroke();
  ctx.restore();

  const tiles: Array<[string, string]> = [
    [stats.totalCheckIns.toLocaleString(), "CHECK-INS"],
    [String(stats.longestStreak?.length ?? 0), "BEST STREAK"],
    [`${Math.round(stats.consistency * 100)}%`, "HIT RATE"],
  ];
  const tileY = 1010;
  const gap = 24;
  const tileW = (W - PAD * 2 - gap * 2) / 3;

  tiles.forEach(([value, label], i) => {
    const x = PAD + i * (tileW + gap);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(ctx, x, tileY, tileW, 200, 34);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `400 76px ${display}`;
    ctx.textAlign = "center";
    ctx.fillText(value, x + tileW / 2, tileY + 108);

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = `700 22px ${sans}`;
    ctx.fillText(label, x + tileW / 2, tileY + 156);
    ctx.textAlign = "left";
  });

  // Top habits --------------------------------------------------------------
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `700 26px ${sans}`;
  ctx.letterSpacing = "4px";
  ctx.fillText("TOP HABITS", PAD, 1310);
  ctx.letterSpacing = "0px";

  stats.topHabits.slice(0, 3).forEach((t, i) => {
    const rowY = 1370 + i * 96;
    const a = accentOf(t.habit.accent);

    ctx.fillStyle = a.hex;
    roundRect(ctx, PAD, rowY, 68, 68, 20);
    ctx.fill();

    ctx.font = `400 38px ${sans}`;
    ctx.textAlign = "center";
    ctx.fillText(t.habit.emoji, PAD + 34, rowY + 48);
    ctx.textAlign = "left";

    ctx.fillStyle = "#ffffff";
    ctx.font = `600 38px ${sans}`;
    const maxName = W - PAD * 2 - 100 - 120;
    let label = t.habit.name;
    while (ctx.measureText(label).width > maxName && label.length > 4) {
      label = label.slice(0, -2);
    }
    if (label !== t.habit.name) label += "…";
    ctx.fillText(label, PAD + 100, rowY + 46);

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `600 34px ${sans}`;
    ctx.textAlign = "right";
    ctx.fillText(String(t.count), W - PAD, rowY + 46);
    ctx.textAlign = "left";
  });

  // Footer ------------------------------------------------------------------
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `500 30px ${sans}`;
  ctx.fillText(
    name ? `${name}'s habit year so far` : "My habit year so far",
    PAD,
    H - 110,
  );

  ctx.fillStyle = accent.hex;
  roundRect(ctx, W - PAD - 18, H - 142, 18, 18, 9);
  ctx.fill();

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.95),
  );
}

export type ShareResult = "shared" | "downloaded" | "failed";

/** Web Share with a file where supported, otherwise a plain download. */
export async function shareWrapped(
  stats: WrappedStats,
  name: string,
): Promise<ShareResult> {
  const blob = await renderShareCard(stats, name);
  if (!blob) return "failed";

  const file = new File([blob], "streakwrapped.png", { type: "image/png" });
  const text = `${stats.totalCheckIns} check-ins, a ${stats.longestStreak?.length ?? 0} best streak, and apparently I'm "${stats.archetype.title}".`;

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "My StreakWrapped", text });
      return "shared";
    } catch (err) {
      // AbortError just means the user backed out of the share sheet.
      if ((err as Error)?.name === "AbortError") return "shared";
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "streakwrapped.png";
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
