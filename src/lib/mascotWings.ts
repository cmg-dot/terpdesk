import type { TargetAndTransition } from "framer-motion";
import { MOVE } from "@/lib/mascotPoses";
import type { MascotMood, MascotPoses } from "@/lib/mascotPoses";

/**
 * The owl's wings, one pose per mood (pure constants; MascotWing in MascotParts.tsx only draws). Each wing is one smooth,
 * rounded teardrop: its root (the shoulder) at its own (0, 0), its tip WING_LENGTH below. A pose places the root, turns the
 * wing about it and may scale it; the wave is a turn about the same root, on top of the pose. Measures are in the 200 x 220
 * viewBox, for the LEFT wing; the right wing is drawn mirrored.
 *   idle / email / success   left wing holds the tablet's edge; right wing raised in a wave (idle, success) or resting (email)
 *   password / passwordError both wings over the eyes / lowered so it peeks over them
 *   passwordPeek             (password shown) the left wing stays over its eye, the right drops and tilts away from the other
 *   mfa / mfaError           both wings hold the security card's edges
 *   wrongPortal              right wing points at the speech bubble
 */
export const WING_LENGTH = 46;

interface WingPose {
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

const REST: WingPose = { x: 34, y: 128, rotate: 14, scale: 1 };
/** Tip on the left edge of the tablet / card in front of the lower chest. */
const HOLD: WingPose = { x: 34, y: 150, rotate: -66, scale: 0.92 };
/** Raised up and out from the shoulder, ready to wave (the right wing, drawn mirrored). */
const RAISED: WingPose = { x: 36, y: 126, rotate: 150, scale: 0.95 };
const OVER_EYE: WingPose = { x: 78, y: 140, rotate: 180, scale: 1.08 };
const PEEK: WingPose = { x: 78, y: 158, rotate: 180, scale: 1.08 };
/** Dropped below the eye and tilted out, so that one eye peeks over it at the password field (the right wing). */
const PEEK_ONE: WingPose = { x: 80, y: 166, rotate: 160, scale: 1.04 };
/** Up and out toward the speech bubble (the right wing). */
const POINT: WingPose = { x: 36, y: 124, rotate: 140, scale: 1 };

const perMood = <T>(fallback: T, special: Partial<Record<MascotMood, T>>): Record<MascotMood, T> => ({
  idle: special.idle ?? fallback,
  email: special.email ?? fallback,
  password: special.password ?? fallback,
  passwordPeek: special.passwordPeek ?? fallback,
  passwordError: special.passwordError ?? fallback,
  mfa: special.mfa ?? fallback,
  mfaError: special.mfaError ?? fallback,
  wrongPortal: special.wrongPortal ?? fallback,
  success: special.success ?? fallback,
});
const toPoses = <T>(values: Record<MascotMood, T>, make: (value: T, mood: MascotMood) => TargetAndTransition): MascotPoses => ({
  idle: make(values.idle, "idle"),
  email: make(values.email, "email"),
  password: make(values.password, "password"),
  passwordPeek: make(values.passwordPeek, "passwordPeek"),
  passwordError: make(values.passwordError, "passwordError"),
  mfa: make(values.mfa, "mfa"),
  mfaError: make(values.mfaError, "mfaError"),
  wrongPortal: make(values.wrongPortal, "wrongPortal"),
  success: make(values.success, "success"),
});

const SHARED = { password: OVER_EYE, passwordPeek: OVER_EYE, passwordError: PEEK, mfa: HOLD, mfaError: HOLD };
const LEFT_POSES = perMood(REST, { idle: HOLD, email: HOLD, success: HOLD, ...SHARED });
const RIGHT_POSES = perMood(REST, { idle: RAISED, success: RAISED, ...SHARED, passwordPeek: PEEK_ONE, wrongPortal: POINT });
const POINT_SPRING = { type: "spring", stiffness: 220, damping: 16 } as const;
const placed = (poses: Record<MascotMood, WingPose>) => toPoses(poses, (p, mood) => ({ ...p, transition: mood === "wrongPortal" ? POINT_SPRING : MOVE }));

/** A friendly wave: the raised wing swings out and back from the shoulder, starting and ending at 0 (so changing mood never jumps). */
const wave = (seconds: number): TargetAndTransition => ({
  rotate: [0, -16, 6, -16, 0],
  transition: { duration: seconds, times: [0, 0.25, 0.5, 0.75, 1], repeat: Infinity, repeatDelay: seconds / 2, ease: "easeInOut" },
});
const STEADY: TargetAndTransition = { rotate: 0, transition: MOVE };

export interface WingPoses {
  wing: MascotPoses;
  wave: MascotPoses;
}

export const LEFT_WING: WingPoses = { wing: placed(LEFT_POSES), wave: toPoses(perMood(STEADY, {}), (t) => t) };
export const RIGHT_WING: WingPoses = { wing: placed(RIGHT_POSES), wave: toPoses(perMood<TargetAndTransition>(STEADY, { idle: wave(1.8), success: wave(0.8) }), (t) => t) };
