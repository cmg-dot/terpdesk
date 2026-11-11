"use client";

import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import type { Transition } from "framer-motion";
import { HOURS_EASE, HOURS_MOTION_S } from "@/lib/hoursMotion";

export interface HoursMotion {
  /** The person asked their system for less motion: nothing travels or scales, everything lands at once. */
  reduce: boolean;
  /** The timing for one movement of `seconds` (a plain ease-out), or an instant change for reduced motion. */
  transition: (seconds?: number) => Transition;
}

/** The hours review's motion settings, honouring `prefers-reduced-motion`. */
export function useHoursMotion(): HoursMotion {
  const reduceSetting = useReducedMotion();
  const reduce = Boolean(reduceSetting);
  return useMemo(
    () => ({
      reduce,
      transition: (seconds: number = HOURS_MOTION_S): Transition => (reduce ? { duration: 0 } : { duration: seconds, ease: HOURS_EASE }),
    }),
    [reduce],
  );
}
