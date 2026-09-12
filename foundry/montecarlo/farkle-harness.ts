// foundry/montecarlo/farkle-harness.ts — the instrument this game is balanced with.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS EXISTS BECAUSE A DESIGN WITHOUT ONE IS AN OPINION.
//
// Every balance claim made about Farkle so far has been made by me, about my own
// design, using probes I wrote for the purpose. That is the self-witness failure
// EINCOL names: a check that compares an artifact to itself always passes.
//
// A harness cannot fix that alone, but it moves the claims from rung 4 (a
// written argument) to rung 2 (execution against reality, reproducing the
// numbers from raw inputs). Everything it reports is recomputed from seeds.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SPREAD IS THE PRODUCT. THE MEAN IS THE EASY NUMBER.
//
// Taken from the staking spec in the corpus, which says it plainly: "Mean return
// is the wrong headline... a harness that reports only means will pass a game a
// solver drains." So this reports the ladder — RANDOM below GREEDY below
// EFFICIENT below PRUDENT below SEARCH — and the gaps between them.
//
// Two numbers decide whether the game ships:
//
//   SKILL DELTA    the best agent minus the median one. The industry benchmark
//                  found in the corpus for skill-based machines is about five
//                  percentage points; below that "the game is a slot wearing a
//                  puzzle costume."
//   SOLVER MARGIN  the unbounded search agent minus the bounded one. If an
//                  unbounded solver runs away with it, the honest description of
//                  the product becomes "whoever wrote the better bot wins."
//
// ─────────────────────────────────────────────────────────────────────────────
// AND ONE THING IT CHECKS THAT NO AGENT LADDER WOULD.
//
// `dominanceProbe` searches for a DEGENERATE STRATEGY: a fixed, thoughtless rule
// that beats thoughtful play. That is a different question from "who scores
// best" — a game can have a wide skill ladder and still be solved by one
// mindless heuristic sitting above all of it.

import {
  CELL_COUNT,
  RISK_CRITICAL,
  drawHand,
  riskAfter,
  scoringChains,
  survivableDepth,
} from '../../game/farkle/hand.js';
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import { type Persona, personas, simPlayer } from '../sim/personas.js';
import {
  type FarkleAction,
  type FarkleConfig,
  DEFAULT_FARKLE,
  FACE_WEIGHTS,
  efficientChain,
  greedyChain,
  judgeChain,
  playFarkle,
  prudentChain,
  runMultiplier,
} from '../../game/farkle/round.js';

/** A named policy. `risk` is the state it stops at, for bank-aware agents. */
export interface Agent {
  readonly name: string;
  readonly choose: (faces: readonly number[], live: ReadonlySet<number>, running: number, chains: number) => FarkleAction;
}

function rng(seed: number): () => number {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Uniform legal move, and it banks at random. The floor. */
export function randomAgent(seed: number): Agent {
  const r = rng(seed);
  return {
    name: 'RANDOM',
    choose: (faces, live) => {
      const cs = scoringChains(faces, live);
      if (cs.length === 0) return [];
      if (r() < 0.25) return [];
      return cs[Math.floor(r() * cs.length)]!.cells;
    },
  };
}

/**
 * A persona from the pool, playing Farkle. REPLACES THE INVENTED STUB.
 *
 * ── WHAT WAS WRONG WITH HUMAN-CAL* ─────────────────────────────────────────
 *
 * The agent this supersedes had an 18% error rate that I chose, with a comment
 * saying so. It then BEAT EVERY OTHER AGENT ON THE LADDER, 30730 against
 * SEARCH-MAX's 26609 — so a number I made up was setting the ceiling that every
 * balance claim in this game was measured against. That is worse than a missing
 * agent, because a missing agent is visibly missing.
 *
 * `foundry/sim/personas.ts` replaces it with fifteen behavioural profiles
 * derived from 8,000 real conversations, each carrying OCEAN traits. The traits
 * are external; the mapping from trait to game decision is mine and is the part
 * still unvalidated — but that is a smaller and nameable gap where the stub's
 * was an unnameable one.
 *
 * Three traits drive three separate decisions, which is the point of using
 * traits rather than a skill slider: a cautious expert and a reckless expert are
 * both experts, and a population that cannot represent both cannot tell a game
 * that rewards judgement from one that rewards nerve.
 */
export function personaAgent(runSeed: number, p: Persona): Agent {
  const { style, rng } = simPlayer(runSeed, p);
  return {
    name: `P:${p.name}`,
    choose: (faces, live, running, chains) => {
      const cs = scoringChains(faces, live);
      if (cs.length === 0) return [];

      // SEARCH DEPTH decides how much of the board this player actually
      // considers. A low-skill persona evaluates a handful of chains and can
      // simply fail to see the best one — which is a different failure from
      // seeing it and slipping, and the two are separated deliberately.
      const considered = Math.max(1, Math.round(cs.length * Math.max(0.08, style.searchDepth)));
      const pool = cs.slice(0, considered);

      // SLIP: found the best move, played another one.
      const best = rng.next('slip') < style.slipRate
        ? rng.pick(pool, 'slip-pick')
        : pool.reduce((a, b) => (b.score / b.cells.length > a.score / a.cells.length ? b : a));

      // EXPLORATION: occasionally prefer an unusual shape over the rated one.
      // Distinct from risk — trying an odd chain is not the same decision as
      // pushing a good one, and a game rewarding only one has a narrower
      // audience than one rewarding both.
      const move = rng.next('explore') < style.exploration * 0.15
        ? rng.pick(pool, 'explore-pick')
        : best;

      // RISK APPETITE decides the bank. The population therefore produces a
      // SPREAD of stop depths rather than converging on the optimum, which is
      // what makes the run multiplier's effect visible at all.
      if (running > 0) {
        const left = survivableDepth(faces, live) - 1;
        const pressure = left <= 0 ? 1 : left === 1 ? 0.6 : 0.2;
        if (rng.next('bank') > style.riskAppetite * (1 - pressure) + (1 - pressure) * 0.15) {
          if (left <= 0) return [];
          if (rng.next('bank2') > style.riskAppetite) return [];
        }
      }
      return move.cells;
    },
  };
}

/** The whole population as agents, at one run seed. */
export function personaLadder(runSeed: number): Agent[] {
  return personas().map((p) => personaAgent(runSeed, p));
}

export const GREEDY: Agent = { name: 'GREEDY', choose: (f, l) => greedyChain(f, l) };
export const EFFICIENT: Agent = { name: 'EFFICIENT', choose: (f, l) => efficientChain(f, l) };
export const PRUDENT: Agent = { name: 'PRUDENT', choose: (f, l) => prudentChain(f, l, 2) };

/**
 * One-ply search over every available chain, scoring by immediate value MINUS
 * the expected loss from the risk it leaves. The adversary.
 *
 * `budget` caps how many chains it may evaluate, which is what separates the bot
 * a real player could run inside a move clock from the theoretical ceiling.
 * Reporting both is the point: the gap between them is how much of the game is
 * solvable given unlimited time, and a small gap means the move clock is doing
 * real work.
 */
export function searchAgent(budget: number): Agent {
  return {
    name: budget === Infinity ? 'SEARCH-MAX' : `SEARCH-${budget}`,
    choose: (faces, live, running, chains) => {
      const cs = scoringChains(faces, live);
      if (cs.length === 0) return [];
      const pool = budget === Infinity ? cs : cs.slice(0, budget);

      // ── THE EV MODEL WAS WRONG AND THE LADDER SHOWED IT ────────────────────
      //
      // The first version scored a chain as `score*(1-p) - running*p` and TOOK NO
      // ACCOUNT OF THE MULTIPLIER. Once the run multiplier shipped, that agent
      // was beaten by HUMAN-CAL — a deliberate stub with an 18% error rate —
      // 30730 to 25735. A stub outscoring the top rung is not a result about the
      // game; it is a defect in the instrument, and every balance number computed
      // from that ladder inherited it.
      //
      // Banking is not worth zero. It banks `running` at the multiplier already
      // earned. Taking a chain risks ALL of that for a larger run at a HIGHER
      // multiplier, which is the whole reason the decision exists:
      //
      //   stop  ->  running * mult(chains)
      //   take  ->  (1-p) * (running + score) * mult(chains + 1)
      //
      // Leaving the multiplier out made every continuation look worse than it
      // was, so the agent banked early and the escalation it was meant to
      // evaluate was invisible to it.
      // ── AND THE SECOND DEFECT, WHICH THE PERSONA POPULATION EXPOSED ───────
      //
      // Fixing the multiplier was not enough: NINE OF FIFTEEN PERSONAS still
      // outscored this agent, happy_path by 21% (32168 against 26474). When most
      // of a simulated population beats the solver, the solver is the thing that
      // is wrong.
      //
      // The cause was `riskAfter(...) / 3` — treating the four risk states as
      // probabilities 0, 1/3, 2/3, 1. Calibration against 16,400 observations
      // says they are nothing of the sort:
      //
      //     state 0, 1, 2  ->    0.0% farkled next  (0 of 12,403)
      //     state 3        ->  100.0%               (3,997 of 3,997)
      //
      // So the agent was assigning a 33% and a 67% chance of ruin to situations
      // that are perfectly safe, and banking out of them. It was not playing
      // badly by accident; it was playing correctly against a world model that
      // did not match the world. Using the MEASURED probability is the fix, and
      // it is the same lesson as the readout: inside a turn the hand is visible,
      // so this is not a probability at all — it is a fact with two values.
      const chainsTaken = chains;
      const stopValue = running * runMultiplier(chainsTaken);
      let bestVal = stopValue;
      let bestCells: FarkleAction = [];
      for (const c of pool) {
        const pLoss = riskAfter(faces, live, c.cells) >= RISK_CRITICAL ? 1 : 0;
        const takeValue = (1 - pLoss) * (running + c.score) * runMultiplier(chainsTaken + 1);
        if (takeValue > bestVal) { bestVal = takeValue; bestCells = c.cells; }
      }
      return bestCells;
    },
  };
}

export interface AgentResult {
  readonly name: string;
  readonly meanScore: number;
  readonly medianScore: number;
  readonly p10: number;
  readonly p90: number;
  /** Fraction of turns that ended with nothing banked. */
  readonly farkleRate: number;
  readonly meanTurnsBanked: number;
}

export function runAgent(agent: Agent, seeds: number, config: FarkleConfig = DEFAULT_FARKLE): AgentResult {
  const scores: number[] = [];
  let farkles = 0;
  let turns = 0;
  let banked = 0;
  for (let s = 1; s <= seeds; s += 1) {
    const r = playFarkle(s, config, (f, l, running, _p, chains) => agent.choose(f, l, running, chains ?? 0));
    scores.push(r.score);
    farkles += r.farkles;
    turns += r.turnsPlayed;
    banked += r.log.filter((x) => x.banked).length;
  }
  scores.sort((a, b) => a - b);
  const at = (q: number): number => scores[Math.min(scores.length - 1, Math.floor(scores.length * q))]!;
  return {
    name: agent.name,
    meanScore: scores.reduce((a, b) => a + b, 0) / scores.length,
    medianScore: at(0.5),
    p10: at(0.10),
    p90: at(0.90),
    farkleRate: turns > 0 ? farkles / turns : 0,
    meanTurnsBanked: seeds > 0 ? banked / seeds : 0,
  };
}

/**
 * Per-step farkle frequency. Reported PER STEP, never pooled.
 *
 * Pooling would average a region that is near 0% against one near 90% and report
 * a number describing neither. The audit set this as a pass condition and the
 * shape is the thing being checked, not the average.
 */
export function riskCurve(agent: Agent, seeds: number, depth = 8): number[] {
  const reached = new Array(depth).fill(0);
  const died = new Array(depth).fill(0);
  for (let s = 1; s <= seeds; s += 1) {
    // Same draw the executor uses, so the curve describes the real game.
    const faces = Array.from({ length: CELL_COUNT }, (_, i) => faceAtOrdinal(s, i, FACE_WEIGHTS));
    const live = new Set(drawHand(s));
    for (let step = 0; step < depth; step += 1) {
      if (live.size === 0) break;
      reached[step] += 1;
      const cells = agent.choose(faces, live, 0, step);
      if (cells.length === 0) { died[step] += 1; break; }
      for (const c of cells) live.delete(c);
    }
  }
  return reached.map((r, i) => (r > 0 ? (died[i] / r) * 100 : NaN));
}

export interface Ladder {
  readonly results: readonly AgentResult[];
  /** Best agent minus the median agent, as a percentage of the median. */
  readonly skillDeltaPct: number;
  /** Unbounded search minus bounded search, as a percentage of bounded. */
  readonly solverMarginPct: number;
}

export function runLadder(seeds = 400, config: FarkleConfig = DEFAULT_FARKLE): Ladder {
  // The reference rungs, plus the WHOLE PERSONA POPULATION. The ladder used to
  // carry one invented "median human"; it now carries fifteen measured ones, so
  // the median is a median of something rather than a number I picked.
  const agents: Agent[] = [
    randomAgent(1), GREEDY, EFFICIENT, PRUDENT,
    searchAgent(24), searchAgent(Infinity),
    ...personaLadder(1),
  ];
  const results = agents.map((a) => runAgent(a, seeds, config));
  // The skill delta is measured across the PERSONA POPULATION only. Including
  // the reference rungs would compare a solver against a uniform-random agent
  // and report a spread that no population of players would ever produce.
  const people = results.filter((r) => r.name.startsWith('P:'));
  const byScore = [...people].sort((a, b) => a.meanScore - b.meanScore);
  const best = byScore[byScore.length - 1]!;
  const median = byScore[Math.floor(byScore.length / 2)]!;
  const bounded = results.find((r) => r.name === 'SEARCH-24')!;
  const unbounded = results.find((r) => r.name === 'SEARCH-MAX')!;
  return {
    results,
    skillDeltaPct: median.meanScore > 0 ? ((best.meanScore - median.meanScore) / median.meanScore) * 100 : 0,
    solverMarginPct: bounded.meanScore > 0 ? ((unbounded.meanScore - bounded.meanScore) / bounded.meanScore) * 100 : 0,
  };
}

/**
 * Hunts for a DEGENERATE STRATEGY: a fixed, thoughtless rule that beats thought.
 *
 * A wide skill ladder does not rule this out. A game can reward skill across its
 * whole ladder and still be solved by one mindless heuristic sitting above all
 * of it, and that heuristic is what a player community finds in a week.
 *
 * Each candidate here is deliberately stupid — "always take the longest chain",
 * "always bank after two" — because a rule that requires judgement is not the
 * failure mode being looked for.
 */
export interface DegenerateFinding {
  readonly name: string;
  readonly meanScore: number;
  readonly beatsBest: boolean;
}

export function dominanceProbe(seeds = 300, config: FarkleConfig = DEFAULT_FARKLE): {
  readonly best: AgentResult;
  readonly trivial: readonly DegenerateFinding[];
  readonly dominated: boolean;
} {
  const best = runAgent(searchAgent(24), seeds, config);

  const trivials: Agent[] = [
    { name: 'always-longest', choose: (f, l) => {
      const cs = scoringChains(f, l); if (!cs.length) return [];
      return cs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a)).cells; } },
    { name: 'always-shortest', choose: (f, l) => {
      const cs = scoringChains(f, l); if (!cs.length) return [];
      return cs.reduce((a, b) => (b.cells.length < a.cells.length ? b : a)).cells; } },
    { name: 'bank-after-1', choose: (f, l, running) => {
      if (running > 0) return [];
      const cs = scoringChains(f, l); if (!cs.length) return [];
      return cs.reduce((a, b) => (b.score > a.score ? b : a)).cells; } },
    { name: 'bank-after-2', choose: (f, l, running) => {
      const cs = scoringChains(f, l); if (!cs.length) return [];
      if (running >= 2) return [];
      return cs.reduce((a, b) => (b.score > a.score ? b : a)).cells; } },
    { name: 'never-bank', choose: (f, l) => greedyChain(f, l) },
    { name: 'singles-only', choose: (f, l) => {
      const cs = scoringChains(f, l).filter((c) => c.cells.length === 1);
      if (!cs.length) return [];
      return cs.reduce((a, b) => (b.score > a.score ? b : a)).cells; } },
  ];

  const trivial = trivials.map((t) => {
    const r = runAgent(t, seeds, config);
    return { name: t.name, meanScore: r.meanScore, beatsBest: r.meanScore > best.meanScore };
  });

  return { best, trivial, dominated: trivial.some((t) => t.beatsBest) };
}

/**
 * Does the seed decide the game, or does the player?
 *
 * Fairness in a shared-seed match means two players on the SAME board are
 * separated by their play rather than by their draw. Measured as the fraction of
 * score variance attributable to the seed: one agent across many seeds gives the
 * between-seed variance; many agents on one seed gives the between-policy
 * variance. If the seed dominates, the game is a lottery with a skill costume.
 */
export function seedDominance(seeds = 250, config: FarkleConfig = DEFAULT_FARKLE): {
  readonly betweenSeed: number;
  readonly betweenPolicy: number;
  readonly seedSharePct: number;
} {
  const policies = [GREEDY, EFFICIENT, PRUDENT, searchAgent(24)];
  const table: number[][] = policies.map((p) => {
    const out: number[] = [];
    for (let s = 1; s <= seeds; s += 1) out.push(playFarkle(s, config, (f, l, r, _pl, ch) => p.choose(f, l, r, ch ?? 0)).score);
    return out;
  });

  const perSeedMeans: number[] = [];
  for (let s = 0; s < seeds; s += 1) {
    perSeedMeans.push(table.reduce((a, row) => a + row[s]!, 0) / policies.length);
  }
  const perPolicyMeans = table.map((row) => row.reduce((a, b) => a + b, 0) / seeds);
  const varOf = (xs: readonly number[]): number => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  };
  const betweenSeed = varOf(perSeedMeans);
  const betweenPolicy = varOf(perPolicyMeans);
  const total = betweenSeed + betweenPolicy;
  return {
    betweenSeed,
    betweenPolicy,
    seedSharePct: total > 0 ? (betweenSeed / total) * 100 : 0,
  };
}

/**
 * THE DUAL CONSTRAINT. Replaces a single headroom gate that was circular.
 *
 * ── WHY THE FIRST GATE WAS SELF-SERVING ─────────────────────────────────────
 *
 * I proposed gating on HEADROOM alone — the gap between a rule read off the
 * screen and hindsight-perfect play — as proof the game is not solved. The audit
 * found the circularity and it is real:
 *
 *   "If you design a 'perfect' risk signal, you effectively kill the headroom
 *    you are trying to protect. You have created a circularity where a BETTER UI
 *    (one that more accurately predicts the optimum) is PENALIZED by your own
 *    gate."
 *
 * Exactly right. A gate that punishes improving the instrument is not measuring
 * the game, it is protecting my design of the instrument.
 *
 * Its replacement is two constraints pulling opposite ways, so neither can be
 * satisfied by degrading the other:
 *
 *   SIGNAL UTILITY   readable must beat script by a margin. The instrument has
 *                    to be worth reading, or it is noise on the screen.
 *   AGENCY FLOOR     ceiling must beat readable by a margin. The instrument must
 *                    not be a command, or the player is executing a script.
 *
 * Sharpen the signal and utility rises while agency falls; blunt it and the
 * reverse. Only a genuinely well-shaped reward curve passes both.
 */
export const SIGNAL_UTILITY_MIN_PCT = 50;
export const AGENCY_FLOOR_MIN_PCT = 25;

export interface DualConstraint {
  readonly script: number;
  readonly readable: number;
  readonly ceiling: number;
  readonly scriptDepth: number;
  readonly readableThreshold: number;
  /** How much better reading the instrument is than ignoring it. */
  readonly signalUtilityPct: number;
  /** How much is left above the instrument for judgement. */
  readonly agencyFloorPct: number;
  readonly passes: boolean;
}

export function dualConstraint(seeds = 2000): DualConstraint {
  const hand = (seed: number): { faces: number[]; live: Set<number> } => ({
    faces: Array.from({ length: CELL_COUNT }, (_, i) => faceAtOrdinal(seed, i, FACE_WEIGHTS)),
    live: new Set(drawHand(seed)),
  });

  const play = (seed: number, stop: (signal: number, chains: number) => boolean, useDepth = false): number => {
    const { faces, live } = hand(seed);
    let run = 0; let chains = 0;
    for (;;) {
      const cs = scoringChains(faces, live);
      if (cs.length === 0) return 0;
      const b = cs.reduce((a, x) => (x.score / x.cells.length > a.score / a.cells.length ? x : a));
      const signal = useDepth
        ? survivableDepth(faces, live) - 1   // how many MORE after this one
        : riskAfter(faces, live, b.cells);
      if (chains > 0 && stop(signal, chains)) break;
      run += b.score; chains += 1;
      for (const c of b.cells) live.delete(c);
    }
    return Math.floor(run * runMultiplier(chains));
  };

  // CEILING: knows the future. Banks at the best moment in hindsight.
  const ceilingOf = (seed: number): number => {
    const { faces, live } = hand(seed);
    let run = 0; let chains = 0; let best = 0;
    for (;;) {
      const cs = scoringChains(faces, live);
      if (cs.length === 0) break;
      const b = cs.reduce((a, x) => (x.score / x.cells.length > a.score / a.cells.length ? x : a));
      run += b.score; chains += 1;
      for (const c of b.cells) live.delete(c);
      best = Math.max(best, Math.floor(run * runMultiplier(chains)));
    }
    return best;
  };

  let script = 0; let scriptDepth = 0;
  for (let d = 1; d <= 6; d += 1) {
    let t = 0;
    for (let s = 1; s <= seeds; s += 1) t += play(s, (_r, c) => c >= d);
    t /= seeds;
    if (t > script) { script = t; scriptDepth = d; }
  }

  // The readable tier is the BEST rule available on whichever signal the screen
  // shows. Both are tried, because a stronger instrument must not be allowed to
  // pass by being measured against a weaker rule.
  let readable = 0; let readableThreshold = 0;
  for (let th = 0; th <= 3; th += 1) {
    let t = 0;
    for (let s = 1; s <= seeds; s += 1) t += play(s, (r) => r >= th);
    t /= seeds;
    if (t > readable) { readable = t; readableThreshold = th; }
  }
  for (let th = 0; th <= 4; th += 1) {
    let t = 0;
    for (let s = 1; s <= seeds; s += 1) t += play(s, (d) => d <= th, true);
    t /= seeds;
    if (t > readable) { readable = t; readableThreshold = 100 + th; }
  }

  let ceiling = 0;
  for (let s = 1; s <= seeds; s += 1) ceiling += ceilingOf(s);
  ceiling /= seeds;

  const signalUtilityPct = script > 0 ? ((readable - script) / script) * 100 : 0;
  const agencyFloorPct = readable > 0 ? ((ceiling - readable) / readable) * 100 : 0;

  return {
    script, readable, ceiling, scriptDepth, readableThreshold,
    signalUtilityPct, agencyFloorPct,
    passes: signalUtilityPct >= SIGNAL_UTILITY_MIN_PCT && agencyFloorPct >= AGENCY_FLOOR_MIN_PCT,
  };
}
