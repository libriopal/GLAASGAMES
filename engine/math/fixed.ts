// engine/math/fixed.ts — Q16.16 fixed-point scalar math (CPU reference executor).
//
// WHY FIXED POINT: the simulation is GPU-authoritative and must produce
// bit-identical state on every vendor. IEEE-754 floats do not: GPUs are
// permitted to contract a*b+c into a fused multiply-add with a single rounding
// step, and NVIDIA / AMD / Intel / Apple make that choice differently. Integer
// arithmetic in WGSL is exact and vendor-invariant, so the entire simulation
// runs on i32 fixed-point. This extends the Q x 1000 scoring discipline in
// game/determinism/fixed-point.ts from scoring into the spatial domain.
//
// WHY LIMBS: WGSL has no 64-bit integer type. A Q16.16 multiply needs the full
// 64-bit product before the >> 16 renormalisation, so mulFixed decomposes both
// operands into 16-bit limbs and reassembles the product with u32 modular
// arithmetic. engine/gpu/shaders/sim.wgsl implements the identical algorithm;
// verify-fixed.ts proves this one matches an exact BigInt oracle, and
// verify-parity.ts proves the WGSL matches this one.

/** Fractional bits. Q16.16 => 65536 units per 1.0. */
export const FRAC_BITS = 16;
export const FIXED_ONE = 1 << FRAC_BITS; // 65536

/**
 * Largest magnitude a fixed-point operand may carry into mulFixed.
 * mulFixed decomposes |operand| into a 16-bit low limb and a high limb; the
 * cross-term a1*b0 + a0*b1 must not exceed 2^32. With |operand| < 2^31 both
 * high limbs are < 2^15 and both low limbs < 2^16, so each cross product is
 * < 2^31 and their sum is < 2^32 — exactly representable in u32.
 */
export const FIXED_MAX = 0x7fffffff;
export const FIXED_MIN = -0x7fffffff; // NOT -2^31: |FIXED_MIN| must be representable.

/** Converts a real number to Q16.16. Throws outside the safe multiply domain. */
export function toFixed(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`toFixed: non-finite value ${value}`);
  }
  const scaled = Math.round(value * FIXED_ONE);
  if (scaled > FIXED_MAX || scaled < FIXED_MIN) {
    throw new Error(`toFixed: ${value} overflows Q16.16 safe domain`);
  }
  return scaled | 0;
}

/** Converts Q16.16 back to a real number. Lossy by design — display/debug only. */
export function fromFixed(fixed: number): number {
  assertFixed(fixed);
  return fixed / FIXED_ONE;
}

/** Runtime guard: a value entering a simulation path must be an i32, never a float. */
export function assertFixed(value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`assertFixed: expected fixed-point integer, got float ${value}`);
  }
  if (value > FIXED_MAX || value < FIXED_MIN) {
    throw new Error(`assertFixed: ${value} outside Q16.16 safe multiply domain`);
  }
}

export function addFixed(a: number, b: number): number {
  return (a + b) | 0;
}

export function subFixed(a: number, b: number): number {
  return (a - b) | 0;
}

/**
 * Q16.16 multiply: (a * b) >> 16, computed without a 64-bit intermediate.
 *
 * Decompose the magnitudes into 16-bit limbs, |a| = a1*2^16 + a0:
 *   |a|*|b| = a1*b1*2^32 + (a1*b0 + a0*b1)*2^16 + a0*b0
 * Shifting right by 16 gives
 *   (a1*b1 << 16) + (a1*b0 + a0*b1) + (a0*b0 >>> 16)
 * Every term is evaluated modulo 2^32. The (a1*b1 << 16) term may overflow u32,
 * but only into bits above 2^31 — which the caller has already promised the
 * true result does not occupy — so the surviving low bits are exact.
 *
 * Sign is handled separately rather than by two's-complement multiply, because
 * the >> 16 renormalisation of a negative product must truncate toward zero
 * consistently on both executors.
 */
export function mulFixed(a: number, b: number): number {
  const negative = a < 0 !== b < 0;
  const ua = Math.abs(a) >>> 0;
  const ub = Math.abs(b) >>> 0;

  const a0 = ua & 0xffff;
  const a1 = ua >>> 16;
  const b0 = ub & 0xffff;
  const b1 = ub >>> 16;

  // Math.imul gives 32-bit wrapping multiply; every term is correct modulo 2^32,
  // which is all the reassembly below requires.
  const lo = Math.imul(a0, b0) >>> 0;
  const cross = (Math.imul(a1, b0) + Math.imul(a0, b1)) >>> 0;
  const hi = Math.imul(a1, b1) >>> 0;

  const magnitude = (((hi << 16) >>> 0) + cross + (lo >>> 16)) >>> 0;
  return (negative ? -magnitude : magnitude) | 0;
}

/**
 * Q16.16 divide: (a << 16) / b, truncating toward zero.
 * Uses float division on the magnitudes then re-truncates. This is exact for
 * every input in the Q16.16 safe domain because |a| * 65536 < 2^47, well inside
 * the 2^53 integer-exact range of a double, so no rounding occurs before the
 * truncation. The GPU path implements restoring division instead — see
 * div_fixed in sim.wgsl — and verify-fixed.ts pins both to the same oracle.
 */
export function divFixed(a: number, b: number): number {
  if (b === 0) {
    throw new Error('divFixed: division by zero');
  }
  const negative = a < 0 !== b < 0;
  const magnitude = Math.floor((Math.abs(a) * FIXED_ONE) / Math.abs(b));
  const signed = negative ? -magnitude : magnitude;
  if (signed > FIXED_MAX || signed < FIXED_MIN) {
    throw new Error(`divFixed: quotient ${signed} overflows Q16.16 safe domain`);
  }
  return signed | 0;
}

/** Clamps a fixed-point value into [lo, hi]. */
export function clampFixed(value: number, lo: number, hi: number): number {
  if (lo > hi) {
    throw new Error('clampFixed: lo exceeds hi');
  }
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * Integer square root of a Q16.16 value, returned in Q16.16.
 *
 * sqrt(x / 2^16) * 2^16 = sqrt(x * 2^16), so the operation is an integer sqrt
 * of x << 16. That product exceeds 32 bits, so it is computed as a 48-bit value
 * via the bit-by-bit restoring algorithm below, which uses only comparisons and
 * shifts and therefore ports to WGSL unchanged.
 */
export function sqrtFixed(value: number): number {
  if (value < 0) {
    throw new Error(`sqrtFixed: negative operand ${value}`);
  }
  if (value === 0) return 0;

  // Operate on the 48-bit quantity (value << 16) using a Number, which is
  // integer-exact to 2^53. The loop is a standard restoring integer sqrt.
  const radicand = value * FIXED_ONE;
  let remainder = radicand;
  let root = 0;
  // Highest power of four <= 2^48.
  let bit = 2 ** 48;
  while (bit > remainder) {
    bit /= 4;
  }
  while (bit !== 0 && bit >= 1) {
    if (remainder >= root + bit) {
      remainder -= root + bit;
      root = root / 2 + bit;
    } else {
      root = root / 2;
    }
    bit /= 4;
  }
  return root | 0;
}
