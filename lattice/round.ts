// lattice/round.ts — one round, played and verifiable.
//
// THE L1x INVARIANT LIVES HERE AND IS THE POINT OF THIS FILE.
//
// The face distribution is read ONCE, before the first turn, and is a `const`
// captured outside the turn loop. Nothing inside the loop may re-weight it.
// That is not a style choice: `CLAUDE.md` declares SixPoolManager immutable
// mid-match and forbids altering face distributions in the live pool, and the
// per-turn face bias found in monteCarlo.ts is what that rule forbids. The OWC
// steered toward a Return-To-Player target, and under a principal-return bond
// RTP is 1.0 by construction — a controller with no setpoint. So there is no
// mid-round re-weighting anywhere in this file, and `verify-lattice` reads this
// source and fails the build if one appears.
//
// Dead boards, which the OWC also addressed, are handled the way the rest of the
// industry handles them and the way this architecture permits: deadlock
// detection and a VISIBLE reshuffle, at a round boundary, identical for every
// player, knowing nothing about who is ahead.

import {
  Board,
  CELL_COUNT,
  CHARGE_MAX,
  EMPTY,
  NO_LINK,
  OFFSET_CHARGE,
  OFFSET_FACE,
  OFFSET_LINK,
  OFFSET_STATE,
  STATE_CHARGED,
  STATE_IDLE,
  STATE_SPENT,
} from './board.js';
import { generateLattice } from './lattice-gen.js';
import { makeRng } from '../engine/sim/world-gen.js';
import { hashState } from '../engine/sim/hash.js';

/** Face weights. Read once per round; never re-read. */
export const FACE_WEIGHTS: readonly number[] = [0, 4, 4, 4, 4, 4, 4];

export interface RoundConfig {
  readonly turns: number;
  /** Cells refilled per turn. */
  readonly refill: number;
}

export const DEFAULT_ROUND: RoundConfig = { turns: 12, refill: 4 };

/** One player action: which cell to bank this turn. */
export type Action = number;

/** What the player observed, for the mutual-information oracle. */
export interface Observation {
  readonly turn: number;
  /** Cells whose charge rose this turn — the visible consequence of a link. */
  readonly chargedCells: readonly number[];
  /** The cell the player banked. */
  readonly banked: number;
}

export interface RoundResult {
  readonly score: number;
  readonly turnsPlayed: number;
  readonly reshuffles: number;
  readonly observations: readonly Observation[];
  /** Chained hash over the board after every turn. */
  readonly digest: number;
  readonly finalLinks: Int32Array;
}

function drawFace(rng: () => number, weights: readonly number[]): number {
  let total = 0;
  for (let f = 1; f <= 6; f += 1) total += weights[f]!;
  let pick = Math.abs(rng()) % total;
  for (let f = 1; f <= 6; f += 1) {
    pick -= weights[f]!;
    if (pick < 0) return f;
  }
  return 6;
}

/** True when no cell can be banked — every cell empty. */
function isDeadlocked(board: Board): boolean {
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (board.get(i, OFFSET_FACE) !== EMPTY) return false;
  }
  return true;
}

/**
 * Plays one round.
 *
 * `chooseAction` is the player. It is handed only what a player can see — the
 * observable board — so a policy CANNOT read the hidden lattice even by
 * accident. That constraint is enforced by the type, not by discipline: there is
 * no path from the argument to OFFSET_LINK.
 */
export function playRound(
  seed: number,
  config: RoundConfig,
  chooseAction: (observable: Int32Array, turn: number) => Action,
): RoundResult {
  const board = new Board();
  generateLattice(board, seed);

  const rng = makeRng(seed ^ 0x5bf03635);

  // ── L1x: the face distribution is fixed here, before the loop, and is const.
  // No statement inside the turn loop may derive a new weighting.
  const weights = FACE_WEIGHTS;

  for (let i = 0; i < CELL_COUNT; i += 1) {
    board.set(i, OFFSET_FACE, drawFace(rng, weights));
    board.set(i, OFFSET_STATE, STATE_IDLE);
  }

  let score = 0;
  let reshuffles = 0;
  const observations: Observation[] = [];
  let chained = 0x811c9dc5;

  let turn = 0;
  for (; turn < config.turns; turn += 1) {
    if (isDeadlocked(board)) {
      // Visible reshuffle. Symmetric, player-agnostic, at a turn boundary — it
      // repopulates the board from the same fixed weights and knows nothing
      // about the score.
      for (let i = 0; i < CELL_COUNT; i += 1) {
        board.set(i, OFFSET_FACE, drawFace(rng, weights));
        board.set(i, OFFSET_STATE, STATE_IDLE);
      }
      reshuffles += 1;
    }

    const banked = chooseAction(board.observable(), turn);
    const target = banked >= 0 && banked < CELL_COUNT ? banked : 0;

    const face = board.get(target, OFFSET_FACE);
    const chargedCells: number[] = [];

    if (face !== EMPTY) {
      // Score is face value times one plus charge — so a cell that has been fed
      // by the hidden lattice is worth more. That is the whole incentive to read
      // the lattice, and it is why w is load-bearing rather than decorative.
      const charge = board.get(target, OFFSET_CHARGE);
      score = (score + face * (1 + charge)) | 0;

      board.set(target, OFFSET_FACE, EMPTY);
      board.set(target, OFFSET_CHARGE, 0);
      board.set(target, OFFSET_STATE, STATE_SPENT);

      // Discharge along the hidden link: the banked cell feeds the one it links
      // to. This is the ONLY way charge moves, so every charge the player sees
      // appear is evidence about the link that produced it.
      const link = board.get(target, OFFSET_LINK);
      if (link !== NO_LINK && board.get(link, OFFSET_FACE) !== EMPTY) {
        const next = Math.min(board.get(link, OFFSET_CHARGE) + 1, CHARGE_MAX);
        board.set(link, OFFSET_CHARGE, next);
        board.set(link, OFFSET_STATE, STATE_CHARGED);
        chargedCells.push(link);
      }
    }

    // Refill, from the same fixed weights.
    let refilled = 0;
    for (let i = 0; i < CELL_COUNT && refilled < config.refill; i += 1) {
      if (board.get(i, OFFSET_FACE) === EMPTY) {
        board.set(i, OFFSET_FACE, drawFace(rng, weights));
        board.set(i, OFFSET_STATE, STATE_IDLE);
        refilled += 1;
      }
    }

    observations.push({ turn, chargedCells, banked: target });
    chained = (chained ^ hashState(board.cells)) >>> 0;
    chained = Math.imul(chained, 0x01000193) >>> 0;
  }

  return {
    score,
    turnsPlayed: turn,
    reshuffles,
    observations,
    digest: chained >>> 0,
    finalLinks: board.hiddenLinks(),
  };
}

/**
 * Recomputes a round from its seed and recorded actions.
 *
 * This is the layer commit-reveal cannot provide: a patched client can draw
 * whatever it likes locally, but it cannot produce an action list that
 * reproduces a false score under these rules, because the rules are integer,
 * deterministic, and run here rather than on the player's machine.
 */
export function verifyRound(
  seed: number,
  config: RoundConfig,
  actions: readonly Action[],
  claimedScore: number,
  claimedDigest: number,
): { readonly ok: boolean; readonly score: number; readonly digest: number } {
  const replayed = playRound(seed, config, (_observable, turn) => actions[turn] ?? 0);
  return {
    ok: replayed.score === claimedScore && replayed.digest === claimedDigest,
    score: replayed.score,
    digest: replayed.digest,
  };
}
