// game/farkle/hand.ts — the live hand, and why it is sixteen cells.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DEFECT THIS FILE EXISTS TO FIX, AND THE MEASUREMENT THAT FOUND IT.
//
// The first design let a turn trace a chain anywhere on the 36-cell board, with
// cells refilling between chains. The independent audit rejected it on the
// grounds that selecting six dice from thirty-six is not Farkle at all:
//
//   "In standard Farkle, the dice are the constraint (you are stuck with what
//    you roll). In your design, the dice are a resource... the probability of a
//    player being unable to find a connected path of length <= 6 that contains
//    at least one 1 or 5 is statistically negligible. This transforms Farkle
//    from a game of managing risk into a game of maximizing efficiency."
//
// Measured with exhaustive path enumeration over 400 seeded boards, the finding
// was stronger than its own wording: FRESH BOARDS WITH NO SCORING PATH, 0/400 =
// 0.00%. Not negligible. Zero. A player could not farkle by trying, so the loss
// condition of a push-your-luck game never fired.
//
// The second attempt cleared cells without refilling inside a turn, which does
// produce a risk curve — but the audit called its first four steps "padding,
// not pacing... you haven't built a game; you've built a loading bar that
// eventually turns into a game", and the measurement agreed: 0%, 0%, 0%, 0%,
// then 0.3%, 5.3%, 20.4%, 46.8%.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FIX IS THE TABLETOP STRUCTURE: A TURN OWNS A HAND, NOT A TABLE.
//
// Tabletop Farkle's whole engine is that you roll six, set the scorers aside,
// and reroll THE REST — each continuation has fewer dice, so the risk climbs,
// and that climb is the decision. A turn here therefore operates on a LIVE HAND
// drawn at turn start. Cells leave it as they score and nothing replaces them.
//
// ─────────────────────────────────────────────────────────────────────────────
// SIXTEEN IS SWEPT, NOT CHOSEN. THE TARGET IS THE REAL GAME.
//
// Having to pick a hand size, I did not pick one. The target is the actual
// tabletop farkle probability by dice remaining, computed by brute force over
// 200,000 throws per depth with every subset tested for a score:
//
//     6 dice 2.3%  ·  5 dice 7.8%  ·  4 dice 15.8%
//     3 dice 27.8% ·  2 dice 44.3% ·  1 die  66.8%
//
// Sweeping hand size on the grid, RMS distance from that curve falls from 55.0
// at hand 6 to 7.5 at hand 20. Hand 6 collapses in three steps, because
// adjacency fragments a small blob instantly — a penalty tabletop does not pay,
// since set-aside dice leave no holes behind.
//
// At HAND_SIZE 16 under efficient play the curve is
//
//     0.0  0.7  10.1  27.5  44.0  60.1     RMS 4.7 from tabletop
//
// with hand size as the only free parameter and nothing fitted after the fact.
// If `internalScoreFarkle`'s table ever changes, THE SWEEP MUST BE RE-RUN —
// this constant is downstream of the pay table and means nothing without it.
//
// ─────────────────────────────────────────────────────────────────────────────
// AND THE RESULT THAT DECIDED THE INTERFACE.
//
// The grid curve was convex — flat, then a cliff — where tabletop is smooth. I
// suspected the AGENT rather than the design: it always took the highest-scoring
// path, usually all six cells, where a tabletop player sets aside one or two
// dice. Tested on the same 2000 boards:
//
//     policy      step1 step2 step3 step4 step5 step6   cells/step   RMS
//     MAXSCORE     0.0   0.7  15.7  45.7  69.0  86.8       3.02     15.2
//     FEWEST       0.0   0.0   0.5   4.8  11.4  26.2       1.37     24.4
//     EFFICIENT    0.0   0.7  10.1  27.5  44.0  60.1       2.52      4.7
//
// THE RISK CURVE IS NOT A PROPERTY OF THE DESIGN. IT IS A CONSEQUENCE OF THE
// PLAYER'S POLICY. The same board at the same step is 0.5% lethal to one policy
// and 15.7% to another.
//
// That is what dissolves the failure mode the audit named the Calculator
// Problem — "if a player can look at the risk strip and realize that the EV of
// step 7 is always lower than step 6, the human element will be crushed by
// mathematical optimization". There is no such schedule to read, because the
// strip cannot know how fast a player intends to burn their hand. Risk is
// endogenous: caused by the choice, not surveyed before it. The audit's word
// for the resulting interface was a "Safety Inspector" rather than a "Fortune
// Teller", which is exactly what `riskAfter` below reports.

import { type DieFace, lookupScore, scoreTable } from './scorer.js';

export const BOARD_W = 6;
export const BOARD_H = 6;
export const CELL_COUNT = BOARD_W * BOARD_H;

/** Cells live in a turn's hand. Swept against the tabletop curve; see header. */
export const HAND_SIZE = 16;

/** Longest chain a hand can score, because a Farkle hand is six dice. */
export const MAX_CHAIN = 6;

export const EMPTY = 0;

/** Orthogonal neighbours. No diagonals: a chain is a path a finger can trace. */
export function neighbours(cell: number): number[] {
  const x = cell % BOARD_W;
  const y = (cell / BOARD_W) | 0;
  const out: number[] = [];
  if (y > 0) out.push(cell - BOARD_W);
  if (y < BOARD_H - 1) out.push(cell + BOARD_W);
  if (x > 0) out.push(cell - 1);
  if (x < BOARD_W - 1) out.push(cell + 1);
  return out;
}

/**
 * Draws the live hand: a connected region grown from one seeded cell.
 *
 * CONNECTED, not a random scatter, and the audit's closing directive is the
 * reason: "the visual implementation of the Live Hand must be treated as a
 * primary mechanic, not a UI overlay. It must be a distinct, encapsulated
 * entity to prevent the fence feeling." Asked whether 16 touchable cells inside
 * a 36-cell board reads as a rule or an arbitrary fence, it answered that the
 * distinction is entirely "between 'the board is locked' and 'this is my hand'".
 *
 * A scattered hand cannot be encapsulated by anything — there is no outline to
 * draw around it. A connected blob has a boundary, so the interface can enclose
 * it and the rule becomes visible rather than enforced.
 *
 * Deterministic in `seed` alone, so both players of a shared seed hold the same
 * hand and the verifier reproduces it.
 */
export function drawHand(seed: number, size = HAND_SIZE): Set<number> {
  const hand = new Set<number>();
  let state = (seed ^ 0x6d2b79f5) >>> 0;
  const next = (): number => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state;
  };

  hand.add(next() % CELL_COUNT);
  let guard = 0;
  while (hand.size < size && guard < 4000) {
    guard += 1;
    const frontier: number[] = [];
    for (const c of hand) for (const n of neighbours(c)) if (!hand.has(n)) frontier.push(n);
    if (frontier.length === 0) break;
    hand.add(frontier[next() % frontier.length]!);
  }
  return hand;
}

export interface Chain {
  readonly cells: readonly number[];
  readonly score: number;
  readonly combo: string;
}

/**
 * Every scoring chain available in the live set.
 *
 * Exhaustive over connected simple paths of length <= MAX_CHAIN. That is
 * affordable because the hand is 16 cells with degree <= 4, and because scoring
 * is an array read rather than a computation — which is the whole reason the
 * ported score table earns its 1.1 MB.
 *
 * `faces` is indexed by BOARD cell, not by hand position, so a caller never has
 * to maintain a second coordinate system.
 */
export function scoringChains(
  faces: readonly number[],
  live: ReadonlySet<number>,
): Chain[] {
  const table = scoreTable();
  const out: Chain[] = [];
  const path: number[] = [];
  const seen = new Set<number>();

  const walk = (cell: number): void => {
    const hand = path.map((i) => faces[i] as DieFace);
    const score = lookupScore(hand, table);
    if (score > 0) out.push({ cells: [...path], score, combo: '' });
    if (path.length >= MAX_CHAIN) return;
    for (const n of neighbours(cell)) {
      if (!live.has(n) || seen.has(n) || faces[n] === EMPTY) continue;
      seen.add(n); path.push(n);
      walk(n);
      path.pop(); seen.delete(n);
    }
  };

  for (const start of live) {
    if (faces[start] === EMPTY) continue;
    seen.clear(); path.length = 0;
    seen.add(start); path.push(start);
    walk(start);
  }
  return out;
}

/** Is this hand dead? The farkle condition, asked exactly once per step. */
export function isFarkled(faces: readonly number[], live: ReadonlySet<number>): boolean {
  return scoringChains(faces, live).length === 0;
}

/** Four nameable states, because no readout may ask a player to compare two magnitudes. */
export const RISK_SAFE = 0;
export const RISK_THIN = 1;
export const RISK_EXPOSED = 2;
export const RISK_CRITICAL = 3;

/**
 * The risk a chain would LEAVE BEHIND, not the risk of the turn.
 *
 * This is the Safety Inspector rather than the Fortune Teller. It answers one
 * question — if you take this chain, is what remains still playable — by
 * removing the cells and asking how many scoring chains survive. It cannot
 * forecast the turn, because the turn depends on choices not yet made.
 *
 * Quantised to four states with no percentage shown anywhere, so the reading is
 * a recognition rather than a measurement.
 */
export function riskAfter(
  faces: readonly number[],
  live: ReadonlySet<number>,
  taking: readonly number[],
): number {
  const rest = new Set(live);
  for (const c of taking) rest.delete(c);
  if (rest.size === 0) return RISK_CRITICAL;
  const survivors = scoringChains(faces, rest).length;
  if (survivors === 0) return RISK_CRITICAL;
  if (survivors <= 2) return RISK_EXPOSED;
  if (survivors <= 8) return RISK_THIN;
  return RISK_SAFE;
}
