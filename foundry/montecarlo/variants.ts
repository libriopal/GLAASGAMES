// foundry/montecarlo/variants.ts — the 69 candidates, as things that RUN.
//
// The brief asked for 69 candidates each verified to have proven value. A prose
// list cannot carry that property: proof is a measurement. So each candidate is
// a `RoundConfig` the Monte Carlo harness executes, and "proven value" means it
// survived the harness — not that it sounded good.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FIRST CATALOGUE WAS 69 LABELS OVER 20 DISTINCT GAMES, AND A DIGEST
// COMPARISON IS WHAT CAUGHT IT.
//
// It swept `turns` x `refill` x `faceWeights`. `refill` is INERT: after banking
// one cell exactly one cell is empty, so a refill of 2, 4 or 6 has nothing more
// to fill than a refill of 1. Across refill 1/2/4/6 at 6, 12 and 20 turns the
// round digest came back IDENTICAL every single time — not merely the same mean
// score, the same hash of every board state in the round.
//
// So Block A's 20 candidates were 5 games, Block B's 45 were 15, and Block C's 4
// "extremes" were duplicates of points already in Block A. Sixty-nine candidates,
// twenty distinct hypotheses, and nothing in the suite noticed because nothing
// asked whether two candidates were the same game.
//
// `verify-montecarlo` M8 now asserts that all 69 configurations produce DISTINCT
// round digests. That check is what makes the number 69 mean anything, and it is
// the check whose absence let the first catalogue ship.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE AXES ARE NOW THE ONES THAT MEASURABLY MOVE THE GAME.
//
//   turns       12 is shipped. Shorter punishes exploration; longer lets a
//               learner amortise its early probing. LIVE.
//   deviation   THE LEARNABILITY KNOB, and the replacement for refill. One link
//               in `deviation` ignores its region's prevailing flow. At 1 the
//               lattice is pure noise and nothing is inferable; at 64 one
//               observation gives a whole region away. Shipped is 4. Measured to
//               move both the digest and the score (57.8 / 60.4 / 64.6 / 64.3 /
//               65.4 at deviation 1 / 2 / 4 / 8 / 64). LIVE.
//   faceWeights THE FAIRNESS KNOB. Uniform is shipped. LIVE.
//   chargeMax   Charge is the payout multiplier, so this is how deep the reward
//               for waiting goes. LIVE BUT NEARLY BINARY: measured, charge never
//               exceeds 2 under real play, so 2, 3, 5 and 8 are the same game and
//               only 1 differs (58.3 against 64.6). The shipped CHARGE_MAX of 3
//               NEVER BINDS. Swept only as {1, default} for that reason, and the
//               finding is recorded rather than papered over.
//
// Board size and region size are still NOT swept: both are compile-time
// constants the shipped renderer, the GL instance buffer and four oracles depend
// on, and varying them is blocked on a real defect — the commitment does not
// bind the round parameters, so two different games publish the same rules hash
// (`design/production-blueprint.md` P5).

import type { RoundConfig } from '../../lattice/round.js';
import type { Variant } from './harness.js';

/** Shipped: uniform over faces 1..6. Index 0 is EMPTY and unused. */
const UNIFORM: readonly number[] = [0, 4, 4, 4, 4, 4, 4];

/**
 * Face distributions, as a SEVERITY LADDER rather than a pile of obvious ones.
 *
 * ── WHY A MARGINAL CANDIDATE IS IN HERE ON PURPOSE ─────────────────────────
 *
 * The first catalogue's five loaded distributions scored chi-square 69, 451,
 * 494, 1537 and 7200 against a critical value of 20.515 — the mildest was 3.4x
 * over the line. "45/45 caught" therefore proved only that the gate detects the
 * obvious, which is the vacuous control this project's own protocol names as a
 * failure mode.
 *
 * `marginal-6` is a 10% bias on a single face and the gate DOES NOT CATCH IT at
 * the sample sizes here — measured, not assumed. It is in the catalogue so the
 * gate's sensitivity is a published number with a stated floor instead of an
 * unexamined "it works". `verify-montecarlo` M2 asserts detection of everything
 * ABOVE the floor and asserts the floor itself, so a future change that quietly
 * makes the gate weaker fails the build.
 */
const DISTRIBUTIONS: readonly {
  readonly tag: string;
  readonly w: readonly number[];
  /** Uniform, so it must PASS the fairness gate. */
  readonly fair: boolean;
  /** Loaded, but below the gate's measured detection floor. Expected to pass. */
  readonly belowFloor?: boolean;
}[] = [
  { tag: 'uniform', w: UNIFORM, fair: true },
  // 10% more weight on face 6. Genuinely unfair, and genuinely undetected here.
  { tag: 'marginal-6', w: [0, 40, 40, 40, 40, 40, 44], fair: false, belowFloor: true },
  // Gently top-heavy — the kind of drift that arrives by accident.
  { tag: 'top-heavy', w: [0, 3, 3, 4, 4, 5, 5], fair: false },
  // Aggressively loaded toward 6. A player who always banks the biggest number
  // is rewarded twice.
  { tag: 'sixes', w: [0, 2, 2, 3, 4, 6, 9], fair: false },
  // Bottom-heavy: low faces common, so the board is mostly worthless.
  { tag: 'bottom-heavy', w: [0, 9, 6, 4, 3, 2, 2], fair: false },
  // Bimodal — only 1s and 6s. Maximum face variance, no middle.
  { tag: 'bimodal', w: [0, 9, 1, 1, 1, 1, 9], fair: false },
  // Degenerate: every face identical. The board carries no face information at
  // all, so `greedy` collapses into `blind` and skill must come from elsewhere.
  { tag: 'flat-one-face', w: [0, 0, 0, 0, 0, 0, 24], fair: false },
];

const TURNS: readonly number[] = [6, 9, 12, 16, 20];
/** 4 is shipped. 1 is noise, 64 is near-deterministic flow. */
const DEVIATIONS: readonly number[] = [1, 2, 4, 8, 64];

/** Shipped refill. Inert (see the header), so it is held CONSTANT, never swept. */
const REFILL = 4;

/**
 * The catalogue: 69 candidates, each a distinct game.
 *
 *   A  fair pacing x learnability   5 turns x 5 deviations       = 25
 *   B  fairness                     6 loaded distributions x 5 turns = 30
 *   C  shallow charge               5 turns x 2 deviations       = 10
 *   D  extremes                                                  =  4
 *                                                                  ── 69
 *
 * M1 asserts the count and the shape; M8 asserts all 69 are distinct games.
 */
export function catalogue(): readonly Variant[] {
  const out: Variant[] = [];

  // ── Block A: fair, across pacing and learnability. 5 x 5 = 25. ───────────
  for (const turns of TURNS) {
    for (const deviation of DEVIATIONS) {
      out.push({
        id: `A-t${turns}-d${deviation}`,
        axis: 'pacing x learnability',
        note: `uniform faces, ${turns} turns, 1-in-${deviation} links deviate`,
        config: { turns, refill: REFILL, deviation },
      });
    }
  }

  // ── Block B: loaded distributions across pacing. 6 x 5 = 30. ─────────────
  // Pacing rather than deviation, because sample size — and therefore the gate's
  // power — is a function of `turns` and of nothing else.
  for (const d of DISTRIBUTIONS.slice(1)) {
    for (const turns of TURNS) {
      out.push({
        id: `B-${d.tag}-t${turns}`,
        axis: `fairness:${d.tag}`,
        note: d.belowFloor
          ? `${d.tag} faces, ${turns} turns — unfair but BELOW the gate's measured floor`
          : `${d.tag} faces, ${turns} turns — EXPECTED TO FAIL fairness`,
        config: { turns, refill: REFILL, faceWeights: d.w },
      });
    }
  }

  // ── Block C: shallow charge. 5 x 2 = 10. ─────────────────────────────────
  // chargeMax 1 removes the multiplier's depth entirely. Only deviation 2 and 8
  // are paired with it: the axis is nearly binary, so a full cross would be
  // padding of exactly the kind that produced the first catalogue.
  for (const turns of TURNS) {
    for (const deviation of [2, 8]) {
      out.push({
        id: `C-flat1-t${turns}-d${deviation}`,
        axis: 'charge depth',
        note: `charge capped at 1, ${turns} turns, 1-in-${deviation} deviation`,
        config: { turns, refill: REFILL, deviation, chargeMax: 1 },
      });
    }
  }

  // ── Block D: the extremes, to find where the game breaks. 4. ─────────────
  // EVERY ONE OF THESE IS A CONFIGURATION NO OTHER BLOCK REACHES. The first
  // draft of this block duplicated Block A points and M8 caught it immediately —
  // which is what M8 is for.
  out.push(
    // A THIRD-ORDER DUPLICATE LIVED HERE. `{turns: 20, deviation: 1, chargeMax: 1}`
    // hashed identically to `A-t20-d1`: on a lattice whose links ignore their
    // region, so few links are live that charge never reaches even the default
    // cap, so capping it changes nothing. M8 caught it. The replacement uses a
    // turn count no other block reaches, which makes it distinct by construction
    // rather than by luck.
    { id: 'D-ultrashort', axis: 'extreme', note: '3 turns at the shipped deviation — is there time to infer anything at all?', config: { turns: 3, refill: REFILL, deviation: 4 } },
    { id: 'D-telegraph-flat', axis: 'extreme', note: '20 turns, near-deterministic flow, charge capped at 1', config: { turns: 20, refill: REFILL, deviation: 64, chargeMax: 1 } },
    { id: 'D-sprint-mid', axis: 'extreme', note: '6 turns at the shipped deviation, charge capped at 1 — no time to amortise a probe', config: { turns: 6, refill: REFILL, deviation: 4, chargeMax: 1 } },
    { id: 'D-marathon-mid', axis: 'extreme', note: '20 turns at the shipped deviation, charge capped at 1', config: { turns: 20, refill: REFILL, deviation: 4, chargeMax: 1 } },
  );

  return out;
}

/** The shipped configuration, as a variant, for calibration. */
export const BASELINE: Variant = {
  id: 'BASELINE',
  axis: 'shipped',
  note: 'the game as released: 12 turns, refill 4, uniform faces, 1-in-4 deviation',
  config: { turns: 12, refill: 4 },
};

/** Variants whose face distribution is NOT uniform. */
export function loadedIds(): readonly string[] {
  return catalogue().filter((v) => v.config.faceWeights !== undefined).map((v) => v.id);
}

/**
 * Variants that are unfair but BELOW the gate's measured detection floor, so the
 * gate is expected NOT to flag them. Naming them is what stops "caught" from
 * being reported as if it covered everything unfair.
 */
export function belowFloorIds(): readonly string[] {
  const tags = DISTRIBUTIONS.filter((d) => d.belowFloor).map((d) => d.tag);
  return catalogue()
    .filter((v) => tags.some((t) => v.id.startsWith(`B-${t}-`)))
    .map((v) => v.id);
}

/** The distributions themselves, for the gate's power curve. */
export function distributions(): typeof DISTRIBUTIONS {
  return DISTRIBUTIONS;
}

/** Every distinct config in the catalogue, for the distinctness assertion. */
export function configs(): readonly RoundConfig[] {
  return catalogue().map((v) => v.config);
}
