// game/farkle/round.ts — the Farkle ruleset, as an executor the server replays.
//
// Third ruleset, same architectural rule as the other two: exactly one executor
// per ruleset, and `net/heat-server.ts` scores by RUNNING it rather than by
// re-implementing it. The server still contains no dice vocabulary.
//
// ─────────────────────────────────────────────────────────────────────────────
// AN ACTION IS A CHAIN OR A BANK. NEVER A SCORE.
//
// The client submits cells it traced, or the decision to stop. It never submits
// a number, because every number it could submit is one it could lie about. The
// executor derives the score from the faces under the chain via the ported
// table, exactly as the single-player game does, so a patched client cannot
// produce a list of chains that reproduces a false total under these rules.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE THREE MODES ARE A CONFIG FIELD, NOT THREE RULE PATHS.
//
// SOLO   fixed turns; the score is the bank.
// VS     shared seed, identical hands, BLIND settlement — neither player sees
//        the other's total until both close. Without that, the second mover in
//        an async match knows the target score, which changes correct risk-taking
//        and is an advantage the first player never had.
// COOP   one board, alternating turns, SEPARATE banks.
//
// Coop was redesigned after the audit rejected a shared unbanked pot: "in game
// theory this is a variation of the Stag Hunt where the penalty for a single
// player's greed is a total loss of the shared progress... the safe player will
// eventually feel held hostage by the risky player. It creates tension, but it
// is a corrosive tension."
//
// So the shared resource is THE BOARD, not the score. Cells one player clears
// are gone for the other, and a hand drawn from a depleted board is a worse
// hand. Cooperation is spatial — carve the board so both keep options — and
// nobody can lose anybody else's points. The audit's read on the replacement:
// "it moves the conflict from 'I am stealing your points' to 'I am taking the
// path you needed'... a common enemy in the dwindling connectivity of the board,
// which is a much healthier driver of cooperation than a shared bank."

import { hashState } from '../../engine/sim/hash.js';
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import {
  BOARD_W,
  CELL_COUNT,
  EMPTY,
  HAND_SIZE,
  type Chain,
  drawHand,
  isFarkled,
  riskAfter,
  scoringChains,
} from './hand.js';
import { type DieFace, lookupScore, scoreFarkle, scoreTable } from './scorer.js';

export type FarkleMode = 'SOLO' | 'VS' | 'COOP';

/** Uniform faces. The weighting is fixed before turn 1 and never derived inside one. */
export const FACE_WEIGHTS: readonly number[] = [0, 4, 4, 4, 4, 4, 4];

export interface FarkleConfig {
  readonly turns: number;
  readonly mode: FarkleMode;
  readonly handSize?: number;
  readonly weights?: readonly number[];
  /** Players sharing the board. 1 for solo, 2 for coop and vs. */
  readonly players?: number;
}

export const DEFAULT_FARKLE: FarkleConfig = { turns: 10, mode: 'SOLO' };

/**
 * A player action: the cells of a chain, or the empty array meaning BANK.
 *
 * One type for both because they are the same decision — "take more" or
 * "stop" — and splitting them into two action kinds would let a client send a
 * bank that the executor had not offered.
 */
export type FarkleAction = readonly number[];

export type Rejection =
  | 'NOT_IN_HAND'
  | 'NOT_CONNECTED'
  | 'TOO_LONG'
  | 'DUPLICATE_CELL'
  | 'EMPTY_CELL'
  | 'NO_SCORE';

export interface FarkleStep {
  readonly turn: number;
  readonly cells: readonly number[];
  readonly score: number;
  readonly combo: string;
  readonly rejected: Rejection | null;
  /** True when this step ended the turn with nothing banked. */
  readonly farkled: boolean;
  readonly banked: boolean;
}

export interface FarkleState {
  readonly faces: number[];
  readonly seed: number;
  readonly weights: readonly number[];
  readonly handSize: number;
  /** The live hand for the turn in progress. */
  live: Set<number>;
  /** Score accumulated this turn and not yet safe. */
  running: number;
  /** Per-player banks. Index is the player whose turn it is. */
  readonly banks: number[];
  player: number;
  turn: number;
  draws: number;
  digest: number;
  readonly log: FarkleStep[];
}

export interface FarkleResult {
  readonly score: number;
  readonly banks: readonly number[];
  readonly turnsPlayed: number;
  readonly digest: number;
  readonly log: readonly FarkleStep[];
  readonly farkles: number;
}

function boardWords(faces: readonly number[]): Int32Array {
  const w = new Int32Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i += 1) w[i] = faces[i] ?? 0;
  return w;
}

export function beginFarkle(seed: number, config: FarkleConfig): FarkleState {
  const weights = config.weights ?? FACE_WEIGHTS;
  const handSize = config.handSize ?? HAND_SIZE;
  const players = config.players ?? (config.mode === 'SOLO' ? 1 : 2);

  const faces: number[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) faces.push(faceAtOrdinal(seed, i, weights));

  return {
    faces,
    seed,
    weights,
    handSize,
    live: drawHand(seed, handSize),
    running: 0,
    banks: new Array(players).fill(0),
    player: 0,
    turn: 0,
    draws: CELL_COUNT,
    digest: hashState(boardWords(faces)),
    log: [],
  };
}

/**
 * Validates a chain. Pure, and shared with the client.
 *
 * The interface greys an illegal chain using THIS function, so a client-side
 * rule cannot merely resemble the server's — it is the server's. The preview
 * and the executor also share one scoring path for the same reason, which is
 * why wildcards were cut from v1: the audit found that a wildcard whose face is
 * a fallible claim and a preview that agrees exactly with the executor are
 * "mutually exclusive... you cannot have a certain preview for an uncertain
 * wildcard." A cosmetic feature does not get to break the property that stops a
 * client showing a number the server will contradict.
 */
export function judgeChain(
  faces: readonly number[],
  live: ReadonlySet<number>,
  cells: FarkleAction,
): { score: number; combo: string; rejected: Rejection | null } {
  if (cells.length === 0) return { score: 0, combo: '', rejected: null };
  if (cells.length > 6) return { score: 0, combo: '', rejected: 'TOO_LONG' };
  if (new Set(cells).size !== cells.length) return { score: 0, combo: '', rejected: 'DUPLICATE_CELL' };
  for (const c of cells) {
    if (!Number.isInteger(c) || c < 0 || c >= CELL_COUNT) return { score: 0, combo: '', rejected: 'NOT_IN_HAND' };
    if (!live.has(c)) return { score: 0, combo: '', rejected: 'NOT_IN_HAND' };
    if (faces[c] === EMPTY) return { score: 0, combo: '', rejected: 'EMPTY_CELL' };
  }
  for (let i = 1; i < cells.length; i += 1) {
    const a = cells[i - 1]!;
    const b = cells[i]!;
    const dx = Math.abs((a % BOARD_W) - (b % BOARD_W));
    const dy = Math.abs(((a / BOARD_W) | 0) - ((b / BOARD_W) | 0));
    if (dx + dy !== 1) return { score: 0, combo: '', rejected: 'NOT_CONNECTED' };
  }

  const hand = cells.map((c) => faces[c] as DieFace);
  const score = lookupScore(hand, scoreTable());
  if (score === 0) return { score: 0, combo: '', rejected: 'NO_SCORE' };
  return { score, combo: scoreFarkle(hand).combo, rejected: null };
}

/** Ends the turn: bank or lose, refill the board, draw the next hand. */
function endTurn(state: FarkleState, keep: boolean): void {
  if (keep) state.banks[state.player] = (state.banks[state.player] ?? 0) + state.running;
  state.running = 0;

  // Refill and gravity happen BETWEEN turns only. Inside a turn the hand can
  // only shrink, which is the entire source of the risk curve.
  for (let col = 0; col < BOARD_W; col += 1) {
    const column: number[] = [];
    for (let row = CELL_COUNT / BOARD_W - 1; row >= 0; row -= 1) {
      const f = state.faces[row * BOARD_W + col]!;
      if (f !== EMPTY) column.push(f);
    }
    for (let row = CELL_COUNT / BOARD_W - 1, k = 0; row >= 0; row -= 1, k += 1) {
      const cell = row * BOARD_W + col;
      if (k < column.length) state.faces[cell] = column[k]!;
      else { state.faces[cell] = faceAtOrdinal(state.seed, state.draws, state.weights); state.draws += 1; }
    }
  }

  state.turn += 1;
  state.player = (state.player + 1) % state.banks.length;
  state.live = drawHand((state.seed ^ Math.imul(state.turn + 1, 0x9e3779b9)) >>> 0, state.handSize);
  state.digest = (Math.imul(state.digest, 31) ^ hashState(boardWords(state.faces))) >>> 0;
}

/**
 * Advances one step. Returns false when the game is over.
 *
 * A step is a chain or a bank — not a turn. A turn is a run of chains ended by
 * a bank or a farkle, which is the tabletop shape and the reason the risk curve
 * exists at all.
 */
export function advanceFarkle(
  state: FarkleState,
  config: FarkleConfig,
  choose: (faces: readonly number[], live: ReadonlySet<number>, running: number, player: number) => FarkleAction,
): boolean {
  if (state.turn >= config.turns) return false;

  // Stagnation is resolved BEFORE the player is asked, so the hand they are
  // shown is the hand they act on. A hand dealt dead is not the player's farkle.
  let attempts = 0;
  while (isFarkled(state.faces, state.live) && attempts < 4) {
    state.live = drawHand((state.seed ^ Math.imul(state.turn * 97 + attempts + 1, 0x85ebca6b)) >>> 0, state.handSize);
    attempts += 1;
  }
  if (isFarkled(state.faces, state.live)) { endTurn(state, false); return true; }

  const cells = choose([...state.faces], state.live, state.running, state.player);
  const turn = state.turn;

  if (cells.length === 0) {
    state.log.push({ turn, cells: [], score: 0, combo: '', rejected: null, farkled: false, banked: true });
    endTurn(state, true);
    return true;
  }

  const { score, combo, rejected } = judgeChain(state.faces, state.live, cells);
  if (rejected !== null) {
    // An illegal chain forfeits the turn's running score. It cannot inflate
    // anything, and the replay diverges from any total claimed for it.
    state.log.push({ turn, cells: [...cells], score: 0, combo: '', rejected, farkled: true, banked: false });
    endTurn(state, false);
    return true;
  }

  state.running += score;
  for (const c of cells) { state.faces[c] = EMPTY; state.live.delete(c); }

  const dead = isFarkled(state.faces, state.live);
  state.log.push({ turn, cells: [...cells], score, combo, rejected: null, farkled: dead, banked: false });
  if (dead) endTurn(state, false);
  return true;
}

export function finishFarkle(state: FarkleState, config: FarkleConfig): FarkleResult {
  return {
    score: state.banks.reduce((a, b) => a + b, 0),
    banks: [...state.banks],
    turnsPlayed: state.turn,
    digest: state.digest,
    log: state.log,
    farkles: state.log.filter((s) => s.farkled).length,
  };
}

export function playFarkle(
  seed: number,
  config: FarkleConfig,
  choose: (faces: readonly number[], live: ReadonlySet<number>, running: number, player: number) => FarkleAction,
): FarkleResult {
  const state = beginFarkle(seed, config);
  let guard = 0;
  while (advanceFarkle(state, config, choose) && guard < 100000) guard += 1;
  return finishFarkle(state, config);
}

/** Recomputes a game from its seed and recorded chains. The layer commit-reveal cannot provide. */
export function verifyFarkleRound(
  seed: number,
  config: FarkleConfig,
  actions: readonly FarkleAction[],
  claimedScore: number,
  claimedDigest: number,
): { readonly ok: boolean; readonly score: number; readonly digest: number } {
  let i = 0;
  const replayed = playFarkle(seed, config, () => actions[i++] ?? []);
  return {
    ok: replayed.score === claimedScore && replayed.digest === claimedDigest,
    score: replayed.score,
    digest: replayed.digest,
  };
}

/** Highest immediate score. The median human, and the harness's GREEDY rung. */
export function greedyChain(faces: readonly number[], live: ReadonlySet<number>): FarkleAction {
  const chains = scoringChains(faces, live);
  if (chains.length === 0) return [];
  return chains.reduce((a: Chain, b: Chain) => (b.score > a.score ? b : a)).cells;
}

/** Best score PER CELL — the policy measured closest to the tabletop risk curve. */
export function efficientChain(faces: readonly number[], live: ReadonlySet<number>): FarkleAction {
  const chains = scoringChains(faces, live);
  if (chains.length === 0) return [];
  return chains.reduce((a: Chain, b: Chain) =>
    b.score / b.cells.length > a.score / a.cells.length ? b : a).cells;
}

/**
 * Takes chains while the hand stays playable, and BANKS when it does not.
 *
 * ── WHY THIS AGENT HAD TO EXIST BEFORE ANY BALANCE CLAIM ────────────────────
 *
 * `verify-farkle` K8 first ran its replay with `efficientChain` and reported an
 * honest round reproducing a score of ZERO. Nothing was broken. That policy
 * never returns a bank, so it plays every turn until the hand dies and keeps
 * none of it — across ten turns it banked nothing at all.
 *
 * That is the push-your-luck tension being real rather than decorative: a player
 * who only ever takes is a player who only ever loses. But it also means every
 * policy in this file up to here is unable to score, and a balance measurement
 * run on non-scoring agents would be meaningless.
 *
 * It is also why the round-3 brief refused to call FEWEST a dominant strategy
 * when it topped a probe's score table — that probe had no banking decision
 * either, so its ranking was an artifact of surviving rather than of scoring.
 * The audit agreed the restraint was correct: "without a banking threshold,
 * FEWEST is a survivalist strategy, not a scoring strategy... you are refusing
 * to report a false finding."
 *
 * `risk` is the threshold at which it stops, in the same four states the
 * interface shows, so the agent and the player read the same instrument.
 */
export function prudentChain(
  faces: readonly number[],
  live: ReadonlySet<number>,
  risk = 2,
): FarkleAction {
  const chains = scoringChains(faces, live);
  if (chains.length === 0) return [];
  const best = chains.reduce((a: Chain, b: Chain) =>
    b.score / b.cells.length > a.score / a.cells.length ? b : a);
  return riskAfter(faces, live, best.cells) >= risk ? [] : best.cells;
}

/** Declared here so the dependency points game -> server and never back. */
export const FARKLE_RULESET = {
  id: 'farkle',
  verify: verifyFarkleRound,
  turnsOf: (config: FarkleConfig): number => config.turns,
};
