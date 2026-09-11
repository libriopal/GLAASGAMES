// foundry/visual/evolve.ts — the fitness function, and the two searches it drives.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE HARD PART IS NOT THE SEARCH. IT IS HAVING A GROUND TRUTH TO SEARCH AGAINST.
//
// A visual search is usually vacuous because nobody can say what a picture is
// FOR, so the fitness function ends up measuring the author's taste with extra
// steps. Here there is a fact of the matter. The lattice has a real prevailing
// flow per region — `regionFlows` returns it — and a belief assembled from
// observations either points that way or does not. So "a right belief and a
// wrong belief must look different" is not an aesthetic preference. It is a
// measurable property of a function from beliefs to marks, and an encoding that
// fails it is broken in the same sense a wrong payout is broken.
//
// The decoy is the reason this has teeth. It is not "no evidence"; it is a
// COHERENT, CONFIDENT, WRONG belief — the same cells observed, flowing the
// opposite way. An encoding that shows only how much evidence there is will
// render the decoy identically to the truth and will score zero, which is the
// correct verdict on it.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO SEARCHES, AND WHY ONLY ONE OF THEM IS EVOLUTIONARY.
//
// The structural space is 144 members. Running a genetic algorithm over 144
// items would be theatre: enumeration visits every one of them, is exact, admits
// no seed-dependence, and costs less. So the structure is ENUMERATED.
//
// The continuous space — `FormParams`, four reals — cannot be enumerated at any
// useful resolution, and that is where mutation and selection actually earn
// their place. So the parameters are EVOLVED, under the identical fitness.
//
// Using the expensive method where the cheap one is exact would be a decoration,
// and this file declines to add one.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE FITNESS IS A GEOMETRIC MEAN.
//
// The four properties can be traded off, and a sum would let an encoding buy a
// zero. The two obvious degenerate designs are exactly that trade:
//
//   an INERT display     perfect stability, zero responsiveness
//   a JUMPY display      perfect responsiveness, zero stability
//
// Under a sum both score respectably. Under a geometric mean a zero in any term
// is fatal, which is the honest reading: a readout you cannot read during play
// and a readout that never moves are both failures, not compromises.

import {
  type Candidate,
  type FormParams,
  type Mark,
  DEFAULT_PARAMS,
  PARAM_BOUNDS,
  encodings,
  marksDistance,
} from './encodings.js';
import { EMPTY_BELIEF, type BeliefState, type Observation, observe } from './belief.js';
import { BOARD_H, BOARD_W, Board, NO_LINK, OFFSET_LINK } from '../../lattice/board.js';
import { REGION, generateLattice, regionFlows } from '../../lattice/lattice-gen.js';
import { makeRng } from '../../engine/sim/world-gen.js';
import { LC_INVISIBLE, LC_LARGE_UI } from '../../web/theme.js';
import { rampLc } from '../../web/lc-ramp.js';

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

/**
 * The widget's size in CSS pixels at the narrowest supported phone.
 *
 * Legibility is expressed in widget widths everywhere else in this file; this is
 * the one place the abstraction is cashed out, so a threshold in mark radii can
 * be checked against a threshold in pixels.
 */
export const WIDGET_PX = 96;

/**
 * The smallest mark a player can read rather than merely notice.
 *
 * `web/board4d.ts` established 5 px as that threshold when it measured plane
 * separation, and the same number applies here for the same reason: below it a
 * difference is present in the data and absent from the player. 2.5 widget-width
 * radii at 96 px is a 5 px diameter.
 */
export const MIN_MARK_R = 2.5 / WIDGET_PX;

/**
 * The absolute floor a display's discrimination must clear, in the same units
 * `marksDistance` returns.
 *
 * ── WHY A RELATIVE RANKING IS NOT ENOUGH, PER THE INDEPENDENT AUDIT ─────────
 *
 * `score` normalises against the best in the field, and asked what that can
 * hide, the auditor said: it "makes the score relative to a potentially mediocre
 * population, masking the fact that the entire candidate set might be
 * functionally useless."
 *
 * That is true and the relative scale cannot answer it, because no amount of
 * ranking tells you whether first place is any good. So there is one absolute
 * number, and it is derived rather than chosen: two renderings that differ by
 * less than the smallest mark a player can resolve do not differ, whatever a
 * ranking says about them. `MIN_MARK_R` is that resolution, and a display whose
 * worst-case right-versus-wrong separation falls under it is failing in
 * absolute terms. `verify-belief` B13 asserts the declared winner clears it.
 */
export const MIN_DISCRIMINATION = MIN_MARK_R;

// ─────────────────────────────────────────────────────────────────────────────
// GROUND TRUTH.

/**
 * One evidence stream and the coherent, confident, WRONG beliefs it is measured
 * against.
 *
 * ── THE INDEPENDENT AUDIT'S ONE LANDED HIT ──────────────────────────────────
 *
 * This carried a single decoy: the same cells flowing the opposite way. Asked
 * what kind of wrong belief that fails to test, the auditor answered:
 *
 *   "The decoy only tests for directional reversal, failing to account for
 *    structural errors like misidentified links or incorrect node connections,
 *    which matters because players are far more likely to hallucinate a
 *    connection than to simply reverse a direction."
 *
 * That is correct and it was the easy case all along. A reversal is 180 degrees
 * away in exactly the channel the winning encoding spends its whole budget on,
 * so any display that encodes direction at all separates it. The error a player
 * actually makes — "this region flows north" when it flows east — is a QUARTER
 * turn, and nothing here tested it.
 *
 * So a trial now carries a family, and `measure` takes discrimination as the
 * WORST case across the family rather than the friendliest one. An encoding that
 * separates a reversal and merges a quarter turn now scores as what it is.
 */
export interface Trial {
  readonly seed: number;
  readonly region: number;
  /** Observations that follow the lattice's real links. */
  readonly truth: readonly Observation[];
  /**
   * Wrong beliefs over the same cells, hardest last. Each is internally
   * consistent — a player could hold any of them with complete confidence.
   */
  readonly decoys: readonly (readonly Observation[])[];
}

/** Names of the decoy family, in the order `Trial.decoys` holds them. */
export const DECOY_KINDS = ['reversed', 'quarter-left', 'quarter-right'] as const;

function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < BOARD_W && row >= 0 && row < BOARD_H;
}

/**
 * Builds one trial: what a player would witness banking cells in one region,
 * and what they would witness if the region flowed the other way.
 *
 * The decoy is generated from the region's PREVAILING direction reversed rather
 * than from random noise, because random noise is easy to tell apart. The
 * adversarial case for a belief display is a wrong answer held confidently.
 */
export function trial(seed: number, region: number, turns: number): Trial {
  const board = new Board();
  generateLattice(board, seed);
  const flows = regionFlows(seed);
  const regionsPerRow = BOARD_W / REGION;
  const prevailing = flows[region] ?? 0;
  const against = (prevailing + 2) % 4;

  const rc = (region % regionsPerRow) * REGION;
  const rr = ((region / regionsPerRow) | 0) * REGION;

  const rng = makeRng(seed ^ (region * 0x9e37));
  const truth: Observation[] = [];
  // One stream per member of DECOY_KINDS: against, quarter left, quarter right.
  const wrongDirs = [against, (prevailing + 1) % 4, (prevailing + 3) % 4];
  const decoys: Observation[][] = wrongDirs.map(() => []);

  for (let t = 0; truth.length < turns && t < turns * 12; t += 1) {
    const col = rc + (Math.abs(rng()) % REGION);
    const row = rr + (Math.abs(rng()) % REGION);
    const from = Board.indexOf(col, row);
    const link = board.get(from, OFFSET_LINK);
    if (link === NO_LINK) continue;

    // Every decoy in the family must be representable from this cell, or the
    // families would be built over different cells and the comparison between
    // them would be confounded by geometry rather than by direction.
    const targets = wrongDirs.map((d) => [col + DX[d]!, row + DY[d]!] as const);
    if (targets.some(([c, r]) => !inBounds(c, r))) continue;

    const turn = truth.length;
    truth.push({ from, to: link, turn });
    targets.forEach(([c, r], i) => decoys[i]!.push({ from, to: Board.indexOf(c, r), turn }));
  }

  return { seed, region, truth, decoys };
}

/** A spread of trials across seeds and regions. */
export function trials(count: number, turns = 8): readonly Trial[] {
  const regionsPerRow = BOARD_W / REGION;
  const regionCount = regionsPerRow * (BOARD_H / REGION);
  const out: Trial[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = trial(1000 + i * 7, i % regionCount, turns);
    // A trial with no usable observations teaches nothing and would dilute every
    // measurement equally, which hides rather than helps.
    if (t.truth.length >= 3 && t.decoys.every((d) => d.length === t.truth.length)) out.push(t);
  }
  return out;
}

/** Folds a stream of observations into a belief. */
export function believe(os: readonly Observation[]): BeliefState {
  let b = EMPTY_BELIEF;
  for (const o of os) b = observe(b, o);
  return b;
}

// ─────────────────────────────────────────────────────────────────────────────
// MEASUREMENT.

/** The four properties, as measured — before any normalisation. */
export interface Raw {
  readonly discrimination: number;
  readonly stability: number;
  readonly responsiveness: number;
  readonly legibility: number;
}

/**
 * The contrast a mark's intensity holds against the ground.
 *
 * This is `rampLc` and nothing else — brightness only, hue pinned, per the
 * palette's rule that a magnitude never travels on hue. It is linear in |Lc|
 * rather than in sRGB because the first sweep of the sRGB ramp showed a fifth of
 * it sitting below the disappearance floor; `web/lc-ramp.ts` records the numbers
 * and the reasoning.
 */
export function markLc(intensity: number): number {
  return Number.isFinite(intensity) ? rampLc(intensity) : 0;
}

/**
 * Is this mark one a player can actually see?
 *
 * ── THE FIRST VERSION OF THIS FUNCTION WAS WRONG AND THE MEASUREMENT SAID SO ─
 *
 * It required every mark to clear `LC_LARGE_UI` (75). Swept, the ramp reaches 75
 * only at intensity 0.9525 — so 96 of 144 candidates scored exactly zero
 * legibility, and every survivor scored exactly 0.375. A property that returns
 * the same number for every candidate that passes it is not measuring the
 * candidates; it is measuring one constant I chose.
 *
 * The mistake was applying a TEXT criterion to a GRAPHIC. `theme.ts` is explicit
 * that 75 is "the floor for large UI components" and 15 "the point at which text
 * disappears". A belief mark is not read as a glyph — it is seen as a position
 * and a brightness — so the floor that applies to an individual mark is
 * disappearance, not readability.
 *
 * The readability floor still applies, but to the WIDGET, not to each mark: see
 * `readableWidget`. Splitting them is what makes the pair informative — one
 * catches marks that vanish, the other catches an encoding whose intensity term
 * never gets bright enough for the component to register at all.
 */
export function legible(m: Mark): boolean {
  if (!Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.r)) return false;
  if (!Number.isFinite(m.intensity)) return false;
  if (m.r < MIN_MARK_R) return false;
  // ── THE WHOLE DISC, NOT ITS CENTRE ────────────────────────────────────────
  //
  // The first version checked only that the centre lay in [0,1]. The search
  // immediately exploited it: `reach` and `gain` both pinned at their upper
  // bounds, because pushing marks further apart bought discrimination and
  // nothing charged for the half of the mark hanging off the widget. The bound,
  // not the fitness, was choosing the layout.
  //
  // Requiring containment makes the trade real — reach and size now compete for
  // the same finite widget — and it is also simply true: a clipped mark is a
  // different shape from an unclipped one, and the player sees the clip.
  if (m.x - m.r < 0 || m.x + m.r > 1) return false;
  if (m.y - m.r < 0 || m.y + m.r > 1) return false;
  return markLc(m.intensity) >= LC_INVISIBLE;
}

/**
 * Does this rendering read as a UI component at all?
 *
 * At least one mark must clear the large-UI floor. An encoding whose intensity
 * term tops out at 0.4 produces a widget that is present, dim and ignorable in
 * every state it can reach — which the per-mark check cannot catch, because each
 * individual mark is above the disappearance floor.
 */
export function readableWidget(ms: readonly Mark[]): boolean {
  return ms.some((m) => Number.isFinite(m.intensity) && markLc(m.intensity) >= LC_LARGE_UI);
}

/**
 * Measures one candidate at one parameter vector, over the whole trial set.
 *
 * Stability and responsiveness are measured from the SAME prefix belief, so the
 * only difference between them is whether the next observation agrees. Measuring
 * them from different prefixes would let board geometry masquerade as a property
 * of the encoding.
 */
export function measure(c: Candidate, p: FormParams, ts: readonly Trial[]): Raw {
  let disc = 0;
  let stab = 0;
  let resp = 0;
  let marks = 0;
  let ok = 0;
  let renders = 0;
  let readable = 0;
  let pairs = 0;

  const tally = (ms: readonly Mark[]): void => {
    renders += 1;
    if (readableWidget(ms)) readable += 1;
    for (const m of ms) {
      marks += 1;
      if (legible(m)) ok += 1;
    }
  };

  for (const t of ts) {
    const n = t.truth.length;
    const prefix = believe(t.truth.slice(0, n - 1));
    const truthBelief = observe(prefix, t.truth[n - 1]!);
    // The reversal remains the responsiveness probe: it is the sharpest possible
    // contradiction, which is what that property wants.
    const contradicted = observe(prefix, t.decoys[0]![n - 1]!);

    const mTruth = c.encodeWith(truthBelief, p);
    const mPrefix = c.encodeWith(prefix, p);
    const mContra = c.encodeWith(contradicted, p);

    // ── DISCRIMINATION IS THE WORST CASE, NOT THE AVERAGE ──────────────────
    //
    // A mean over the decoy family would let a large, easy separation from the
    // reversal pay for merging a quarter turn, which is precisely the failure
    // the audit named. A display is only as trustworthy as the wrong belief it
    // separates least well.
    let worst = Infinity;
    for (const d of t.decoys) {
      const mDecoy = c.encodeWith(believe(d), p);
      worst = Math.min(worst, marksDistance(mTruth, mDecoy));
      tally(mDecoy);
    }
    disc += worst;
    stab += marksDistance(mPrefix, mTruth);
    resp += marksDistance(mPrefix, mContra);
    pairs += 1;

    tally(mTruth);
    tally(mPrefix);
    tally(mContra);
  }

  if (pairs === 0) return { discrimination: 0, stability: 0, responsiveness: 0, legibility: 0 };
  // The product of two fractions: how many marks survive, and how many
  // renderings register as a component. Either failing outright zeroes the term,
  // which the geometric mean then treats as fatal — correctly, since a display
  // nobody can see has no other virtues worth weighing.
  const markShare = marks === 0 ? 0 : ok / marks;
  const widgetShare = renders === 0 ? 0 : readable / renders;
  return {
    discrimination: disc / pairs,
    stability: stab / pairs,
    responsiveness: resp / pairs,
    legibility: markShare * widgetShare,
  };
}

export interface Scored {
  readonly id: string;
  readonly raw: Raw;
  /** Each property mapped to 0..1 against the best in the field. */
  readonly scores: Raw;
  readonly fitness: number;
}

/**
 * The denominators that turn raw measurements into 0..1 scores.
 *
 * There is no absolute unit for "how different two pictures are", so an absolute
 * target would be a constant somebody made up. The scale is therefore taken from
 * the field — which makes the claim exactly as strong as it should be: *this* is
 * the best member of *this* grammar, and nothing more.
 *
 * It is a separate value, and passed explicitly, because a fitness whose
 * denominators move while it is being optimised is not a fitness. See
 * `evolveParams`.
 */
export interface Scale {
  readonly disc: number;
  readonly stab: number;
  readonly resp: number;
}

export function scaleOf(field: readonly { readonly raw: Raw }[]): Scale {
  return {
    disc: Math.max(...field.map((f) => f.raw.discrimination), 0),
    stab: Math.max(...field.map((f) => f.raw.stability), 0),
    resp: Math.max(...field.map((f) => f.raw.responsiveness), 0),
  };
}

export function scoreOne(raw: Raw, s: Scale): { scores: Raw; fitness: number } {
  const scores: Raw = {
    discrimination: s.disc === 0 ? 0 : Math.min(1, raw.discrimination / s.disc),
    // Lower is better: the jumpiest member of the field scores 0.
    stability: s.stab === 0 ? 1 : Math.max(0, 1 - raw.stability / s.stab),
    responsiveness: s.resp === 0 ? 0 : Math.min(1, raw.responsiveness / s.resp),
    legibility: raw.legibility,
  };
  const terms = [scores.discrimination, scores.stability, scores.responsiveness, scores.legibility];
  // Geometric mean. A zero anywhere is fatal; see the header.
  const fitness = terms.some((v) => v <= 0)
    ? 0
    : Math.exp(terms.reduce((a, v) => a + Math.log(v), 0) / terms.length);
  return { scores, fitness };
}

/** Normalises a field of raw measurements against its own best and scores it. */
export function score(field: readonly { readonly id: string; readonly raw: Raw }[]): readonly Scored[] {
  const s = scaleOf(field);
  return field.map((f) => ({ id: f.id, raw: f.raw, ...scoreOne(f.raw, s) }));
}

/** Exhaustive over the structural grammar at one fixed parameter vector. */
export function searchStructures(ts: readonly Trial[], p: FormParams = DEFAULT_PARAMS): readonly Scored[] {
  const field = encodings().map((c) => ({ id: c.id, raw: measure(c, p, ts) }));
  return [...score(field)].sort((a, b) => b.fitness - a.fitness);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE EVOLUTIONARY HALF.

const KEYS = ['reach', 'base', 'gain', 'floor'] as const;

function clampParams(p: FormParams): FormParams {
  const out: Record<string, number> = {};
  for (const k of KEYS) {
    const [lo, hi] = PARAM_BOUNDS[k];
    out[k] = Math.max(lo, Math.min(hi, p[k]));
  }
  return out as unknown as FormParams;
}

function mutate(p: FormParams, rng: () => number, sigma: number): FormParams {
  const out: Record<string, number> = {};
  for (const k of KEYS) {
    const [lo, hi] = PARAM_BOUNDS[k];
    // Gaussian-ish: the mean of two uniforms, centred, scaled by the range.
    const u = (Math.abs(rng() % 1000) / 1000 + Math.abs(rng() % 1000) / 1000) / 2 - 0.5;
    out[k] = p[k] + u * (hi - lo) * sigma;
  }
  return clampParams(out as unknown as FormParams);
}

export interface Evolved {
  readonly params: FormParams;
  readonly raw: Raw;
  readonly fitness: number;
  readonly generations: number;
}

/**
 * Hill-climbs the continuous vector for one structure.
 *
 * ── THE NORMALISATION PROBLEM, AND HOW IT IS HANDLED ────────────────────────
 *
 * `score` normalises against a field, and during parameter evolution the field
 * is the population — which moves. A fitness that changes because its
 * denominators moved is not a fitness, and a generation could "improve" while
 * every member got worse.
 *
 * So the denominators are FROZEN from the structural search's field and passed
 * in. Every generation is then scored on the same scale, and a rise is a real
 * one. This is the same discipline `verify-parimutuel` applies to pool closure:
 * fix the divisor before the comparison, not during it.
 */
export function evolveParams(
  c: Candidate,
  ts: readonly Trial[],
  scale: Scale,
  opts: { seed: number; population: number; generations: number },
): Evolved {
  const rng = makeRng(opts.seed);

  // ── THE PLATEAU, AND WHY THE CLIMB NEEDS A SECOND KEY ─────────────────────
  //
  // The geometric mean returns exactly zero whenever any term is zero, which is
  // the right published verdict and a catastrophic search surface. Measured on
  // the first co-evolution run: 96 of 144 structures never moved off
  // `DEFAULT_PARAMS` at all. Their intensity term could not reach the widget's
  // readability floor, so legibility was zero, so fitness was zero — and so was
  // every mutation's, until the luminance floor crossed 0.84 in one jump. The
  // climb was standing on a flat zero and could not see the cliff edge from it.
  //
  // A ranking produced that way reports which structures happened to start in a
  // non-zero region, not which are good. So acceptance is LEXICOGRAPHIC: the
  // published fitness first, and on the plateau the arithmetic mean of the same
  // four scores, which is smooth and non-zero and points the right way. The
  // surrogate never enters the published number; it only tells the climb which
  // way is uphill while the real fitness is blind.
  const surrogate = (s: Raw): number =>
    (s.discrimination + s.stability + s.responsiveness + s.legibility) / 4;

  let best = DEFAULT_PARAMS;
  let bestRaw = measure(c, best, ts);
  let bestScored = scoreOne(bestRaw, scale);
  let bestFit = bestScored.fitness;
  let bestSur = surrogate(bestScored.scores);

  for (let g = 0; g < opts.generations; g += 1) {
    // Sigma anneals: broad exploration first, then refinement. Without it the
    // climb either never finds the basin or never settles in it.
    const sigma = 0.45 * (1 - g / opts.generations) + 0.05;
    for (let k = 0; k < opts.population; k += 1) {
      const p = mutate(best, rng, sigma);
      const raw = measure(c, p, ts);
      const sc = scoreOne(raw, scale);
      const sur = surrogate(sc.scores);
      const better = sc.fitness > bestFit || (sc.fitness === bestFit && sur > bestSur);
      if (better) {
        best = p;
        bestRaw = raw;
        bestFit = sc.fitness;
        bestSur = sur;
      }
    }
  }

  return { params: best, raw: bestRaw, fitness: bestFit, generations: opts.generations };
}

export interface CoEvolved extends Scored {
  readonly params: FormParams;
}

/**
 * The whole search: enumerate the structures, evolve each one's parameters, then
 * rank them at their own best.
 *
 * ── WHY EVERY STRUCTURE GETS ITS OWN PARAMETER SEARCH ───────────────────────
 *
 * The first run of this search ranked all 144 structures at `DEFAULT_PARAMS`,
 * whose luminance floor is zero. Measured, that floor is disastrous: the ramp
 * from `GROUND_RAISED` to `CYAN` does not clear the large-UI contrast floor
 * until intensity 0.9525, so 96 of the 144 scored exactly zero and the survivors
 * all scored an identical 0.373-0.375. The ranking was reporting my choice of
 * one constant, dressed as a property of the encodings.
 *
 * Ranking a structure at a parameter vector it did not choose is the visual
 * equivalent of benchmarking a policy at somebody else's hyperparameters. So
 * each structure is evolved first and judged at its own best, and the comparison
 * is then between designs rather than between accidents.
 *
 * THREE PASSES, because the scale has to be frozen before it can be optimised
 * against:
 *
 *   1. measure every structure at `DEFAULT_PARAMS` -> a reference `Scale`.
 *   2. evolve each structure's parameters against that frozen scale.
 *   3. re-derive the scale from the evolved field and re-score everyone on it,
 *      so the published ranking is one common yardstick.
 *
 * Pass 2 is a hill climb on a monotone transform of the raw measurements, so
 * freezing the denominators does not change what it is climbing — it only stops
 * the number from moving underneath it.
 */
export function coEvolve(
  ts: readonly Trial[],
  opts: { seed: number; population: number; generations: number },
): readonly CoEvolved[] {
  const cs = encodings();

  const pass1 = cs.map((c) => ({ id: c.id, raw: measure(c, DEFAULT_PARAMS, ts) }));
  const frozen = scaleOf(pass1);

  const pass2 = cs.map((c, i) => {
    const e = evolveParams(c, ts, frozen, { ...opts, seed: opts.seed + i * 977 });
    return { id: c.id, raw: e.raw, params: e.params };
  });

  const final = scaleOf(pass2);
  return pass2
    .map((f) => ({ id: f.id, raw: f.raw, params: f.params, ...scoreOne(f.raw, final) }))
    .sort((a, b) => b.fitness - a.fitness);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE DECLARED RESULT.
//
// These are written by the search, not chosen. `verify-belief` re-runs the
// search and asserts they are still what it produces — the M10 pattern, where a
// declared best that quietly stops being the best fails the suite rather than
// sitting in a comment nobody re-checks.

/** The search's inputs. Changing any of these changes the answer. */
export const DECLARED_TRIALS = 24;
export const DECLARED_TURNS = 8;
export const DECLARED_SEED = 20260910;
export const DECLARED_POPULATION = 16;
export const DECLARED_GENERATIONS = 10;

/**
 * The winner at the declared inputs.
 *
 * An arc of five marks swept along the belief's resultant direction, its length
 * set by the resultant's magnitude, its brightness by how much evidence stands
 * behind it. Fitness 0.6412 against a runner-up at 0.6279, measured against the WORST member of the
 * decoy family rather than the friendliest.
 */
export const DECLARED_BEST_ID = 'arc/resultant/magnitude/weight';

/**
 * ── WHAT IS ACTUALLY STABLE, AND WHAT IS A COIN FLIP ────────────────────────
 *
 * Swept over three trial sets x three search seeds, the FORM, the ANGLE and the
 * SIZE were identical in all nine runs — `arc`, `resultant`, `magnitude`. The
 * intensity term alternated between `weight` and `coherence`, whose fitnesses
 * differ by one to two percent.
 *
 * So the robust finding is the family, and `verify-belief` asserts the family
 * across seeds rather than the exact string, which would be flaky by
 * construction. The exact winner is pinned too, at the declared inputs only.
 */
export const DECLARED_BEST_FAMILY = 'arc/resultant/magnitude/';

/** Evolved, not chosen. Reproduced exactly by `verify-belief` from the seed. */
export const DECLARED_BEST_PARAMS: FormParams = {
  reach: 0.47739319999999996,
  base: 0.03276840000000001,
  gain: 0.08390400000000002,
  floor: 0.77601175,
};
