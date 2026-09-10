// lattice/lattice-gen.ts — the hidden structure, derived from the revealed seed.
//
// Every cell FEEDS exactly one other cell. That link is the hidden lattice: the
// neural/synaptic layer the concept corpus draws behind the board in 72% of its
// frames, and the thing the player is actually learning to read.
//
// WHY IT MUST BE STRUCTURED AND NOT RANDOM — this is the safety argument, not a
// design preference. Habitual gamblers detect illusory patterns in random data
// more than other people do, so a game that dangles a hidden layer in front of
// pattern-seeking is, if that layer is noise, a machine for exploiting exactly
// the population most at risk. Apophenia is a FALSE POSITIVE on randomness; if
// the structure is genuinely there and genuinely inferable, the player's pattern
// detection is correct and the game is teaching rather than preying.
//
// So the links are deliberately LOCAL and BIASED, not uniform:
//   - a cell feeds one of its four neighbours, never an arbitrary far cell
//   - direction is drawn from a per-region prevailing flow
// Both properties make the lattice learnable from observation, and both are what
// give it the mutual information that `verify-lattice` P1 measures and publishes.
// A uniform random link map would score near zero on P1 and fail the build.

import { BOARD_H, BOARD_W, Board, CELL_COUNT, NO_LINK, OFFSET_LINK, OFFSET_W } from './board.js';
import { makeRng } from '../engine/sim/world-gen.js';
import { toFixed } from '../engine/math/fixed.js';

/** Four-neighbourhood, in a fixed order so the draw is reproducible. */
const NEIGHBOUR_DX = [0, 1, 0, -1] as const;
const NEIGHBOUR_DY = [-1, 0, 1, 0] as const;

/**
 * Region edge, in cells: 3x3 blocks over a 6x6 board, so four regions.
 *
 * Each region gets a prevailing flow direction, so links correlate spatially
 * rather than being independent per cell — that correlation is precisely what
 * makes the lattice inferable from a handful of observations instead of
 * requiring all 36 to be seen individually. The Monte Carlo learner reads this
 * to know which cells share a flow.
 */
export const REGION = 3;

export interface LatticeStats {
  readonly linked: number;
  /** How many links follow their region's prevailing direction. */
  readonly conforming: number;
}

/**
 * How often a link DEVIATES from its region's prevailing flow: one draw in
 * `deviation`. Shipped is 4, i.e. 1 in 4.
 *
 * THIS IS THE LEARNABILITY KNOB, AND IT IS THE ONE THE BALANCE SWEEP NEEDED.
 * The Monte Carlo catalogue originally swept `refill`, which a digest comparison
 * proved completely inert — after banking one cell exactly one cell is empty, so
 * `refill > 1` has nothing to fill and all four settings produce byte-identical
 * rounds. Sweeping it produced 69 labels over 20 distinct games.
 *
 * Deviation is the opposite: it moves the exact property the design argues
 * about. At 1 the lattice is pure noise and nothing is inferable — the apophenia
 * hazard this file's header calls a machine for exploiting pattern-seekers. At a
 * very large value every link follows its region and one observation gives the
 * whole region away. The shipped 1-in-4 is a claim that the band between those
 * is where the game lives, and until now that claim had never been swept.
 */
export const DEFAULT_DEVIATION = 4;

/**
 * Writes the hidden link and w columns into the board.
 *
 * Returns statistics rather than nothing, because a generator whose output is
 * never measured is a generator nobody notices has broken.
 */
export function generateLattice(board: Board, seed: number, deviation: number = DEFAULT_DEVIATION): LatticeStats {
  const rng = makeRng(seed);
  const draw = (n: number): number => Math.abs(rng()) % n;

  // One prevailing direction per region, drawn first so the region layout does
  // not depend on how many cells happen to be linked.
  const regionsPerRow = BOARD_W / REGION;
  const regionCount = regionsPerRow * (BOARD_H / REGION);
  const prevailing: number[] = [];
  for (let r = 0; r < regionCount; r += 1) prevailing.push(draw(4));

  let linked = 0;
  let conforming = 0;

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const column = Board.columnOf(index);
    const row = Board.rowOf(index);
    const region = ((row / REGION) | 0) * regionsPerRow + ((column / REGION) | 0);
    const prefer = prevailing[region]!;

    // 3 in 4 follow the region's flow; the rest deviate. Without deviation the
    // lattice would be trivially guessable after one observation and there would
    // be no skill in reading it; without a prevailing flow it would be
    // unlearnable. The band between those is where the game lives.
    const direction = draw(deviation) === 0 ? draw(4) : prefer;

    const targetColumn = column + NEIGHBOUR_DX[direction]!;
    const targetRow = row + NEIGHBOUR_DY[direction]!;

    if (targetColumn < 0 || targetColumn >= BOARD_W || targetRow < 0 || targetRow >= BOARD_H) {
      // Edge cells feeding outward feed nothing. Real boundaries, not wrapping:
      // a wrapped board would make the edges behave unlike everywhere else while
      // looking identical, which is the kind of hidden rule this design refuses.
      board.set(index, OFFSET_LINK, NO_LINK);
    } else {
      board.set(index, OFFSET_LINK, Board.indexOf(targetColumn, targetRow));
      linked += 1;
      if (direction === prefer) conforming += 1;
    }

    // The w coordinate: the cell's position on the hidden axis. Rendered only as
    // field — flow and brightness behind the board — and never as a number.
    board.set(index, OFFSET_W, toFixed(draw(64) - 32));
  }

  return { linked, conforming };
}

/** The prevailing direction of each region, for the post-round reveal. */
export function regionFlows(seed: number): readonly number[] {
  const rng = makeRng(seed);
  const draw = (n: number): number => Math.abs(rng()) % n;
  const regionsPerRow = BOARD_W / REGION;
  const regionCount = regionsPerRow * (BOARD_H / REGION);
  const flows: number[] = [];
  for (let r = 0; r < regionCount; r += 1) flows.push(draw(4));
  return flows;
}
