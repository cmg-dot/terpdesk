/**
 * The demo agency website's artwork, drawn in SVG so the page loads no images: the hero's ridgelines and pine forest, and the small
 * pine brand mark. Decorative only (hidden from screen readers).
 */

/** A three-tier pine standing on `base`, centred on `x`, `h` tall: one closed path. */
function pine(x: number, base: number, h: number): string {
  const w = h * 0.22;
  const tiers: [number, number, number][] = [
    // [y as a share of the height up from the base, half-width at that tier's skirt, half-width where the next tier starts]
    [0.62, 0.55, 0.3],
    [0.32, 0.8, 0.45],
    [0.08, 1, 0.12],
  ];
  const top = `M${x} ${base - h}`;
  const right = tiers.map(([y, skirt, waist]) => `L${x + w * skirt} ${base - h * y} L${x + w * waist} ${base - h * y}`).join(" ");
  const left = [...tiers].reverse().map(([y, skirt, waist]) => `L${x - w * waist} ${base - h * y} L${x - w * skirt} ${base - h * y}`).join(" ");
  const trunk = `L${x + w * 0.12} ${base} L${x - w * 0.12} ${base}`;
  // The last right tier's waist is the trunk's width, so the outline runs: apex, right skirts, trunk, left skirts, apex.
  return `${top} ${right} ${trunk} ${left} Z`;
}

const VIEW_W = 1440;
const BASE = 240;

/** A forest with gaps: trees every ~30px, heights varied by a fixed pattern so the server and the browser draw the same thing. */
const FOREST = Array.from({ length: 49 }, (_, i) => i)
  .filter((i) => i % 11 !== 5 && i % 11 !== 6)
  .map((i) => ({ x: i * 30 + ((i * 13) % 11), h: 48 + ((i * 37) % 46) + (i % 4 === 0 ? 22 : 0) }));

const FAR_RIDGE = "0,150 120,112 230,134 360,72 470,120 560,96 690,40 800,104 900,82 1010,124 1120,60 1230,110 1330,90 1440,118 1440,240 0,240";
const NEAR_RIDGE = "0,192 140,152 260,176 400,128 520,170 650,142 780,182 900,136 1040,176 1180,146 1300,182 1440,156 1440,240 0,240";

export function MountainSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${BASE}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" className={className}>
      <polygon points={FAR_RIDGE} fill="rgb(255 255 255 / 0.07)" />
      <polygon points={NEAR_RIDGE} fill="var(--forest)" opacity="0.85" />
      <g fill="var(--ev-night)">
        {FOREST.map(({ x, h }) => (
          <path key={x} d={pine(x, BASE, h)} />
        ))}
        <rect x="0" y={BASE - 8} width={VIEW_W} height="8" />
      </g>
    </svg>
  );
}

/** The brand mark: a forest-green pine on a gold disc. */
export function PineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <circle cx="16" cy="16" r="16" fill="var(--ev-gold)" />
      <path d={pine(16, 26, 20)} fill="var(--forest)" />
    </svg>
  );
}
