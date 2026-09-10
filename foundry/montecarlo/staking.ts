// foundry/montecarlo/staking.ts — the Monte Carlo harness, pointed at a POOL.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE SINGLE-PLAYER HARNESS IS NOT ENOUGH.
//
// `harness.ts` measures whether a board rewards skill: how much of the inferable
// value a policy captures, against a trivial baseline the suite searches for.
// That is the right question for a solo game and the wrong one for a staked
// heat, because in a pool a player's return does not depend on their score. It
// depends on their score RELATIVE TO THE COHORT, and on what everyone staked.
//
// Two games can have identical skill depth and completely different economies. A
// board where the top rung beats the bottom rung by 40 points still produces a
// broken product if the payout curve hands the difference to whoever wagered
// most, or if a colluder can farm the pool with throwaway entries.
//
// So this module plays a HEAT of agents drawn from the same ladder, settles it
// through the real `settle()`, and measures the thing that actually matters
// commercially: DOES SKILL PAY, AND CAN IT BE FARMED.

import { type Entry, DEFAULT_PARAMS, settle } from '../../game/economy/pari-mutuel.js';
import { MAX_STAKE, MIN_STAKE } from '../../game/economy/heat.js';
import { type RoundConfig } from '../../lattice/round.js';
import { type Variant, ladderScores } from './harness.js';

/** One rung's economic result over a simulated season of heats. */
export interface RungEconomics {
  readonly rung: string;
  /** Mean banked score. */
  readonly score: number;
  /** Mean stake wagered per heat. */
  readonly staked: bigint;
  /** Mean payout received per heat. */
  readonly returned: bigint;
  /** (returned − staked) / staked, in basis points. */
  readonly roiBps: number;
}

export interface StakingMetrics {
  readonly id: string;
  readonly rungs: readonly RungEconomics[];
  /** Spearman-style ordering check: does a better rung earn more? */
  readonly skillPaysRank: boolean;
  /** ROI gap between the best and worst rung, in basis points. */
  readonly skillPremiumBps: number;
  /** Every simulated heat closed exactly. */
  readonly allPoolsClosed: boolean;
  /** ROI of a colluder running k sybils, in basis points. */
  readonly sybilRoiBps: number;
  /** ROI of the same player running no sybils. */
  readonly honestRoiBps: number;
}

const bpsOf = (ret: bigint, stake: bigint): number =>
  stake === 0n ? 0 : Number(((ret - stake) * 10000n) / stake);

/**
 * Runs `heats` heats of `cohort` agents, one agent per ladder rung (cycled), all
 * staking the same amount, and settles each heat for real.
 *
 * EQUAL STAKES BY DEFAULT, because the question this function answers is whether
 * SKILL pays. Varying stake at the same time would confound the two, and the
 * stake dimension is measured separately by `sybilProbe`.
 */
export function evaluateStaking(
  v: Variant,
  heats: number,
  cohort = 16,
  stake = 100n,
): StakingMetrics {
  const rungNames = ['blind', 'greedy', 'chargeAware', 'expectedPayout', 'regionFlow'];
  const totals = new Map<string, { score: number; staked: bigint; returned: bigint; n: number }>();
  for (const r of rungNames) totals.set(r, { score: 0, staked: 0n, returned: 0n, n: 0 });
  let allClosed = true;

  for (let h = 1; h <= heats; h += 1) {
    const entries: Entry[] = [];
    const rungOf: string[] = [];
    for (let i = 0; i < cohort; i += 1) {
      const rung = rungNames[i % rungNames.length]!;
      // Each seat plays its own seed so the cohort is a spread of outcomes, as a
      // real heat is: same board, different players.
      const score = ladderScores(v.config, h * 1000 + i, rung);
      entries.push({ id: `a${String(i).padStart(2, '0')}`, score, stake });
      rungOf.push(rung);
    }
    const r = settle(entries, DEFAULT_PARAMS, false);
    if (r.distributed !== r.netPool) allClosed = false;
    const byId = new Map(r.payouts.map((p) => [p.id, p.payout]));
    for (let i = 0; i < cohort; i += 1) {
      const t = totals.get(rungOf[i]!)!;
      t.score += entries[i]!.score;
      t.staked += stake;
      t.returned += byId.get(entries[i]!.id) ?? 0n;
      t.n += 1;
    }
  }

  const rungs: RungEconomics[] = rungNames.map((r) => {
    const t = totals.get(r)!;
    return {
      rung: r,
      score: t.score / Math.max(1, t.n),
      staked: t.staked / BigInt(Math.max(1, t.n)),
      returned: t.returned / BigInt(Math.max(1, t.n)),
      roiBps: bpsOf(t.returned, t.staked),
    };
  });

  // Does a better mean score earn a better ROI? Checked as a strict ordering
  // over the rungs sorted by score.
  const byScore = [...rungs].sort((a, b) => a.score - b.score);
  let ordered = true;
  for (let i = 1; i < byScore.length; i += 1) {
    if (byScore[i]!.roiBps < byScore[i - 1]!.roiBps) ordered = false;
  }

  const sy = sybilProbe(v.config, heats, cohort, stake);

  return {
    id: v.id,
    rungs,
    skillPaysRank: ordered,
    skillPremiumBps: byScore[byScore.length - 1]!.roiBps - byScore[0]!.roiBps,
    allPoolsClosed: allClosed,
    sybilRoiBps: sy.sybilRoiBps,
    honestRoiBps: sy.honestRoiBps,
  };
}

/**
 * Is the sybil attack profitable once payouts are STAKE-WEIGHTED?
 *
 * ── THE QUESTION THE DESIGN AUDIT ANSWERED BY ASSERTION ─────────────────────
 *
 * Asked whether stake-weighting revives collusion, the auditor replied: "No,
 * sybils are neutralized by the requirement of minimum stake per account." That
 * is a claim, not a measurement, and it is not obviously true — under
 * stake-weighting a sybil at MIN_STAKE dilutes the pool far less than a sybil at
 * full stake, while lifting the attacker's matchpoints by exactly as much. The
 * cheap-sybil case is strictly better for the attacker than the equal-stake case
 * that was measured before.
 *
 * So it is measured here rather than believed. The attacker plays their real
 * entry at MAX_STAKE and floods the heat with MIN_STAKE throwaways.
 */
export function sybilProbe(
  config: RoundConfig,
  heats: number,
  cohort: number,
  stake: bigint,
  sybils = 8,
  /**
   * Apply the production concentration limit.
   *
   * TRUE is the shipped configuration: the attacker may stake no more than any
   * other entrant, so their sybils dilute a pool they do not dominate.
   *
   * FALSE is the POSITIVE CONTROL, and it must stay reachable. It lets the
   * attacker take MAX_STAKE against a field staking `stake`, reproducing the
   * dominant-entrant case that measurement showed IS profitable. Without it
   * `verify-staking` S4 would assert that collusion fails without ever
   * demonstrating that it could have succeeded — a check that cannot distinguish
   * a working limit from a harmless attack.
   */
  enforce = true,
): { readonly sybilRoiBps: number; readonly honestRoiBps: number } {
  const run = (k: number): number => {
    let staked = 0n;
    let returned = 0n;
    for (let h = 1; h <= heats; h += 1) {
      const entries: Entry[] = [];
      for (let i = 0; i < cohort; i += 1) {
        entries.push({
          id: `f${String(i).padStart(2, '0')}`,
          score: ladderScores(config, h * 1000 + i, 'expectedPayout'),
          stake,
        });
      }
      // Under the limit the attacker is just another entrant; unconstrained,
      // they dominate.
      const attackerStake = enforce ? stake : MAX_STAKE;
      entries.push({
        id: 'ATTACKER',
        score: ladderScores(config, h * 1000 + 999, 'regionFlow'),
        stake: attackerStake,
      });
      // Their sybils: minimum legal stake, deliberately terrible scores.
      for (let s = 0; s < k; s += 1) {
        entries.push({ id: `S${s}`, score: 0, stake: MIN_STAKE });
      }
      const r = settle(entries, DEFAULT_PARAMS, enforce);
      const byId = new Map(r.payouts.map((p) => [p.id, p.payout]));
      staked += attackerStake + MIN_STAKE * BigInt(k);
      returned += byId.get('ATTACKER') ?? 0n;
      for (let s = 0; s < k; s += 1) returned += byId.get(`S${s}`) ?? 0n;
    }
    return bpsOf(returned, staked);
  };
  return { sybilRoiBps: run(sybils), honestRoiBps: run(0) };
}
