import type { TargetAndTransition, Transition } from "framer-motion";
import { EASE, MOVE, byMood } from "@/lib/mascotPoses";
import type { MascotPoses } from "@/lib/mascotPoses";

/**
 * The owl's prop, one pose per mood like mascotPoses.ts: the mini-tablet it holds (its screen showing ASL sign cards, or "SIGNED
 * IN"), which flips into the security card for the two-step code (green while waiting, red after a wrong code).
 */

const SHOWN: TargetAndTransition = { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 20 } };
/** The device: held up while idle, typing the email, on success and for the code; tucked away while the eyes are covered or it points. */
export const BADGE: MascotPoses = byMood(
  { opacity: 0, y: 26, scale: 0.6, transition: { duration: 0.2, ease: EASE } },
  { idle: SHOWN, email: SHOWN, success: SHOWN, mfa: SHOWN, mfaError: SHOWN },
);

/** A gentle hover of the held card while waiting. */
const hover: TargetAndTransition = { y: [0, -3, 0], transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } };
export const BADGE_FLOAT: MascotPoses = byMood({ y: 0, transition: MOVE }, { mfa: hover, mfaError: hover });

/** The card flips (squeezes to an edge and back) whenever it turns: when it is first shown, to red and back to green. */
const FLIP_S = 0.36;
const flip: TargetAndTransition = { scaleX: [1, 0, 1], transition: { duration: FLIP_S, ease: "easeInOut" } };
export const CARD_FLIP: MascotPoses = byMood({ scaleX: 1, transition: { duration: 0 } }, { mfa: flip, mfaError: flip });

/** The faces swap halfway through the flip, while the card is edge-on. */
const swap = (opacity: number): TargetAndTransition => ({ opacity, transition: { delay: FLIP_S / 2, duration: 0 } });
const instantly = (opacity: number): TargetAndTransition => ({ opacity, transition: { duration: 0 } });
export const GREEN_FACE: MascotPoses = byMood(instantly(1), { mfa: swap(1), mfaError: swap(0) });
export const RED_FACE: MascotPoses = byMood(instantly(0), { mfa: swap(0), mfaError: swap(1) });
/** The tablet's glowing screen: on top while it shows signs, gone (mid-flip) once it has turned into the security card. */
export const SCREEN: MascotPoses = byMood({ opacity: 1, transition: MOVE }, { mfa: swap(0), mfaError: swap(0) });
/** The screen's glass: pale mint (#ECFDF5) while it shows signs, deep forest (#0B3B32) edged in mint (#10B981) for the welcome. */
export const SCREEN_GLASS: MascotPoses = byMood(
  { fill: "#ECFDF5", stroke: "#10B981", strokeWidth: 1.2, transition: MOVE },
  { success: { fill: "#0B3B32", stroke: "#10B981", strokeWidth: 2, transition: MOVE } },
);
/** A mint glow that flares round the screen as the welcome comes up, then settles. */
export const SCREEN_GLOW: MascotPoses = byMood({ opacity: 0, transition: { duration: 0.2 } }, { success: { opacity: [0, 0.75, 0.4], transition: { duration: 0.9, ease: "easeOut" } } });

const loop = (seconds: number, extra: Transition = {}): Transition => ({ duration: seconds, repeat: Infinity, ease: "easeOut", ...extra });
/** A soft emerald glow pulsing out from the check while the code is awaited. */
export const PULSE: MascotPoses = byMood({ scale: 1, opacity: 0, transition: { duration: 0.15 } }, { mfa: { scale: [1, 1.9], opacity: [0.55, 0], transition: loop(1.6) } });
/** A light shimmer sweeping across the card now and then while the code is awaited. */
export const SHIMMER: MascotPoses = byMood({ x: -40, transition: { duration: 0 } }, { mfa: { x: [-40, 90], transition: loop(1.4, { ease: "easeInOut", repeatDelay: 1.2, delay: 0.5 }) } });
