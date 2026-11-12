"use client";

import { motion } from "framer-motion";
import { WING_LENGTH } from "@/lib/mascotWings";
import type { WingPoses } from "@/lib/mascotWings";

/** The owl's palette (fixed, like a logo): forest, cream, sage, mint, a warm amber beak, and badge red for a refused code. */
export const OWL = {
  forest: "#0B3B32",
  cream: "#FAF9F5",
  sage: "#E2EBE5",
  mint: "#10B981",
  mintDeep: "#059669",
  mintPale: "#ECFDF5",
  amber: "#D97706",
  red: "#9E3929",
  redPale: "#FEF2F2",
} as const;

/** The wing turns about its root (its own (0, 0)), for both its pose and its wave. */
const PIVOT = { transformBox: "view-box" as const, originX: "0px", originY: "0px" };
/** A round teardrop: root at (0, 0), widest a little below it, tapering to a soft tip at (0, WING_LENGTH). */
const WING_SHAPE = `M0 -4 C10.5 -4 14.5 9 13.5 21 C12.5 32 5.5 ${WING_LENGTH - 6} 0 ${WING_LENGTH} C-5.5 ${WING_LENGTH - 6} -12.5 32 -13.5 21 C-14.5 9 -10.5 -4 0 -4 Z`;
/** A soft inner accent along the wing. */
const WING_ACCENT = `M-5 5 C-8.5 15 -7 27 -1.5 ${WING_LENGTH - 9}`;

/** One wing (see mascotWings.ts): a single mint teardrop with a deeper mint accent curve. `mirrored` draws the right wing. */
export const MascotWing = ({ poses, mirrored = false }: { poses: WingPoses; mirrored?: boolean }) => (
  <g transform={mirrored ? "translate(200 0) scale(-1 1)" : undefined} data-mascot-wing={mirrored ? "right" : "left"}>
    <motion.g variants={poses.wing} style={PIVOT}>
      <motion.g variants={poses.wave} style={PIVOT} data-wing-root>
        <path d={WING_SHAPE} fill={OWL.mint} data-wing-body />
        <path d={WING_ACCENT} fill="none" stroke={OWL.mintDeep} strokeWidth={2.2} strokeLinecap="round" />
      </motion.g>
    </motion.g>
  </g>
);
