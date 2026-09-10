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
  /**
   * The face distribution, as weights over faces 0..6 (index 0 = EMPTY, unused).
   *
   * ADDITIVE AND OPTIONAL. Omitted, it is `FACE_WEIGHTS` and the game is
   * byte-identical to the one that shipped — `verify-montecarlo` M0 asserts that
   * against the digest. It exists so the Monte Carlo harness can vary the ONE
   * knob that decides fairness, and so a variant that loads the dice is a thing
   * the fairness oracle can be pointed at rather than a thing nobody can express.
   *
   * L1x still holds: this is read ONCE, before turn 1, and never re-derived
   * inside a turn from game state. A per-GAME distribution chosen before the
   * first roll is not a per-TURN bias, and the distinction is the whole of the
   * OWC finding.
   */
  readonly faceWeights?: readonly number[];
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
  /** True when stagnation could not be cleared and the round ended early. */
  readonly conceded: boolean;
  readonly observations: readonly Observation[];
  /** Chained hash over the board after every turn. */
  readonly digest: number;
  readonly finalLinks: Int32Array;
}

/**
 * Draws one die face.
 *
 * EXPORTED SO IT CAN BE MEASURED. This is the entire fairness surface of the
 * game — every face that ever reaches the board comes through here — and L1y in
 * `verify-lattice` samples it directly rather than inferring the distribution
 * from played rounds. Exposing the faces on `RoundResult` would have been the
 * alternative, and would have widened the game's public result shape to suit a
 * test; this widens nothing a player sees.
 *
 * Note `Math.abs(rng()) % total` is a modulo over an i32, so a `total` that is
 * not a divisor of the RNG's range introduces a small modulo bias. With six
 * equal weights of 4 the total is 24, and L1y measures the resulting
 * distribution empirically rather than assuming the bias is negligible.
 */
export function drawFace(rng: () => number, weights: readonly number[]): number {
  let total = 0;
  for (let f = 1; f <= 6; f += 1) total += weights[f]!;
  let pick = Math.abs(rng()) % total;
  for (let f = 1; f <= 6; f += 1) {
    pick -= weights[f]!;
    if (pick < 0) return f;
  }
  return 6;
}

/** How many times a stagnant board may be reshuffled before the round concedes. */
export const MAX_RESHUFFLE_ATTEMPTS = 4;

/**
 * True when the board is STAGNANT — the real dead-board condition for this game.
 *
 * "No moves left" is the wrong test here, because a player can always bank any
 * non-empty cell. What actually dies is the thing the game is about: if every
 * bankable cell either has no link or links at an empty cell, then NOTHING the
 * player does can move charge. The hidden lattice becomes unobservable and
 * unexploitable, scoring flattens to bare face values, and the round degenerates
 * into picking the biggest number on the board.
 *
 * That is the failure the OWC was reaching for when it boosted draw weights. It
 * is detected here instead, at a turn boundary, by a function that cannot see
 * the score, the turn number, or who is ahead — the whole parameter list is one
 * board.
 */
export function isStagnant(board: Board): boolean {
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (board.get(i, OFFSET_FACE) === EMPTY) continue;
    const link = board.get(i, OFFSET_LINK);
    if (link === NO_LINK) continue;
    if (board.get(link, OFFSET_FACE) !== EMPTY) return false;
  }
  return true;
}

/**
 * A round in progress.
 *
 * THIS EXISTS SO THERE IS EXACTLY ONE EXECUTOR. `playRound` runs a round to
 * completion against a policy; an interactive host cannot, because a player
 * answers over minutes and a synchronous callback loop cannot wait. The obvious
 * response — let the UI drive its own turn loop — would create a SECOND
 * implementation of the rules with nothing holding the two in agreement, which
 * is precisely the defect kernel.ts/sim.wgsl parity exists to prevent, one
 * level up and with no oracle.
 *
 * So the turn is extracted rather than duplicated. `playRound` and
 * `lattice/session.ts` both call `advanceTurn`, and there is no second copy of
 * the rules to drift.
 */
export interface RoundState {
  readonly board: Board;
  readonly rng: () => number;
  score: number;
  reshuffles: number;
  conceded: boolean;
  readonly observations: Observation[];
  chained: number;
  turn: number;
  /**
   * The face distribution IN FORCE for this round, resolved once in
   * `beginRound` before the first roll and never recomputed. Refills read this
   * rather than reaching for a config field mid-turn, so L1x's guarantee — no
   * weighting derived inside a turn — stays literally true rather than merely
   * defensible.
   */
  readonly weights: readonly number[];
}

/** Generates the lattice and the opening faces. */
export function beginRound(seed: number, config?: RoundConfig): RoundState {
  const board = new Board();
  generateLattice(board, seed);

  const rng = makeRng(seed ^ 0x5bf03635);

  // ── L1x: the face distribution is fixed here, before any turn, and is const.
  // No statement inside a turn may derive a new weighting. A config-supplied
  // distribution is resolved HERE, once, before the first roll — never later.
  const weights = config?.faceWeights ?? FACE_WEIGHTS;

  for (let i = 0; i < CELL_COUNT; i += 1) {
    board.set(i, OFFSET_FACE, drawFace(rng, weights));
    board.set(i, OFFSET_STATE, STATE_IDLE);
  }

  return { board, rng, score: 0, reshuffles: 0, conceded: false, observations: [], chained: 0x811c9dc5, turn: 0, weights };
}

/**
 * Advances one turn. Returns false when the round has ended.
 *
 * The order of operations here is load-bearing and is the reason this is one
 * function rather than several a host could call out of sequence: stagnation is
 * resolved BEFORE the player is asked, so the board they are shown is the board
 * they act on.
 */
export function advanceTurn(
  state: RoundState,
  config: RoundConfig,
  chooseAction: (observable: Int32Array, turn: number) => Action,
): boolean {
  const { board, rng } = state;
  // FACE_WEIGHTS is used DIRECTLY here rather than bound to a local. A local
  // rebinding is harmless as written, but it is the exact textual shape L1x
  // forbids inside a turn, and L1x fired on it the moment the turn was
  // extracted. Satisfying the rule by removing the pattern is correct;
  // relaxing the rule to permit a benign instance would spend the oracle.
  if (state.conceded || state.turn >= config.turns) return false;

  {
    const turn = state.turn;
    // ── D1: stagnation is detected and answered VISIBLY ────────────────────
    // Bounded attempts, because a reshuffle cannot rescue every lattice — if a
    // region's links all point off the board there may be no arrangement of
    // faces that restores flow. Looping forever would hang; looping silently
    // would hide it. The round concedes instead and reports how many attempts
    // it made, so an unplayable lattice shows up as a number rather than as a
    // freeze.
    let attempts = 0;
    while (isStagnant(board) && attempts < MAX_RESHUFFLE_ATTEMPTS) {
      for (let i = 0; i < CELL_COUNT; i += 1) {
        board.set(i, OFFSET_FACE, drawFace(rng, state.weights));
        board.set(i, OFFSET_STATE, STATE_IDLE);
        board.set(i, OFFSET_CHARGE, 0);
      }
      state.reshuffles += 1;
      attempts += 1;
    }
    if (attempts >= MAX_RESHUFFLE_ATTEMPTS && isStagnant(board)) {
      state.conceded = true;
      return false;
    }

    const banked = chooseAction(board.observable(), turn);
    const target = banked >= 0 && banked < CELL_COUNT ? banked : 0;

    const face = board.get(target, OFFSET_FACE);
    const chargedCells: number[] = [];

    if (face !== EMPTY) {
      // ── YOU ARE PAID FOR WHAT YOU FEED, NOT FOR WHAT YOU HOLD ──────────
      //
      // The rule used to be `face * (1 + charge)` on the banked cell, and
      // `verify-learnable` proved that rule made the hidden lattice worthless.
      // Scrambling every link into uniform noise did not reduce a greedy
      // player's advantage — it slightly INCREASED it (83.4% vs 79.8%) —
      // because charge lands somewhere regardless of where links point, so
      // "bank the biggest number" was the whole game.
      //
      // Now the payout is the face of the cell the banked cell FEEDS, scaled by
      // the charge that had accumulated on the cell you banked. To score you
      // must know where a cell points, and the only way to know is to watch
      // where charge appeared on earlier turns. That is the inference loop the
      // game claims to be about, and it is now the one the scoring rewards.
      //
      // A dead link still pays the cell's own face, so a board with no live
      // links is playable but poor — the floor, not a punishment.
      const charge = board.get(target, OFFSET_CHARGE);
      const link = board.get(target, OFFSET_LINK);
      const feedsLive = link !== NO_LINK && board.get(link, OFFSET_FACE) !== EMPTY;
      // PAYING FOR THE SECOND HOP TOO WAS TRIED AND MEASURED WORSE. Charge
      // travels two steps, so it was natural to pay for both cells it passes
      // through — but the second hop is not predictable from one region's flow,
      // so paying for it added noise the model cannot reduce and inference
      // value FELL from 4.2% to 2.1%. The payout stays on the hop a player can
      // actually infer.
      state.score = feedsLive
        ? (state.score + board.get(link, OFFSET_FACE) * (1 + charge)) | 0
        : (state.score + face) | 0;

      board.set(target, OFFSET_FACE, EMPTY);
      board.set(target, OFFSET_CHARGE, 0);
      board.set(target, OFFSET_STATE, STATE_SPENT);

      // Discharge along the hidden link: the banked cell feeds the one it links
      // to. This is the ONLY way charge moves, so every charge the player sees
      // appear is evidence about the link that produced it.
      if (feedsLive) {
        const next = Math.min(board.get(link, OFFSET_CHARGE) + 1, CHARGE_MAX);
        board.set(link, OFFSET_CHARGE, next);
        board.set(link, OFFSET_STATE, STATE_CHARGED);
        chargedCells.push(link);

        // ── THE CHARGE TRAVELS TWO STEPS, NOT ONE ────────────────────────
        //
        // With a single hop only one cell gained charge per turn, so the
        // highest-charge cell almost always dominated the choice and knowing
        // where cells point rarely changed the pick. verify-learnable measured
        // the consequence: modelling the lattice was worth a near-constant ~2.4
        // points a round at 12, 16 and 20 turns — real, but under the 5% design
        // target however long the round ran.
        //
        // A second hop puts two live candidates on the board each turn and
        // makes the CHAIN, rather than one link, the thing worth knowing. It
        // also gives the observer two data points per bank instead of one, so
        // the lattice becomes inferable faster.
        const second = board.get(link, OFFSET_LINK);
        if (second !== NO_LINK && second !== target && board.get(second, OFFSET_FACE) !== EMPTY) {
          const onward = Math.min(board.get(second, OFFSET_CHARGE) + 1, CHARGE_MAX);
          board.set(second, OFFSET_CHARGE, onward);
          board.set(second, OFFSET_STATE, STATE_CHARGED);
          chargedCells.push(second);
        }
      }
    }

    // Refill, from the same fixed weights.
    let refilled = 0;
    for (let i = 0; i < CELL_COUNT && refilled < config.refill; i += 1) {
      if (board.get(i, OFFSET_FACE) === EMPTY) {
        board.set(i, OFFSET_FACE, drawFace(rng, state.weights));
        board.set(i, OFFSET_STATE, STATE_IDLE);
        refilled += 1;
      }
    }

    state.observations.push({ turn, chargedCells, banked: target });
    state.chained = (state.chained ^ hashState(board.cells)) >>> 0;
    state.chained = Math.imul(state.chained, 0x01000193) >>> 0;
    state.turn += 1;
    return true;
  }
}

/** The result of a round, from its state. */
export function finishRound(state: RoundState): RoundResult {
  return {
    score: state.score,
    turnsPlayed: state.turn,
    reshuffles: state.reshuffles,
    conceded: state.conceded,
    observations: state.observations,
    digest: state.chained >>> 0,
    finalLinks: state.board.hiddenLinks(),
  };
}

/**
 * Plays one round to completion against a policy.
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
  const state = beginRound(seed, config);
  while (advanceTurn(state, config, chooseAction)) {
    // advanceTurn owns the loop condition, so the two drivers cannot disagree
    // about when a round is over.
  }
  return finishRound(state);
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
