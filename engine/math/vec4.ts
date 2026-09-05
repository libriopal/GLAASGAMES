// engine/math/vec4.ts — Q16.16 four-dimensional vector algebra.
//
// These are genuine 4-spatial-dimensional vectors: x, y, z, w are four
// independent extents, not a 3D position with a homogeneous coordinate. Nothing
// here treats w as a divisor.
//
// The functions take and return plain component tuples rather than allocating
// objects, because the CPU reference executor runs them inside the per-entity
// tick loop and any allocation there becomes garbage-collector pressure at frame
// rate. engine/sim/state.ts stores components in flat Int32Arrays for the same
// reason; these helpers exist for readable one-off math, not for bulk work.

import { addFixed, mulFixed, sqrtFixed, subFixed } from './fixed.js';

export interface Vec4 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export const ZERO4: Vec4 = { x: 0, y: 0, z: 0, w: 0 };

export function vec4(x: number, y: number, z: number, w: number): Vec4 {
  return { x: x | 0, y: y | 0, z: z | 0, w: w | 0 };
}

export function add4(a: Vec4, b: Vec4): Vec4 {
  return {
    x: addFixed(a.x, b.x),
    y: addFixed(a.y, b.y),
    z: addFixed(a.z, b.z),
    w: addFixed(a.w, b.w),
  };
}

export function sub4(a: Vec4, b: Vec4): Vec4 {
  return {
    x: subFixed(a.x, b.x),
    y: subFixed(a.y, b.y),
    z: subFixed(a.z, b.z),
    w: subFixed(a.w, b.w),
  };
}

/** Scales a vector by a Q16.16 scalar. */
export function scale4(v: Vec4, scalar: number): Vec4 {
  return {
    x: mulFixed(v.x, scalar),
    y: mulFixed(v.y, scalar),
    z: mulFixed(v.z, scalar),
    w: mulFixed(v.w, scalar),
  };
}

/** Four-term dot product, in Q16.16. */
export function dot4(a: Vec4, b: Vec4): number {
  return (
    (mulFixed(a.x, b.x) + mulFixed(a.y, b.y) + mulFixed(a.z, b.z) + mulFixed(a.w, b.w)) | 0
  );
}

/**
 * Squared length. Preferred over length4 wherever the caller only needs to
 * compare magnitudes — it skips the sqrt entirely and cannot lose precision.
 */
export function lengthSquared4(v: Vec4): number {
  return dot4(v, v);
}

export function length4(v: Vec4): number {
  return sqrtFixed(lengthSquared4(v));
}

/**
 * Returns the unit vector, or ZERO4 when the input has no direction.
 *
 * Failing to a zero vector rather than throwing is deliberate: normalising a
 * degenerate velocity is a routine occurrence in a simulation (an entity at
 * rest), and a throw inside the tick loop would turn a benign state into a
 * crash. Callers that need to distinguish "no direction" check the input length
 * themselves.
 */
export function normalize4(v: Vec4): Vec4 {
  const magnitude = length4(v);
  if (magnitude === 0) return ZERO4;
  return {
    x: Math.trunc((v.x * 65536) / magnitude) | 0,
    y: Math.trunc((v.y * 65536) / magnitude) | 0,
    z: Math.trunc((v.z * 65536) / magnitude) | 0,
    w: Math.trunc((v.w * 65536) / magnitude) | 0,
  };
}

/**
 * There is no 4D cross product. The 3D cross product is a coincidence of three
 * dimensions: the space of bivectors in R^n has dimension n(n-1)/2, which equals
 * n only when n is 3. In R^4 that space is six-dimensional, so the object
 * orthogonal to two vectors is a plane, not a vector.
 *
 * What generalises is the wedge product, which returns the bivector spanning the
 * two operands, indexed here as [xy, xz, xw, yz, yw, zw] — the same plane
 * ordering used by rotor4.ts and by the WGSL port.
 */
export function wedge4(a: Vec4, b: Vec4): readonly number[] {
  return [
    subFixed(mulFixed(a.x, b.y), mulFixed(a.y, b.x)), // xy
    subFixed(mulFixed(a.x, b.z), mulFixed(a.z, b.x)), // xz
    subFixed(mulFixed(a.x, b.w), mulFixed(a.w, b.x)), // xw
    subFixed(mulFixed(a.y, b.z), mulFixed(a.z, b.y)), // yz
    subFixed(mulFixed(a.y, b.w), mulFixed(a.w, b.y)), // yw
    subFixed(mulFixed(a.z, b.w), mulFixed(a.w, b.z)), // zw
  ];
}

export function equals4(a: Vec4, b: Vec4): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w;
}
