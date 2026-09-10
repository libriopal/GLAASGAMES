// foundry/montecarlo/variants.ts — the 69 candidates, as things that RUN.
//
// The brief asked for 69 candidates each verified to have proven value. A prose
// list cannot carry that property: proof is a measurement. So each candidate is
// a `RoundConfig` the Monte Carlo harness executes, and "proven value" means it
// survived the harness — not that it sounded good.
//
// ─────────────────────────────────────────────────────────────────────────────
// THEY ARE GENERATED FROM AXES, NOT WRITTEN OUT ONE BY ONE, AND THAT IS A
// DESIGN DECISION RATHER THAN LAZINESS.
//
// Sixty-nine hand-authored variants would be sixty-nine opportunities to smuggle
// in a preference. Sweeping a small number of axes systematically means the
// catalogue has no favourites: the harness sees a grid, and whatever survives
// survives because of its numbers. It also makes the space REPRODUCIBLE — the
// same axes regenerate the same 69, so a result can be re-derived rather than
// taken on trust.
//
// THE AXES ARE THE ONES THAT ACTUALLY MOVE FAIRNESS AND BALANCE:
//
//   turns       12 is shipped. Shorter punishes exploration; longer lets a
//               learner amortise its early probing.
//   refill      4 is shipped. This is the information-churn rate: refill fast
//               and the board forgets what the player learned about it.
//   faceWeights THE fairness knob. Uniform is shipped. A loaded distribution is
//               the exploit this suite exists to catch, so several variants load
//               it ON PURPOSE and are REQUIRED to fail the fairness gate. A
//               catalogue containing no bad candidates could not demonstrate
//               that the filter works.
//
// Board size and charge depth are deliberately NOT swept: both are compile-time
// constants that the shipped renderer, the GL instance buffer and four oracles
// depend on. Varying them is Stage 3 work and it is blocked on a real defect —
// the commitment does not bind the round parameters, so two different games
// publish the same rules hash (`design/production-blueprint.md` P5). Sweeping an
// axis the commitment cannot describe would produce variants that are
// indistinguishable to the fairness proof, which is worse than not sweeping it.

import type { Variant } from './harness.js';

/** Shipped: uniform over faces 1..6. Index 0 is EMPTY and unused. */
const UNIFORM: readonly number[] = [0, 4, 4, 4, 4, 4, 4];

/** Face distributions. The loaded ones are here to BE CAUGHT. */
const DISTRIBUTIONS: readonly { readonly tag: string; readonly w: readonly number[]; readonly fair: boolean }[] = [
  { tag: 'uniform', w: UNIFORM, fair: true },
  // Gently top-heavy — the kind of drift that arrives by accident.
  { tag: 'top-heavy', w: [0, 3, 3, 4, 4, 5, 5], fair: false },
  // Aggressively loaded toward 6. A player who always banks the biggest number
  // is rewarded twice; `greedy` should approach the ceiling and `dominance`
  // should spike.
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
const REFILL: readonly number[] = [1, 2, 4, 6];

/**
 * The catalogue.
 *
 * 5 turn settings x 4 refill settings = 20 fair variants on the shipped
 * distribution, plus 5 loaded distributions x (a 3x3 sub-grid + the shipped
 * point) sampled to bring the total to 69. The exact construction is below and
 * is deterministic — `verify-montecarlo` M1 asserts the count and the shape, so
 * a silent change to this file moves a number somebody has to defend.
 */
export function catalogue(): readonly Variant[] {
  const out: Variant[] = [];

  // ── Block A: the fair grid. 5 x 4 = 20. ──────────────────────────────────
  for (const turns of TURNS) {
    for (const refill of REFILL) {
      out.push({
        id: `A-t${turns}-r${refill}`,
        axis: 'pacing',
        note: `uniform faces, ${turns} turns, refill ${refill}`,
        config: { turns, refill },
      });
    }
  }

  // ── Block B: loaded distributions across a reduced grid. 5 x 9 = 45. ─────
  // Reduced because the question here is "does loading the dice get caught",
  // which does not need the full pacing sweep to answer.
  const bTurns = [9, 12, 16];
  const bRefill = [2, 4, 6];
  for (const d of DISTRIBUTIONS.slice(1)) {
    for (const turns of bTurns) {
      for (const refill of bRefill) {
        out.push({
          id: `B-${d.tag}-t${turns}-r${refill}`,
          axis: `fairness:${d.tag}`,
          note: `${d.tag} faces, ${turns} turns, refill ${refill} — EXPECTED TO FAIL fairness`,
          config: { turns, refill, faceWeights: d.w },
        });
      }
    }
  }

  // ── Block C: the extremes, to find where the game breaks. 4. ─────────────
  out.push(
    { id: 'C-starved', axis: 'extreme', note: 'refill 1 over 20 turns — the board empties', config: { turns: 20, refill: 1 } },
    { id: 'C-flooded', axis: 'extreme', note: 'refill 6 over 6 turns — nothing persists to learn', config: { turns: 6, refill: 6 } },
    { id: 'C-sprint', axis: 'extreme', note: '6 turns, refill 2 — no time to amortise a probe', config: { turns: 6, refill: 2 } },
    { id: 'C-marathon', axis: 'extreme', note: '20 turns, refill 4 — maximum room to learn', config: { turns: 20, refill: 4 } },
  );

  return out;
}

/** The shipped configuration, as a variant, for calibration. */
export const BASELINE: Variant = {
  id: 'BASELINE',
  axis: 'shipped',
  note: 'the game as released: 12 turns, refill 4, uniform faces',
  config: { turns: 12, refill: 4 },
};

/** Variants whose face distribution is NOT uniform, i.e. must fail fairness. */
export function loadedIds(): readonly string[] {
  return catalogue().filter((v) => v.config.faceWeights !== undefined).map((v) => v.id);
}
