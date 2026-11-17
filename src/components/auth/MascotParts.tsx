"use client";

import { motion } from "framer-motion";
import { OWL, OWL_SHAPES } from "@/lib/owlGeometry";
import type { WingPoses } from "@/lib/mascotWings";

// The palette lives with the owl's shapes (lib/owlGeometry.ts); the mascot's parts keep importing it from here.
export { OWL };

/** The wing turns about its root (its own (0, 0)), for both its pose and its wave. */
const PIVOT = { transformBox: "view-box" as const, originX: "0px", originY: "0px" };

/** One wing (see mascotWings.ts): a single mint teardrop with a deeper mint accent curve. `mirrored` draws the right wing. */
export const MascotWing = ({ poses, mirrored = false }: { poses: WingPoses; mirrored?: boolean }) => (
  <g transform={mirrored ? "translate(200 0) scale(-1 1)" : undefined} data-mascot-wing={mirrored ? "right" : "left"}>
    <motion.g variants={poses.wing} style={PIVOT}>
      <motion.g variants={poses.wave} style={PIVOT} data-wing-root>
        <path d={OWL_SHAPES.wing} fill={OWL.mint} data-wing-body />
        <path d={OWL_SHAPES.wingAccent} fill="none" stroke={OWL.mintDeep} strokeWidth={OWL_SHAPES.wingAccentStroke} strokeLinecap="round" />
      </motion.g>
    </motion.g>
  </g>
);
