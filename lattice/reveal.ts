// lattice/reveal.ts — after the round, the lattice is shown.
//
// P2, and the reason it is not optional.
//
// A hidden structure a player must infer is the same stimulus a slot machine
// presents, with one difference that decides everything: a slot machine NEVER
// TELLS YOU. The player's pattern-seeking is never corrected, so a wrong belief
// survives indefinitely and the machine profits from it. Habitual gamblers
// detect illusory patterns in random data more than other people do, which makes
// an uncorrected hidden layer a trap aimed precisely at them.
//
// Revealing the true lattice every round inverts that. A player who saw
// structure that was not there is TOLD SO, by ground truth, within a minute.
// Over a session that is calibration training — the opposite of what a machine
// that never reveals does to the same cognitive habit.
//
// It also makes the round auditable by anyone: seed, links and flows are enough
// to recompute the whole hidden structure independently and check it against the
// commitment published before play began.

import { Board, CELL_COUNT, NO_LINK } from './board.js';
import { generateLattice, regionFlows } from './lattice-gen.js';
import { checkReveal, type Commitment, type Reveal } from './commit.js';

/** Direction from one cell to another: 0 up, 1 right, 2 down, 3 left, 4 none. */
export function directionOf(from: number, to: number): number {
  if (to < 0) return 4;
  const dx = Board.columnOf(to) - Board.columnOf(from);
  const dy = Board.rowOf(to) - Board.rowOf(from);
  if (dx === 0 && dy === -1) return 0;
  if (dx === 1 && dy === 0) return 1;
  if (dx === 0 && dy === 1) return 2;
  if (dx === -1 && dy === 0) return 3;
  return 4;
}

export interface RoundReveal {
  readonly seed: number;
  readonly serverSeed: string;
  readonly clientSeed: string;
  /** True when the revealed seed matches the commitment published before play. */
  readonly commitmentHolds: boolean;
  /** The hidden lattice, in full. */
  readonly links: Int32Array;
  /** Each region's prevailing flow — the structure that made it learnable. */
  readonly flows: readonly number[];
}

/**
 * Rebuilds the hidden lattice from the seed alone.
 *
 * This is the independence property: nothing from the played round is consulted,
 * so a third party with only the reveal can reconstruct what the player was
 * inferring and check it. If this ever diverged from what the round actually
 * used, the reveal would be a story rather than a disclosure — which is why the
 * oracle compares the two rather than trusting them to agree.
 */
export function reconstructLattice(seed: number): Int32Array {
  const board = new Board();
  generateLattice(board, seed);
  return board.hiddenLinks();
}

/**
 * Builds the disclosure a player sees at the end of a round.
 *
 * `localRulesHash` is the verifier's own `computeRules().hash`, threaded
 * through rather than computed here so this module stays free of filesystem
 * access and can run in a browser. It is required, not defaulted: a default
 * would silently reduce `commitmentHolds` to the operator agreeing with
 * itself, which is precisely the check that was missing before `ruleset.ts`.
 */
export async function buildReveal(
  commitment: Commitment,
  reveal: Reveal,
  seed: number,
  localRulesHash: string,
): Promise<RoundReveal> {
  return {
    seed,
    serverSeed: reveal.serverSeed,
    clientSeed: reveal.clientSeed,
    commitmentHolds: await checkReveal(commitment, reveal, localRulesHash),
    links: reconstructLattice(seed),
    flows: regionFlows(seed),
  };
}

export interface InferenceScore {
  /** Cells the player guessed a direction for. */
  readonly guessed: number;
  readonly correct: number;
  /** Correct as a fraction of guessed; 0 when nothing was guessed. */
  readonly accuracy: number;
  /**
   * What the BEST NO-SKILL STRATEGY scores on the same cells: guess the single
   * most common direction everywhere.
   *
   * This is not 1/5, and getting that wrong would have been the most harmful bug
   * in the system. The first version of this reported a uniform 0.20 baseline —
   * but the lattice has a prevailing flow per region, so simply guessing "up"
   * for all 36 cells scores 0.389. A player told chance was 0.20, scoring 0.35,
   * would conclude they had learned something when a constant guess beats them.
   * That is precisely the false-skill belief this whole reveal exists to
   * correct, manufactured by the correction itself.
   *
   * The honest bar is the best a player could do while knowing nothing about
   * THIS round — and because the prevailing-flow bias is a permanent property of
   * the generator, the modal direction is exactly that.
   */
  readonly chanceBaseline: number;
}

/**
 * Scores a player's guess at the hidden lattice.
 *
 * `guesses` is one direction per cell, 0..3, or -1 for "no guess". Directions
 * rather than target indices, because a direction is what a person can actually
 * hold in mind for 36 cells.
 */
export function scoreInference(guesses: readonly number[], truth: Int32Array): InferenceScore {
  let guessed = 0;
  let correct = 0;
  // Frequency of each true direction over the cells the player actually guessed,
  // so the baseline is computed on the same sample the accuracy is.
  const directionCounts = [0, 0, 0, 0, 0];

  for (let i = 0; i < CELL_COUNT; i += 1) {
    const guess = guesses[i] ?? -1;
    if (guess < 0) continue;
    guessed += 1;

    const link = truth[i] ?? NO_LINK;
    const actual = link === NO_LINK ? 4 : directionOf(i, link);
    if (guess === actual) correct += 1;
    directionCounts[actual] = directionCounts[actual]! + 1;
  }

  const modal = Math.max(...directionCounts);

  return {
    guessed,
    correct,
    accuracy: guessed === 0 ? 0 : correct / guessed,
    chanceBaseline: guessed === 0 ? 0 : modal / guessed,
  };
}
