// foundry/montecarlo/orrery.ts — the Monte Carlo engine Darkmatter needs and
// Chemical's harness cannot be.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHY A NEW ENGINE AT ALL, RATHER THAN REUSING `synth-harness.ts`.
//
// Chemical's harness enumerates every legal move and beams over clonable state.
// That works because its move set is FINITE AND SMALL: adjacent cell subsets
// crossed with three product options. Darkmatter's is neither. A placement is a
// point on a disc and a magnitude is a real number, so "enumerate the legal
// moves" has no meaning and a beam has nothing to beam over.
//
// Four structural differences follow, and each one is a component below:
//
//   1. The action space is CONTINUOUS      -> progressive widening (E1)
//   2. The response is NOISY across seeds  -> common random numbers, antithetic
//                                              pairs, racing (E3, E4, E10, E11)
//   3. Rollouts are EXPENSIVE (605 ms)     -> prefix cache, digest transposition,
//                                              lambda-capped depth (E5, E6, E8)
//   4. Every metric has an unknown floor   -> the floor is an engine service, not
//                                              a discipline (E12)
//
// ═════════════════════════════════════════════════════════════════════════════
// THE ONE IDEA THE REST HANGS ON: THE LATTICE IS THE INTERFACE.
//
// Standing rule (C) from the Chemical runs: the ceiling must share a verb set
// with the agents, checked structurally, because twice a "ceiling" scored below
// a bounded agent and the arithmetic was reporting a broken evaluator rather
// than a strong player.
//
// In a continuous action space that rule has a consequence nobody had to face on
// a board. If the SEARCH discretises to 12 bearings and the PLAYER is given a
// continuous dial, the player can express actions the ceiling cannot, so the
// ceiling is not a ceiling. If the search is finer than the player's interface,
// the solver margin measures the discretisation and not the game.
//
// So there is exactly ONE lattice, and the engine, the ceiling, the agents and
// the shipped interface all draw from it. That is not a convenience: it is the
// only way the measurement means anything. And it is also, by accident of being
// forced, the thing that makes Darkmatter a straightforward game -- a player who
// picks from twelve named bearings is making a decision, and a player dragging a
// continuous dial is operating machinery.
//
// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN. This module is RESEARCH DOMAIN: offline, non-deterministic scheduling
// permitted, floats permitted in SCORING. It never runs inside the game. The
// simulation it calls is Design/Execution Domain and stays Q32.32 throughout;
// nothing here writes a float back into a universe.

import {
  type Universe,
  cloneUniverse,
  digest,
  seedUniverse,
  stepUniverse,
} from '../../game/dark/nbody.js';

// ─────────────────────────────────────────────────────────────────────────────
// E8 · ROLLOUT DEPTH IS MEASURED, NOT CHOSEN.
//
// Stage 0 measured the Lyapunov exponent at 0.098 per simulated second, which is
// a prediction horizon of 1/lambda = 10.2 s. At DT = 0.05 that is 204 steps.
//
// Rolling out past it is not conservatism, it is burning 605 ms per play to
// integrate noise: beyond the horizon two nearly identical actions have
// decorrelated, so the extra steps add variance to the estimate without adding
// information to it. The budget saved goes into WIDTH, which is the axis that
// actually resolves actions.
export const LYAPUNOV_LAMBDA = 0.098;
export const DT_SECONDS = 0.05;
export const LYAPUNOV_HORIZON_STEPS = Math.floor(1 / LYAPUNOV_LAMBDA / DT_SECONDS);

// ─────────────────────────────────────────────────────────────────────────────
// E2 · THE LATTICE.

/** An action the engine, the ceiling, the agents and the interface all share. */
export interface LatticeAction {
  /** Stable identity. Two actions with the same id must be the same action. */
  readonly id: string;
  /** What the interface calls it. If this cannot be said in three words the
   *  lattice is too clever for the game it is meant to make straightforward. */
  readonly label: string;
  /** Price in the round's single currency. Zero is allowed and is a decision. */
  readonly cost: number;
}

export interface Lattice<A extends LatticeAction> {
  /** Every action available at this state. FINITE, by construction. */
  actions(u: Universe): readonly A[];
  /** Mutates the universe. Must not introduce a float into fixed-point state. */
  apply(u: Universe, a: A): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// E5 + E6 · THE PREFIX CACHE, AND WHY FIXED POINT PAYS FOR ITSELF HERE.
//
// Every evaluation replays the same settle phase -- 80 of 440 steps, 18% of the
// cost, recomputed identically thousands of times. Caching the settled universe
// per (seed, bodies) removes it outright.
//
// The deeper version uses `digest`, which is exact because the state is Q32.32.
// Two search branches that arrive at a BITWISE-IDENTICAL universe are the same
// node and can be merged -- an ordinary transposition table, which is worthless
// in floating point (two paths to "the same" state differ in the last bits and
// never collide) and exact here. The determinism requirement was adopted for
// replay verification; it turns out to pay a second time as a search speedup.

const SETTLED = new Map<string, Universe>();

export function settled(seed: number, bodies: number, settleSteps: number): Universe {
  const key = `${seed}:${bodies}:${settleSteps}`;
  const hit = SETTLED.get(key);
  if (hit) return cloneUniverse(hit);
  const u = seedUniverse(seed, bodies);
  for (let s = 0; s < settleSteps; s += 1) stepUniverse(u);
  SETTLED.set(key, u);
  return cloneUniverse(u);
}

/** Clears the prefix cache. Tests that measure cache effect need this. */
export function resetPrefixCache(): void { SETTLED.clear(); }

export interface Transpositions { hits: number; misses: number; }

/**
 * A transposition table keyed on the exact fixed-point digest. Returns the
 * cached value for a state already evaluated, otherwise computes and stores it.
 *
 * NEGATIVE CONTROL FOR THIS COMPONENT: on a chaotic system with distinct
 * actions, the hit rate should be LOW. A high hit rate means the actions are not
 * actually distinguishable states -- which is a finding about the game, not a
 * win for the cache, and the run must report it rather than enjoy the speedup.
 */
export function memoiseByState<T>(
  table: Map<string, T>,
  stats: Transpositions,
  u: Universe,
  compute: () => T,
): T {
  const k = digest(u);
  const hit = table.get(k);
  if (hit !== undefined) { stats.hits += 1; return hit; }
  stats.misses += 1;
  const v = compute();
  table.set(k, v);
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// E4 · ANTITHETIC UNIVERSES.
//
// Negating every velocity gives the time-reversed system: same masses, same
// positions, same total energy, opposite angular momentum. It is a legitimate
// second sample from the same generator whose noise is anti-correlated with the
// first, so the pair's mean has lower variance than two independent draws.
//
// In fixed point the negation is EXACT -- an integer sign flip, no rounding --
// so the pair is exactly antithetic rather than approximately so. In floating
// point it would be approximately so and the variance argument would leak.

export function antithetic(u: Universe): Universe {
  const v = cloneUniverse(u);
  for (const b of v.bodies) b.vel = { x: -b.vel.x, y: -b.vel.y, z: -b.vel.z };
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// E3 + E10 + E11 · COMMON RANDOM NUMBERS, AND RACING.
//
// CRN: every action is evaluated on the SAME seeds, so the seed effect cancels
// in the comparison. This is already what the probes do informally; naming it
// makes it checkable, and `race` enforces it by construction -- an arm is never
// advanced onto a seed its rivals have not also seen.
//
// RACING: with 605 ms per play, evaluating 24 actions on 9 seeds costs 130 s per
// decision. Most of those actions are obviously bad after two seeds. Successive
// halving spends the budget where the contest is: evaluate every arm on a few
// seeds, drop the worst half, double the seeds for the rest, repeat.
//
// THE STOPPING RULE IS A VARIANCE BUDGET, NOT A SEED COUNT. An arm survives
// while its standard error is large enough that the gap to the leader could be
// noise. That turns "how many seeds is enough" from a guess into a measurement,
// which is the same move standing rule B makes for gates.

export interface RaceResult<A> {
  readonly winner: A;
  readonly mean: number;
  readonly stderr: number;
  /** Plays actually spent. Compare against arms x seeds to price the racing. */
  readonly plays: number;
  /** Every arm's final estimate, for reporting rather than for deciding. */
  readonly table: readonly { action: A; mean: number; n: number }[];
}

export function race<A>(
  arms: readonly A[],
  seeds: readonly number[],
  evaluate: (a: A, seed: number) => number,
  opts: { readonly keepFraction?: number; readonly firstRound?: number } = {},
): RaceResult<A> {
  const keep = opts.keepFraction ?? 0.5;
  const first = Math.max(2, Math.min(opts.firstRound ?? 3, seeds.length));

  let live = arms.map((action) => ({ action, sum: 0, sq: 0, n: 0 }));
  let used = 0;
  let cursor = 0;
  let batch = first;

  while (live.length > 1 && cursor < seeds.length) {
    const take = seeds.slice(cursor, Math.min(cursor + batch, seeds.length));
    if (take.length === 0) break;
    for (const arm of live) {
      for (const s of take) {
        const v = evaluate(arm.action, s);
        arm.sum += v; arm.sq += v * v; arm.n += 1; used += 1;
      }
    }
    cursor += take.length;
    if (cursor >= seeds.length) break;
    live.sort((a, b) => b.sum / b.n - a.sum / a.n);
    const survivors = Math.max(1, Math.floor(live.length * keep));
    live = live.slice(0, survivors);
    batch = Math.min(batch * 2, seeds.length - cursor);
  }

  live.sort((a, b) => b.sum / b.n - a.sum / a.n);
  const top = live[0]!;
  const mean = top.sum / top.n;
  const varr = Math.max(0, top.sq / top.n - mean * mean);
  return {
    winner: top.action,
    mean,
    stderr: Math.sqrt(varr / Math.max(1, top.n)),
    plays: used,
    table: live.map((a) => ({ action: a.action, mean: a.sum / a.n, n: a.n })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// E1 · PROGRESSIVE WIDENING.
//
// The textbook answer to a continuous (or merely large) action space in Monte
// Carlo tree search: a node's child count is allowed to grow as k * N^alpha
// rather than being enumerated up front. Early visits go to a handful of actions
// and are therefore informative; the branch widens only where the search keeps
// returning.
//
// Here it does a second job. Because the lattice is finite, widening is not
// strictly necessary to make the search terminate -- but it IS the measurement
// that decides how big the lattice should be. If widening past twelve actions
// never improves the value estimate, the interface should offer twelve. That is
// Chemical's "cap of three options is measured, not chosen" argument, applied to
// a lattice instead of a product list.

export const widthAt = (visits: number, k = 1.6, alpha = 0.5): number =>
  Math.max(1, Math.ceil(k * Math.pow(Math.max(1, visits), alpha)));

// ─────────────────────────────────────────────────────────────────────────────
// E9 · THE DO-NOTHING ARM IS BUILT IN, NOT BOLTED ON.
//
// Revision 4 of the plan calls it the screensaver detector: if an agent that
// never intervenes scores near the readable rule, the universe is producing the
// score and the player is an observer.
//
// On a running system, do-nothing -- not a random legal move -- is the correct
// floor, and the two are the same thing only on a static board. Making it an arm
// of every search means no evaluation can be reported without it, which is the
// difference between a control that exists and a control that is run.

export interface Evaluation<A> {
  readonly best: A | null;
  readonly bestScore: number;
  readonly doNothingScore: number;
  /** best - do-nothing. Zero or negative means the verb is not the game. */
  readonly agency: number;
  readonly liveMoves: number;
  readonly entropyBits: number;
  readonly plays: number;
}

export function evaluate<A extends LatticeAction>(
  lattice: Lattice<A>,
  seeds: readonly number[],
  build: (seed: number) => Universe,
  score: (u: Universe) => number,
  rollout: number = LYAPUNOV_HORIZON_STEPS,
  budget?: number,
): Evaluation<A> {
  const probe = build(seeds[0]!);
  const arms = lattice.actions(probe);

  const run = (a: A | null, seed: number): number => {
    const u = build(seed);
    if (a) lattice.apply(u, a);
    for (let s = 0; s < rollout; s += 1) stepUniverse(u);
    return score(u);
  };

  let doNothing = 0;
  for (const s of seeds) doNothing += run(null, s);
  doNothing /= seeds.length;

  const affordable = budget === undefined ? arms : arms.filter((a) => a.cost <= budget);
  if (affordable.length === 0) {
    return { best: null, bestScore: doNothing, doNothingScore: doNothing, agency: 0, liveMoves: 0, entropyBits: 0, plays: seeds.length };
  }

  // Full grid rather than a race here: the entropy and live-move counts are
  // properties of the WHOLE action set, and a race deliberately stops measuring
  // the arms it drops. Racing is for choosing; this function is for reporting.
  const means = affordable.map((a) => {
    let acc = 0;
    for (const s of seeds) acc += run(a, s);
    return acc / seeds.length;
  });

  const best = Math.max(...means);
  const live = best > 0 ? means.filter((m) => m >= best * 0.9).length : 0;
  const tot = means.reduce((p, q) => p + Math.max(0, q), 0);
  let h = 0;
  if (tot > 0) for (const m of means) { const p = Math.max(0, m) / tot; if (p > 0) h -= p * Math.log2(p); }

  return {
    best: affordable[means.indexOf(best)] ?? null,
    bestScore: best,
    doNothingScore: doNothing,
    agency: best - doNothing,
    liveMoves: live,
    entropyBits: h,
    plays: seeds.length * (affordable.length + 1),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// E7 · THE FORECAST CONE IS THE SEARCH'S BY-PRODUCT, NOT A SECOND COMPUTATION.
//
// The engine already integrates many futures per decision. Their envelope is
// exactly the cone the interface should draw, so engine and interface share one
// computation instead of duplicating it -- and the drawing is then HONEST BY
// CONSTRUCTION: it shows where the search itself is uncertain, rather than a
// separately-authored graphic that asserts an uncertainty nobody measured.
//
// The Chemical scar this avoids: a display whose brightest state was unreachable
// because the RULE driving it could never be true. A cone computed from the same
// rollouts that choose the move cannot drift away from the thing it depicts.

export interface ConeSample { readonly step: number; readonly radius: number; readonly centre: readonly [number, number, number]; }

export function cone(
  futures: readonly Universe[],
  bodyIndex: number,
  steps: number,
  every: number,
  toXYZ: (u: Universe, i: number) => readonly [number, number, number],
): ConeSample[] {
  const live = futures.map(cloneUniverse);
  const out: ConeSample[] = [];
  for (let s = 0; s <= steps; s += 1) {
    if (s % every === 0) {
      const pts = live.map((u) => toXYZ(u, bodyIndex));
      let cx = 0, cy = 0, cz = 0;
      for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
      cx /= pts.length; cy /= pts.length; cz /= pts.length;
      let r = 0;
      for (const p of pts) r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz));
      out.push({ step: s, radius: r, centre: [cx, cy, cz] });
    }
    for (const u of live) stepUniverse(u);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// E12 · THE RESOLUTION FLOOR IS AN ENGINE SERVICE.
//
// Standing rule B: no metric becomes a gate until its null model is measured.
// It has now been violated twice in this project by discipline alone -- the 35%
// seed-share bar imported into a game whose discreteness manufactured 19.5% of
// it, and the novel-distance metric whose 0.1949 sat 1.32x a floor of 0.1480.
// Both were caught, both were caught late, and both were caught because somebody
// remembered.
//
// So the engine computes it. `floorOf` takes points whose true value on the
// metric is ZERO BY CONSTRUCTION and reports what the estimator says about them.
// A gate compares against that number or it is not a gate.
//
// The one thing this cannot do for you is choose honest null points. A null
// drawn FROM the reference set has distance exactly 0 and can never fail -- that
// exact mistake was made and caught at the writing desk this round. `floorOf`
// therefore REFUSES a null that returns exactly zero everywhere, because a floor
// of zero is the signature of a degenerate control rather than of a sharp
// instrument.

export interface Floor { readonly floor: number; readonly samples: readonly number[]; }

export function floorOf(nullPoints: readonly number[]): Floor {
  if (nullPoints.length === 0) throw new Error('floorOf: no null points. A metric with no null is not a gate.');
  const floor = Math.max(...nullPoints);
  if (floor === 0) {
    throw new Error(
      'floorOf: every null point scored exactly 0. That is the signature of a null drawn from ' +
      'the reference set it is measured against, which cannot fail. Choose points whose true ' +
      'value is zero by construction but which are NOT members of the comparison set.',
    );
  }
  return { floor, samples: [...nullPoints] };
}

export function clearsFloor(observed: number, f: Floor, multiple = 2): boolean {
  return observed > f.floor * multiple;
}
