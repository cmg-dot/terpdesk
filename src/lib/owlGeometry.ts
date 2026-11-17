/**
 * The terpDESK owl's shapes and colours, in one place so the animated sign-in mascot (components/auth/TerpMascot.tsx) and the
 * static logo (components/brand/OwlLogo.tsx) always draw the same owl. Measures are in the mascot's 200 x 220 viewBox. Pure.
 */

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

/** A wing's length, root (the shoulder, its own (0, 0)) to tip. */
export const WING_LENGTH = 46;

export const OWL_SHAPES = {
  /** The two ear tufts, drawn with a thick, round-joined stroke of the body colour. */
  ears: "M58 86 L53 54 L84 70 Z M142 86 L147 54 L116 70 Z",
  earStroke: 10,
  body: { cx: 100, cy: 138, rx: 72, ry: 78 },
  belly: { cx: 100, cy: 180, rx: 46, ry: 33 },
  /** The cream discs round the eyes. */
  eyeDiscs: [{ cx: 76, cy: 108 }, { cx: 124, cy: 108 }],
  eyeDiscR: 30,
  /** Pupil centres (looking straight ahead), each with a white shine up and to the right. */
  pupilX: [78, 122],
  pupilY: 110,
  pupilR: 13,
  shine: { dx: 4, dy: -5, r: 4.5 },
  brows: "M62 94 L86 87 M138 94 L114 87",
  beak: "M91 127 Q100 122 109 127 Q105 137 100 142 Q95 137 91 127 Z",
  /** A round teardrop: root at (0, 0), widest a little below it, tapering to a soft tip at (0, WING_LENGTH). */
  wing: `M0 -4 C10.5 -4 14.5 9 13.5 21 C12.5 32 5.5 ${WING_LENGTH - 6} 0 ${WING_LENGTH} C-5.5 ${WING_LENGTH - 6} -12.5 32 -13.5 21 C-14.5 9 -10.5 -4 0 -4 Z`,
  /** A soft inner accent along the wing. */
  wingAccent: `M-5 5 C-8.5 15 -7 27 -1.5 ${WING_LENGTH - 9}`,
  wingAccentStroke: 2.2,
} as const;

/** A wing at rest by the owl's side (the left one; the right is its mirror image across x = 100): root position, turn and size. */
export const WING_REST = { x: 34, y: 128, rotate: 14, scale: 1 } as const;
