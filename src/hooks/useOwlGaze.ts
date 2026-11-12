"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import type { MotionValue } from "framer-motion";

/** How far the pupils may travel from centre, in viewBox units. Pupil (r 13) plus this plus the mood's glance stays inside the eye (r 30). */
const EYE_TRAVEL = 6;
/** The face's own small lean toward the pointer: a shift (viewBox units) and a tilt (degrees). */
const FACE_TRAVEL = 2.5;
const FACE_TILT = 4;
/** Beyond this many screen pixels from the owl's eyes, the pointer counts as "all the way" in that direction. */
const REACH_PX = 420;
/** The eyes' height in the 200 x 220 viewBox. */
const EYE_LINE = 110 / 220;
/** Nearly critically damped: smooth, no wobble past the target (so the pupils never overshoot their limit). */
const SPRING = { stiffness: 140, damping: 18, mass: 0.6 };

export interface OwlGaze {
  eyeX: MotionValue<number>;
  eyeY: MotionValue<number>;
  faceX: MotionValue<number>;
  faceY: MotionValue<number>;
  faceTilt: MotionValue<number>;
}

/**
 * The owl's eyes follow the pointer anywhere on the page, smoothed by springs; with `face`, the face also leans a touch toward it.
 * Pointer moves are read at most once per frame. When `eyes` is off (eyes covered, a head shake, reduced motion) everything
 * eases back to centre and the listener is removed.
 */
export function useOwlGaze(svgRef: RefObject<SVGSVGElement>, eyes: boolean, face: boolean): OwlGaze {
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const targets = { eyeX: useMotionValue(0), eyeY: useMotionValue(0), faceX: useMotionValue(0), faceY: useMotionValue(0), faceTilt: useMotionValue(0) };
  const { eyeX, eyeY, faceX, faceY, faceTilt } = targets;

  const aim = useCallback(() => {
    const svg = svgRef.current;
    const p = pointer.current;
    let ux = 0;
    let uy = 0;
    if (eyes && svg && p) {
      const box = svg.getBoundingClientRect();
      if (box.width === 0) return; // this copy of the owl is hidden (the other layout is showing)
      const dx = p.x - (box.left + box.width / 2);
      const dy = p.y - (box.top + box.height * EYE_LINE);
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        // A unit direction, shortened while the pointer is close to the owl.
        const k = Math.min(1, dist / REACH_PX) / dist;
        ux = dx * k;
        uy = dy * k;
      }
    }
    eyeX.set(ux * EYE_TRAVEL);
    eyeY.set(uy * EYE_TRAVEL);
    const lean = eyes && face ? 1 : 0;
    faceX.set(ux * FACE_TRAVEL * lean);
    faceY.set(uy * FACE_TRAVEL * lean);
    faceTilt.set(ux * FACE_TILT * lean);
  }, [svgRef, eyes, face, eyeX, eyeY, faceX, faceY, faceTilt]);

  // Re-aim when the mood changes what may move (back to centre when frozen).
  useEffect(() => aim(), [aim]);

  useEffect(() => {
    if (!eyes) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          aim();
        });
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [eyes, aim]);

  return {
    eyeX: useSpring(eyeX, SPRING),
    eyeY: useSpring(eyeY, SPRING),
    faceX: useSpring(faceX, SPRING),
    faceY: useSpring(faceY, SPRING),
    faceTilt: useSpring(faceTilt, SPRING),
  };
}
