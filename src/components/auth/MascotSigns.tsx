"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { OWL } from "@/components/auth/MascotParts";
import type { MascotMood } from "@/lib/mascotPoses";

/** How long each sign card stays on the tablet's screen. */
const CARD_MS = 3000;
const FINGER = { fill: "none", stroke: OWL.forest, strokeWidth: 2.6, strokeLinecap: "round" as const };
const PALM = <rect x={-6} y={-2} width={12} height={10} rx={4} fill={OWL.forest} />;

/** The hand rocks about its own ring (its group's (0, 0)). */
const PIVOT = { transformBox: "view-box" as const, originX: "0px", originY: "0px" };
/** How far each ring sits from the symbol's centre: the two thick rings just touch there. */
const RING_GAP = 4.3;
/** The emblem is drawn a little smaller than the other icons, so its strokes are thickened to keep the same weight on screen. */
const EMBLEM_SCALE = 0.78;
const BAR = { fill: "none", stroke: OWL.forest, strokeWidth: 2.6 / EMBLEM_SCALE, strokeLinecap: "round" as const };

/**
 * One hand of the interpreter symbol, as flat geometry that stays crisp at icon size: a solid rounded palm block, three
 * straight finger bars and a thick thumb-and-index ring (an F-hand). Drawn upright, ring at (6, -1.5), then turned 35 degrees
 * so its fingers point up and to the right, palm out to the left and ring in the middle; the other hand is this one turned half
 * round. It rocks a few degrees about its ring, `turn` setting which way it starts.
 */
const InterpretHand = ({ turn }: { turn: 1 | -1 }) => {
  const reduce = useReducedMotion();
  return (
    <g transform={`translate(${-RING_GAP} 0)`}>
      <motion.g
        style={PIVOT}
        animate={reduce ? { rotate: 0 } : { rotate: [0, 5 * turn, 0, -5 * turn, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <g transform="rotate(35) translate(-6 1.5)">
          <rect x={-6} y={-1} width={11} height={9} rx={3} fill={OWL.forest} />
          <path d="M-4 -1 V-9.5 M-0.8 -1.5 V-11 M2.4 -1 V-9.5" {...BAR} />
          <circle cx={6} cy={-1.5} r={2.9} fill="none" stroke={OWL.forest} strokeWidth={3} />
        </g>
      </motion.g>
    </g>
  );
};

/** A sign's drawn extent (strokes included), in its own units about (0, 0): measured in the browser, plus half of each stroke. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The sign icons, drawn about (0, 0). `label` names the card (data-asl-card); it is not drawn. */
const SIGNS: readonly { label: string; box: Box; icon: ReactNode }[] = [
  {
    // An open hand, waving.
    label: "HELLO",
    box: { x: -10.8, y: -12.3, w: 24.1, h: 20.3 },
    icon: (
      <>
        {PALM}
        <path d="M-4.5 -2 V-9 M-1.5 -3 V-11 M1.5 -3 V-10.5 M4.5 -2 V-8.5 M-6 3 L-9.5 -1" {...FINGER} />
        <path d="M8.5 -10 q2.2 2.2 0 4.4 M11 -11.5 q3.2 3.6 0 7.2" fill="none" stroke={OWL.mint} strokeWidth={1.4} strokeLinecap="round" />
      </>
    ),
  },
  {
    // The ILY handshape: thumb, index and little finger up, the middle two folded.
    label: "ILY",
    box: { x: -11.3, y: -11.3, w: 17.3, h: 19.3 },
    icon: (
      <>
        {PALM}
        <path d="M-4.5 -2 V-10 M4.5 -2 V-9 M-1.5 -2 V-4 M1.5 -2 V-4 M-6 3 L-10 -1" {...FINGER} />
      </>
    ),
  },
  {
    // INTERPRET: the interpreter symbol, two F-hands whose thumb-and-index rings meet in the middle, fingers up-right and down-left.
    label: "INTERPRET",
    box: { x: -16.6, y: -12.7, w: 33.2, h: 25.4 },
    icon: (
      <g transform={`scale(${EMBLEM_SCALE})`}>
        <InterpretHand turn={1} />
        <g transform="rotate(180)">
          <InterpretHand turn={-1} />
        </g>
      </g>
    ),
  },
];

const FADE = { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.4 } }, exit: { opacity: 0, transition: { duration: 0.3 } } };

/** The screen's glass (MascotTablet: 54 x 36 at (73, 145)) and the room a sign may fill: 5 units clear top and bottom, 6 at the sides. */
const GLASS_CENTRE = { x: 100, y: 163 };
const FIT = { w: 42, h: 26 };
/** No sign is drawn larger than this, so the small hands do not swell past the others. */
const MAX_SCALE = 1.3;

/** Centres a sign on the glass and scales it to fill the room it has (strokes scale with it, so its lines stay in proportion). */
const placeSign = (box: Box): string => {
  const scale = Math.min(MAX_SCALE, FIT.w / box.w, FIT.h / box.h);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return `translate(${GLASS_CENTRE.x} ${GLASS_CENTRE.y}) scale(${scale.toFixed(3)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`;
};

/**
 * The tablet's screen content: while idle or typing the email it cycles through three ASL sign cards (HELLO, ILY, INTERPRET),
 * each centred and filling the screen, crossfading every few seconds; on success it shows the welcome: a check that draws itself
 * and "WELCOME TO terpDESK" (on the screen's deep forest glass, see SCREEN_GLASS). The timer only runs while the cards are on show.
 */
export const MascotSigns = ({ mood }: { mood: MascotMood }) => {
  const [index, setIndex] = useState(0);
  const cycling = mood === "idle" || mood === "email";
  useEffect(() => {
    if (!cycling) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SIGNS.length), CARD_MS);
    return () => window.clearInterval(timer);
  }, [cycling]);
  const sign = SIGNS[index];
  const reduce = Boolean(useReducedMotion());

  return (
    <AnimatePresence initial={false}>
      {mood === "success" ? (
        <motion.g key="welcome" {...FADE} data-asl-card="WELCOME">
          <circle cx={100} cy={154.5} r={6.5} fill={OWL.mint} />
          <motion.path
            d="M96.8 154.7 L99.2 157.1 L103.6 152.2"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1, transition: { duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.2 } }}
            data-welcome-check
          />
          <text x={100} y={167.5} textAnchor="middle" fontSize={4.4} fontWeight={700} letterSpacing={0.9} fill={OWL.mintPale} opacity={0.85}>
            WELCOME TO
          </text>
          <text x={100} y={177} textAnchor="middle" fontSize={8} fontWeight={800}>
            <tspan fill={OWL.mint}>terp</tspan>
            <tspan fill="#FFFFFF">DESK</tspan>
          </text>
        </motion.g>
      ) : (
        <motion.g key={sign.label} {...FADE} data-asl-card={sign.label}>
          <g transform={placeSign(sign.box)}>{sign.icon}</g>
        </motion.g>
      )}
    </AnimatePresence>
  );
};
