// foundry/chem/weights.ts — the dice are loaded by a search, not by a preference.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FINDING THIS ANSWERS.
//
// Round 4 of the independent audit accepted the density and rejected the
// sharpness:
//
//   "The scarcity (4.9 options) is correct and provides a good density for a
//    puzzle. However, the 'sharpness' is inconsistent. If the best option is only
//    1.5x the median on only 55% of playable boards, nearly half your puzzles are
//    'flat,' offering no clear optimal solution."
//
// Flatness is not a thing to argue about. It is a consequence of the face
// distribution, that distribution is a six-number vector, and whether a given
// vector produces sharp boards is measurable. So it is searched.
//
// `RoundConfig.faceWeights` already exists for exactly this and
// `verify-montecarlo` already treats it as the one knob that decides fairness,
// so nothing new is being invented — the knob is being turned by measurement
// instead of by hand.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE FITNESS MEASURES, AND WHY FOUR TERMS RATHER THAN ONE.
//
// Maximising sharpness alone has an obvious degenerate solution, and it is worth
// naming because a single-term fitness would have found it: make one molecule
// enormously valuable and very rare. Every board then has a clear best move and
// the game is a hunt for one tile pattern. Sharp, and terrible.
//
//   SHARPNESS     is the best move clearly better than the median one? The
//                 auditor's metric, kept in the auditor's terms.
//   FIRST-DRAW    what fraction of boards are playable WITHOUT a redraw? The
//                 redraw guarantees no dead board, but leaning on it is a patch;
//                 a distribution that rarely needs it is better than one that
//                 needs it constantly.
//   DENSITY       options per board, against the band the auditor passed. Both
//                 directions are failures: too few is frustrating, too many is
//                 the matching game round 3 objected to.
//   DIVERSITY     how much of the molecule library actually turns up. This is
//                 the EDUCATIONAL term. A distribution that only ever yields H2
//                 and O2 is sharp, dense, playable, and teaches two facts.
//
// Geometric mean, so a zero anywhere is fatal — the same discipline the belief
// search used, for the same reason: a sum lets a design buy a zero.

import { MOLECULES } from '../../game/chem/library.js';
import { drawPlayableBoard, isPlayable, playableMoves } from '../../game/chem/board.js';
import { makeRng } from '../../engine/sim/world-gen.js';

/** Weights over faces 1..6. Index 0 is unused, matching `FACE_WEIGHTS`. */
export type Weights = readonly number[];

/** The measured properties of one weight vector, before scoring. */
export interface Traits {
  /** Fraction of boards where the best move scores >= 1.5x the median. */
  readonly sharpness: number;
  /** Fraction of boards playable on the first draw, with no redraw. */
  readonly firstDraw: number;
  /** Mean playable molecules per board. */
  readonly density: number;
  /** Fraction of the library that appeared at least once. */
  readonly diversity: number;
}

/**
 * The auditor's own threshold, kept verbatim rather than retuned.
 *
 * Using its number means the result can be reported back in the terms the
 * objection was raised in. Choosing a friendlier one would be answering a
 * different question and calling it the same.
 */
export const SHARP_RATIO = 1.5;

/**
 * The density band, from what the audit accepted and rejected.
 *
 * 4.9 options per board was called "correct... a good density". 10.3 was called
 * too many. Below about 2 there is barely a decision. So the band is [2, 8] with
 * the accepted value inside it, and the endpoints are the two verdicts rather
 * than two numbers somebody liked.
 */
export const DENSITY_MIN = 2;
export const DENSITY_MAX = 8;

export function measure(weights: Weights, boards: number, seed: number): Traits {
  let sharp = 0;
  let firstDraw = 0;
  let options = 0;
  let scored = 0;
  const seen = new Set<string>();

  for (let b = 0; b < boards; b += 1) {
    const rng = makeRng(seed + b * 977);
    let drawn: { symbols: string[]; draws: number };
    try {
      drawn = drawPlayableBoard(rng, weights);
    } catch {
      // A distribution that cannot produce a playable board at all is not a
      // candidate. Returning zeros lets the geometric mean reject it rather
      // than letting an exception abort the whole search.
      return { sharpness: 0, firstDraw: 0, density: 0, diversity: 0 };
    }
    if (drawn.draws === 1) firstDraw += 1;

    const moves = playableMoves(drawn.symbols);
    options += moves.length;
    for (const m of moves) seen.add(m.formula);
    if (moves.length === 0) continue;

    const energies = moves.map((m) => m.energy).sort((a, z) => z - a);
    const best = energies[0]!;
    const median = energies[Math.floor(energies.length / 2)]!;
    scored += 1;
    // A board with ONE option is trivially "sharp" and is not what the auditor
    // meant. Only boards offering a choice can be flat or sharp at all.
    if (energies.length > 1 && best >= median * SHARP_RATIO) sharp += 1;
  }

  return {
    sharpness: scored === 0 ? 0 : sharp / scored,
    firstDraw: firstDraw / boards,
    density: options / boards,
    diversity: seen.size / MOLECULES.length,
  };
}

/** Density scored as a band: 1 inside it, falling off outside. */
function densityScore(d: number): number {
  if (d >= DENSITY_MIN && d <= DENSITY_MAX) return 1;
  if (d < DENSITY_MIN) return Math.max(0, d / DENSITY_MIN);
  return Math.max(0, DENSITY_MAX / d);
}

export function fitness(t: Traits): number {
  const terms = [t.sharpness, t.firstDraw, densityScore(t.density), t.diversity];
  if (terms.some((v) => v <= 0)) return 0;
  return Math.exp(terms.reduce((a, v) => a + Math.log(v), 0) / terms.length);
}

/** Weights are integers, so a distribution is exactly reproducible. */
const MIN_W = 0;
const MAX_W = 16;

function mutate(w: Weights, rng: () => number, strength: number): number[] {
  const out = [...w];
  for (let f = 1; f <= 6; f += 1) {
    const delta = (Math.abs(rng()) % (2 * strength + 1)) - strength;
    out[f] = Math.max(MIN_W, Math.min(MAX_W, (out[f] ?? 0) + delta));
  }
  // A vector of all zeros cannot draw anything; keep at least one bonding face.
  if (out.slice(1, 5).every((v) => v === 0)) out[1 + (Math.abs(rng()) % 4)] = 1;
  return out;
}

export interface Evolved {
  readonly weights: number[];
  readonly traits: Traits;
  readonly fitness: number;
}

/**
 * Hill-climbs the face distribution.
 *
 * Small population, few generations, and a shrinking mutation size. The space is
 * six small integers, so this is not a hard optimisation — the value is in the
 * fitness being MEASURED rather than in the search being clever, and a climb
 * that anyone can re-run and check beats a method nobody will.
 *
 * The board sample is fixed per generation by `seed`, so two vectors are always
 * compared on the same boards. Re-sampling between candidates would make the
 * comparison noise.
 */
export function evolve(
  start: Weights,
  opts: { seed: number; boards: number; population: number; generations: number },
): Evolved {
  const rng = makeRng(opts.seed);
  let best = [...start];
  let bestTraits = measure(best, opts.boards, opts.seed);
  let bestFit = fitness(bestTraits);

  for (let g = 0; g < opts.generations; g += 1) {
    const strength = Math.max(1, Math.round(5 * (1 - g / opts.generations)));
    for (let k = 0; k < opts.population; k += 1) {
      const w = mutate(best, rng, strength);
      const t = measure(w, opts.boards, opts.seed);
      const f = fitness(t);
      if (f > bestFit) { best = w; bestTraits = t; bestFit = f; }
    }
  }
  return { weights: best, traits: bestTraits, fitness: bestFit };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE DECLARED RESULT. `verify-chem` re-runs the search and asserts these.

export const DECLARED_SEED = 606061;
export const DECLARED_BOARDS = 40;
export const DECLARED_POPULATION = 14;
export const DECLARED_GENERATIONS = 12;

/**
 * Written by the search. Do not hand-edit; re-run and re-declare.
 *
 * ── WHAT IT FOUND, AGAINST THE UNIFORM WEIGHTS THAT SHIPPED ─────────────────
 *
 *                      faces 1-6        sharp  firstDraw  density  diversity
 *     uniform      [4, 4, 4, 4, 4, 4]     63%       98%       5.1        56%
 *     evolved      [5, 8, 9, 8, 7, 2]     93%      100%       6.8        63%
 *
 * The auditor's objection was that "nearly half your puzzles are flat". Flat
 * boards go from 37% to 7%, density stays inside the band it passed, no board
 * needs a redraw at all, and more of the library shows up than before.
 *
 * ── AND WHAT IT MEANS, WHICH IS NOT WHAT A CHEMIST WOULD GUESS ──────────────
 *
 * Valence 1 — hydrogen and the halogens — comes out LOWEST of the four bonding
 * faces, at 5. That is the opposite of elemental abundance, where hydrogen
 * dominates everything. The search has a reason and it is a game reason: cheap
 * two-atom molecules like H2, HF and HCl are always available and always score
 * little, so a hydrogen-rich board is crowded with options that are all equally
 * unexciting. Thinning them is what makes the best move stand out.
 *
 * **This is a play distribution, not an abundance distribution, and the game
 * must not imply otherwise.** Nothing here claims the board samples the real
 * universe; it claims each TILE obeys real valence and each MOLECULE is real.
 * Those are the claims `verify-chem` checks, and the weights are outside them
 * on purpose.
 */
export const DECLARED_WEIGHTS: readonly number[] = [0, 5, 8, 9, 8, 7, 2];
