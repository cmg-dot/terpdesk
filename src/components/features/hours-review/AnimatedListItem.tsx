"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { HOURS_MOTION_FAST_S, HOURS_STAGGER_MAX_STEPS, HOURS_STAGGER_S, LIST_GAP_CLASS } from "@/lib/hoursMotion";

/**
 * One card or row in a list (render it directly inside an <AnimatePresence>). It fades in a few pixels below where it settles, one
 * step after the card above it, and when it leaves (a record approved or sent back for correction, an assignment made, a filter that
 * no longer matches) it fades, narrows slightly and folds to nothing, taking the gap below it along so the cards under it glide up
 * instead of jumping. The list that holds these items needs `-mb-3` to cancel the last item's gap. Presentation only.
 */
export function AnimatedListItem({ children, index = 0 }: { children: ReactNode; index?: number }) {
  const { reduce, transition } = useHoursMotion();
  const step = Math.min(index, HOURS_STAGGER_MAX_STEPS) * HOURS_STAGGER_S;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, scale: 1, height: "auto", transitionEnd: { overflow: "visible" }, transition: { ...transition(), delay: reduce ? 0 : step } }}
      exit={reduce ? { opacity: 0, height: 0, overflow: "hidden", transition: transition(0) } : { opacity: 0, scale: 0.98, height: 0, overflow: "hidden", transition: transition(HOURS_MOTION_FAST_S) }}
    >
      <div className={LIST_GAP_CLASS}>{children}</div>
    </motion.div>
  );
}
