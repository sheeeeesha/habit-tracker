"use client";

import { useEffect, useId, useRef } from "react";
import { ICON_WEIGHT, X } from "./icons";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Hidden from view but read out by screen readers. */
  description?: string;
  children: React.ReactNode;
  /** Sticky action area pinned above the safe-area inset. */
  footer?: React.ReactNode;
}

/**
 * Bottom sheet on phones, centred dialog from `sm` up. Locks background
 * scrolling, closes on Escape or backdrop tap, and moves focus inside on open.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Compensate for the vanishing scrollbar so the page doesn't jump.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const { overflow, paddingRight } = document.body.style;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    const focusTimer = window.setTimeout(() => {
      // An explicit [data-autofocus] wins; `querySelector` with a grouped
      // selector would otherwise just return whatever comes first in the DOM
      // (the close button), which reads badly and traps the eye.
      const panel = panelRef.current;
      const target =
        panel?.querySelector<HTMLElement>("[data-autofocus]") ??
        panel?.querySelector<HTMLElement>(
          "input, select, textarea, button, [tabindex]:not([tabindex='-1'])",
        );
      target?.focus();
    }, 60);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm [animation:fade-in_.2s_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-white/12 bg-ink-2 shadow-2xl [animation:slide-up_.34s_cubic-bezier(.16,1,.3,1)] sm:max-w-lg sm:rounded-[2rem]"
      >
        <div className="shrink-0 px-5 pt-3 pb-1">
          <div
            aria-hidden
            className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-white/20 sm:hidden"
          />
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="display-md text-bone">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="tap-target -mt-1 -mr-2 grid place-items-center rounded-full text-bone/50 transition hover:bg-white/10 hover:text-bone active:scale-90"
            >
              <X size={20} weight={ICON_WEIGHT} aria-hidden />
            </button>
          </div>
          {description && (
            <p id={descId} className="mt-1 text-sm text-bone/55">
              {description}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-white/10 bg-ink-2/95 px-5 pt-4 pb-safe backdrop-blur">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
