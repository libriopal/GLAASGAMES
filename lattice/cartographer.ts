// lattice/cartographer.ts — Blind Cartographer. Experiment #2.
//
// Before banking a cell you may DECLARE which neighbour you believe it feeds.
// Correct doubles the face component of that turn's payout; wrong halves it;
// declining leaves the game exactly as it was.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXPERIMENT AND NOT A LEADERBOARD.
//
// `verify-learnable` E7 measures a +6.3% edge from the observation trail against
// a 54.4% clairvoyant ceiling — the player captures about 12% of the information
// on the board. But E7 measures a POLICY. Nothing in this project has ever
// measured what a HUMAN inferred, because nothing ever asked them.
//
// The foundry cannot breed without a fitness signal and has none: all 1129
// corpus ratings are 0 and `scoreJudgment`/`concordance` are disabled for want
// of data. A leaderboard or a head-to-head arena would supply one, and both need
// a population that does not exist. A priced declaration needs one player and
// one session.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FITNESS SIGNAL IS NOT ACCURACY, AND AN AUDITOR IS WHY.
//
// The first draft scored declaration accuracy. The independent auditor:
//
//   "Declaration accuracy measures PLAYER CALIBRATION, not GRAPH DIFFICULTY OR
//    QUALITY... the evolutionary pressure will optimize for player certainty,
//    likely converging on trivial graphs (to maximize accuracy) or impossible
//    graphs (to minimize it), rather than finding a balanced difficulty curve."
//
// Correct. Breed on accuracy and the population walks to "every cell feeds the
// cell on its right" — accuracy 1.0, difficulty 0.
//
// Scoring DISCRIMINABILITY instead is the obvious repair and it degenerates the
// same way one level up: on a guessable board the player learns the rule in one
// observation and then declares correctly forever, so discriminability against
// chance is enormous and the trivial board wins again.
//
// What holds is measuring against a BLIND baseline rather than against chance:
//
//     lift = P(correct | declared, with trail) − P(correct | declared, no trail)
//
// on the SAME board. A guessable board scores ~0 because the blind term is just
// as high; an impossible board scores ~0 because neither term beats chance; lift
// peaks at intermediate difficulty. That is `verify-learnable` E7's own
// structure, pointed at a human's declaration instead of a policy's move.
// `design/experiments.md` records the full derivation and the residual risk.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FILE ADDS NO RULES TO THE GAME.
//
// It does not touch `advanceTurn`. The board, the links, the charge and the
// payout are unchanged, and the observable projection a player sees is
// byte-identical whether or not they declare — `verify-cartographer` C4 asserts
// exactly that, because if declaring changed what is knowable then this is a
// different game and its numbers could not be compared to E7's.
//
// The declaration is scored AFTER the reveal, from the same `finalLinks` the
// reveal already publishes. Nothing here can see a link before the player could.

import { BOARD_W, CELL_COUNT, NO_LINK } from './board.js';

/** A declaration: at turn `turn`, cell `cell` was claimed to feed `believesFeeds`. */
export interface Declaration {
  readonly turn: number;
  readonly cell: number;
  /** A cell index, or NO_LINK for "this cell feeds nothing". */
  readonly believesFeeds: number;
}

/** One declaration, after the reveal has made it checkable. */
export interface ScoredDeclaration extends Declaration {
  readonly actualFeeds: number;
  readonly correct: boolean;
}

export interface CartographerResult {
  readonly scored: readonly ScoredDeclaration[];
  readonly declared: number;
  readonly correct: number;
  /** Turns played without a declaration — the player declining the bet. */
  readonly declined: number;
  /** correct / declared, or null when nothing was declared. */
  readonly accuracy: number | null;
  /** The score multiplier applied across the round, for display. */
  readonly netMultiplier: number;
}

/**
 * The cells a given cell could legally feed: its orthogonal neighbours, plus
 * NO_LINK. This is the declaration's option set and it is derived from the board
 * geometry rather than from the lattice, so it discloses nothing.
 */
export function declarationOptions(cell: number): readonly number[] {
  const opts: number[] = [NO_LINK];
  const x = cell % BOARD_W;
  const y = Math.floor(cell / BOARD_W);
  if (y > 0) opts.push(cell - BOARD_W);
  if (x < BOARD_W - 1) opts.push(cell + 1);
  if (y < Math.floor((CELL_COUNT - 1) / BOARD_W)) opts.push(cell + BOARD_W);
  if (x > 0) opts.push(cell - 1);
  return opts;
}

/** Chance accuracy for one cell — 1 / |options|. Interior cells: 0.2. */
export function chanceAccuracy(cell: number): number {
  return 1 / declarationOptions(cell).length;
}

/**
 * The payout multiplier a declaration earns.
 *
 * PRICED, BECAUSE AN UNPRICED DECLARATION MEASURES NOTHING. If declaring were
 * free the rational player declares on every turn regardless of belief, the
 * declaration rate saturates at 1, and the calibration curve — the entire point
 * — flattens into noise. Halving on a wrong call is what makes the rate carry
 * information about confidence.
 */
export const DECLARE_CORRECT = 2;
export const DECLARE_WRONG = 0.5;
export const DECLARE_DECLINED = 1;

export function declarationMultiplier(d: ScoredDeclaration | null): number {
  if (d === null) return DECLARE_DECLINED;
  return d.correct ? DECLARE_CORRECT : DECLARE_WRONG;
}

/**
 * Scores a round's declarations against the revealed lattice.
 *
 * `finalLinks` is what `RoundResult` already publishes at the reveal, so this
 * function cannot be called earlier than the player could have checked for
 * themselves.
 */
export function scoreDeclarations(
  declarations: readonly Declaration[],
  finalLinks: Int32Array,
  turnsPlayed: number,
): CartographerResult {
  const scored: ScoredDeclaration[] = [];
  for (const d of declarations) {
    const actualFeeds = finalLinks[d.cell] ?? NO_LINK;
    scored.push({ ...d, actualFeeds, correct: actualFeeds === d.believesFeeds });
  }
  const correct = scored.filter((s) => s.correct).length;
  const declared = scored.length;
  let netMultiplier = 1;
  for (const s of scored) netMultiplier *= declarationMultiplier(s);
  return {
    scored,
    declared,
    correct,
    declined: Math.max(0, turnsPlayed - declared),
    accuracy: declared === 0 ? null : correct / declared,
    netMultiplier,
  };
}

/**
 * The calibration readout: how much better than chance the player's declarations
 * were, on the boards they chose to bet on.
 *
 * NOT THE BREEDING SIGNAL. This is the single-session, player-facing number, and
 * it is `accuracy − chance` — which the auditor correctly showed is confounded
 * with board difficulty and must never be used to rank genomes. The breeding
 * signal is the trail lift in `verify-cartographer` C5, which needs a blind
 * baseline on the same board and therefore cannot be computed from one session.
 * The two are kept apart, and named apart, so they cannot be confused later.
 */
export function calibration(result: CartographerResult): number | null {
  if (result.accuracy === null || result.declared === 0) return null;
  const expectedByChance =
    result.scored.reduce((s, d) => s + chanceAccuracy(d.cell), 0) / result.declared;
  return result.accuracy - expectedByChance;
}
