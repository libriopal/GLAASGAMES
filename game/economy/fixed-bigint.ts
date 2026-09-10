// game/economy/fixed-bigint.ts — exact fixed-point arithmetic for settlement.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY BIGINT AND NOT THE Q16.16 IN engine/math/fixed.ts.
//
// The settlement weight curve is g(p) = FLOOR_W + (1 − FLOOR_W)·p^γ with γ = 2.4
// — a FRACTIONAL exponent — and `CLAUDE.md` forbids floating point anywhere in
// settlement code. `engine/math/fixed.ts` offers mulFixed, divFixed and
// sqrtFixed; it has no pow, and Q16.16 has nowhere near the headroom for one.
// At Q16.16 a percentile of 0.01 raised to 2.4 lands on the integer 1, so the
// bottom of the field would be quantised into a single bucket.
//
// BigInt is exact by construction, has no rounding mode to get wrong, and is
// deterministic across every JS engine — which is the property a settlement
// verifier needs, since two machines that disagree about a payout by one minor
// unit disagree about whether the pool closed.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DOUBLE-ROUNDING TRAP, AND HOW IT IS AVOIDED ENTIRELY.
//
// The independent audit, reviewing the design BEFORE it was written:
//
//   "BigInt p^(12/5) via nth-root then integer power risks DOUBLE ROUNDING
//    (round the 5th root, then round the payout division), which can violate
//    monotonicity."
//
// That is the real hazard. The obvious implementation — raise to the 12th, round
// the 5th root, then round again in the payout division — rounds twice, and two
// roundings can invert the order of two adjacent percentiles. A player with a
// strictly higher score could then receive a strictly smaller payout, which is
// the kind of defect nobody notices until someone with a spreadsheet does.
//
// It is avoided by never computing an intermediate rounded value at all.
// To evaluate x^(12/5) at scale S, where x = X/S:
//
//     R  =  S · x^(12/5)
//     R⁵ =  S⁵ · X¹² / S¹²  =  X¹² / S⁷
//
// so R is the largest integer satisfying  R⁵ · S⁷ ≤ X¹².  Both sides are exact
// BigInts and the comparison is exact, so the answer is found by binary search
// with NO intermediate rounding whatsoever — one floor, at the end, by
// definition. Monotonicity then follows for free: X₁ < X₂ implies X₁¹² < X₂¹²
// implies R₁ ≤ R₂. It cannot invert, because there is no second rounding to
// invert it.

/** Fixed-point scale: 2^32. Values are integers representing value·2^32. */
export const SCALE = 1n << 32n;

/** One, at scale. */
export const ONE = SCALE;

/** Converts a rational a/b to fixed point, flooring. */
export function fromRatio(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new RangeError('fromRatio: zero denominator');
  return (a * SCALE) / b;
}

/** Multiplies two fixed-point values, flooring once. */
export function mul(a: bigint, b: bigint): bigint {
  return (a * b) / SCALE;
}

/** Divides two fixed-point values, flooring once. */
export function div(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new RangeError('div: zero denominator');
  return (a * SCALE) / b;
}

/**
 * The largest integer r with r^n ≤ v. Exact; no floating point, no rounding
 * chain — the comparison `r**n <= v` is exact BigInt arithmetic.
 */
export function integerNthRoot(v: bigint, n: bigint): bigint {
  if (v < 0n) throw new RangeError('integerNthRoot: negative radicand');
  if (v < 2n) return v;
  // Bracket by bit length, then bisect. The invariant is lo^n <= v < hi^n.
  let lo = 1n;
  let hi = 1n << (BigInt(v.toString(2).length) / n + 1n);
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if (mid ** n <= v) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

/**
 * x^(num/den) in fixed point, with EXACTLY ONE rounding.
 *
 * Solves for the largest R with R^den · S^(den−num) ≤ X^num when den ≥ num, and
 * the mirrored form otherwise. Both sides stay exact BigInts, so the single
 * floor is the definition of the result rather than an accumulation of drift.
 *
 * MONOTONE BY CONSTRUCTION: a larger X gives a larger or equal R, because the
 * predicate being searched is monotone in X and nothing is rounded before the
 * comparison.
 */
export function powRational(x: bigint, num: bigint, den: bigint): bigint {
  if (num <= 0n || den <= 0n) throw new RangeError('powRational: exponent must be positive');
  if (x === 0n) return 0n;

  // R^den = S^den · (X/S)^num = X^num · S^(den-num)
  const xNum = x ** num;
  const target = den >= num
    ? xNum * SCALE ** (den - num)
    : xNum / SCALE ** (num - den);

  return integerNthRoot(target, den);
}

/**
 * The settlement weight curve, g(p) = FLOOR_W + (1 − FLOOR_W)·p^γ.
 *
 * γ is passed as an exact RATIONAL (numerator, denominator) rather than a
 * decimal, because 2.4 is not representable in binary and a settlement engine
 * must not contain a constant whose value depends on how it was parsed. γ = 2.4
 * is exactly 12/5.
 */
export function weight(
  p: bigint,
  floorW: bigint,
  gammaNum: bigint,
  gammaDen: bigint,
): bigint {
  const shaped = powRational(p, gammaNum, gammaDen);
  return floorW + mul(ONE - floorW, shaped);
}
