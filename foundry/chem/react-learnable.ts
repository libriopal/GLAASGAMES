// foundry/chem/react-learnable.ts — the same instrument, pointed at the fix.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE CLAIM WAS FALSIFIED ONCE. THIS IS WHAT IT TOOK TO MAKE IT TRUE.
//
// Assembly scoring was measured and found to teach nothing: understanding
// valence was worth +1.43% over "take the biggest blob" at t = 1.23, because
// building from free atoms breaks no bonds and the score therefore tracked atom
// count at r = 0.843.
//
// Reaction scoring breaks that coupling by construction — a reaction's score is
// a DIFFERENCE between bonds formed and bonds broken, and a difference is not
// monotone in size. This file measures whether that is actually what happens,
// using the identical method so the two are comparable: paired seeds, four
// policies, one of which understands a chemical idea and memorises nothing.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE POLICIES, AND WHY `fuel` IS THE ONE THAT MATTERS.
//
//   random    takes any available reaction.
//   biggest   takes the largest selection. The match-3 instinct, unchanged from
//             the assembly experiment so the comparison is honest.
//   fuel      prefers reactions whose REACTANTS are weakly bonded. A player who
//             has understood that a strongly-bonded molecule has little left to
//             give and a weakly-bonded one has much — and who has memorised no
//             numbers whatsoever.
//   energy    takes the highest release. The full table.
//
// `fuel` is the educational claim in executable form. If it beats `biggest`, one
// transferable idea is worth points. If it does not, the chemistry is still a
// costume and the claim must be dropped rather than restated.

import { formationEnergy } from '../../game/chem/bonds.js';
import { MOLECULES, bondsOf } from '../../game/chem/library.js';
import {
  type MoleculeWeights, type ReactiveMove,
  UNIFORM_WEIGHTS, applyMove, drawReactiveBoard, reactiveMoves,
} from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';

export type ReactPolicy = 'random' | 'biggest' | 'fuel' | 'energy';

const MOL_ENERGY: ReadonlyMap<string, number> =
  new Map(MOLECULES.map((m) => [m.formula, formationEnergy(bondsOf(m))]));

/** Mean bond energy of a move's reactants. Lower means more to gain. */
const reactantStability = (m: ReactiveMove): number =>
  m.reaction.reactants.reduce((s, f) => s + MOL_ENERGY.get(f)!, 0) / m.reaction.reactants.length;

function choose(p: ReactPolicy, moves: readonly ReactiveMove[], rng: () => number): ReactiveMove {
  switch (p) {
    case 'random':
      return moves[Math.abs(rng()) % moves.length]!;
    case 'biggest':
      return moves.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    case 'fuel':
      return moves.reduce((a, b) => (reactantStability(b) < reactantStability(a) ? b : a));
    case 'energy':
      return moves.reduce((a, b) => (b.reaction.released > a.reaction.released ? b : a));
  }
}

export function playReactRound(
  p: ReactPolicy,
  seed: number,
  turns: number,
  weights: MoleculeWeights = UNIFORM_WEIGHTS,
): number {
  const rng = makeRng(seed);
  const { tiles } = drawReactiveBoard(rng, weights);
  let score = 0;
  for (let t = 0; t < turns; t += 1) {
    const moves = reactiveMoves(tiles);
    if (moves.length === 0) break;
    const move = choose(p, moves, rng);
    score += move.reaction.released;
    applyMove(tiles, move, rng, weights);
  }
  return score;
}

export interface Paired {
  /** Mean of a − b, in kJ/mol. */
  readonly delta: number;
  /** As a percentage of b's mean. */
  readonly pct: number;
  /** Paired t statistic. */
  readonly t: number;
  readonly wins: number;
  readonly n: number;
}

export function pairedCompare(a: readonly number[], b: readonly number[]): Paired {
  const d = a.map((v, i) => v - b[i]!);
  const mean = d.reduce((x, v) => x + v, 0) / d.length;
  const sd = Math.sqrt(d.reduce((x, v) => x + (v - mean) ** 2, 0) / Math.max(1, d.length - 1));
  const se = sd / Math.sqrt(d.length);
  const base = b.reduce((x, v) => x + v, 0) / b.length;
  return {
    delta: mean,
    pct: base === 0 ? 0 : (100 * mean) / base,
    t: se === 0 ? 0 : mean / se,
    wins: d.filter((v) => v > 0).length,
    n: d.length,
  };
}

export function runPolicies(
  seeds: number,
  turns: number,
  seed0 = 8800,
  weights: MoleculeWeights = UNIFORM_WEIGHTS,
): Record<ReactPolicy, number[]> {
  const out = { random: [], biggest: [], fuel: [], energy: [] } as Record<ReactPolicy, number[]>;
  for (const p of ['random', 'biggest', 'fuel', 'energy'] as ReactPolicy[]) {
    for (let i = 0; i < seeds; i += 1) out[p].push(playReactRound(p, seed0 + i * 4001, turns, weights));
  }
  return out;
}

/** Correlation between how many tiles a move consumes and what it pays. */
export function sizeEnergyCorrelation(boards: number, seed0 = 700): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < boards; i += 1) {
    const { tiles } = drawReactiveBoard(makeRng(seed0 + i * 53));
    for (const m of reactiveMoves(tiles)) { xs.push(m.cells.length); ys.push(m.reaction.released); }
  }
  const mx = xs.reduce((a, v) => a + v, 0) / xs.length;
  const my = ys.reduce((a, v) => a + v, 0) / ys.length;
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i]! - mx) * (ys[i]! - my); dx += (xs[i]! - mx) ** 2; dy += (ys[i]! - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}
