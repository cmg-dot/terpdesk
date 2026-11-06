"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface Props {
  /** Changes when the screen's content changes (another month, week, day or view): that is what animates. */
  transitionKey: string;
  /** 1 when the new content is later in time, -1 earlier, 0 for a view change (a plain cross-fade). */
  direction: -1 | 0 | 1;
  children: ReactNode;
}

const SLIDE_PX = 10;

const variants = {
  enter: ({ direction, slide }: { direction: number; slide: number }) => ({ opacity: 0, x: direction * slide }),
  center: { opacity: 1, x: 0 },
  exit: ({ direction, slide }: { direction: number; slide: number }) => ({ opacity: 0, x: -direction * slide }),
};

/**
 * A light cross-fade with a 10px directional slide (0.15s, opacity and transform only, so it stays on the GPU) between
 * months, weeks, days and views. The outgoing screen is lifted out of the layout (popLayout), so the new one is in place
 * and interactive at once; the animation never delays it. Reduced-motion users get the fade without the slide.
 */
export const CalendarTransition = ({ transitionKey, direction, children }: Props) => {
  const reduce = useReducedMotion();
  const custom = { direction, slide: reduce ? 0 : SLIDE_PX };
  return (
    <div className="relative">
      <AnimatePresence mode="popLayout" initial={false} custom={custom}>
        <motion.div key={transitionKey} custom={custom} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.15, ease: "easeOut" }}>
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
