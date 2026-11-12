import type { TargetAndTransition, Transition } from "framer-motion";

/**
 * The sign-in owl's poses, one per mood, as pure constants (the component only draws). Coordinates are in the owl's 200 x 220
 * viewBox. Reduced-motion users get each pose's resting state at once, with no loops (see `settle`). The wings are in
 * mascotWings.ts, the security card in mascotProps.ts.
 *   idle / success   holds the mini-tablet (ASL sign cards / "SIGNED IN") and waves; success adds a happy bounce
 *   email            wings at its sides, glancing toward the form          password         wings over its eyes
 *   passwordPeek     (password shown) one wing drops so one eye peeks at the field, the other stays covered
 *   passwordError    peeks over lowered wings, worried brows, head shake    mfa              holds up the security card
 *   mfaError         the card turns red, head shake                        wrongPortal      points a wing at its speech bubble
 */
export type MascotMood = "idle" | "email" | "password" | "passwordPeek" | "passwordError" | "mfa" | "mfaError" | "wrongPortal" | "success";
export type MascotPoses = Record<MascotMood, TargetAndTransition>;

/** The moods that come with a speech bubble; they last until the person edits the form again. */
export const HINT_MOODS: ReadonlySet<MascotMood> = new Set<MascotMood>(["passwordError", "mfaError", "wrongPortal"]);

/** One pose for every mood, except those given in `special`. */
export const byMood = (fallback: TargetAndTransition, special: Partial<MascotPoses>): MascotPoses => ({
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

export const EASE = [0.4, 0, 0.2, 1] as const;
export const MOVE: Transition = { duration: 0.35, ease: EASE };

const blink: Transition = { duration: 4, times: [0, 0.9, 0.94, 1], repeat: Infinity, ease: "easeInOut" };
const open = (x: number, y: number): TargetAndTransition => ({ x, y, scaleX: 1, scaleY: 1, transition: MOVE });
const SHUT: TargetAndTransition = { x: 0, y: 2, scaleX: 1, scaleY: 0.12, transition: MOVE };
/** Each eye (pupil and shine). It blinks now and then while relaxed and looks where the action is. */
export const EYES: MascotPoses = byMood(open(0, 0), {
  idle: { x: 0, y: 0, scaleX: 1, scaleY: [1, 1, 0.1, 1], transition: { ...MOVE, scaleY: blink } },
  email: { x: 5, y: 2, scaleX: 1, scaleY: [1, 1, 0.1, 1], transition: { ...MOVE, scaleY: blink } },
  password: SHUT,
  passwordPeek: SHUT,
  passwordError: open(0, -4),
  mfa: open(0, 4),
  mfaError: open(0, 4),
  wrongPortal: open(5, -4),
  success: { x: 0, y: -2, scaleX: 1.15, scaleY: 1.15, transition: { type: "spring", stiffness: 400, damping: 12 } },
});

/**
 * The peeking eye (the right one, on the password field's side): the same as EYES except while the password is shown, when it
 * opens wide and looks across and down at the field.
 */
export const PEEKING_EYE: MascotPoses = { ...EYES, passwordPeek: { x: 5, y: 3, scaleX: 1.05, scaleY: 1.05, transition: { ...MOVE, delay: 0.1 } } };

/** Worried brows (inner ends raised) for the two "try again" moods; otherwise out of sight. */
export const BROWS: MascotPoses = byMood(
  { opacity: 0, y: 4, transition: { duration: 0.15 } },
  {
    passwordError: { opacity: 1, y: 0, transition: MOVE },
    mfaError: { opacity: 1, y: 0, transition: MOVE },
  },
);

const float: TargetAndTransition = { x: 0, y: [0, -6, 0], rotate: 0, transition: { y: { duration: 3.6, repeat: Infinity, ease: "easeInOut" }, x: MOVE, rotate: MOVE } };
const shake: Transition = { duration: 0.6, ease: "easeInOut" };
/** The whole owl: a gentle float, a hunch for the password, head shakes for the errors, a lean toward its bubble, a happy bounce. */
export const BODY: MascotPoses = byMood(float, {
  password: { x: 0, y: 3, rotate: 0, transition: MOVE },
  // Leaning a little toward the field it peeks at.
  passwordPeek: { x: 0, y: 3, rotate: 3, transition: MOVE },
  // A puzzled shake that ends in a head tilt.
  passwordError: { x: 0, y: 2, rotate: [0, -7, 7, -5, 5, -6], transition: { rotate: shake, y: MOVE, x: MOVE } },
  // It stands up a little to show the card (so the card also clears the form's edge where the owl only peeks in, on phones).
  mfa: { x: 0, y: -12, rotate: 0, transition: MOVE },
  mfaError: { x: [0, -8, 8, -6, 6, -3, 0], y: -12, rotate: 0, transition: { x: shake, y: MOVE, rotate: MOVE } },
  wrongPortal: { x: 0, y: -4, rotate: 4, transition: MOVE },
  success: { x: 0, y: [0, -18, 0, -9, 0], rotate: [0, -5, 5, -2, 0], transition: { duration: 0.8, ease: "easeOut" } },
});

/** The same poses with no travel: every loop and keyframe list collapses to where it ends, applied at once. */
export const settle = (poses: MascotPoses): MascotPoses => {
  const still = (target: TargetAndTransition): TargetAndTransition => {
    const out: TargetAndTransition = { transition: { duration: 0 } };
    for (const [key, value] of Object.entries(target)) {
      if (key === "transition") continue;
      Object.assign(out, { [key]: Array.isArray(value) ? value[value.length - 1] : value });
    }
    return out;
  };
  return {
    idle: still(poses.idle),
    email: still(poses.email),
    password: still(poses.password),
    passwordPeek: still(poses.passwordPeek),
    passwordError: still(poses.passwordError),
    mfa: still(poses.mfa),
    mfaError: still(poses.mfaError),
    wrongPortal: still(poses.wrongPortal),
    success: still(poses.success),
  };
};
