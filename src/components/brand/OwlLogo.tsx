import type { ReactNode } from "react";
import { OWL, OWL_SHAPES as S, WING_REST } from "@/lib/owlGeometry";

/**
 * The terpDESK owl on its own, as a logo: the sign-in mascot's exact shapes (lib/owlGeometry.ts), both wings resting at its sides,
 * eyes open and looking ahead, no tablet. Static (no animation). "color" is the full palette; "mono" is one colour (forest) for
 * print or embroidery: the eyes, belly and wing accents are cut out, and a thin gap separates shapes that overlap.
 * public/branding/owl*.svg and owl*.png are exported from it.
 */

export type OwlLogoVariant = "color" | "mono";

/** The owl's drawn bounds (x 15.4-184.6, y 49-216, ear strokes and resting wings included, measured) plus a 6-unit margin. */
export const OWL_LOGO_VIEWBOX = "9 43 182 179";

const WING_AT_REST = `translate(${WING_REST.x} ${WING_REST.y}) rotate(${WING_REST.rotate}) scale(${WING_REST.scale})`;
const MIRROR = "translate(200 0) scale(-1 1)";
/** Mono: the width of the cut that keeps overlapping shapes (beak, wings) apart from the body. */
const GAP = 5;

/** Both wings at rest: the left as placed, the right its mirror image. */
const RestingWings = ({ children }: { children: ReactNode }) => (
  <>
    {[false, true].map((mirrored) => (
      <g key={String(mirrored)} transform={mirrored ? MIRROR : undefined}>
        <g transform={WING_AT_REST}>{children}</g>
      </g>
    ))}
  </>
);

const ColorOwl = () => (
  <g>
    <path d={S.ears} fill={OWL.forest} stroke={OWL.forest} strokeWidth={S.earStroke} strokeLinejoin="round" />
    <ellipse {...S.body} fill={OWL.forest} />
    <ellipse {...S.belly} fill={OWL.sage} />
    {S.eyeDiscs.map((disc) => <circle key={disc.cx} {...disc} r={S.eyeDiscR} fill={OWL.cream} />)}
    {S.pupilX.map((x) => (
      <g key={x}>
        <circle cx={x} cy={S.pupilY} r={S.pupilR} fill={OWL.forest} />
        <circle cx={x + S.shine.dx} cy={S.pupilY + S.shine.dy} r={S.shine.r} fill="#FFFFFF" />
      </g>
    ))}
    <path d={S.beak} fill={OWL.amber} />
    <RestingWings>
      <path d={S.wing} fill={OWL.mint} />
      <path d={S.wingAccent} fill="none" stroke={OWL.mintDeep} strokeWidth={S.wingAccentStroke} strokeLinecap="round" />
    </RestingWings>
  </g>
);

/** Mask ids are prefixed so two mono owls on one page never share them. */
const MonoOwl = ({ id }: { id: string }) => (
  <g>
    <defs>
      {/* What stays of the body: everything but the eye discs, the belly, and the beak and wings with a gap round them. */}
      <mask id={`${id}-body`} maskUnits="userSpaceOnUse" x={0} y={0} width={200} height={240}>
        <rect x={0} y={0} width={200} height={240} fill="#FFFFFF" />
        {S.eyeDiscs.map((disc) => <circle key={disc.cx} {...disc} r={S.eyeDiscR} fill="#000000" />)}
        <ellipse {...S.belly} fill="#000000" />
        <path d={S.beak} fill="#000000" stroke="#000000" strokeWidth={GAP} strokeLinejoin="round" />
        <RestingWings>
          <path d={S.wing} fill="#000000" stroke="#000000" strokeWidth={GAP} />
        </RestingWings>
      </mask>
      <mask id={`${id}-pupils`} maskUnits="userSpaceOnUse" x={0} y={0} width={200} height={240}>
        <rect x={0} y={0} width={200} height={240} fill="#FFFFFF" />
        {S.pupilX.map((x) => <circle key={x} cx={x + S.shine.dx} cy={S.pupilY + S.shine.dy} r={S.shine.r} fill="#000000" />)}
      </mask>
      {/* In the wing's own units (it is used inside the wing's transform). */}
      <mask id={`${id}-wing`} maskUnits="userSpaceOnUse" x={-20} y={-10} width={40} height={70}>
        <rect x={-20} y={-10} width={40} height={70} fill="#FFFFFF" />
        <path d={S.wingAccent} fill="none" stroke="#000000" strokeWidth={S.wingAccentStroke} strokeLinecap="round" />
      </mask>
    </defs>
    <g mask={`url(#${id}-body)`} fill={OWL.forest}>
      <path d={S.ears} stroke={OWL.forest} strokeWidth={S.earStroke} strokeLinejoin="round" />
      <ellipse {...S.body} />
    </g>
    <g mask={`url(#${id}-pupils)`} fill={OWL.forest}>
      {S.pupilX.map((x) => <circle key={x} cx={x} cy={S.pupilY} r={S.pupilR} />)}
    </g>
    <path d={S.beak} fill={OWL.forest} />
    <RestingWings>
      <path d={S.wing} fill={OWL.forest} mask={`url(#${id}-wing)`} />
    </RestingWings>
  </g>
);

/** The owl drawing alone (in the mascot's 200 x 220 units), to place inside another SVG. */
export const OwlLogoArt = ({ variant = "color", idPrefix = "owl" }: { variant?: OwlLogoVariant; idPrefix?: string }) =>
  variant === "mono" ? <MonoOwl id={`${idPrefix}-mono`} /> : <ColorOwl />;

interface OwlLogoProps {
  variant?: OwlLogoVariant;
  /** Spoken name; without one the logo is decorative (hidden from screen readers). */
  title?: string;
  className?: string;
  /** Unique per page when more than one mono owl is shown (its masks have ids). */
  idPrefix?: string;
}

/** The owl logo, cropped to the owl. */
export const OwlLogo = ({ variant = "color", title, className, idPrefix }: OwlLogoProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={OWL_LOGO_VIEWBOX}
    className={className}
    role={title ? "img" : undefined}
    aria-hidden={title ? undefined : true}
  >
    {title && <title>{title}</title>}
    <OwlLogoArt variant={variant} idPrefix={idPrefix} />
  </svg>
);
