import { deflateSync } from "node:zlib";

/**
 * Draws a hand-signed-looking signature for a name as a transparent PNG (dark ink, anti-aliased), with no image library: a smooth
 * Catmull-Rom stroke through cursive-like peaks and loops, then a flourish. Deterministic: the same name always draws the same
 * signature. The bytes satisfy the app's checks (PNG magic, 64 B to 300 KB) for both the interpreter and on-site signatures.
 */

const WIDTH = 360;
const HEIGHT = 110;
const INK = [24, 35, 66] as const;

type Point = readonly [number, number];

/** A small seeded random generator (mulberry32), so a name always gives the same strokes. */
function seeded(text: string): () => number {
  let state = 0;
  for (let i = 0; i < text.length; i++) state = (Math.imul(state ^ text.charCodeAt(i), 2654435761) + 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Handwriting leans right: a point is pushed right the higher it sits above the baseline. */
const SLANT = 0.32;

/**
 * The pen's path for one word, cursive-style: a capital (or ascender) is a tall loop (up, back over itself, down), a short letter
 * is a rounded hump, and some letters trail off into a flat connector, as hurried signatures do.
 */
function wordPath(word: string, startX: number, baseline: number, rnd: () => number): { points: Point[]; endX: number } {
  const points: Point[] = [];
  const add = (x: number, y: number) => points.push([x + (baseline - y) * SLANT, y]);
  add(startX - 4, baseline + 4);
  let x = startX;
  Array.from(word).forEach((ch, i) => {
    const tall = i === 0 || "bdfhklt".includes(ch.toLowerCase());
    const width = (tall ? 13 : 10) + rnd() * 6;
    if (tall) {
      const h = (i === 0 ? 40 : 30) + rnd() * 8;
      add(x + width * 0.35, baseline - h);
      add(x - width * 0.05, baseline - h * 0.72);
      add(x + width * 0.3, baseline + 1);
    } else if (i > 1 && rnd() < 0.3) {
      add(x + width * 0.8, baseline - 3 - rnd() * 3);
    } else {
      const h = 11 + rnd() * 7;
      add(x + width * 0.3, baseline - h);
      add(x + width * 0.6, baseline - h * 0.85);
      add(x + width * 0.85, baseline + 1);
    }
    x += width;
  });
  return { points, endX: x + 10 };
}

function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  const at = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
  return [at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1])];
}

function drawStroke(alpha: Float32Array, points: Point[], width: number): void {
  const stamp = (cx: number, cy: number, r: number) => {
    for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(HEIGHT - 1, Math.ceil(cy + r + 1)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(WIDTH - 1, Math.ceil(cx + r + 1)); x++) {
        const coverage = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
        const i = y * WIDTH + x;
        if (coverage > alpha[i]) alpha[i] = coverage;
      }
    }
  };
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const steps = Math.max(8, Math.ceil(Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const [x, y] = catmullRom(p0, points[i], points[i + 1], p3, t);
      // The pen presses harder mid-stroke and lifts at the ends.
      stamp(x, y, width * (0.75 + 0.35 * Math.sin(Math.PI * t)));
    }
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(alpha: Float32Array): Buffer {
  const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const row = y * (WIDTH * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < WIDTH; x++) {
      const o = row + 1 + x * 4;
      raw[o] = INK[0];
      raw[o + 1] = INK[1];
      raw[o + 2] = INK[2];
      raw[o + 3] = Math.round(alpha[y * WIDTH + x] * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** The signature of `name` as PNG bytes. */
export function signaturePng(name: string): Buffer {
  const rnd = seeded(name);
  const alpha = new Float32Array(WIDTH * HEIGHT);
  let x = 18;
  let lastX = x;
  name.split(/\s+/).filter(Boolean).forEach((word, i) => {
    const { points, endX } = wordPath(word, x, 72 - i * 4, rnd);
    drawStroke(alpha, points, 1.7);
    lastX = endX;
    x = endX + 16;
  });
  // The flourish: a long sweep back under the name.
  drawStroke(alpha, [[lastX - 6, 80], [lastX + 10, 86], [(lastX + 18) / 2, 92], [24, 88]], 1.2);
  return encodePng(alpha);
}

/** The same signature as the `data:image/png;base64,...` text the hours record stores for the interpreter's own signature. */
export const signatureDataUrl = (name: string): string => `data:image/png;base64,${signaturePng(name).toString("base64")}`;
