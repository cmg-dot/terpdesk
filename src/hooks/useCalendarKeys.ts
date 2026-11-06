"use client";

import { useEffect, useRef } from "react";

/** Somewhere an arrow key already means something else: a text field, a menu or list, an open dialog or popover. */
const CLAIMS_ARROWS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="listbox"], [role="menu"], [role="slider"], [aria-modal="true"]';

const isBusy = (target: EventTarget | null): boolean => {
  if (target instanceof Element && target.closest(CLAIMS_ARROWS)) return true;
  // A popover is portalled to <body>, so focus can be elsewhere while one is open; the keys stay out of its way.
  return document.querySelector('[role="dialog"], [aria-modal="true"]') !== null;
};

/**
 * Left / Right arrow: one day back / forward. Shift + Left / Right: one week. Does nothing while `enabled` is false, while
 * a text field, menu or dialog has the keys, or with Ctrl / Alt / Meta held (those belong to the browser).
 */
export const useCalendarKeys = (enabled: boolean, onStep: (unit: "day" | "week", direction: 1 | -1) => void): void => {
  const step = useRef(onStep);
  step.current = onStep;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (isBusy(event.target)) return;
      event.preventDefault();
      step.current(event.shiftKey ? "week" : "day", event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
};
