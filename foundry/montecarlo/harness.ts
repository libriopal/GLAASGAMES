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
// value does a TRIVIAL strategy already capture? If a one-line heuristic gets
// most of what perfect information gets, the game is exploitable in the sense
// that matters commercially — the interesting decisions are decorative. That is
// `dominance`, and it is bounded by a clairvoyant ceiling exactly as
// `verify-learnable` E7 bounds its own claim.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE LADDER IS DELIBERATELY SIMPLER THAN verify-learnable's, AND CALIBRATED
// AGAINST IT.
//
// `verify-learnable` has seven policies and 45KB of argument about them. This
// has five, because it must run 69 variants rather than one game. Two
// instruments measuring the same property is exactly the drift this repo
// forbids — so `verify-montecarlo` M0 CALIBRATES this ladder against the
// shipped game, whose numbers are already known and audited. An instrument that
// cannot reproduce a result we have already measured has no business ranking
// variants we have not.

import { CELL_COUNT, EMPTY, NO_LINK, OFFSET_CHARGE, OFFSET_FACE } from '../../lattice/board.js';
import { type RoundConfig, playRound } from '../../lattice/round.js';

/** A candidate variant: a name, an axis it probes, and the config it means. */
export interface Variant {
  readonly id: string;
  readonly axis: string;
  readonly note: string;
  readonly config: RoundConfig;
}

/** What one agent scored, over the sweep. */
export interface AgentResult {
  readonly mean: number;
  readonly stdev: number;
}

export interface VariantMetrics {
  readonly id: string;
  readonly axis: string;
  /** Mean score of each rung of the ladder. */
  readonly blind: number;
  readonly greedy: number;
  readonly chargeAware: number;
  readonly regional: number;
  readonly clairvoyant: number;
  /**
   * (best learnable − blind) / (clairvoyant − blind). The literature's skill
   * gap, normalised by what is actually achievable on this board rather than by
   * 100% — the same correction E7 needed when an unbounded ratio flattered it.
   */
  readonly skillDepth: number;
  /**
   * (best TRIVIAL policy − blind) / (clairvoyant − blind). How much of the
   * achievable value a one-line heuristic already takes. High = exploitable.
   */
  readonly dominance: number;
  /** Room left for skill above the best trivial strategy. */
  readonly headroom: number;
  /** Fraction of rounds that conceded to stagnation. The stalemate metric. */
  readonly stagnation: number;
  /** Chi-square of the opening deal against UNIFORM. The fairness gate. */
  readonly faceChiSquare: number;
  /** Score spread across seeds for a FIXED policy — seed luck vs skill. */
  readonly seedVariance: number;
}

type Policy = (observable: Int32Array, links: Int32Array | null, memory: Memory) => number;

interface Memory {
  /** cell -> direction observed to receive its charge, as a cell index. */
  readonly seen: Map<number, number>;
  lastBanked: number;
}

const faceAt = (o: Int32Array, i: number): number => o[i * 3] ?? EMPTY;
const chargeAt = (o: Int32Array, i: number): number => o[i * 3 + 2] ?? 0;

/** Every cell that can legally be banked this turn. */
function open(o: Int32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) if (faceAt(o, i) !== EMPTY) out.push(i);
  return out;
}

// ── the ladder ─────────────────────────────────────────────────────────────
// Rungs 1-3 are TRIVIAL: each is a single comparison a player could describe in
// one sentence. If one of them approaches the ceiling, the variant is
// exploitable and no amount of design elsewhere rescues it.

/** Rung 0 — no information used at all. The floor every other rung is measured against. */
const blind: Policy = (o) => {
  const cells = open(o);
  return cells.length === 0 ? 0 : cells[0]!;
};

/** Rung 1 — "bank the biggest number". The single most likely dominant strategy. */
const greedy: Policy = (o) => {
  const cells = open(o);
  let best = cells[0] ?? 0;
  for (const c of cells) if (faceAt(o, c) > faceAt(o, best)) best = c;
  return best;
};

/** Rung 2 — "bank the most charged". */
const chargeAware: Policy = (o) => {
  const cells = open(o);
  let best = cells[0] ?? 0;
  for (const c of cells) if (chargeAt(o, c) > chargeAt(o, best)) best = c;
  return best;
};

/**
 * Rung 3 — the LEARNABLE one: uses what previous turns disclosed about where
 * charge flows, which is the only rung that needs the game's hidden structure to
 * be inferable at all.
 */
const regional: Policy = (o, _links, mem) => {
  const cells = open(o);
  let best = cells[0] ?? 0;
  let bestScore = -1;
  for (const c of cells) {
    const target = mem.seen.get(c);
    // ── IT MUST SUBSUME THE TRIVIAL RUNGS, OR THE COMPARISON IS RIGGED ──────
    //
    // The payout is face(FED cell) x (1 + charge(banked cell)), so charge is a
    // MULTIPLIER and any policy that ignores it is handicapped. Draft one valued
    // an unknown cell at its own face, which threw the multiplier away and left
    // the learnable rung scoring 50.3 against a one-line charge-chaser's 64.2.
    // Reading that as "the game is exploitable" would have been wrong: it was
    // this policy being worse at arithmetic, not the game being shallow.
    //
    // With no memory of where a cell feeds, the expected face of its target is
    // the mean of a uniform 1..6 — 3.5. Using that as the fallback makes this
    // rung equal to charge-chasing where it knows nothing, and strictly better
    // where it has learned something. Only then does the gap between them mean
    // what `headroom` claims it means.
    const expectedTargetFace = target !== undefined && faceAt(o, target) !== EMPTY
      ? faceAt(o, target)
      : 3.5;
    const value = expectedTargetFace * (1 + chargeAt(o, c));
    if (value > bestScore) { bestScore = value; best = c; }
  }
  return best;
};

/**
 * Rung 4 — the CEILING. Knows the lattice and plays the true payout.
 *
 * Its job is not to be a player. It is to bound every claim below it, so a
 * variant cannot be praised for an edge larger than the information on its
 * board — the failure E7 was rebuilt to avoid.
 */
const clairvoyant: Policy = (o, links) => {
  const cells = open(o);
  if (links === null) return blind(o, links, { seen: new Map(), lastBanked: -1 });
  let best = cells[0] ?? 0;
  let bestScore = -1;
  for (const c of cells) {
    const link = links[c] ?? NO_LINK;
    const live = link !== NO_LINK && faceAt(o, link) !== EMPTY;
    const value = live ? faceAt(o, link) * (1 + chargeAt(o, c)) : faceAt(o, c);
    if (value > bestScore) { bestScore = value; best = c; }
  }
  return best;
};

/**
 * Plays one seed under one policy, learning DURING the round.
 *
 * ── THE FIRST VERSION LEARNED NOTHING, AND THE NUMBERS SAID SO ──────────────
 *
 * Draft one filled `mem.seen` from `r.observations` AFTER `playRound` returned —
 * that is, after the only round that could have used it was over. The regional
 * rung therefore played every turn with an empty memory and degenerated into
 * "bank the biggest face". The output was unmistakable once read: regional
 * scored 46.0 and greedy scored 46.0, to the decimal, and `headroom` came out
 * 0.000 on all 24 survivors. The harness was ranking `chargeAware` and calling
 * it skill.
 *
 * It would have passed the suite. M0 only asked that skill depth be positive,
 * and a trivial rung beating blind satisfies that — the check was true of the
 * wrong quantity. The tell was headroom being identically zero everywhere,
 * which is not a result, it is a signature.
 *
 * The fix is to learn the way a player does: watch the board between turns. If
 * exactly one cell's charge rose after the cell I banked, that is the link, and
 * it is knowable in the moment rather than in hindsight.
 */
function playOne(seed: number, config: RoundConfig, policy: Policy, omniscient: boolean):
  { score: number; conceded: boolean; faces: number[] } {
  const mem: Memory = { seen: new Map(), lastBanked: -1 };
  const faces: number[] = [];
  const probe = omniscient ? playRound(seed, config, () => 0) : null;
  const links = probe ? probe.finalLinks : null;

  let sampled = false;
  let prevCharge: number[] | null = null;

  const r = playRound(seed, config, (observable) => {
    if (!sampled) {
      sampled = true;
      for (let i = 0; i < CELL_COUNT; i += 1) {
        const f = faceAt(observable, i);
        if (f !== EMPTY) faces.push(f);
      }
    }

    // ── LEARN FROM THE TURN THAT JUST RESOLVED, BEFORE CHOOSING THIS ONE ────
    // Diff the charge column against the previous turn. Exactly one cell rising
    // after a bank is the observation the on-screen trail shows a human.
    const nowCharge: number[] = [];
    for (let i = 0; i < CELL_COUNT; i += 1) nowCharge.push(chargeAt(observable, i));
    if (prevCharge !== null && mem.lastBanked >= 0) {
      const risen: number[] = [];
      for (let i = 0; i < CELL_COUNT; i += 1) {
        if (nowCharge[i]! > (prevCharge[i] ?? 0)) risen.push(i);
      }
      if (risen.length === 1) mem.seen.set(mem.lastBanked, risen[0]!);
    }
    prevCharge = nowCharge;

    const choice = policy(observable, links, mem);
    mem.lastBanked = choice;
    return choice;
  });

  return { score: r.score, conceded: r.conceded, faces };
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const stdev = (xs: readonly number[]): number => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/**
 * Chi-square of realised faces against UNIFORM.
 *
 * AGAINST UNIFORM, NOT AGAINST THE VARIANT'S OWN DECLARATION, and the
 * difference is the whole meaning of the check. The first draft compared each
 * variant's dice to the weights that variant declared — so `flat-one-face`, a
 * distribution that puts every ounce of weight on the number 6, scored a
 * perfect 0.0 and sailed through the fairness gate. It was internally
 * consistent: it said it would roll sixes and it rolled sixes.
 *
 * That is conformance, not fairness. **A loaded die that honestly declares
 * itself loaded is still loaded.** The property a player needs is that the
 * faces are uniform, which is exactly what `verify-lattice` L1y asserts of the
 * shipped game, so that is what this measures — regardless of what the variant
 * claims about itself.
 */
export function faceUniformityChiSquare(faces: readonly number[]): number {
  const weights = [0, 1, 1, 1, 1, 1, 1];
  const counts = new Array(7).fill(0) as number[];
  for (const f of faces) if (f >= 1 && f <= 6) counts[f] = (counts[f] ?? 0) + 1;
  const total = counts.reduce((a, b) => a + b, 0);
  const wTotal = weights.slice(1).reduce((a, b) => a + b, 0);
  if (total === 0 || wTotal === 0) return 0;
  let chi = 0;
  for (let f = 1; f <= 6; f += 1) {
    const expected = (total * (weights[f] ?? 0)) / wTotal;
    if (expected <= 0) continue;
    chi += ((counts[f] ?? 0) - expected) ** 2 / expected;
  }
  return chi;
}

/** Runs the whole ladder over `seeds` rounds and reports the metrics. */
export function evaluate(v: Variant, seeds: number): VariantMetrics {
  const run = (p: Policy, omni: boolean) => {
    const scores: number[] = [];
    let conceded = 0;
    const faces: number[] = [];
    for (let s = 1; s <= seeds; s += 1) {
      const r = playOne(s, v.config, p, omni);
      scores.push(r.score);
      if (r.conceded) conceded += 1;
      if (faces.length < 20000) faces.push(...r.faces);
    }
    return { scores, conceded: conceded / seeds, faces };
  };

  const b = run(blind, false);
  const g = run(greedy, false);
  const c = run(chargeAware, false);
  const rg = run(regional, false);
  const cl = run(clairvoyant, true);

  const mb = mean(b.scores);
  const mg = mean(g.scores);
  const mc = mean(c.scores);
  const mr = mean(rg.scores);
  const mcl = mean(cl.scores);

  const ceiling = mcl - mb;
  const bestTrivial = Math.max(mg, mc);
  const bestLearnable = Math.max(mr, bestTrivial);

  return {
    id: v.id,
    axis: v.axis,
    blind: mb,
    greedy: mg,
    chargeAware: mc,
    regional: mr,
    clairvoyant: mcl,
    skillDepth: ceiling <= 0 ? 0 : (bestLearnable - mb) / ceiling,
    dominance: ceiling <= 0 ? 1 : (bestTrivial - mb) / ceiling,
    headroom: mcl - bestTrivial <= 0 ? 0 : (bestLearnable - bestTrivial) / (mcl - bestTrivial),
    stagnation: rg.conceded,
    faceChiSquare: faceUniformityChiSquare(rg.faces),
    seedVariance: stdev(rg.scores),
  };
}
