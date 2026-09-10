// game/economy/pari-mutuel.ts — Spec 36 (E25δ) settlement, as executable math.
//
// Matchpoints within a heat → Neuberg normalisation → weight curve → pool
// closure. Every step is integer or exact rational, so a verifier reproduces it
// bit-for-bit.
//
// ─────────────────────────────────────────────────────────────────────────────
// REAL MONEY IS OFF, AND THIS FILE CANNOT TURN IT ON.
//
// `FEATURE_RM_SETTLEMENT` is false and election E29 (legal counsel) gates it.
// Spec 36 says so about itself, in its own red box: "Adopting pari-mutuel
// mathematics does not confer pari-mutuel legal status... E29 remains the gate,
// and this document raises rather than lowers its urgency."
//
// So `stake` here is an abstract integer in MINOR UNITS with no currency
// attached, there is no payment path, and nothing in this module reads or writes
// a balance. What is built is the arithmetic and its proofs. The independent
// audit was asked whether a feature flag is a sufficient boundary and answered
// that it is a SOFT one — "in many jurisdictions, providing the software used
// for gambling is a regulated activity regardless of the flag... the line is the
// functionality of the settlement logic itself." That answer is recorded here
// rather than filed away: it is a Tier 1 matter and it is not resolved by this
// file existing.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE HEAT, AND WHY THE COHORT IS CLOSED BEFORE ANYTHING IS SCORED.
//
// If every player on a day shares one seed, the board is public within an hour
// and a late entrant is reciting rather than solving. A HEAT is one seed plus
// the cohort that plays it inside a short window; scores are compared only
// within a heat, exactly as duplicate bridge compares only pairs who held the
// same cards. Board difficulty then cancels completely — a rich seed lifts
// everyone in that heat equally — and a leaked seed is worthless once its heat
// closes.

import { ONE, SCALE, fromRatio, weight } from './fixed-bigint.js';

/** Real-money settlement. FALSE, and only a human may change it. See E29. */
export const FEATURE_RM_SETTLEMENT = false;

/**
 * Minimum cohort size.
 *
 * Spec 36 proposes n ≥ 8 with sub-minimum heats merged forward, rather than
 * leaning on Neuberg to rescue tiny cohorts — because the Neuberg source flags
 * its own objective as "of questionable soundness" even though the formula is
 * well defined. The independent audit separately required a hard floor at n ≥ 2,
 * without which matchpointing divides by M = n − 1 = 0.
 */
export const MIN_HEAT = 8;

/** The normalisation target: every heat is mapped onto a common scale N. */
export const NEUBERG_N = 64;

export interface Entry {
  /**
   * A stable identifier for the entry, intrinsic to the player rather than to
   * their position in an array.
   *
   * LOAD-BEARING FOR ORDER INVARIANCE. See `settle`.
   */
  readonly id: string;
  /** Final banked score in this heat. Integer. */
  readonly score: number;
  /** Stake in abstract minor units. Integer. */
  readonly stake: bigint;
}

export interface SettlementParams {
  /** Takeout, in basis points. Spec 36 proposes 600 (6%). */
  readonly takeoutBps: bigint;
  /** Forward-carry withholding, in basis points. */
  readonly carryBps: bigint;
  /** Carry received from the prior day. */
  readonly carryIn: bigint;
  /** Guaranteed floor weight, fixed point. 0.18 → 0.18·2^32. */
  readonly floorW: bigint;
  /** γ as an exact rational. 2.4 = 12/5. */
  readonly gammaNum: bigint;
  readonly gammaDen: bigint;
}

export const DEFAULT_PARAMS: SettlementParams = {
  takeoutBps: 600n,
  carryBps: 300n,
  carryIn: 0n,
  floorW: (18n * SCALE) / 100n,
  gammaNum: 12n,
  gammaDen: 5n,
};

export interface Payout {
  readonly id: string;
  /** Raw matchpoints ×2, so the half-point stays an integer. */
  readonly matchpointsX2: number;
  /** Percentile after Neuberg, fixed point. */
  readonly percentile: bigint;
  readonly weight: bigint;
  readonly payout: bigint;
}

export interface Settlement {
  readonly payouts: readonly Payout[];
  readonly handle: bigint;
  readonly takeout: bigint;
  readonly carryOut: bigint;
  readonly netPool: bigint;
  /** Σ payouts. Must equal netPool exactly. */
  readonly distributed: bigint;
}

/**
 * Matchpoints, ×2 so the half-point for a tie stays an integer.
 *
 * m_i = |{j : S_j < S_i}| + ½·|{j ≠ i : S_j = S_i}|
 *
 * Rank-only, and that is the anti-solver property rather than a simplification:
 * it does not matter BY HOW MUCH a score differs, so a bot scoring 400% of par
 * earns the same top as a human scoring 101%. A linear exploit becomes a bounded
 * one.
 */
export function matchpointsX2(entries: readonly Entry[]): number[] {
  return entries.map((e) => {
    let below = 0;
    let tied = 0;
    for (const other of entries) {
      if (other === e) continue;
      if (other.score < e.score) below += 1;
      else if (other.score === e.score) tied += 1;
    }
    return below * 2 + tied;
  });
}

/**
 * Neuberg normalisation onto the common scale N.
 *
 *   m' = (m + 1)·(N / n) − 1
 *
 * Independently confirmed this session against the Welsh Bridge Union's
 * description: "Multiply by the number of times the board should have been
 * played... and divide by the number of times it was actually played."
 *
 * Returned as a fixed-point percentile p = m' / (N − 1).
 */
export function neubergPercentile(mX2: number, n: number, N: number): bigint {
  // m' = (m + 1)·N/n − 1, held as an exact rational over 2n to keep the half.
  //   m = mX2/2  ⇒  m' = ((mX2 + 2)·N − 2n) / (2n)
  //   p  = m' / (N − 1)
  const num = BigInt((mX2 + 2) * N - 2 * n);
  const den = BigInt(2 * n * (N - 1));
  return fromRatio(num, den);
}

/**
 * Settles a closed heat.
 *
 * ── THE REMAINDER RULE IS WHERE THIS DESIGN NEARLY SHIPPED A BUG ────────────
 *
 * Spec 36 §2.4 says the rounding remainder is "awarded to the single top-ranked
 * entry (never destroyed)", which closes the pool exactly. The independent
 * audit, reading the design before it was implemented, found that the phrase
 * hides a defect:
 *
 *   "'remainder awarded to the single top-ranked entry' is ambiguous under
 *    TIES. If the code picks the winner by array index (winners[0] /
 *    find-first-max), permuting the input changes who receives the remainder,
 *    which VIOLATES the order-invariance property the design claims."
 *
 * It is exactly right, and order invariance is not a nicety here — it is the
 * property that makes entering at minute 1 identical to entering at minute 11.
 *
 * Its two fixes are both applied:
 *   1. The remainder is DISTRIBUTED ACROSS ALL TIED TOP ENTRIES, not handed to
 *      one, which also removes the discontinuous jump a large remainder would
 *      otherwise put at the top of the payout curve.
 *   2. The leftover units after that split are assigned by SORTED ENTRY ID — an
 *      intrinsic, order-independent key. Array position is never consulted, so
 *      permuting the input cannot move a single minor unit.
 */
export function settle(
  entries: readonly Entry[],
  params: SettlementParams = DEFAULT_PARAMS,
): Settlement {
  const n = entries.length;
  if (n < 2) {
    throw new RangeError(
      `settle: heat size ${n} is below the minimum of 2 — matchpointing divides by M = n - 1, ` +
        'so a heat of 0 or 1 has no defined comparison. Merge it forward instead.',
    );
  }
  const ids = new Set(entries.map((e) => e.id));
  if (ids.size !== n) throw new RangeError('settle: duplicate entry ids — order invariance relies on ids being unique');

  const handle = entries.reduce((a, e) => a + e.stake, 0n);
  const takeout = (handle * params.takeoutBps) / 10000n;
  const grossAfterTakeout = handle - takeout;
  const carryOut = (grossAfterTakeout * params.carryBps) / 10000n;
  const netPool = grossAfterTakeout - carryOut + params.carryIn;

  const mps = matchpointsX2(entries);
  const percentiles = mps.map((m) => neubergPercentile(m, n, NEUBERG_N));
  const weights = percentiles.map((p) =>
    weight(p < 0n ? 0n : p > ONE ? ONE : p, params.floorW, params.gammaNum, params.gammaDen),
  );
  const weightSum = weights.reduce((a, w) => a + w, 0n);

  const raw = weights.map((w) => (weightSum === 0n ? 0n : (netPool * w) / weightSum));
  const distributedBeforeRemainder = raw.reduce((a, p) => a + p, 0n);
  let remainder = netPool - distributedBeforeRemainder;

  // ── the remainder, split across every tied top entry, by intrinsic id ──────
  const topScore = entries.reduce((a, e) => (e.score > a ? e.score : a), entries[0]!.score);
  const topIdx = entries
    .map((e, i) => ({ e, i }))
    .filter((x) => x.e.score === topScore)
    // SORTED BY ID, NEVER BY POSITION. This is the line the audit's finding is
    // about: `.sort()` on an intrinsic key gives the same answer for every
    // permutation of the input, where picking `[0]` of the unsorted filter does
    // not.
    .sort((a, b) => (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0))
    .map((x) => x.i);

  const final = [...raw];
  if (remainder > 0n && topIdx.length > 0) {
    const each = remainder / BigInt(topIdx.length);
    for (const i of topIdx) final[i] = final[i]! + each;
    remainder -= each * BigInt(topIdx.length);
    // Fewer leftover units than tied entries; hand them out in id order.
    for (let k = 0; k < topIdx.length && remainder > 0n; k += 1) {
      final[topIdx[k]!] = final[topIdx[k]!]! + 1n;
      remainder -= 1n;
    }
  }

  const payouts: Payout[] = entries.map((e, i) => ({
    id: e.id,
    matchpointsX2: mps[i]!,
    percentile: percentiles[i]!,
    weight: weights[i]!,
    payout: final[i]!,
  }));

  return {
    payouts,
    handle,
    takeout,
    carryOut,
    netPool,
    distributed: final.reduce((a, p) => a + p, 0n),
  };
}
