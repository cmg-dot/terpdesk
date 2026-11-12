"use client";

import { motion } from "framer-motion";
import { OWL } from "@/components/auth/MascotParts";
import { MascotSigns } from "@/components/auth/MascotSigns";
import type { MascotMood, MascotPoses } from "@/lib/mascotPoses";

interface TabletPoses {
  badge: MascotPoses;
  float: MascotPoses;
  flip: MascotPoses;
  screen: MascotPoses;
  glass: MascotPoses;
  glow: MascotPoses;
  green: MascotPoses;
  red: MascotPoses;
  pulse: MascotPoses;
  shimmer: MascotPoses;
}

/** The device's outline, shared by its faces and the shimmer's clip. Everything is drawn LOWERED below it, clear of the beak. */
const DEVICE = { x: 68, y: 140, width: 64, height: 46, rx: 10 };
const LOWERED = "translate(0 4)";

/**
 * The TerpDesk mini-tablet the owl holds in front of its chest. While idle or typing the email its glowing screen cycles ASL sign
 * cards (MascotSigns); on success the glass turns deep forest with a mint glow and welcomes the person to terpDESK. For the two-step code it flips into the security card: forest with a
 * mint check (a pulsing glow and a passing shimmer while it waits), flipping again to pale red with an X after a wrong code.
 * Out of sight while the eyes are covered or the owl points. `clipId` must be unique on the page (the owl can be drawn twice).
 */
export const MascotTablet = ({ poses, clipId, mood }: { poses: TabletPoses; clipId: string; mood: MascotMood }) => (
  <motion.g variants={poses.badge} data-mascot-badge>
    <g transform={LOWERED}>
      <defs>
        <clipPath id={clipId}>
          <rect {...DEVICE} />
        </clipPath>
      </defs>
      <motion.g variants={poses.float}>
        <motion.g variants={poses.flip}>
          <motion.g variants={poses.green} data-card-face="green">
            <rect {...DEVICE} fill={OWL.forest} stroke={OWL.mint} strokeWidth={3} />
            <rect x={77} y={149} width={22} height={5} rx={2.5} fill={OWL.mintDeep} />
            <motion.circle variants={poses.pulse} cx={100} cy={168} r={10} fill={OWL.mint} />
            <circle cx={100} cy={168} r={10} fill={OWL.mint} />
            <path d="M95 168 L98.5 171.5 L105 164.5" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <g clipPath={`url(#${clipId})`}>
              <motion.path variants={poses.shimmer} d="M74 138 h10 l-10 50 h-10 Z" fill="#FFFFFF" opacity={0.22} />
            </g>
          </motion.g>
          <motion.g variants={poses.red} data-card-face="red">
            <rect {...DEVICE} fill={OWL.redPale} stroke={OWL.red} strokeWidth={3} />
            <rect x={77} y={149} width={22} height={5} rx={2.5} fill={OWL.red} opacity={0.35} />
            <circle cx={100} cy={168} r={10} fill={OWL.red} />
            <path d="M96 164 L104 172 M104 164 L96 172" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
          </motion.g>
          <motion.g variants={poses.screen} data-tablet-screen>
            <rect {...DEVICE} fill={OWL.forest} />
            <motion.rect variants={poses.glow} x={71} y={143} width={58} height={40} rx={8} fill="none" stroke={OWL.mint} strokeWidth={4} />
            <motion.rect variants={poses.glass} x={73} y={145} width={54} height={36} rx={6} data-tablet-glass />
            <MascotSigns mood={mood} />
          </motion.g>
        </motion.g>
      </motion.g>
    </g>
  </motion.g>
);
