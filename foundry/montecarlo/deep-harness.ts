// foundry/montecarlo/deep-harness.ts — the instrument for the two deep-strategy
// candidates, and for the metrics the approved plan added.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE VERSUS MATCH SHARES ONE BOARD ARRAY BETWEEN TWO EXECUTOR STATES.
//
// The architectural rule is one executor per ruleset and the server scores by
// RUNNING it. A match runner that re-implemented shipping, refills and the order
// book would be a second implementation of the rules wearing a different name,
// and it would drift.
//
// So it does not re-implement anything. Two `SynthState`s are created and their
// `tiles` arrays are made THE SAME OBJECT. Each player advances through the real
// `advanceSynth`, mutating the shared board; books, banks, points and order
// streams stay per-player because they live on separate states. The contested
// resource is the board, which is exactly the design, and every rule that
// applies is the shipped one.
//
// The seam worth naming: the two states each carry their own `seed`, so their
// order streams and refills differ. That is intended — two players should not be
// dealt the same book — and it is why a side-swap control exists (N3/N4), since
// any asymmetry it introduced would otherwise look like a skill difference.

import {
  type SynthAction,
  type SynthConfig,
  DEFAULT_SYNTH,
  PASS,
  advanceSynth,
  beginSynth,
} from '../../game/chem/synth.js';
import {
  type Agent,
  type Move,
  ORDER_1,
  bookDelta,
  dockSet,
  legalMoves,
  transposeMoves,
} from './synth-harness.js';

/** Every action available, including the declaration verb when it is enabled. */
export function allMoves(
  tiles: readonly string[],
  book: readonly string[],
  bank: number,
  swapsLeft: number,
  config: SynthConfig,
): Move[] {
  const out = [...legalMoves(tiles, config), ...transposeMoves(tiles, bank, config, swapsLeft)];
  return out;
}

/**
 * EFFECTIVE BRANCHING and MOVE-VALUE ENTROPY — the anti-Nim gate.
 *
 * The audit's finding was that every other metric is blind to this: "You could
 * pass every gate with a game that has massive consequences and high denial, but
 * only two or three meaningful moves available in the entire state space."
 * Consequence horizon rewards a move mattering; denial value rewards players
 * interfering; neither notices there were only three moves to pick from.
 *
 *   branching  moves within 10% of the best, per turn. DECISION DENSITY asks
 *              only whether the top TWO are close, which cannot tell three live
 *              options from thirty.
 *   entropy    Shannon entropy of the normalised move values. A board where one
 *              move is worth everything has low entropy however many moves are
 *              legal, which catches branching that is nominally wide and
 *              actually one-handed.
 *
 * Both use the value function the readable rule uses, so they describe the
 * decision the PLAYER faces rather than a spread in a quantity nobody sees.
 */
export function branchingProfile(
  seeds: number,
  config: SynthConfig,
): { branching: number; entropy: number } {
  let liveTotal = 0;
  let entTotal = 0;
  let turns = 0;
  const dock = dockSet(config);
  for (let s = 1; s <= seeds; s += 1) {
    const st = beginSynth(s * 7919, config);
    for (let t = 0; t < config.turns; t += 1) {
      const moves = allMoves(st.tiles, st.book, st.bank, st.swapsLeft, config);
      if (moves.length === 0) break;
      const vals = moves.map((m) => bookDelta(m, st.book, dock) * 1e6 + m.released);
      const top = Math.max(...vals);
      const span = Math.max(1e-9, Math.abs(top));
      turns += 1;
      liveTotal += vals.filter((v) => v >= top - span * 0.1).length;

      // Softmax over values rescaled to the observed range, so entropy measures
      // the SHAPE of the choice rather than the units the values happen to be in.
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const range = Math.max(1e-9, hi - lo);
      const w = vals.map((v) => Math.exp(((v - lo) / range) * 4));
      const sum = w.reduce((a, b) => a + b, 0);
      let h = 0;
      for (const x of w) {
        const p = x / sum;
        if (p > 0) h -= p * Math.log2(p);
      }
      entTotal += h;

      advanceSynth(st, config, (tiles, book, queue, bank, turn) =>
        ORDER_1.choose(tiles, book, queue, bank, turn, config),
      );
    }
  }
  return {
    branching: turns > 0 ? liveTotal / turns : 0,
    entropy: turns > 0 ? entTotal / turns : 0,
  };
}

/**
 * An agent that uses the declaration verb.
 *
 * Declares when it judges the target reachable inside the window, which is the
 * decision the mechanic exists to pose. Deliberately NOT clairvoyant: it reads
 * only the board and the book, so a declaration is a bet on its own read.
 */
export function declaringAgent(confidence: number): Agent {
  return {
    name: `DECLARE-${confidence.toFixed(1)}`,
    choose: (tiles, book, queue, bank, turn, config) => {
      const moves = allMoves(tiles, book, bank, 0, config);
      const dock = dockSet(config);

      // Declare when a book entry looks reachable: some move makes it now, or a
      // move's products get closer to it. The threshold is the agent's nerve.
      if ((config.route ?? false) && book.length > 0 && bank >= (config.routeStake ?? 150)) {
        // `confidence` is an absolute COUNT of moves that can produce the
        // target, not a ratio. The first version divided by the move-list length
        // (~500 on a full board), so the threshold was unreachable and the agent
        // NEVER DECLARED -- which made stage 0's N1 compare 2594 to 2594 and pass
        // on equality. A control that cannot distinguish is the vacuous-
        // measurement signature this project has now hit three times.
        let bestIdx = -1;
        let bestCount = 0;
        for (let i = 0; i < book.length; i += 1) {
          const want = book[i]!;
          const reachable = moves.filter((m) => m.products.includes(want)).length;
          if (reachable > bestCount) { bestCount = reachable; bestIdx = i; }
        }
        if (bestIdx >= 0 && bestCount >= confidence) {
          return { cells: [], option: bestIdx, kind: 'DECLARE' };
        }
      }

      if (moves.length === 0) return PASS;
      let best = moves[0]!;
      let bestVal = -Infinity;
      for (const m of moves) {
        const v = bookDelta(m, book, dock) * 1e6 + m.released;
        if (v > bestVal) { bestVal = v; best = m; }
      }
      return best.action;
    },
  };
}

/**
 * The control the audit made a HARD GATE: a player who never declares.
 *
 * "If a Never-Declare agent reaches 90% of the ceiling, the mechanic has failed
 * its primary purpose... A hard failure preserves the integrity of the negative
 * selection process."
 */
export const NEVER_DECLARE: Agent = {
  name: 'NEVER-DECLARE',
  choose: (tiles, book, queue, bank, turn, config) =>
    ORDER_1.choose(tiles, book, queue, bank, turn, config),
};

/**
 * The opposing player's open book, during a match.
 *
 * A denial agent has to SEE what its rival needs, and nothing in the single-
 * player `choose` signature carries that. The first run wired a closure that was
 * never updated, so the denier read an empty book, behaved exactly like ORDER-1,
 * and produced a DENIAL VALUE of 48% that was really self-play with a different
 * label. `playMatch` now sets this before each player's turn.
 */
let RIVAL_BOOK: readonly string[] = [];
export const rivalBook = (): readonly string[] => RIVAL_BOOK;

export interface MatchResult {
  readonly scoreA: number;
  readonly scoreB: number;
  readonly winner: 'A' | 'B' | 'DRAW';
}

/**
 * One match: two players, two books, ONE board.
 *
 * `tiles` is deliberately the same array object on both states, so a cell one
 * player consumes is gone for the other. That is the whole design — the audit's
 * ruling on the co-op version applies here too: "it moves the conflict from 'I
 * am stealing your points' to 'I am taking the path you needed'."
 */
export function playMatch(
  seed: number,
  config: SynthConfig,
  a: Agent,
  b: Agent,
): MatchResult {
  const sa = beginSynth(seed, config);
  const sb = beginSynth(seed ^ 0x5bf03635, config);
  // THE SHARED BOARD. Both executors mutate one array.
  (sb as { tiles: string[] }).tiles = sa.tiles;

  const players = [
    { st: sa, agent: a },
    { st: sb, agent: b },
  ];
  for (let t = 0; t < config.turns; t += 1) {
    for (let i = 0; i < players.length; i += 1) {
      const p = players[i]!;
      RIVAL_BOOK = [...players[1 - i]!.st.book];
      advanceSynth(p.st, config, (tiles, book, queue, bank, turn) =>
        p.agent.choose(tiles, book, queue, bank, turn, config),
      );
    }
  }
  RIVAL_BOOK = [];
  const scoreA = sa.points;
  const scoreB = sb.points;
  return {
    scoreA,
    scoreB,
    winner: scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'DRAW',
  };
}

/**
 * Head-to-head over paired seeds WITH SIDES SWAPPED.
 *
 * Every seed is played twice, once with each agent on each side, so any
 * advantage baked into a side cancels. Without that, a side asymmetry would read
 * as a skill difference and the whole versus instrument would be measuring
 * itself. N3 and N4 in the plan exist for exactly this.
 */
export function headToHead(
  seeds: number,
  config: SynthConfig,
  a: Agent,
  b: Agent,
): { winRateA: number; draws: number; meanA: number; meanB: number } {
  let winsA = 0;
  let draws = 0;
  let sumA = 0;
  let sumB = 0;
  let games = 0;
  for (let s = 1; s <= seeds; s += 1) {
    const seed = s * 7919;
    for (const swap of [false, true]) {
      const r = swap ? playMatch(seed, config, b, a) : playMatch(seed, config, a, b);
      const scoreA = swap ? r.scoreB : r.scoreA;
      const scoreB = swap ? r.scoreA : r.scoreB;
      sumA += scoreA;
      sumB += scoreB;
      games += 1;
      if (scoreA > scoreB) winsA += 1;
      else if (scoreA === scoreB) draws += 1;
    }
  }
  return {
    winRateA: games > 0 ? (winsA / games) * 100 : 0,
    draws: games > 0 ? (draws / games) * 100 : 0,
    meanA: games > 0 ? sumA / games : 0,
    meanB: games > 0 ? sumB / games : 0,
  };
}

/**
 * An agent that also tries to take what its OPPONENT needs.
 *
 * Denial is the first genuinely strategic negative action in this design, and
 * DENIAL VALUE is the gate that says whether the shared board is a contested
 * resource or merely a shared table.
 */
export function denyingAgent(weight: number, rivalBook: () => readonly string[]): Agent {
  return {
    name: `DENY-${weight}`,
    choose: (tiles, book, queue, bank, turn, config) => {
      const moves = allMoves(tiles, book, bank, 0, config);
      if (moves.length === 0) return PASS;
      const dock = dockSet(config);
      const rival = rivalBook();
      let best = moves[0]!;
      let bestVal = -Infinity;
      for (const m of moves) {
        // Consuming a molecule the rival's book wants is worth something; making
        // one for them is worth negative.
        const denies = m.reactants.filter((f) => rival.includes(f) && !m.products.includes(f)).length;
        const gifts = m.products.filter((f) => rival.includes(f)).length;
        const v = bookDelta(m, book, dock) * 1e6 + (denies - gifts) * weight * 1e5 + m.released;
        if (v > bestVal) { bestVal = v; best = m; }
      }
      return best.action;
    },
  };
}
