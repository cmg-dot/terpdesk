import type { TargetAndTransition } from "framer-motion";

/**
 * The hours review's motion, in one place so every row, panel and list moves the same way: short (150 to 250 ms), a smooth ease-out
 * with no bounce, nothing that travels more than a few pixels. Reduced-motion users get the same end states with no travel at all
 * (see useHoursMotion). Pure constants: no business logic lives here.
 */

/** The exit of a card or a row that has been dealt with, a tab or page change fading out. */
export const HOURS_MOTION_FAST_S = 0.15;
/** Opening a panel, a card or list arriving. */
export const HOURS_MOTION_S = 0.2;
/** A touch of ease-out: it settles without overshoot. */
export const HOURS_EASE = [0.4, 0, 0.2, 1] as const;
/** The most any one item waits behind the ones above it when a list arrives (a light stagger, never a slow cascade). */
export const HOURS_STAGGER_S = 0.025;
/** How far a page of rows slides when the page number changes. */
export const HOURS_SLIDE_PX = 24;
export const HOURS_STAGGER_MAX_STEPS = 5;

/**
 * A details panel opening and closing by height. `overflow` is hidden only while it moves, so a focus ring or a menu inside the open
 * panel is never clipped once it has settled.
 */
export const PANEL: { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition } = {
  initial: { height: 0, opacity: 0, overflow: "hidden" },
  animate: { height: "auto", opacity: 1, overflow: "hidden", transitionEnd: { overflow: "visible" } },
  exit: { height: 0, opacity: 0, overflow: "hidden" },
};

/** The height of the gap between two cards in a list (Tailwind gap-3). It collapses WITH the card, so nothing jumps when one leaves. */
export const LIST_GAP_CLASS = "pb-3";
