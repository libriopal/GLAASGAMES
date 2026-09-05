// engine/math/trig.ts — deterministic Q16.16 trigonometry via CORDIC.
//
// Math.sin/Math.cos are unusable here for two reasons: they are floats (banned
// from simulation paths), and their results are not specified to the last bit by
// ECMA-262 — two JS engines may legitimately disagree. A GPU's built-in sin() is
// worse still: precision is vendor-defined.
//
// CORDIC computes sine and cosine using only comparisons, additions and right
// shifts. Every operation is exact integer arithmetic, so the result is
// bit-identical on every CPU and every GPU. engine/gpu/shaders/sim.wgsl carries
// a line-for-line port; verify-trig.ts bounds the approximation error and
// verify-parity.ts proves the two ports agree.

// No imports from ./fixed.js: this module is deliberately self-contained integer
// arithmetic, so that a change to the general fixed-point helpers cannot perturb
// the trigonometric constants the simulation is pinned to.

/** CORDIC iteration count. 17 stages resolve the full Q16.16 fraction. */
const CORDIC_STAGES = 17;

/**
 * atan(2^-i) in Q16.16, i = 0..16.
 *
 * Hardcoded rather than computed from Math.atan at load time: a table derived
 * from floats would make the whole simulation depend on the host's libm, which
 * is exactly the vendor variance this module exists to eliminate.
 */
const ATAN_TABLE: readonly number[] = [
  51472, 30386, 16055, 8150, 4091, 2047, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1,
];

/**
 * The CORDIC gain, product of 1/sqrt(1 + 2^-2i) over all stages, in Q16.16.
 * Pre-multiplying the seed vector by this constant leaves the rotated result
 * already normalised, saving a divide per call.
 */
const CORDIC_GAIN = 39797; // 0.6072529350 * 65536

/** pi, pi/2 and 2*pi in Q16.16. */
export const PI_FIXED = 205887; // 3.14159265 * 65536
export const HALF_PI_FIXED = 102944;
export const TWO_PI_FIXED = 411775;

/**
 * Reduces an angle to [-pi, pi] by repeated addition rather than a modulo, so
 * the operation stays in exact integer arithmetic and ports to WGSL unchanged.
 * Bounded to 64 corrections; angles beyond ~200 turns are a caller bug and are
 * clamped rather than looped over indefinitely.
 */
function wrapAngle(angle: number): number {
  let wrapped = angle | 0;
  let guard = 0;
  while (wrapped > PI_FIXED && guard < 64) {
    wrapped = (wrapped - TWO_PI_FIXED) | 0;
    guard += 1;
  }
  while (wrapped < -PI_FIXED && guard < 64) {
    wrapped = (wrapped + TWO_PI_FIXED) | 0;
    guard += 1;
  }
  return wrapped;
}

/**
 * Simultaneously computes cosine and sine of a Q16.16 angle in radians.
 *
 * CORDIC converges only within [-pi/2, pi/2], so angles in the second and third
 * quadrants are reflected into range and the sign of the result is flipped to
 * compensate — cos(x +/- pi) = -cos(x), sin(x +/- pi) = -sin(x).
 */
export function cosSinFixed(angle: number): { readonly cos: number; readonly sin: number } {
  let theta = wrapAngle(angle);
  let flip = false;

  if (theta > HALF_PI_FIXED) {
    theta = (theta - PI_FIXED) | 0;
    flip = true;
  } else if (theta < -HALF_PI_FIXED) {
    theta = (theta + PI_FIXED) | 0;
    flip = true;
  }

  // Seed the vector at (gain, 0) so the accumulated CORDIC gain cancels out.
  let x = CORDIC_GAIN;
  let y = 0;
  let residual = theta;

  for (let stage = 0; stage < CORDIC_STAGES; stage += 1) {
    const dx = x >> stage;
    const dy = y >> stage;
    const delta = ATAN_TABLE[stage]!;
    if (residual >= 0) {
      x = (x - dy) | 0;
      y = (y + dx) | 0;
      residual = (residual - delta) | 0;
    } else {
      x = (x + dy) | 0;
      y = (y - dx) | 0;
      residual = (residual + delta) | 0;
    }
  }

  return flip ? { cos: -x | 0, sin: -y | 0 } : { cos: x | 0, sin: y | 0 };
}

export function cosFixed(angle: number): number {
  return cosSinFixed(angle).cos;
}

export function sinFixed(angle: number): number {
  return cosSinFixed(angle).sin;
}

/**
 * Converts whole degrees to Q16.16 radians using exact integer arithmetic.
 *
 * Scaling by a Q16.16 constant for pi/180 would be lossy: 0.0174533 rounds to
 * 1144/65536, an overestimate whose error compounds with the angle and reaches
 * 65 units — a full quarter of the CORDIC error budget — by one complete turn.
 * Expressing the conversion as the exact ratio degrees * 2pi / 360 keeps the
 * division at the end, where a single rounding is applied to the final result
 * instead of being baked into a constant and amplified.
 *
 * The intermediate degrees * TWO_PI_FIXED is integer-exact in a double for any
 * |degrees| below 2^31, far beyond the guarded input range.
 */
export function degreesToFixed(degrees: number): number {
  if (!Number.isInteger(degrees)) {
    throw new Error(`degreesToFixed: expected integer degrees, got ${degrees}`);
  }
  if (degrees > 1_000_000 || degrees < -1_000_000) {
    throw new Error(`degreesToFixed: ${degrees} outside supported range`);
  }
  const numerator = degrees * TWO_PI_FIXED;
  const negative = numerator < 0;
  const magnitude = Math.abs(numerator);
  // Round to nearest rather than truncate, so +x and -x stay exact mirrors.
  const rounded = Math.floor((magnitude + 180) / 360);
  return (negative ? -rounded : rounded) | 0;
}
