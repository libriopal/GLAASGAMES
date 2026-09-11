// foundry/chem/learnable.ts — is the chemistry worth points, or is it a costume?
//
// ─────────────────────────────────────────────────────────────────────────────
// THE CLAIM THIS FILE CAN FALSIFY.
//
// The feature's whole justification is that a player learns real chemistry. That
// is only true if understanding chemistry CHANGES WHAT YOU DO. A game where the
// valence-aware player and the oblivious one score the same has not taught
// anything; it has decorated a match-3 with element symbols and a citation.
//
// `verify-learnable` E8 already did this for the hidden lattice and got numbers
// that were worth having precisely because they could have come back zero:
// recall alone +6.3%, regional deduction alone +4.2%, both +7.3%. This is the
// same instrument pointed at the same question one layer up.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE POLICIES, AND WHY THE MIDDLE ONE IS THE INTERESTING ONE.
//
//   random        finds a legal move and takes it. A player who works out what
//                 is allowed by trial and error and never evaluates anything.
//   biggest       takes the move with the most atoms. The match-3 instinct —
//                 bigger clear, bigger reward — imported from games where it is
//                 true. It is the control that matters, because it is what
//                 someone plays who has NOT understood the chemistry but is not
//                 playing at random either.
//   valence       takes the move whose atoms have the greatest total valence. A
//                 player who has grasped "more bonds means more energy" and has
//                 memorised NO numbers at all.
//   energy        takes the highest-energy move. Full knowledge: the bond
//                 enthalpy table, effectively.
//
// `valence` is the one the educational claim rests on. `energy` beating `random`
// proves only that a lookup table beats ignorance, which is not a lesson anybody
// needs a game for. **`valence` beating `biggest` is the finding**: it would mean
// a single transferable idea — that an atom's bond count drives what it can
// build and how much that releases — is worth points, without memorising
// anything.
//
// If `valence` and `biggest` come out level, the honest conclusion is that this
// game teaches chemistry vocabulary and not chemistry, and it should say so.

import { type Move, drawPlayableBoard, playableMoves } from '../../game/chem/board.js';
import { BY_SYMBOL, poolForFace, valenceOf } from '../../game/chem/elements.js';
import { makeRng } from '../../engine/sim/world-gen.js';

export type PolicyName = 'random' | 'biggest' | 'valence' | 'energy';

const totalValence = (symbols: readonly string[], m: Move): number =>
  m.cells.reduce((a, c) => a + valenceOf(BY_SYMBOL.get(symbols[c]!)!.group), 0);

/**
 * Chooses a move. Ties broken by the first in enumeration order, which is
 * deterministic, so two policies that would tie never differ by luck.
 */
function choose(name: PolicyName, symbols: readonly string[], moves: readonly Move[], rng: () => number): Move {
  switch (name) {
    case 'random':
      return moves[Math.abs(rng()) % moves.length]!;
    case 'biggest':
      return moves.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    case 'valence':
      return moves.reduce((a, b) => (totalValence(symbols, b) > totalValence(symbols, a) ? b : a));
    case 'energy':
      return moves.reduce((a, b) => (b.energy > a.energy ? b : a));
  }
}

/**
 * Plays one round and returns the total energy released.
 *
 * Consumed cells are refilled from the same distribution, so the board stays
 * live and a round is a sequence of decisions rather than one. A round ends
 * early if the board runs dry of legal moves — which the weight search made
 * rare, but not impossible once tiles have been consumed.
 */
export function playRound(
  name: PolicyName,
  seed: number,
  weights: readonly number[],
  turns: number,
): { score: number; turnsPlayed: number } {
  const rng = makeRng(seed);
  const { symbols } = drawPlayableBoard(rng, weights);
  let score = 0;
  let played = 0;

  const refill = (cell: number): void => {
    let total = 0;
    for (let f = 1; f <= 6; f += 1) total += weights[f] ?? 0;
    let pick = Math.abs(rng()) % Math.max(1, total);
    let face = 6;
    for (let f = 1; f <= 6; f += 1) {
      pick -= weights[f] ?? 0;
      if (pick < 0) { face = f; break; }
    }
    const pool = poolForFace(face);
    symbols[cell] = pool[Math.abs(rng()) % pool.length]!.symbol;
  };

  for (let t = 0; t < turns; t += 1) {
    const moves = playableMoves(symbols);
    if (moves.length === 0) break;
    const move = choose(name, symbols, moves, rng);
    score += move.energy;
    played += 1;
    for (const c of move.cells) refill(c);
  }
  return { score, turnsPlayed: played };
}

export interface Comparison {
  readonly policy: PolicyName;
  readonly mean: number;
  /** Standard error of the mean, so a gap can be read against its noise. */
  readonly stderr: number;
}

/**
 * Runs every policy over the SAME seeds and reports means.
 *
 * Paired seeds, because the variance between boards dwarfs the variance between
 * policies. Comparing two policies on different boards would measure the boards.
 */
export function compare(
  seeds: number,
  weights: readonly number[],
  turns: number,
  seed0 = 4242,
): Comparison[] {
  const names: PolicyName[] = ['random', 'biggest', 'valence', 'energy'];
  return names.map((policy) => {
    const scores: number[] = [];
    for (let i = 0; i < seeds; i += 1) {
      scores.push(playRound(policy, seed0 + i * 7919, weights, turns).score);
    }
    const mean = scores.reduce((a, v) => a + v, 0) / scores.length;
    const variance = scores.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, scores.length - 1);
    return { policy, mean, stderr: Math.sqrt(variance / scores.length) };
  });
}

/** The uplift of one policy over another, as a percentage of the baseline. */
export function uplift(a: Comparison, b: Comparison): number {
  return b.mean === 0 ? 0 : (100 * (a.mean - b.mean)) / b.mean;
}
