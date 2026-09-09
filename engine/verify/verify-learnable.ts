// engine/verify/verify-learnable.ts — is there a game here at all?
//
// THE GAP THIS CLOSES, AND IT IS THE LARGEST ONE LEFT.
//
// This repository has proven, exhaustively, that the game is FAIR. The dice are
// uniform (L1y, chi-square 3.69 over 60,000 draws). The seed is committed before
// play. The rules are hashed into the artifact. The hidden lattice carries real
// information — P1 measures 1.918 bits of mutual information against a
// randomised control at 0.000.
//
// None of that is a claim that the game is PLAYABLE. Information being present
// in a channel does not mean a person can extract it. P2 compares only two
// extremes: a perfect oracle that knows the lattice (1.000) and a blind guess
// (0.389). Nothing measures the middle, which is the only part a human occupies.
//
// And every "player" this project has ever tested is a greedy policy that reads
// face value and charge. That policy exists to make the oracles deterministic,
// not because anyone checked it was a reasonable stand-in for a person.
//
// So the question nobody has asked: DOES WATCHING THE BOARD HELP? If a strategy
// that uses the observable evidence cannot beat one that ignores it, then the
// hidden lattice is decoration, the inference game is theatre, and this is a
// slot machine with extra steps — while every existing oracle still passes.
//
// E1  a charge-aware strategy beats a blind one, by a margin, over many seeds
// E2  a LEARNER that builds its own link model beats the naive charge-reader
// E3  the effect is not an artifact of one seed         (paired, many rounds)
// E4  the measurement can report NO skill               (NEGATIVE CONTROL)
//
// E4 IS THE POINT. Run the same comparison on a board whose lattice has been
// scrambled into noise, and the advantage must shrink. Without that, E1
// measures "greedy beats random", which is true of almost any scoring rule and
// says nothing about the hidden structure.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FILE CURRENTLY FAILS, AND THAT IS THE FINDING. DO NOT TUNE IT GREEN.
//
//   E1  charge-aware 84.6 vs blind 47.0  (+79.8%), 400/400 paired boards
//   E2  modelling learner 85.5 vs charge-reader 84.6  (+1.1%), 206/400
//   E4  SCRAMBLED lattice: the advantage is 83.4% — HIGHER than the 79.8% on a
//       real lattice
//
// Read together: watching the board pays enormously, and the STRUCTURE of the
// hidden lattice contributes nothing to that payoff. A uniformly random link
// map rewards the same greedy strategy just as well. The edge comes from the
// scoring rule — score = face x (1 + charge) — which pays for picking the
// biggest number on the board, and charge appears somewhere regardless of where
// the links point.
//
// So the premise the whole game rests on — "read the pattern, infer the hidden
// lattice, play the chain" — is not yet doing any work. P1's 1.918 bits are
// real; they are simply not WORTH anything to a player. And E2 says the same
// thing from the other side: a learner that explicitly models the link map
// beats the naive number-picker by 1.1%, which is nothing.
//
// This is a GAME DESIGN defect, not a regression, so it is deliberately NOT in
// the gating suite: a red build here would block unrelated work for a reason CI
// cannot fix. It is run as a standing diagnostic (`npm run verify:learnable`)
// and it must go green before the game can honestly claim to reward inference.
//
// The fix is in the SCORING RULE, not in this oracle. Something must pay for
// being right about the structure — for example scoring a banked cell by the
// charge it CAUSES downstream rather than the charge it already carries, so
// that predicting where charge will land is what earns.
// ─────────────────────────────────────────────────────────────────────────────

import { CELL_COUNT, OFFSET_LINK } from '../../lattice/board.js';
import { DEFAULT_ROUND, advanceTurn, beginRound, finishRound } from '../../lattice/round.js';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

/** Deterministic RNG, so a reported effect size is reproducible. */
function rng(seed: number): () => number {
  let s = seed | 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
    return (s >>> 0) / 4294967296;
  };
}

type Policy = (observable: Int32Array, turn: number, memory: Memory) => number;

// The board's geometry, mirrored from lattice-gen. The learner is allowed to
// know the SHAPE of the world (a 6x6 grid split into four 3x3 regions, links
// pointing at 4-neighbours) because a player can see that much by looking. It
// is not allowed to know any actual link.
const BOARD_W = 6, REGION = 3, REGIONS_PER_ROW = BOARD_W / REGION;
const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;
const colOf = (i: number): number => i % BOARD_W;
const rowOf = (i: number): number => (i / BOARD_W) | 0;
const regionOf = (i: number): number =>
  ((rowOf(i) / REGION) | 0) * REGIONS_PER_ROW + ((colOf(i) / REGION) | 0);
const REGION_COUNT = 4;

/** What a policy is allowed to remember between turns. Observables only. */
interface Memory {
  /**
   * votes[region * 4 + direction] — times charge appeared one step in
   * `direction` after banking a cell in `region`.
   *
   * REGIONAL, NOT PER-CELL, AND THAT IS THE WHOLE POINT. A 12-turn round yields
   * at most 12 observations; estimating 36 independent links from 12 samples is
   * hopeless, and a learner that tried it was measuring its own weakness rather
   * than the game. lattice-gen's own comment says why the regional form is the
   * right model: three links in four follow their region's prevailing flow,
   * "precisely what makes the lattice inferable from a handful of observations
   * instead of requiring all 36 to be seen individually". Four regions times
   * four directions is sixteen parameters with a strong prior, which a round
   * genuinely can estimate.
   */
  readonly votes: Int32Array;
  lastBanked: number;
  lastCharges: Int32Array;
}

const newMemory = (): Memory => ({
  votes: new Int32Array(REGION_COUNT * 4),
  lastBanked: -1,
  lastCharges: new Int32Array(CELL_COUNT),
});

const faceOf = (o: Int32Array, i: number): number => o[i * 3]!;
const chargeOf = (o: Int32Array, i: number): number => o[i * 3 + 2]!;

/** BLIND: ignores everything except whether a cell is occupied. */
const blind: Policy = (observable, turn) => {
  const r = rng(0x51ed ^ (turn * 2654435761));
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const i = Math.floor(r() * CELL_COUNT) % CELL_COUNT;
    if (faceOf(observable, i) !== 0) return i;
  }
  return 0;
};

/** CHARGE-AWARE: the greedy policy every other oracle uses. */
const chargeAware: Policy = (observable) => {
  let best = 0, bestValue = -1;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const face = faceOf(observable, i);
    if (face === 0) continue;
    const value = face * (1 + chargeOf(observable, i));
    if (value > bestValue) { bestValue = value; best = i; }
  }
  return best;
};

/**
 * LEARNER: builds an empirical model of the hidden lattice from observables.
 *
 * It never sees a link. It sees that after banking cell `from`, cell `to`
 * gained charge, and increments counts[from][to]. Over a round that is a noisy
 * estimate of the link map, and it banks the cell whose predicted downstream
 * target is most valuable — i.e. it plays for the CHAIN rather than for the
 * biggest number on the board.
 *
 * This is the strategy the game claims to reward. If it does not win, the claim
 * is false.
 */
const learner: Policy = (observable, _turn, memory) => {
  // Attribute last turn's charge gains to a DIRECTION in the banked cell's
  // region. Only unit steps count: a charge that appeared somewhere unreachable
  // in one step was not caused by this bank.
  const from = memory.lastBanked;
  if (from >= 0) {
    for (let i = 0; i < CELL_COUNT; i += 1) {
      if (chargeOf(observable, i) <= (memory.lastCharges[i] ?? 0)) continue;
      const dx = colOf(i) - colOf(from);
      const dy = rowOf(i) - rowOf(from);
      for (let d = 0; d < 4; d += 1) {
        if (dx === DX[d] && dy === DY[d]) {
          const k = regionOf(from) * 4 + d;
          memory.votes[k] = (memory.votes[k] ?? 0) + 1;
        }
      }
    }
  }

  /** The region's best-guess prevailing flow, or -1 while it has seen nothing. */
  const flowOf = (region: number): number => {
    let best = -1, seen = 0;
    for (let d = 0; d < 4; d += 1) {
      const n = memory.votes[region * 4 + d]!;
      if (n > seen) { seen = n; best = d; }
    }
    return best;
  };

  let best = 0, bestValue = -Infinity;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const face = faceOf(observable, i);
    if (face === 0) continue;
    const charge = chargeOf(observable, i);

    // The scoring rule pays the face of the cell this one FEEDS, scaled by the
    // charge sitting on it. The learner predicts that target from its regional
    // model and values THAT — the inference the game is meant to reward. With
    // no prediction yet it falls back to the cell's own face, matching the
    // rule's dead-link floor.
    const d = flowOf(regionOf(i));
    let target = -1;
    if (d >= 0) {
      const tc = colOf(i) + DX[d]!;
      const tr = rowOf(i) + DY[d]!;
      if (tc >= 0 && tc < BOARD_W && tr >= 0 && tr < BOARD_W) target = tr * BOARD_W + tc;
    }
    const targetFace = target >= 0 ? faceOf(observable, target) : 0;
    const value = targetFace > 0 ? targetFace * (1 + charge) : face;
    if (value > bestValue) { bestValue = value; best = i; }
  }

  memory.lastBanked = best;
  for (let i = 0; i < CELL_COUNT; i += 1) memory.lastCharges[i] = chargeOf(observable, i);
  return best;
};

/**
 * Plays one round under a policy. `scramble` is the negative control.
 *
 * THE FIRST VERSION OF THIS CONTROL SEVERED EVERY LINK, AND THAT IS IMPOSSIBLE.
 * With no links, `isStagnant` reports the board dead on turn 0 — every
 * non-empty cell either has no link or points at nothing — so the round
 * reshuffles to its cap, concedes, and both policies score exactly 0. The
 * comparison divided 0 by 0 and reported NaN.
 *
 * That is not a bug in the control so much as a fact about the game: D1's
 * stagnation rule makes a linkless board UNPLAYABLE BY CONSTRUCTION, so this
 * game cannot degenerate into pure chance even in principle.
 *
 * The right control is therefore the one P1 already uses for mutual
 * information: keep the links, destroy their STRUCTURE. Every cell still feeds
 * somewhere, so the board stays alive; where it feeds is now noise.
 */
function playWith(seed: number, policy: Policy, scramble: boolean): number {
  const state = beginRound(seed);
  if (scramble) {
    const r = rng(seed ^ 0x7f4a7c15);
    for (let i = 0; i < CELL_COUNT; i += 1) {
      state.board.set(i, OFFSET_LINK, Math.floor(r() * CELL_COUNT) % CELL_COUNT);
    }
  }
  const memory = newMemory();
  while (advanceTurn(state, DEFAULT_ROUND, (observable, turn) => policy(observable, turn, memory))) {
    // advanceTurn owns the loop condition.
  }
  return finishRound(state).score;
}

const ROUNDS = 400;
const seedFor = (i: number): number => (i * 2654435761) | 0;

interface Result { readonly mean: number; readonly wins: number }

function compare(a: Policy, b: Policy, scramble: boolean): { readonly a: Result; readonly b: Result } {
  let sumA = 0, sumB = 0, winsA = 0, winsB = 0;
  for (let i = 0; i < ROUNDS; i += 1) {
    // PAIRED: both policies play the SAME board. Comparing across different
    // boards would measure seed luck at least as much as strategy.
    const seed = seedFor(i);
    const scoreA = playWith(seed, a, scramble);
    const scoreB = playWith(seed, b, scramble);
    sumA += scoreA; sumB += scoreB;
    if (scoreA > scoreB) winsA += 1; else if (scoreB > scoreA) winsB += 1;
  }
  return {
    a: { mean: sumA / ROUNDS, wins: winsA },
    b: { mean: sumB / ROUNDS, wins: winsB },
  };
}

// ── E1: does watching the board help at all? ───────────────────────────────
const chargeVsBlind = compare(chargeAware, blind, false);
{
  const lift = ((chargeVsBlind.a.mean / chargeVsBlind.b.mean) - 1) * 100;
  ok(chargeVsBlind.a.mean > chargeVsBlind.b.mean,
    `E1: a charge-aware strategy scores ${chargeVsBlind.a.mean.toFixed(1)} against a blind one's ` +
      `${chargeVsBlind.b.mean.toFixed(1)} over ${ROUNDS} paired rounds. Watching the board does not help, so ` +
      'the observable evidence is decorative and this is a game of pure chance wearing a puzzle costume.');
  console.log(
    `  E1 evidence pays: charge-aware ${chargeVsBlind.a.mean.toFixed(1)} vs blind ` +
      `${chargeVsBlind.b.mean.toFixed(1)} (+${lift.toFixed(1)}%), winning ${chargeVsBlind.a.wins}/${ROUNDS} paired boards`,
  );
}

// ── E2: does modelling the hidden lattice beat merely reacting to it? ──────
// The margin is stated BEFORE the measurement, so this cannot be settled by
// looking at the number and declaring it sufficient.
const E2_MARGIN_PCT = 5;
const learnerVsCharge = compare(learner, chargeAware, false);
const learnerLift = (learnerVsCharge.a.mean / learnerVsCharge.b.mean) - 1;
{
  ok(learnerLift * 100 >= E2_MARGIN_PCT,
    `E2: a learner that models the hidden lattice beats the naive charge-reader by only ` +
      `${(learnerLift * 100).toFixed(1)}%, under the ${E2_MARGIN_PCT}% margin set in advance. Modelling the ` +
      'thing the game is about must be worth more than reacting to what is already on screen, or the ' +
      'inference premise is decorative.');
  console.log(
    `  E2 depth: modelling learner ${learnerVsCharge.a.mean.toFixed(1)} vs charge-reader ` +
      `${learnerVsCharge.b.mean.toFixed(1)} (+${(learnerLift * 100).toFixed(1)}%, margin ${E2_MARGIN_PCT}%), ` +
      `winning ${learnerVsCharge.a.wins}/${ROUNDS}`,
  );
}

// ── E3: the effect is not one lucky seed ───────────────────────────────────
{
  const won = chargeVsBlind.a.wins;
  ok(won > ROUNDS * 0.55,
    `E3: the charge-aware strategy won only ${won} of ${ROUNDS} paired boards. A mean advantage carried by a ` +
      'few outliers is not a skill a player can rely on turn to turn');
  console.log(`  E3 consistency: charge-aware wins ${won}/${ROUNDS} paired boards (${((won / ROUNDS) * 100).toFixed(0)}%)`);
}

// ── E4: NEGATIVE CONTROL — the LEARNER's edge must depend on real structure ─
//
// THE FIRST VERSION OF THIS CONTROL ASKED THE WRONG QUESTION. It compared
// charge-aware against blind on a scrambled lattice, which measures "greedy
// beats random" — true under almost any scoring rule, and it stayed true when
// the lattice was noise. The thing that must depend on structure is not whether
// evidence pays at all; it is whether MODELLING THE STRUCTURE pays. So the
// control now scrambles the lattice and re-measures the LEARNER's edge.
//
// A real lattice is locally biased: three links in four follow the prevailing
// regional flow. That is learnable. A uniformly scrambled lattice is not
// learnable by construction, so a learner's advantage over the naive reader
// must collapse. If it does not, the learner is not learning the structure.
{
  const scrambled = compare(learner, chargeAware, true);
  const scrambledLift = (scrambled.a.mean / scrambled.b.mean) - 1;

  ok(Number.isFinite(scrambledLift),
    'E4 SETUP FAILED: the scrambled control produced no scores, so it measured nothing');
  ok(scrambledLift < learnerLift,
    `E4 NEGATIVE CONTROL FAILED: the learner's edge over the naive reader was ` +
      `${(scrambledLift * 100).toFixed(1)}% on a SCRAMBLED lattice against ${(learnerLift * 100).toFixed(1)}% ` +
      'on a real one. An edge that survives the structure being destroyed was never coming from the ' +
      'structure, so E2 is measuring something other than inference.');
  console.log(
    `  E4 negative control: learner edge ${(learnerLift * 100).toFixed(1)}% on a real lattice vs ` +
      `${(scrambledLift * 100).toFixed(1)}% scrambled — ` +
      (scrambledLift < learnerLift
        ? 'the edge comes from the structure being learnable'
        : 'THE EDGE SURVIVES SCRAMBLING, so it is not inference'),
  );
}

if (failures.length > 0) {
  console.error(`verify-learnable: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-learnable: PASS — the hidden lattice is exploitable by a strategy a person could actually run');
