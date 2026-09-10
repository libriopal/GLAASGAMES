// foundry/montecarlo/harness.ts — the instrument that makes "proven value" mean
// something. Agent-based playtesting over a variant space.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS BEFORE THE CANDIDATE LIST, AND NOT AFTER.
//
// The brief asked for 69 candidates "each verified to have proven value". A list
// cannot carry that property. Proof is a measurement, so the catalogue is
// worthless before this file exists and nearly free afterwards — the 69 are
// parameterisations this harness EXECUTES, not paragraphs somebody reads.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FILE HAS BEEN REVISED ONCE AFTER PUBLICATION, AND THE REVISION RETRACTED
// ITS OWN HEADLINE. THAT HISTORY IS KEPT HERE ON PURPOSE.
//
// The first version reported: skill depth 0.432, dominance 0.406, headroom 0.042
// — read as "a one-line heuristic captures 40.6% of achievable value and knowing
// the hidden lattice adds only ~1.4 points on top", i.e. the game is shallow.
//
// Four probes against the running code falsified that reading:
//
//   X-MC1  The "learnable" rung learned almost nothing. Charge travels TWO hops,
//          so two cells rise per bank, and the learner only recorded a link when
//          EXACTLY ONE rose — discarding 44.6% of the signal. At decision time
//          only 1.52% of open cells had a usable learned target. The rung was
//          charge-chasing 98.5% of the time. `headroom` measured the policy's
//          ignorance, not the game's depth.
//
//   X-MC2  The lattice is REGIONALLY structured by construction (4 regions, a
//          prevailing direction each, 75% conformance) precisely so that a few
//          observations generalise to cells never banked. The old rung was a
//          per-cell lookup table that did none of that.
//
//   X-MC3  `clairvoyant` (97.7) is not the ceiling of what a player can infer.
//          Handed the true region flows and nothing else, an agent scores 88.1.
//          The remaining ~9.6 points are the 25% of links that DEVIATE from
//          their region — knowable only one cell at a time, by construction.
//          Normalising skill against 97.7 charged the player for information the
//          generator deliberately made un-inferable in aggregate.
//
//   X-MC6  `refill` is INERT. Across refill 1/2/4/6 at 6, 12 and 20 turns the
//          round digest was IDENTICAL every time: after banking one cell exactly
//          one cell is empty, so `refill > 1` has nothing to fill. The old
//          catalogue swept it across 69 candidates that were 20 distinct games.
//
//   X-MC7  A SCRAMBLED-BELIEF control then falsified the REPLACEMENT too. A rung
//          that never learns and always believes "every cell feeds north" scored
//          70.8, beating the real learner's 66.7. A zero-information constant
//          cannot beat inference unless the SCORING SHAPE is doing the work —
//          and it was: `expectedFace x (1 + charge)` rewards banking next to big
//          numbers whatever you believe, because the link IS a neighbour.
//
//   X-MC8  So the missing rung was the strongest TRIVIAL policy: "bank the cell
//          surrounded by the biggest numbers", which scores 69.9 with no memory
//          at all. The first report's "40.6% captured by a trivial strategy" was
//          measured against a weaker trivial baseline than the game admits.
//
//   X-MC9  With the learner falling back to that estimate instead of a constant,
//          it scores 74.1 — above the best trivial — and its SCRAMBLED twin
//          scores 64.3. On a lattice with NO region structure the three collapse
//          together (72.7 / 73.3 / 72.8). The effect is present where it should
//          be and vanishes where it cannot exist.
//
// THE ORIGINAL HEADLINE IS RETRACTED. Knowing the lattice is worth ~16.8 points
// over the best trivial policy on the shipped board, not ~1.4. The ladder now
// reports against the INFERABLE ceiling, and the absolute full-information
// number is kept beside it rather than standing in for it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE METRICS ARE THE LITERATURE'S, NOT MINE. (Researched, not invented.)
//
// Automated balancing via simulated agents is a settled technique. The standard
// readout is a SKILL GAP: run agents of differing competence over many seeds and
// compare. The published rule of thumb — a gap above ~50% indicates strong
// strategic play, below ~20% the game "feels random", NEGATIVE means strategy is
// counterproductive — is what `skillDepth` reports.
//
// Exploitability in the game-theory sense is NASHCONV: the best-response gap,
// δᵢ(π) = Rᵢ(BR(π⁻ⁱ), π⁻ⁱ) − Rᵢ(πᵢ, π⁻ⁱ), summed over players, zero exactly at
// Nash equilibrium.
//
// **IT DOES NOT APPLY HERE AND SAYING SO MATTERS.** NashConv is defined for
// multi-agent play; Lattice is one player against a seeded distribution. There
// is no opponent to deviate against. Importing the name without the setting
// would be the vocabulary proxy — a respected term doing no work.
//
// The single-player analogue that IS meaningful: how much of the achievable
// value does a TRIVIAL strategy already capture? That is `dominance`, and after
// X-MC3 it is normalised against what is INFERABLE, not against omniscience.

import { BOARD_H, BOARD_W, CELL_COUNT, EMPTY, NO_LINK } from '../../lattice/board.js';
import { type RoundConfig, drawFace, playRound } from '../../lattice/round.js';
import { REGION, regionFlows } from '../../lattice/lattice-gen.js';
import { makeRng } from '../../engine/sim/world-gen.js';
import { type Sibling, asPolicy, siblings } from './siblings.js';

/** A candidate variant: a name, an axis it probes, and the config it means. */
export interface Variant {
  readonly id: string;
  readonly axis: string;
  readonly note: string;
  readonly config: RoundConfig;
}

export interface VariantMetrics {
  readonly id: string;
  readonly axis: string;
  /** Mean score of each rung of the ladder. */
  readonly blind: number;
  readonly greedy: number;
  readonly chargeAware: number;
  /** "Bank next to big numbers." */
  readonly neighbourAware: number;
  /** Expected payout under the real rule. The strongest trivial rung found. */
  readonly expectedPayout: number;
  /** The learner with its belief switched off — the honest inference control. */
  readonly regionFlowNoBelief: number;
  /** The learner: infers region flow from the charge trail. */
  readonly regionFlow: number;
  /** The learner with its belief inverted. The control that prices inference. */
  readonly regionFlowScrambled: number;
  /** Handed the true region flows. The INFERABLE ceiling. */
  readonly regionOracle: number;
  /** Handed every link. The absolute full-information bound. */
  readonly clairvoyant: number;
  /**
   * (learner − blind) / (INFERABLE ceiling − blind).
   *
   * Against the inferable ceiling rather than the omniscient one, because X-MC3
   * showed ~17% of the omniscient span comes from per-cell deviations the design
   * deliberately made un-inferable in aggregate. Charging the player for that
   * was flattering the ceiling and deflating every ratio beneath it.
   */
  readonly skillDepth: number;
  /** The same ratio against omniscience, kept so the deflation stays visible. */
  readonly absoluteDepth: number;
  /** (best TRIVIAL − blind) / (inferable ceiling − blind). High = exploitable. */
  readonly dominance: number;
  /** Room the learner left on the table, as a fraction of the inferable gap. */
  readonly headroom: number;
  /**
   * regionOracle − best trivial policy: what the hidden lattice is WORTH.
   *
   * THE GATE THAT MATTERS MOST, and it is a safety property before it is a
   * balance one. `lattice-gen.ts` argues that dangling a hidden layer in front of
   * pattern-seeking players is defensible ONLY if the layer is really there and
   * really inferable — otherwise the game rewards apophenia, in front of the
   * population most at risk from it. A variant whose span is ~0 or negative is a
   * board where perfect knowledge of the lattice buys nothing: the structure is
   * decoration. Such variants are DEGENERATE and are rejected, not ranked.
   */
  readonly inferableSpan: number;
  /** True when the hidden lattice is worth nothing. Ranking these is meaningless. */
  readonly degenerate: boolean;
  /** Fraction of rounds that conceded to stagnation. The stalemate metric. */
  readonly stagnation: number;
  /** Chi-square of this variant's DRAWN faces against uniform. */
  readonly faceChiSquare: number;
  /** How many faces that statistic was computed over. Power is a function of it. */
  readonly faceSamples: number;
  /**
   * learner − the SAME learner with its belief switched off.
   *
   * Not learner − inverted, which the independent audit showed overstates by
   * ~2.7x because inverting is strictly worse than not knowing. Must collapse to
   * ~0 — or go NEGATIVE — on a lattice with no region structure.
   */
  readonly inferenceValue: number;
  /** learner − inverted learner. A labelled UPPER BOUND, never the headline. */
  readonly inferenceUpperBound: number;
  /** Score spread across seeds for a FIXED policy — seed luck vs skill. */
  readonly seedVariance: number;
}

interface Memory {
  /** region -> observed direction counts. NOT per-cell: see X-MC2. */
  readonly tally: number[][];
  /** The true region flows, for the oracle rung only. */
  readonly flows: readonly number[] | null;
  lastBanked: number;
}

type Policy = (observable: Int32Array, links: Int32Array | null, memory: Memory) => number;

const faceAt = (o: Int32Array, i: number): number => o[i * 3] ?? EMPTY;
const chargeAt = (o: Int32Array, i: number): number => o[i * 3 + 2] ?? 0;

// ── board geometry, duplicated from the generator's own conventions ─────────
const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;
const REGIONS_PER_ROW = BOARD_W / REGION;
const colOf = (i: number): number => i % BOARD_W;
const rowOf = (i: number): number => (i / BOARD_W) | 0;
const regionOf = (i: number): number =>
  ((rowOf(i) / REGION) | 0) * REGIONS_PER_ROW + ((colOf(i) / REGION) | 0);

/** The cell reached by stepping `d` from `i`, or -1 off the board. */
function step(i: number, d: number): number {
  const c = colOf(i) + DX[d]!;
  const r = rowOf(i) + DY[d]!;
  if (c < 0 || c >= BOARD_W || r < 0 || r >= BOARD_H) return -1;
  return r * BOARD_W + c;
}

/** The direction from `from` to `to`, or -1 when they are not neighbours. */
function dirBetween(from: number, to: number): number {
  for (let d = 0; d < 4; d += 1) if (step(from, d) === to) return d;
  return -1;
}

/**
 * Expected face of an unknown cell.
 *
 * The mean of a uniform 1..6. Used wherever a policy has no belief about where a
 * cell feeds, so that policy still prices the charge multiplier correctly and
 * therefore SUBSUMES charge-chasing rather than being handicapped against it.
 * The first draft valued unknowns at their own face, which threw the multiplier
 * away and made the learnable rung look worse than a one-liner.
 */
const UNKNOWN_FACE = 3.5;

/** Picks the open cell maximising `score`. */
function argmax(o: Int32Array, score: (c: number) => number): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (faceAt(o, i) === EMPTY) continue;
    const v = score(i);
    if (best < 0 || v > bestScore) { bestScore = v; best = i; }
  }
  return best < 0 ? 0 : best;
}

// ── the ladder ─────────────────────────────────────────────────────────────
// Rungs 0-2 are TRIVIAL: each is a single comparison a player could describe in
// one sentence. If one of them approaches the ceiling, the variant is
// exploitable and no amount of design elsewhere rescues it.

/** Rung 0 — no information used at all. The floor every other rung is measured against. */
const blind: Policy = (o) => argmax(o, () => 0);

/** Rung 1 — "bank the biggest number". */
const greedy: Policy = (o) => argmax(o, (c) => faceAt(o, c));

/** Rung 2 — "bank the most charged". The single most likely dominant strategy. */
const chargeAware: Policy = (o) => argmax(o, (c) => chargeAt(o, c));

/**
 * The mean face of a cell's live orthogonal neighbours.
 *
 * THIS IS THE FALLBACK THAT SHOULD ALWAYS HAVE BEEN HERE. A cell feeds one of
 * its four neighbours, so with no belief at all about WHICH, the expected face
 * of its target is the mean over the neighbours it could feed — not the global
 * constant 3.5. Using 3.5 threw away real board information and made every
 * belief-driven rung look better than it was.
 */
function neighbourMean(o: Int32Array, c: number): number {
  let sum = 0;
  let n = 0;
  for (let d = 0; d < 4; d += 1) {
    const t = step(c, d);
    if (t >= 0 && faceAt(o, t) !== EMPTY) { sum += faceAt(o, t); n += 1; }
  }
  return n === 0 ? UNKNOWN_FACE : sum / n;
}

/**
 * Rung 3 — THE STRONGEST TRIVIAL POLICY, and the one the first ladder missed.
 *
 * "Bank the cell surrounded by the biggest numbers." One sentence, no memory, no
 * inference — and on the shipped board it scores 69.9 against charge-chasing's
 * 62.7 and the first ladder's entire "learnable" rung at 66.7.
 *
 * ── HOW IT WAS FOUND, BECAUSE THE METHOD MATTERS MORE THAN THE POLICY ───────
 *
 * Not by thinking of it. By running a SCRAMBLED-BELIEF control on the learner:
 * same board, same policy shape, belief rotated 180 degrees. A third arm of that
 * control — a learner that never learns and always believes "every cell feeds
 * north" — scored 70.8, beating the real learner. A zero-information constant
 * cannot beat inference unless the scoring shape itself is doing the work, and
 * it was: `expectedFace x (1 + charge)` rewards banking next to big numbers
 * whatever direction you believe in, because the link IS one of the neighbours.
 *
 * Omitting this rung is what made the first report claim the game was
 * exploitable at 40.6%. It was comparing against a weak trivial baseline.
 */
const neighbourAware: Policy = (o) => argmax(o, (c) => neighbourMean(o, c) * (1 + chargeAt(o, c)));

/**
 * Expected payout under the REAL rule, with a uniform prior over which of the
 * four directions is the link. A dead or off-board direction pays the cell's own
 * face, exactly as `advanceTurn` does.
 *
 * ── THE MACHINE FOUND THIS ONE, NOT THE AUTHOR ──────────────────────────────
 *
 * `siblings.ts` enumerates a grammar of memoryless one-liners and plays them.
 * On its FIRST run it returned `expPayout` at 77.52 against the author's
 * declared best trivial rung at 68.1 — and ahead of `nbrSum` (76.10), which was
 * the rung the independent auditor had found by hand. Two adversarial passes
 * found two different rungs the author missed; the enumerated search found a
 * better one than either, immediately.
 *
 * That is the argument for M10 existing. It is also why the learner below falls
 * back to THIS estimate: a learner measured against a baseline weaker than the
 * one a machine can write in a second is not measuring inference.
 */
const expectedPayoutOf = (o: Int32Array, c: number): number => {
  let acc = 0;
  for (let d = 0; d < 4; d += 1) {
    const t = step(c, d);
    acc += t >= 0 && faceAt(o, t) !== EMPTY
      ? faceAt(o, t) * (1 + chargeAt(o, c))
      : faceAt(o, c);
  }
  return acc / 4;
};

/** Rung 3b — the strongest trivial policy the generated grammar contains. */
const expectedPayout: Policy = (o) => argmax(o, (c) => expectedPayoutOf(o, c));

/**
 * THE LADDER'S DECLARED BEST TRIVIAL POLICY, exported so the sibling search
 * cannot drift from it.
 *
 * M10's first draft re-implemented the declared rung inline, which meant the
 * check compared the grammar against a COPY that the ladder no longer used —
 * it stayed red after the ladder was fixed, for the wrong reason. A check that
 * duplicates the thing it audits will eventually audit the duplicate.
 */
export const declaredBestTrivial: (o: Int32Array) => number =
  (o) => expectedPayout(o, null, { tally: [], flows: null, lastBanked: -1 });

/**
 * How many agreeing observations before a region's flow is trusted.
 *
 * Measured, not chosen: 1 scores 74.1, 2 scores 72.8, 3 scores 72.2. Acting on
 * the first observation wins because a region only has to be RIGHT more often
 * than the neighbour-mean fallback, not certain.
 */
const CONFIDENCE = 1;

/**
 * Rung 4 — the LEARNER, rebuilt twice.
 *
 * It infers each REGION'S PREVAILING FLOW from the charge trail and applies it
 * to every cell in that region, including cells it has never banked. That is the
 * inference the lattice generator was built to reward: links are drawn from a
 * per-region direction with 75% conformance precisely so that a handful of
 * observations generalise.
 *
 * Two corrections got it here, and both were forced by controls rather than by
 * reasoning:
 *
 *   X-MC1/2  The first version memorised per-cell `cell -> target` pairs and
 *            discarded every two-hop observation. On a 36-cell board over 12
 *            turns that table was usable for 1.52% of decisions, so the rung was
 *            charge-chasing with a rounding error attached.
 *   X-MC9    The second version fell back to a constant where it had no belief,
 *            which is strictly worse than the neighbour mean the board already
 *            shows. Falling back to `neighbourAware`'s own estimate makes this
 *            rung a genuine SUPERSET of the strongest trivial policy, so the gap
 *            between them is inference and nothing else.
 */
const regionFlow: Policy = (o, _links, mem) =>
  argmax(o, (c) => valueUnderBelief(o, c, mem, 'true'));

/**
 * Rung 4'' — THE CONTROL THAT SHOULD ALWAYS HAVE BEEN THE CONTROL.
 *
 * The same policy with its belief switched OFF, so it falls back to
 * `expectedPayout` everywhere. `learner - this` is the honest value of the
 * belief, and it is what `inferenceValue` now reports.
 *
 * The published figure used `learner - INVERTED` instead, which the independent
 * audit showed is ~2.7x too large: inverting a belief is strictly worse than
 * holding none, because on this board the link is always one of the four
 * neighbours and the inverted direction is the one guaranteed NOT to be it more
 * often than chance. Reproduced locally at 400 paired seeds: learner minus
 * inverted +11.54, learner minus random +6.99, learner minus no-belief +4.30.
 * The inverted arm survives below as a labelled UPPER BOUND, never as the
 * headline.
 */
const regionFlowNoBelief: Policy = (o, _links, mem) =>
  argmax(o, (c) => valueUnderBelief(o, c, mem, 'none'));

/**
 * Rung 4' — THE SCRAMBLED CONTROL. Learns exactly as much, then believes the
 * OPPOSITE direction.
 *
 * This is the arm that makes the learner's lift mean something. A rung that
 * gains points because of the SHAPE of its scoring function gains them here too;
 * only a rung whose belief carries real information is HURT by inverting it. On
 * the shipped board the true learner scores 74.1 and this scores 64.3; on a
 * lattice with no region structure the two are identical. An effect claimed must
 * also be shown to vanish where it cannot exist.
 */
const regionFlowScrambled: Policy = (o, _links, mem) =>
  argmax(o, (c) => valueUnderBelief(o, c, mem, 'inverted'));

function valueUnderBelief(
  o: Int32Array,
  c: number,
  mem: Memory,
  mode: 'true' | 'inverted' | 'none',
): number {
  // THE FALLBACK IS THE BEST TRIVIAL ESTIMATE, NOT A WEAKER ONE. This is what
  // makes the learner a strict SUPERSET of `expectedPayout`, so the gap between
  // them is inference and nothing else. Falling back to `neighbourMean` — a rung
  // a generated one-liner beats by ~9 points — meant the "value of inference"
  // was partly just the fallback being bad at arithmetic.
  const fallback = expectedPayoutOf(o, c);
  if (mode === 'none') return fallback;
  const t = mem.tally[regionOf(c)]!;
  let bd = -1;
  let bv = 0;
  for (let d = 0; d < 4; d += 1) if (t[d]! > bv) { bv = t[d]!; bd = d; }
  if (bd < 0 || bv < CONFIDENCE) return fallback;
  const use = mode === 'inverted' ? (bd + 2) % 4 : bd;
  const tgt = step(c, use);
  return tgt >= 0 && faceAt(o, tgt) !== EMPTY
    ? faceAt(o, tgt) * (1 + chargeAt(o, c))
    : fallback;
}

/**
 * Rung 4 — the INFERABLE CEILING. Handed the true region flows, nothing else.
 *
 * THIS IS THE DENOMINATOR THAT SHOULD ALWAYS HAVE BEEN USED. A player who read
 * the board perfectly could arrive at exactly this knowledge — four directions —
 * because it is the only part of the lattice that is inferable in aggregate. The
 * 25% of links that deviate are, by construction, learnable only one cell at a
 * time and only after that cell has been banked and refilled.
 */
const regionOracle: Policy = (o, _links, mem) =>
  argmax(o, (c) => {
    const flows = mem.flows;
    if (flows === null) return chargeAt(o, c);
    const tgt = step(c, flows[regionOf(c)]!);
    const expected = tgt >= 0 && faceAt(o, tgt) !== EMPTY ? faceAt(o, tgt) : neighbourMean(o, c);
    return expected * (1 + chargeAt(o, c));
  });

/**
 * Rung 5 — the ABSOLUTE bound. Knows every link and plays the true payout.
 *
 * IT IS A ONE-PLY GREEDY WITH FULL INFORMATION, NOT A SOLVED OPTIMUM, and the
 * distinction is stated because the number gets used as a ceiling. A true
 * optimum would search over turn sequences and could only score HIGHER, so this
 * is a LOWER bound on omniscient play — which means any ratio taken against it
 * is an OVER-estimate of how much of the game a policy has captured.
 */
const clairvoyant: Policy = (o, links) => {
  if (links === null) return argmax(o, () => 0);
  return argmax(o, (c) => {
    const link = links[c] ?? NO_LINK;
    const live = link !== NO_LINK && faceAt(o, link) !== EMPTY;
    return live ? faceAt(o, link) * (1 + chargeAt(o, c)) : faceAt(o, c);
  });
};

/**
 * Plays one seed under one policy, learning DURING the round.
 *
 * ── HOW THE OBSERVATION IS READ, AND WHY IT CHANGED ─────────────────────────
 *
 * Charge travels TWO hops, so a bank usually raises charge on two cells. The
 * first version recorded a link only when exactly one cell rose, which threw
 * away 44.6% of all observations (X-MC1: 551 single-rise events against 443
 * double-rise). It is not ambiguous: the FIRST hop is the risen cell ADJACENT to
 * the cell just banked, and the second is a neighbour of that one. Adjacency
 * identifies the first hop uniquely, so both cases now yield an observation.
 *
 * What is recorded is the DIRECTION, tallied per region — not the cell pair.
 * See `regionFlow` for why.
 */
function playOne(
  seed: number,
  config: RoundConfig,
  policy: Policy,
  reveal: 'none' | 'flows' | 'links',
): { score: number; conceded: boolean } {
  const mem: Memory = {
    tally: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    flows: reveal === 'flows' ? regionFlows(seed) : null,
    lastBanked: -1,
  };
  const links = reveal === 'links' ? playRound(seed, config, () => 0).finalLinks : null;

  let prevCharge: number[] | null = null;

  const r = playRound(seed, config, (observable) => {
    const nowCharge: number[] = [];
    for (let i = 0; i < CELL_COUNT; i += 1) nowCharge.push(chargeAt(observable, i));

    if (prevCharge !== null && mem.lastBanked >= 0) {
      for (let i = 0; i < CELL_COUNT; i += 1) {
        if (nowCharge[i]! <= (prevCharge[i] ?? 0)) continue;
        const d = dirBetween(mem.lastBanked, i);
        // Only the FIRST hop is adjacent to the banked cell. The second hop is
        // adjacent to the first, so this picks out the observation that is
        // actually about the cell we acted on.
        if (d >= 0) { mem.tally[regionOf(mem.lastBanked)]![d]! += 1; break; }
      }
    }
    prevCharge = nowCharge;

    const choice = policy(observable, links, mem);
    mem.lastBanked = choice;
    return choice;
  });

  return { score: r.score, conceded: r.conceded };
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const stdev = (xs: readonly number[]): number => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/**
 * Chi-square of a face sample against UNIFORM.
 *
 * AGAINST UNIFORM, NOT AGAINST THE VARIANT'S OWN DECLARATION, and the
 * difference is the whole meaning of the check. The first draft compared each
 * variant's dice to the weights that variant declared — so `flat-one-face`, a
 * distribution that puts every ounce of weight on the number 6, scored a
 * perfect 0.0 and sailed through the fairness gate. It was internally
 * consistent: it said it would roll sixes and it rolled sixes.
 *
 * That is conformance, not fairness. **A loaded die that honestly declares
 * itself loaded is still loaded.**
 */
export function faceUniformityChiSquare(faces: readonly number[]): number {
  const counts = new Array(7).fill(0) as number[];
  for (const f of faces) if (f >= 1 && f <= 6) counts[f] = (counts[f] ?? 0) + 1;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const expected = total / 6;
  let chi = 0;
  for (let f = 1; f <= 6; f += 1) chi += ((counts[f] ?? 0) - expected) ** 2 / expected;
  return chi;
}

/**
 * How many faces a variant actually draws over `seeds` rounds.
 *
 * 36 for the opening deal, plus ONE per turn — because only the banked cell is
 * ever empty when the refill runs, which is the same mechanism that makes
 * `refill` inert (X-MC6). Reshuffles draw another 36 each and are not counted,
 * so this is a slight UNDER-estimate and therefore conservative about power.
 */
export function faceSampleSize(config: RoundConfig, seeds: number): number {
  return seeds * (CELL_COUNT + config.turns);
}

/**
 * Samples the fairness surface DIRECTLY.
 *
 * `drawFace` is exported for exactly this reason and `verify-lattice` L1y
 * already samples it this way rather than inferring a distribution from played
 * rounds. Going through the board instead would re-import the correlation bug
 * that produced chi-square 955 on uniform dice in the first draft.
 */
export function sampleFaces(weights: readonly number[], n: number, rngSeed: number): number[] {
  const rng = makeRng(rngSeed);
  const faces: number[] = [];
  for (let i = 0; i < n; i += 1) faces.push(drawFace(rng, weights));
  return faces;
}

/**
 * The gate's POWER against a given distribution: the fraction of independent
 * samples it flags, at the sample size a variant of this shape actually draws.
 *
 * A single chi-square is one draw from a distribution and reading it as a verdict
 * is how a gate acquires an unmeasured sensitivity. `verify-montecarlo` publishes
 * this curve, including the bias levels where power is ZERO.
 */
export function detectionRate(
  weights: readonly number[],
  n: number,
  trials: number,
  critical: number,
): number {
  let caught = 0;
  for (let t = 0; t < trials; t += 1) {
    if (faceUniformityChiSquare(sampleFaces(weights, n, 0x5eed0000 + t * 7919)) >= critical) caught += 1;
  }
  return caught / trials;
}

const UNIFORM_WEIGHTS: readonly number[] = [0, 4, 4, 4, 4, 4, 4];

/** Runs the whole ladder over `seeds` rounds and reports the metrics. */
export function evaluate(v: Variant, seeds: number): VariantMetrics {
  const run = (p: Policy, reveal: 'none' | 'flows' | 'links') => {
    const scores: number[] = [];
    let conceded = 0;
    for (let s = 1; s <= seeds; s += 1) {
      const r = playOne(s, v.config, p, reveal);
      scores.push(r.score);
      if (r.conceded) conceded += 1;
    }
    return { scores, conceded: conceded / seeds };
  };

  const b = run(blind, 'none');
  const g = run(greedy, 'none');
  const c = run(chargeAware, 'none');
  const na = run(neighbourAware, 'none');
  const ep = run(expectedPayout, 'none');
  const rf = run(regionFlow, 'none');
  const rn = run(regionFlowNoBelief, 'none');
  const rs = run(regionFlowScrambled, 'none');
  const ro = run(regionOracle, 'flows');
  const cl = run(clairvoyant, 'links');

  const mb = mean(b.scores);
  const mg = mean(g.scores);
  const mc = mean(c.scores);
  const mna = mean(na.scores);
  const mep = mean(ep.scores);
  const mrf = mean(rf.scores);
  const mrn = mean(rn.scores);
  const mrs = mean(rs.scores);
  const mro = mean(ro.scores);
  const mcl = mean(cl.scores);

  // The inferable span is the denominator. See X-MC3.
  const inferable = mro - mb;
  const absolute = mcl - mb;
  const bestTrivial = Math.max(mg, mc, mna, mep);
  const bestLearnable = Math.max(mrf, bestTrivial);

  // A span below this means knowing every region flow buys less than a point
  // over a one-line heuristic — indistinguishable from a board with no structure.
  const DEGENERATE_SPAN = 2;
  const span = mro - bestTrivial;
  const n = faceSampleSize(v.config, seeds);
  const faces = sampleFaces(v.config.faceWeights ?? UNIFORM_WEIGHTS, n, 0x5eed1234);

  return {
    id: v.id,
    axis: v.axis,
    blind: mb,
    greedy: mg,
    chargeAware: mc,
    neighbourAware: mna,
    expectedPayout: mep,
    regionFlow: mrf,
    regionFlowNoBelief: mrn,
    regionFlowScrambled: mrs,
    regionOracle: mro,
    clairvoyant: mcl,
    // Clamped at the degeneracy boundary rather than at zero: a denominator that
    // has collapsed produces ratios above 1 that LOOK like the best candidates in
    // the sweep, which is how deviation-1 noise boards ranked first on the first
    // run of this file.
    skillDepth: inferable <= 0 || span < DEGENERATE_SPAN ? 0 : (bestLearnable - mb) / inferable,
    absoluteDepth: absolute <= 0 ? 0 : (bestLearnable - mb) / absolute,
    dominance: inferable <= 0 || span < DEGENERATE_SPAN ? 1 : (bestTrivial - mb) / inferable,
    headroom: mro - bestTrivial <= 0 ? 0 : (bestLearnable - bestTrivial) / (mro - bestTrivial),
    inferableSpan: span,
    degenerate: span < DEGENERATE_SPAN,
    inferenceValue: mrf - mrn,
    inferenceUpperBound: mrf - mrs,
    stagnation: rf.conceded,
    faceChiSquare: faceUniformityChiSquare(faces),
    faceSamples: n,
    seedVariance: stdev(rf.scores),
  };
}

// ── THE SIBLING SEARCH ──────────────────────────────────────────────────────
// See `siblings.ts` for why this exists and, more importantly, for what it
// cannot catch.

export interface SiblingResult {
  readonly id: string;
  readonly mean: number;
  /** Paired difference against the ladder's declared best trivial rung. */
  readonly deltaVsDeclared: number;
  /** 95% half-width of that paired difference. */
  readonly ci95: number;
}

/**
 * Plays every generated sibling on the same seeds as the declared best trivial
 * policy, and reports PAIRED differences.
 *
 * PAIRED, because the seeds are the dominant source of variance here and an
 * unpaired comparison would drown an 8-point effect in seed luck.
 */
export function searchSiblings(
  config: RoundConfig,
  seeds: number,
  declared: (o: Int32Array) => number,
): readonly SiblingResult[] {
  const runPolicy = (p: (o: Int32Array) => number): number[] => {
    const out: number[] = [];
    for (let s = 1; s <= seeds; s += 1) {
      out.push(playRound(s, config, (o) => p(o)).score);
    }
    return out;
  };

  const base = runPolicy(declared);
  const out: SiblingResult[] = [];
  for (const sib of siblings() as readonly Sibling[]) {
    const mine = runPolicy(asPolicy(sib.score));
    const diffs = mine.map((v, i) => v - base[i]!);
    const m = mean(diffs);
    // Standard error of the paired mean, then the 95% half-width.
    const sd = Math.sqrt(
      diffs.reduce((a, d) => a + (d - m) ** 2, 0) / Math.max(1, diffs.length - 1),
    );
    out.push({
      id: sib.id,
      mean: mean(mine),
      deltaVsDeclared: m,
      ci95: 1.96 * sd / Math.sqrt(diffs.length),
    });
  }
  return out.sort((a, b) => b.deltaVsDeclared - a.deltaVsDeclared);
}

/**
 * Plays ONE seed under a named ladder rung and returns the score.
 *
 * Exported so `staking.ts` drives the SAME policies this file measures, rather
 * than a second copy of them. Two implementations of a ladder is the drift this
 * repository forbids everywhere else, and a staking simulation ranking a
 * different set of agents than the balance harness would be comparing two
 * different games.
 */
export function ladderScores(config: RoundConfig, seed: number, rung: string): number {
  const table: Record<string, { p: Policy; reveal: 'none' | 'flows' | 'links' }> = {
    blind: { p: blind, reveal: 'none' },
    greedy: { p: greedy, reveal: 'none' },
    chargeAware: { p: chargeAware, reveal: 'none' },
    neighbourAware: { p: neighbourAware, reveal: 'none' },
    expectedPayout: { p: expectedPayout, reveal: 'none' },
    regionFlow: { p: regionFlow, reveal: 'none' },
    regionOracle: { p: regionOracle, reveal: 'flows' },
    clairvoyant: { p: clairvoyant, reveal: 'links' },
  };
  const entry = table[rung];
  if (entry === undefined) throw new RangeError(`ladderScores: unknown rung ${rung}`);
  return playOne(seed, config, entry.p, entry.reveal).score;
}
