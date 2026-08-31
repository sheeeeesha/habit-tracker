"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, ICON_WEIGHT, X } from "../icons";

export interface StorySlide {
  id: string;
  /** Any CSS background — flat colour or gradient. */
  background: string;
  /** Ink colour for everything drawn on top of `background`. */
  ink: string;
  content: React.ReactNode;
  /** Decorative shape filling the upper half of the slide. */
  motif?: React.ReactNode;
  /** Milliseconds before auto-advancing. */
  duration?: number;
}

interface StoryProps {
  slides: StorySlide[];
  onExit: () => void;
  /** Skips auto-advance and slide transitions. */
  reduceMotion?: boolean;
}

const DEFAULT_DURATION = 5200;
const TAP_MS = 260;
const TAP_SLOP = 12;
const SWIPE_MIN = 48;

export function Story({ slides, onExit, reduceMotion = false }: StoryProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const pointer = useRef<{ x: number; y: number; t: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const slide = slides[index];
  const isLast = index === slides.length - 1;

  const go = useCallback(
    (delta: 1 | -1) => {
      setIndex((i) => {
        const next = i + delta;
        if (next < 0) return 0;
        if (next >= slides.length) return slides.length - 1;
        return next;
      });
    },
    [slides.length],
  );

  // Keyboard controls mirror the tap zones.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return onExit();
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onExit]);

  // Take focus so the arrow keys work without a click first.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    pointer.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setPaused(true);
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = pointer.current;
    pointer.current = null;
    setPaused(false);
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const elapsed = Date.now() - start.t;

    // Horizontal swipe wins over a tap.
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (elapsed < TAP_MS && Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) {
      const bounds = e.currentTarget.getBoundingClientRect();
      const isLeftZone = e.clientX - bounds.left < bounds.width * 0.32;
      if (isLeftZone) go(-1);
      else if (!isLast) go(1);
    }
  }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="fixed inset-0 z-40 overflow-hidden outline-none select-none"
      style={{ background: slide.background, color: slide.ink }}
    >
      {/* Progress bars ------------------------------------------------- */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-safe">
        {slides.map((s, i) => (
          <div
            key={s.id}
            className="h-[3px] flex-1 overflow-hidden rounded-full"
            style={{ background: "color-mix(in srgb, currentColor 26%, transparent)" }}
          >
            <div
              className="h-full origin-left rounded-full"
              // Longhand only: mixing the `animation` shorthand with
              // `animationPlayState` makes React warn and can drop one of them.
              style={{
                background: "currentColor",
                transform:
                  i < index || (i === index && reduceMotion)
                    ? "scaleX(1)"
                    : i === index
                      ? undefined
                      : "scaleX(0)",
                animationName: i === index && !reduceMotion ? "barfill" : undefined,
                animationDuration: `${s.duration ?? DEFAULT_DURATION}ms`,
                animationTimingFunction: "linear",
                animationFillMode: "forwards",
                animationPlayState: paused ? "paused" : "running",
              }}
              onAnimationEnd={() => {
                if (i === index && !isLast) go(1);
              }}
            />
          </div>
        ))}
      </div>

      {/* Close --------------------------------------------------------- */}
      <button
        type="button"
        onClick={onExit}
        aria-label="Close Wrapped"
        className="absolute right-2 top-6 z-30 grid h-11 w-11 place-items-center rounded-full transition hover:bg-black/10 active:scale-90"
        style={{ marginTop: "env(safe-area-inset-top, 0px)" }}
      >
        <X size={22} weight={ICON_WEIGHT} aria-hidden />
      </button>

      {/* Poster motif — decorative only, sits behind the type. */}
      {slide.motif && (
        <div
          aria-hidden
          key={`motif-${slide.id}`}
          className="pointer-events-none absolute inset-x-0 top-[9%] h-[36%] opacity-[0.17] animate-float"
        >
          {slide.motif}
        </div>
      )}

      {/* Slide --------------------------------------------------------- */}
      <div
        className="absolute inset-0 touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointer.current = null;
          setPaused(false);
        }}
      >
        <div
          key={slide.id}
          // `mt-auto` on the child (rather than justify-end) anchors the poster
          // to the bottom but collapses to normal top-aligned scrolling as soon
          // as a slide is taller than the screen, so nothing is ever clipped.
          className="flex h-full w-full flex-col overflow-y-auto overscroll-contain px-6 pt-20 pb-24 sm:px-10"
          style={
            reduceMotion
              ? undefined
              : {
                  animationName: "rise",
                  animationDuration: "500ms",
                  animationTimingFunction: "cubic-bezier(.16,1,.3,1)",
                  animationFillMode: "both",
                }
          }
        >
          <div className="mx-auto mt-auto w-full max-w-md">{slide.content}</div>
        </div>
      </div>

      {/* Explicit controls — tap zones alone are not discoverable or
          reachable for keyboard and screen-reader users. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-4 pb-safe">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Previous"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full transition hover:bg-black/10 active:scale-90 disabled:opacity-25"
        >
          <CaretLeft size={22} weight={ICON_WEIGHT} aria-hidden />
        </button>

        <span
          aria-live="polite"
          className="pointer-events-none text-xs font-semibold tabular-nums opacity-45"
        >
          {index + 1} / {slides.length}
        </span>

        <button
          type="button"
          onClick={() => go(1)}
          disabled={isLast}
          aria-label="Next"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full transition hover:bg-black/10 active:scale-90 disabled:opacity-25"
        >
          <CaretRight size={22} weight={ICON_WEIGHT} aria-hidden />
        </button>
      </div>
    </div>
  );
}
