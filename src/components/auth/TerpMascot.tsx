"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useMascotMood } from "@/components/auth/LoginMascotContext";
import { MascotWing, OWL } from "@/components/auth/MascotParts";
import { MascotTablet } from "@/components/auth/MascotTablet";
import { useOwlGaze } from "@/hooks/useOwlGaze";
import { BODY, BROWS, EYES, PEEKING_EYE, settle } from "@/lib/mascotPoses";
import type { MascotMood, MascotPoses } from "@/lib/mascotPoses";
import { BADGE, BADGE_FLOAT, CARD_FLIP, GREEN_FACE, PULSE, RED_FACE, SCREEN, SCREEN_GLASS, SCREEN_GLOW, SHIMMER } from "@/lib/mascotProps";
import { LEFT_WING, RIGHT_WING } from "@/lib/mascotWings";
import type { WingPoses } from "@/lib/mascotWings";

const MOVING = { body: BODY, eyes: EYES, peekingEye: PEEKING_EYE, brows: BROWS, badge: BADGE, float: BADGE_FLOAT, flip: CARD_FLIP, screen: SCREEN, glass: SCREEN_GLASS, glow: SCREEN_GLOW, green: GREEN_FACE, red: RED_FACE, pulse: PULSE, shimmer: SHIMMER };
type PoseSet = typeof MOVING;
const settleWing = (w: WingPoses): WingPoses => ({ wing: settle(w.wing), wave: settle(w.wave) });
/** Reduced motion: every pose applied at once, no loops. */
const STILL = Object.fromEntries(Object.entries<MascotPoses>(MOVING).map(([part, poses]) => [part, settle(poses)])) as PoseSet;
const STILL_WINGS = { left: settleWing(LEFT_WING), right: settleWing(RIGHT_WING) };

/** The eyes follow the pointer except while covered, peeking at the password or shaking; the face only leans along while relaxed. */
const EYES_FROZEN: ReadonlySet<MascotMood> = new Set<MascotMood>(["password", "passwordPeek", "passwordError", "mfaError"]);
const FACE_FOLLOWS: ReadonlySet<MascotMood> = new Set<MascotMood>(["idle", "email"]);

/**
 * The sign-in mascot: a round baby owl that follows the form. It holds a mini-tablet showing ASL sign cards and waves while idle,
 * glances at the form while an email is typed, covers its eyes for the password (and peeks with one eye when it is shown), turns the tablet into a security card for the
 * two-step code, shakes its head at a wrong password or code, points at its speech bubble for the wrong portal, and bounces on
 * success with "WELCOME TO terpDESK" on the tablet (mascotPoses.ts lists every mood). Its eyes follow
 * the pointer. Decorative only (hidden from screen readers; the form says everything in words); with reduced motion it changes
 * pose without moving and its eyes stay put.
 */
export const TerpMascot = ({ className }: { className?: string }) => {
  const mood = useMascotMood();
  const reduce = Boolean(useReducedMotion());
  const poses = reduce ? STILL : MOVING;
  const wings = reduce ? STILL_WINGS : { left: LEFT_WING, right: RIGHT_WING };
  const clipId = `owl-card-${useId().replace(/:/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const gaze = useOwlGaze(svgRef, !reduce && !EYES_FROZEN.has(mood), FACE_FOLLOWS.has(mood));
  // The first paint (server render included) draws the idle pose; the loops only start when the pose label changes, so it is
  // set once mounted ("drawn" is not a pose: nothing moves before that).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    // overflow visible: a pointing wing reaches past the owl's own box.
    <motion.svg ref={svgRef} viewBox="0 0 200 220" overflow="visible" className={className} aria-hidden="true" focusable="false" initial="idle" animate={mounted ? mood : "drawn"} data-mascot-mood={mood}>
      <motion.g variants={poses.body}>
        <path d="M58 86 L53 54 L84 70 Z M142 86 L147 54 L116 70 Z" fill={OWL.forest} stroke={OWL.forest} strokeWidth={10} strokeLinejoin="round" />
        <ellipse cx={100} cy={138} rx={72} ry={78} fill={OWL.forest} />
        <ellipse cx={100} cy={180} rx={46} ry={33} fill={OWL.sage} />
        <motion.g style={{ x: gaze.faceX, y: gaze.faceY, rotate: gaze.faceTilt }} data-mascot-face>
          <circle cx={76} cy={108} r={30} fill={OWL.cream} />
          <circle cx={124} cy={108} r={30} fill={OWL.cream} />
          <motion.path variants={poses.brows} d="M62 94 L86 87 M138 94 L114 87" fill="none" stroke={OWL.forest} strokeWidth={4.5} strokeLinecap="round" data-mascot-brows />
          {[78, 122].map((x) => (
            <motion.g key={x} variants={x > 100 ? poses.peekingEye : poses.eyes} data-mascot-eye={x > 100 ? "right" : "left"}>
              <motion.g style={{ x: gaze.eyeX, y: gaze.eyeY }} data-mascot-pupil>
                <circle cx={x} cy={110} r={13} fill={OWL.forest} />
                <circle cx={x + 4} cy={105} r={4.5} fill="#FFFFFF" />
              </motion.g>
            </motion.g>
          ))}
          <path d="M91 127 Q100 122 109 127 Q105 137 100 142 Q95 137 91 127 Z" fill={OWL.amber} />
        </motion.g>

        <MascotTablet poses={poses} clipId={clipId} mood={mood} />

        <MascotWing poses={wings.left} />
        <MascotWing poses={wings.right} mirrored />
      </motion.g>
    </motion.svg>
  );
};
