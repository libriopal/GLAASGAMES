// game/dark/fixed.ts — Q32.32 fixed point, because the physics has to replay.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE THREE-WAY WAR, AND WHY THE WIDTH IS 64 BITS RATHER THAN 32.
//
// The plan's round-one audit named the tension exactly: "You are fighting a
// three-way war between Determinism, Stability, and Scale... Q16.16 provides a
// fixed precision of 1/65536, but it limits your integer range to +/-32767. In a
// physics simulation you will encounter the Scale Problem: you need the distance
// between two stars and the gravitational influence of a small mass
// simultaneously. In fixed-point, you cannot have both."
//
// Correct, and it is the part that would have been discovered late. The rest of
// this repository uses Q16.16 for settlement, where the range is money and the
// precision is a cent. An N-body integrator needs about nine decimal digits of
// integer range AND sub-unit resolution at the same time, which Q16.16 cannot
// hold.
//
// So positions and velocities are Q32.32 on BigInt: exact, deterministic at any
// width, and bitwise identical on every machine because integer arithmetic has
// no rounding mode to disagree about. It is slower than floats and that is the
// price of a physics engine whose replay is a proof rather than a hope.
//
// ─────────────────────────────────────────────────────────────────────────────
// ROUND-TO-NEAREST-EVEN, NOT TRUNCATION, AND THAT IS A CORRECTNESS DECISION.
//
// The round-two audit found the failure mode none of the other controls would
// catch: "Numerical Resonance (Quantization Exploits)... an agent may find a
// glitch where rounding errors create a localized, non-physical energy gain."
// Every other control passes such a leak -- it is deterministic, it replays
// bitwise, it is not chaotic, and the player really does cause it.
//
// Truncation biases every product toward zero, so the error is not noise, IT HAS
// A SIGN -- and a systematic sign is precisely what integrates into a directional
// drift over thousands of steps. Round-to-nearest-even makes the rounding error
// zero-mean, which turns a leak into a random walk. N8 then tests conserved
// quantities for DIRECTIONAL drift rather than magnitude, because a bounded
// random walk is the expected cost of fixed point and a monotone trend is an
// exploit source whether or not anyone has found it yet.

/** Q32.32. One unit is 2^32. */
export type Fx = bigint;

export const SHIFT = 32n;
export const ONE: Fx = 1n << SHIFT;
export const HALF: Fx = ONE >> 1n;

/** The representable bound. Exceeding it is a range defect, not a large number. */
export const FX_MAX: Fx = (1n << 63n) - 1n;

export const fromInt = (n: number): Fx => BigInt(Math.trunc(n)) << SHIFT;

/**
 * From a float, for SETUP ONLY.
 *
 * Deliberately not usable on the step path: a float entering the integrator
 * anywhere would reintroduce the platform-dependent rounding this whole module
 * exists to remove. World generation converts once, at the boundary.
 */
export const fromFloat = (x: number): Fx => BigInt(Math.round(x * 2 ** 32));

export const toFloat = (a: Fx): number => Number(a) / 2 ** 32;

/**
 * Multiply with round-to-nearest-even.
 *
 * The tie case is the one that matters. Rounding halves consistently upward
 * biases the error the same way truncation does, just more subtly; ties-to-even
 * splits them and leaves the error mean at zero.
 */
export function mul(a: Fx, b: Fx): Fx {
  const p = a * b;
  const q = p >> SHIFT;
  const rem = p & (ONE - 1n);
  if (rem > HALF) return q + 1n;
  if (rem < HALF) return q;
  // Exactly half: round to even.
  return (q & 1n) === 0n ? q : q + 1n;
}

export function div(a: Fx, b: Fx): Fx {
  if (b === 0n) throw new RangeError('fixed: division by zero');
  const p = (a << SHIFT) * 2n;
  const q = p / b;
  // One extra bit of quotient, then round it away to nearest-even.
  const half = q & 1n;
  const r = q >> 1n;
  if (half === 0n) return r;
  return (r & 1n) === 0n ? r : r + 1n;
}

/**
 * Integer square root of a Q32.32 value, returning Q32.32.
 *
 * Newton on BigInt, which terminates exactly and identically everywhere. A
 * float sqrt here would be the single line that broke bitwise replay.
 */
export function sqrt(a: Fx): Fx {
  if (a < 0n) throw new RangeError('fixed: sqrt of negative');
  if (a === 0n) return 0n;
  // sqrt(a / 2^32) * 2^32 = sqrt(a * 2^32)
  const n = a << SHIFT;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

export const abs = (a: Fx): Fx => (a < 0n ? -a : a);

/** Did any component leave the representable range? A defect, not a big number. */
export function inRange(...vs: readonly Fx[]): boolean {
  for (const v of vs) if (abs(v) >= FX_MAX) return false;
  return true;
}

export interface Vec3 {
  readonly x: Fx;
  readonly y: Fx;
  readonly z: Fx;
}

export const vec = (x: Fx, y: Fx, z: Fx): Vec3 => ({ x, y, z });
export const ZERO: Vec3 = vec(0n, 0n, 0n);

export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: Fx): Vec3 => vec(mul(a.x, k), mul(a.y, k), mul(a.z, k));
export const dot = (a: Vec3, b: Vec3): Fx => mul(a.x, b.x) + mul(a.y, b.y) + mul(a.z, b.z);
export const norm2 = (a: Vec3): Fx => dot(a, a);
export const norm = (a: Vec3): Fx => sqrt(norm2(a));

/** A stable text form, for hashing a state into a replay digest. */
export const vecKey = (a: Vec3): string => `${a.x},${a.y},${a.z}`;
