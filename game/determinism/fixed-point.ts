// game/determinism/fixed-point.ts — W8 (07_CLAUDE_CODE_HANDOFF_V6.md §5.2)
// Scoring is fixed-point Q×1000; no floats in scoring paths.

export const FIXED_POINT_SCALE = 1000;

/** Converts a decimal value to a Q×1000 fixed-point integer. Throws if the result isn't an integer. */
export function toFixedPoint(value: number): number {
  const scaled = Math.round(value * FIXED_POINT_SCALE);
  if (!Number.isInteger(scaled)) throw new Error('verify-fixed-point-scoring: non-integer fixed-point value');
  return scaled;
}

export function fromFixedPoint(fixed: number): number {
  assertFixedPoint(fixed);
  return fixed / FIXED_POINT_SCALE;
}

/** Runtime guard: a value entering a scoring path must be a Q×1000 integer, never a bare float. */
export function assertFixedPoint(value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`verify-fixed-point-scoring: expected fixed-point integer, got float ${value}`);
  }
}

export function addFixed(a: number, b: number): number {
  assertFixedPoint(a);
  assertFixedPoint(b);
  return a + b;
}

export function subFixed(a: number, b: number): number {
  assertFixedPoint(a);
  assertFixedPoint(b);
  return a - b;
}

/** Multiply a fixed-point value by an integer count (not by another fixed-point value, to avoid scale drift). */
export function mulFixedByCount(fixed: number, count: number): number {
  assertFixedPoint(fixed);
  if (!Number.isInteger(count)) throw new Error('verify-fixed-point-scoring: count must be an integer');
  return fixed * count;
}
