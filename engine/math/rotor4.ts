// engine/math/rotor4.ts — rotation in four dimensions.
//
// THE CORE DIFFERENCE FROM 3D: a rotation does not happen "about an axis". It
// happens *in a plane*. In 3D every plane has a unique normal vector, so naming
// the normal ("rotate about Y") is an unambiguous shorthand for naming the plane
// — and that shorthand is the only reason axis-angle works. In 4D a plane has an
// entire orthogonal *plane* rather than a single normal, so the shorthand has no
// meaning and must be abandoned. Rotations are specified directly by plane.
//
// R^4 has six basis planes: xy, xz, xw, yz, yw, zw. A general rotation composes
// one Givens rotation per plane. This module builds a 4x4 fixed-point rotation
// matrix from six plane angles.
//
// WHY A MATRIX RATHER THAN AN ACCUMULATED ROTOR: repeated fixed-point rotor
// composition drifts off the unit norm, and renormalising costs a square root
// per entity per tick. Orientation is instead kept as six angles — the canonical
// state — and the matrix is regenerated from them each time it is needed. The
// matrix is therefore always exactly as orthonormal as CORDIC allows, and never
// accumulates error across ticks, because nothing is accumulated.

import { addFixed, mulFixed } from './fixed.js';
import { cosSinFixed } from './trig.js';
import type { Vec4 } from './vec4.js';

/** The six rotation planes of R^4, in the canonical order used engine-wide. */
export const PLANE_XY = 0;
export const PLANE_XZ = 1;
export const PLANE_XW = 2;
export const PLANE_YZ = 3;
export const PLANE_YW = 4;
export const PLANE_ZW = 5;
export const PLANE_COUNT = 6;

/**
 * Which two axes each plane spans, in the same order as the constants above.
 * The WGSL port carries this table verbatim.
 */
const PLANE_AXES: readonly (readonly [number, number])[] = [
  [0, 1], // xy
  [0, 2], // xz
  [0, 3], // xw
  [1, 2], // yz
  [1, 3], // yw
  [2, 3], // zw
];

/** Orientation as six plane angles in Q16.16 radians. */
export type Orientation4 = readonly [number, number, number, number, number, number];

export const IDENTITY_ORIENTATION: Orientation4 = [0, 0, 0, 0, 0, 0];

/**
 * A 4x4 rotation matrix in Q16.16, row-major: element (row, col) is m[row*4+col].
 * Backed by Int32Array so it can be uploaded to a GPU uniform buffer unchanged.
 */
export type Mat4 = Int32Array;

const FIXED_ONE = 65536;

export function identityMat4(): Mat4 {
  const m = new Int32Array(16);
  m[0] = FIXED_ONE;
  m[5] = FIXED_ONE;
  m[10] = FIXED_ONE;
  m[15] = FIXED_ONE;
  return m;
}

/**
 * Applies a single Givens rotation in `plane` by `angle` to `m`, in place.
 *
 * A Givens rotation touches exactly the two rows spanning the plane and leaves
 * the other two untouched — which is precisely what makes it the right
 * primitive here. In 4D, rotating in the xy plane leaves z and w completely
 * alone; there is no "wobble" of a third axis as intuition from 3D might
 * suggest, because the zw plane is entirely orthogonal to the xy plane.
 */
function applyGivens(m: Mat4, plane: number, angle: number): void {
  if (angle === 0) return;
  const [a, b] = PLANE_AXES[plane]!;
  const { cos, sin } = cosSinFixed(angle);

  for (let col = 0; col < 4; col += 1) {
    const va = m[a * 4 + col]!;
    const vb = m[b * 4 + col]!;
    m[a * 4 + col] = addFixed(mulFixed(cos, va), -mulFixed(sin, vb));
    m[b * 4 + col] = addFixed(mulFixed(sin, va), mulFixed(cos, vb));
  }
}

/**
 * Builds the rotation matrix for an orientation by composing all six plane
 * rotations in canonical order.
 *
 * The order is fixed and documented rather than configurable because rotations
 * do not commute: xy-then-zw and zw-then-xy give different results whenever both
 * angles are non-zero. Pinning the order makes orientation state reproducible
 * across the CPU and GPU executors, which is the whole point.
 */
export function orientationToMatrix(orientation: Orientation4): Mat4 {
  const m = identityMat4();
  for (let plane = 0; plane < PLANE_COUNT; plane += 1) {
    applyGivens(m, plane, orientation[plane]!);
  }
  return m;
}

/** Transforms a 4D vector by a rotation matrix. */
export function transform4(m: Mat4, v: Vec4): Vec4 {
  const components = [v.x, v.y, v.z, v.w];
  const out = [0, 0, 0, 0];
  for (let row = 0; row < 4; row += 1) {
    let sum = 0;
    for (let col = 0; col < 4; col += 1) {
      sum = addFixed(sum, mulFixed(m[row * 4 + col]!, components[col]!));
    }
    out[row] = sum;
  }
  return { x: out[0]!, y: out[1]!, z: out[2]!, w: out[3]! };
}

/**
 * Advances an orientation by a per-plane angular velocity over `dtFixed`
 * seconds, returning the new orientation.
 *
 * Angles are kept unwrapped here; cosSinFixed wraps internally, and wrapping at
 * this level would make the stored orientation depend on how many ticks have
 * elapsed rather than only on the accumulated rotation.
 */
export function integrateOrientation(
  orientation: Orientation4,
  angularVelocity: Orientation4,
  dtFixed: number,
): Orientation4 {
  const next: number[] = [];
  for (let plane = 0; plane < PLANE_COUNT; plane += 1) {
    next.push(addFixed(orientation[plane]!, mulFixed(angularVelocity[plane]!, dtFixed)));
  }
  return next as unknown as Orientation4;
}

/**
 * Projects a 4D point to 3D by perspective division along w.
 *
 * This is the 4D analogue of the 3D-to-2D perspective divide: the viewer sits at
 * `viewerW` on the w axis and the point is scaled by the ratio of that distance
 * to its own w offset. Points at or behind the viewer's w plane are rejected by
 * returning null, exactly as a 3D renderer near-clips.
 */
export function projectTo3D(
  point: Vec4,
  viewerW: number,
): { readonly x: number; readonly y: number; readonly z: number } | null {
  const depth = viewerW - point.w;
  if (depth <= 0) return null;
  const ratio = Math.trunc((viewerW * FIXED_ONE) / depth) | 0;
  return {
    x: mulFixed(point.x, ratio),
    y: mulFixed(point.y, ratio),
    z: mulFixed(point.z, ratio),
  };
}

/**
 * Slices a 4D point against the hyperplane w = sliceW, returning the 3D
 * cross-section coordinates when the point lies within `thickness` of it.
 *
 * Slicing is the alternative to projection for presenting 4D: rather than
 * squashing the fourth dimension into perspective, it shows the 3D
 * cross-section at one w, the way a 2D being would perceive a 3D object passing
 * through their plane. Both are provided because they suit different games, and
 * the renderer chooses per-pass.
 */
export function sliceTo3D(
  point: Vec4,
  sliceW: number,
  thickness: number,
): { readonly x: number; readonly y: number; readonly z: number } | null {
  const offset = point.w - sliceW;
  const distance = offset < 0 ? -offset : offset;
  if (distance > thickness) return null;
  return { x: point.x, y: point.y, z: point.z };
}
