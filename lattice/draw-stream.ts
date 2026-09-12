// lattice/draw-stream.ts — faces indexed by ordinal, so the future is knowable.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FILE EXISTS BECAUSE A SPECIFICATION MADE A CLAIM OUR ENGINE COULD NOT KEEP.
//
// The external optical spec that describes the forecast grid states, as one of
// four properties that "close a hole":
//
//     "Row 1 is a pure function of (seed, tickIndex) via the counter-based RNG."
//
// It is not, and it was never going to be. `advanceTurn` drew refill faces from
// `state.rng` — a sequential xorshift stream. The number of draws a turn
// consumes is the number of EMPTY cells up to `config.refill`, which depends on
// what the player banked; and a stagnation reshuffle rewrites all 36 cells and
// consumes 36 draws in one go. So the face that arrives on turn N was a function
// of the entire play history, not of (seed, N).
//
// A forecast strip built on the spec's stated property would have been WRONG —
// and wrong in the specific way this repository keeps catching itself: a claim
// inherited from a document instead of measured against the code. The bug would
// have been invisible until a reshuffle fired, at which point every prediction
// on screen would have silently become someone else's.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FIX IS TO INDEX THE STREAM BY ORDINAL RATHER THAN BY TURN.
//
// A face is a pure function of (seed, ordinal): the n-th face this round will
// ever draw is fixed before the round starts and cannot be changed by anything
// the player does. What play changes is only WHERE IN THE SEQUENCE WE ARE.
//
// That is a strictly stronger property than the spec asked for, and it is the
// one that makes the two-row grid honest:
//
//   Row 1  the next six faces in the stream. CERTAIN — these values cannot
//          change, and `advanceTurn` consumes them in this order.
//   Row 2  the six after those. The VALUES are equally fixed; what is fallible
//          is whether the window reaches them, because a reshuffle eats 36
//          ordinals at once and slides everything.
//
// So row 2's uncertainty is not decoration and it is not borrowed. It is this
// engine's own reshuffle rule, seen from the front. The independent auditor was
// asked whether that was "a real epistemic uncertainty, or an implementation
// detail dressed up as a design virtue", and answered: real — "the uncertainty
// is not in the RNG itself, which remains deterministic, but in the mapping of
// the RNG stream to the game state... a property of the player's knowledge."
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY NOT REUSE THE HMAC STREAM FROM magentadice-cyancode.
//
// That repository's `csprng.ts` is the right architecture and is where this
// counter discipline comes from: `nextFloat` hashes (seed, counter) so any draw
// recomputes in isolation. It is not reused verbatim here for one reason that
// is not a matter of taste — `crypto.subtle.digest` is ASYNC, and every function
// on this path is synchronous and is called inside a turn. Adopting it would
// make `advanceTurn` async, which would make the executor un-replayable in a
// tight loop and would change the signature the server verifies through.
//
// What IS reused is the property that makes it work: a hash of the counter, not
// a walk of a stream. The mixer below is the integer finaliser from splitmix64's
// 32-bit sibling, which is a bijection on u32 — so distinct ordinals can never
// collide onto the same draw, and the sequence has no short cycles the way a
// naive `seed + ordinal` scramble would.

import { type Board, CELL_COUNT, EMPTY, NO_LINK, OFFSET_FACE, OFFSET_LINK } from './board.js';

/**
 * Avalanche mixer, u32 → u32. A bijection: no two ordinals share a draw.
 *
 * Constants are Murmur3's finaliser. They are not tuned and must not be tuned —
 * their avalanche properties are a published result, and a "better" constant
 * somebody picked by eye is how a generator acquires a bias nobody can see.
 */
function mix32(x: number): number {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The face at a given position in this round's draw sequence.
 *
 * Pure. Depends on nothing but its arguments — no state, no counter to advance,
 * no order of evaluation. `faceAtOrdinal(s, 900, w)` returns the same value
 * whether it is asked before the round begins or after nine hundred draws, and
 * that is the entire property the forecast rests on.
 */
export function faceAtOrdinal(seed: number, ordinal: number, weights: readonly number[]): number {
  let total = 0;
  for (let i = 1; i < weights.length; i += 1) total += weights[i] ?? 0;
  if (total <= 0) return 1;

  // The ordinal is mixed WITH the seed rather than added to it, so two rounds
  // whose seeds differ by one do not share a draw sequence offset by one.
  let pick = mix32(mix32(seed | 0) ^ Math.imul(ordinal | 0, 0x9e3779b9)) % total;
  for (let face = 1; face < weights.length; face += 1) {
    pick -= weights[face] ?? 0;
    if (pick < 0) return face;
  }
  return weights.length - 1;
}

/** How many ordinals a full-board reshuffle consumes. One per cell, always. */
export const RESHUFFLE_COST = CELL_COUNT;

/** The two rows. Six wide, because the board is six wide. */
export const FORECAST_WIDTH = 6;
/** Depth is capped at two BY DESIGN, not by screen space. See `forecast`. */
export const FORECAST_DEPTH = 2;

export interface Forecast {
  /**
   * The next twelve faces, row-major: indices 0..5 are row 1, 6..11 are row 2.
   *
   * Every value here is certain in the sense that matters — it is what the
   * stream holds at that ordinal, and nothing can change it.
   */
  readonly faces: readonly number[];
  /**
   * Confidence that the window actually reaches each cell, 0..CONFIDENCE_MAX.
   *
   * Row 1 is always `CONFIDENCE_MAX`: stagnation is resolved at the TOP of a
   * turn, before the player is asked, so by the time this forecast is shown the
   * only reshuffle that could have moved the window has already fired. Row 2 is
   * graded by how far the board is from stagnation, because a reshuffle before
   * those draws land would slide them out from under the display.
   */
  readonly confidence: readonly number[];
  /** Where the window starts. Exposed so a verifier can recompute the faces. */
  readonly ordinal: number;
}

/**
 * Confidence is an integer count of states, not a probability.
 *
 * Four states, and the reason is evidence rather than convenience. The optical
 * spec's first finding — from behavioural work on stomatopod colour vision that
 * found discrimination of only 12–25 nm across twelve receptor classes — is that
 * a many-channel visual system reads SIGNATURES rather than comparing
 * magnitudes. The design rule taken from it is that no readout may require the
 * player to compare two values. A four-state quantisation is nameable: certain,
 * likely, doubtful, no claim. A continuous bar would not be.
 */
export const CONFIDENCE_MAX = 3;

/**
 * How many bankable cells still feed a live neighbour.
 *
 * This is `isStagnant`'s condition, counted instead of thresholded. Stagnation
 * is the case where this reaches zero, so the count is the margin — and because
 * it is an integer read off the board with no clock and no float, both players
 * of a shared seed compute the same one and the verifier reproduces it.
 */
export function liveLinkCount(board: Board): number {
  let live = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (board.get(i, OFFSET_FACE) === EMPTY) continue;
    const link = board.get(i, OFFSET_LINK);
    if (link === NO_LINK) continue;
    if (board.get(link, OFFSET_FACE) !== EMPTY) live += 1;
  }
  return live;
}

/**
 * The forecast, as of now.
 *
 * ── WHY DEPTH STOPS AT TWO ───────────────────────────────────────────────────
 *
 * Not screen space. Full knowledge of the draw queue converts the board from a
 * stochastic puzzle into a deterministic search problem, and at that point the
 * difference between two players is the difference between their solvers. Depth
 * two with the second row uncertain leaves the search stochastic, which is the
 * distinction between a skill game and a solved one.
 *
 * The auditor's answer on this was that a cap of two is a HEURISTIC and that the
 * way to settle it is to measure the spread between a bounded search agent and a
 * greedy one at depth 2 against depth 3 — if the spread does not widen, the cap
 * is justified. That measurement is not done, so the cap is recorded here as
 * chosen rather than as demonstrated.
 */
export function forecast(
  seed: number,
  ordinal: number,
  weights: readonly number[],
  board: Board,
): Forecast {
  const faces: number[] = [];
  const confidence: number[] = [];

  const live = liveLinkCount(board);
  // Graded on the margin, floored at zero. The thresholds are cell counts on a
  // 36-cell board: comfortably live, thinning, one bad turn from a reshuffle.
  const rowTwo = live >= 12 ? CONFIDENCE_MAX : live >= 6 ? 2 : live >= 2 ? 1 : 0;

  for (let row = 0; row < FORECAST_DEPTH; row += 1) {
    for (let col = 0; col < FORECAST_WIDTH; col += 1) {
      const n = row * FORECAST_WIDTH + col;
      faces.push(faceAtOrdinal(seed, ordinal + n, weights));
      confidence.push(row === 0 ? CONFIDENCE_MAX : rowTwo);
    }
  }

  return { faces, confidence, ordinal };
}
