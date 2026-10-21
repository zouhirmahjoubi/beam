/**
 * Free 3D light for beams a palm lifts off the board. Board-local meters,
 * +y up. Pure math with plain arrays, so it runs in tests.
 */
import { DIRS, type Color, type Dir } from './grid.ts';

export type V3 = [number, number, number];

export interface PalmDisc {
  center: V3;
  /** Unit normal pointing out of the palm. */
  normal: V3;
  radius: number;
}

export interface SkyTarget {
  center: V3;
  radius: number;
  /** Way the opening faces, or null when light can enter from anywhere. */
  aperture: V3 | null;
  color: Color;
}

export type FreeEnd = 'target' | 'hand' | 'closed' | 'wrong-color' | 'miss' | 'limit';

export interface FreeResult {
  /** Corner points; only the first `count` are valid when a buffer is reused. */
  points: V3[];
  count: number;
  end: FreeEnd;
  /** Index of the sky target reached, or -1. */
  hit: number;
  /** Palms the beam touched, in order. */
  palmHits: number[];
}

/** A reusable result, so tracing every frame allocates nothing after warm-up. */
export function freeBuffer(): FreeResult {
  return { points: [], count: 0, end: 'miss', hit: -1, palmHits: [] };
}

/** Light must arrive within this angle of straight into an aperture. */
export const APERTURE_HALF_ANGLE = (35 * Math.PI) / 180;
const APERTURE_COS = Math.cos(APERTURE_HALF_ANGLE);

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function reflect3(d: V3, n: V3): V3 {
  const k = 2 * dot(d, n);
  return [d[0] - k * n[0], d[1] - k * n[1], d[2] - k * n[2]];
}

export function apertureVector(aperture: 'down' | Dir): V3 {
  if (aperture === 'down') return [0, -1, 0];
  const [dx, dz] = DIRS[aperture];
  const l = Math.hypot(dx, dz);
  return [dx / l, 0, dz / l];
}

function hitDisc(o: V3, d: V3, palm: PalmDisc): number {
  const denom = dot(d, palm.normal);
  if (Math.abs(denom) < 1e-6) return Infinity;
  const c = palm.center;
  const t = ((c[0] - o[0]) * palm.normal[0] + (c[1] - o[1]) * palm.normal[1] + (c[2] - o[2]) * palm.normal[2]) / denom;
  if (t <= 1e-4) return Infinity;
  const px = o[0] + d[0] * t - c[0];
  const py = o[1] + d[1] * t - c[1];
  const pz = o[2] + d[2] * t - c[2];
  return px * px + py * py + pz * pz <= palm.radius * palm.radius ? t : Infinity;
}

function hitSphere(o: V3, d: V3, s: SkyTarget): number {
  const ox = o[0] - s.center[0];
  const oy = o[1] - s.center[1];
  const oz = o[2] - s.center[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const c = ox * ox + oy * oy + oz * oz - s.radius * s.radius;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 1e-4 ? t : Infinity;
}

function put(out: FreeResult, x: number, y: number, z: number): void {
  let p = out.points[out.count];
  if (!p) {
    p = [0, 0, 0];
    out.points[out.count] = p;
  }
  p[0] = x;
  p[1] = y;
  p[2] = z;
  out.count++;
}

function done(out: FreeResult, end: FreeEnd, hit = -1): FreeResult {
  out.end = end;
  out.hit = hit;
  return out;
}

const O: V3 = [0, 0, 0];
const D: V3 = [0, 0, 0];

/**
 * Follow a beam through the air: bounce off palms that face it, stop at the
 * back of a hand, light a sky crystal it enters through the opening.
 * `skipPalm` is the palm that lifted the beam, which it cannot hit again first.
 * Pass `out` to reuse a buffer from freeBuffer() instead of allocating.
 */
export function freeTrace(
  origin: V3,
  direction: V3,
  color: Color,
  palms: ReadonlyArray<PalmDisc | null>,
  targets: ReadonlyArray<SkyTarget>,
  skipPalm = -1,
  maxLength = 0.9,
  maxBounces = 3,
  out: FreeResult = freeBuffer(),
): FreeResult {
  O[0] = origin[0];
  O[1] = origin[1];
  O[2] = origin[2];
  D[0] = direction[0];
  D[1] = direction[1];
  D[2] = direction[2];
  let left = maxLength;
  let skip = skipPalm;
  out.count = 0;
  out.palmHits.length = 0;
  out.hit = -1;
  put(out, O[0], O[1], O[2]);

  for (let bounce = 0; bounce <= maxBounces; bounce++) {
    let best = left;
    let palm = -1;
    let target = -1;
    for (let i = 0; i < palms.length; i++) {
      const p = palms[i];
      if (!p || i === skip) continue;
      const t = hitDisc(O, D, p);
      if (t < best) {
        best = t;
        palm = i;
        target = -1;
      }
    }
    for (let i = 0; i < targets.length; i++) {
      const t = hitSphere(O, D, targets[i]);
      if (t < best) {
        best = t;
        target = i;
        palm = -1;
      }
    }

    const px = O[0] + D[0] * best;
    const py = O[1] + D[1] * best;
    const pz = O[2] + D[2] * best;
    put(out, px, py, pz);
    if (target >= 0) {
      const s = targets[target];
      if (s.aperture && dot(D, s.aperture) > -APERTURE_COS) return done(out, 'closed');
      if (s.color !== 0 && s.color !== color) return done(out, 'wrong-color');
      return done(out, 'target', target);
    }
    if (palm < 0) return done(out, 'miss');

    out.palmHits.push(palm);
    const normal = palms[palm]!.normal;
    const k = dot(D, normal);
    if (k >= 0) return done(out, 'hand');
    D[0] -= 2 * k * normal[0];
    D[1] -= 2 * k * normal[1];
    D[2] -= 2 * k * normal[2];
    O[0] = px;
    O[1] = py;
    O[2] = pz;
    left -= best;
    skip = palm;
  }
  return done(out, 'limit');
}
