"use client";

/**
 * Imperative confetti burst. Appends short-lived nodes straight to <body> so a
 * celebration never triggers a React re-render on the list behind it.
 */
export function burstConfetti(
  origin: { x: number; y: number },
  colors: string[],
  count = 22,
) {
  if (typeof document === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (document.documentElement.dataset.reduceMotion === "true") return;

  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = `position:fixed;left:${origin.x}px;top:${origin.y}px;z-index:60;pointer-events:none`;

  for (let i = 0; i < count; i++) {
    const bit = document.createElement("span");
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 60 + Math.random() * 90;
    const size = 5 + Math.random() * 6;
    const isRound = Math.random() > 0.55;
    bit.style.cssText = [
      "position:absolute",
      "left:0",
      "top:0",
      `width:${size}px`,
      `height:${size * (isRound ? 1 : 0.45)}px`,
      `background:${colors[i % colors.length]}`,
      `border-radius:${isRound ? "50%" : "1px"}`,
      `--dx:${Math.cos(angle) * distance}px`,
      // Bias downward so the burst reads as gravity, not an explosion.
      `--dy:${Math.sin(angle) * distance + 70}px`,
      `--dr:${Math.random() * 720 - 360}deg`,
      `animation:confetti-fall ${700 + Math.random() * 450}ms cubic-bezier(.2,.7,.4,1) forwards`,
    ].join(";");
    layer.appendChild(bit);
  }

  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1400);
}

/** Short haptic tick where supported (Android Chrome). */
export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
