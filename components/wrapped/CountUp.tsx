"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  to: number;
  /** Milliseconds for the whole run. */
  duration?: number;
  suffix?: string;
  className?: string;
  reduceMotion?: boolean;
}

/** Eases out fast then settles — the number lands rather than crawls. */
function easeOutExpo(t: number) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function CountUp({
  to,
  duration = 1400,
  suffix = "",
  className,
  reduceMotion = false,
}: CountUpProps) {
  const [value, setValue] = useState(0);
  const frame = useRef<number>(0);

  useEffect(() => {
    // Nothing to animate — the rendered value is derived below instead.
    if (reduceMotion) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(easeOutExpo(t) * to));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [to, duration, reduceMotion]);

  const shown = reduceMotion ? to : value;

  return (
    <span className={className}>
      {/* The live value is decorative motion; announce the final number once. */}
      <span aria-hidden className="tabular-nums">
        {shown.toLocaleString()}
        {suffix}
      </span>
      <span className="sr-only">
        {to.toLocaleString()}
        {suffix}
      </span>
    </span>
  );
}
