"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useHoursMotion } from "@/hooks/useHoursMotion";

/**
 * Something that opens and closes in place: its height grows from nothing while it fades in, and folds away again when it leaves
 * (render it inside an <AnimatePresence>). The clipping that makes the fold look right is dropped once it is open, so a dropdown
 * menu inside it is never cut off. With reduced motion set on the device it appears and goes at once.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const { reduce, transition } = useHoursMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { height: 0, opacity: 0, overflow: "hidden" }}
      animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" }, transition: transition(0.22) }}
      exit={{ height: 0, opacity: 0, overflow: "hidden", transition: transition(0.18) }}
    >
      {children}
    </motion.div>
  );
}
