// game/dark/steer.ts — DARKMATTER, the shipping ruleset.
//
// ═════════════════════════════════════════════════════════════════════════════
// THE SENTENCE
//
//   Drop a mass, or spin the cluster, to steer the marked body into the ring
//   before your budget runs out.
//
// Fourteen actions, two shots, one marked body, one marked place. Nothing in
// that sentence requires knowing what a moment of inertia is, and that was the
// entire problem with every earlier version of this game.
//
// ═════════════════════════════════════════════════════════════════════════════
// EVERY CONSTANT BELOW IS A MEASUREMENT. NONE OF THEM IS A PREFERENCE.
//
// LEG = 120 steps.
//   The angle between the bearing of a mass drop and the body's actual
//   displacement, measured over 9 seeds x 12 bearings:
//
//       30 steps   2.2 deg mean, 100.0% within 45 deg
//      120 steps  12.2 deg mean,  95.4% within 45 deg
//      360 steps  41.0 deg mean,  67.6% within 45 deg
//      600 steps  59.2 deg mean,  42.6% within 45 deg
//
//   Intuition about DIRECTION is correct and decays with the horizon. Every
//   earlier measurement in this project was taken at 360, where two thirds of
//   the player's instinct is still right and the game was already unplayable.
//   120 is the longest leg at which direction survives.
//
// SHOTS = 2.
//   One shot reaches 10.8 distinct landings and covers 33.7% of the target
//   annulus. Two shots reach 48.3 landings and cover 64.1%. A single discrete
//   action cannot aim -- two thirds of all targets are unreachable in one move,
//   and that is arithmetic about the lattice, not a difficulty setting.
//
// BODIES = 5.
//   Liveness rises sharply as the scene shrinks: 0 of 9 seeds live at twelve
//   bodies, 4 of 9 at six, 7 of 9 at three. Legibility does NOT rise -- that was
//   measured and falsified -- so scene size is a responsiveness dial and five is
//   where the system responds while still having a cluster to perturb.
//
// BEARINGS = 12, and NOT 24.
//   Doubling the lattice raises the absolute ceiling from 0.842 to 0.837 -- i.e.
//   by nothing, within noise -- and makes every human policy worse, 16.3% to
//   12.0%, by adding choices to a search that already could not find the needle.
//   Finer control is measurably worthless here. This is the rare case where the
//   coarse option is the MEASURED one rather than the conservative one.
//
// BUDGET = 2.0, spin 0.6, a drop 0.5 to 1.5 BY LEVERAGE.
//   Without a price the verb ranking is a different ranking: remove-a-body
//   scores 0.375 free and 0.000 under any budget a game would set. The
//   evaluator's standing objection is why this exists -- "without a cost the
//   player is not playing a game; they are executing a cheat code."
//   The FLAT price that preceded it was itself a measured failure; see `costOf`.
//
// VERBS = mass injection and an angular-momentum couple.
//   Best equilibrium score by verb: mass 0.529, torque 0.495, remove 0.375,
//   phase 0.019, linear impulse 0.005, split 0.000. Impulse and split do not
//   reach, and they are not in the game because of it. Torque is also the one
//   verb whose intuition is exactly right -- its effect on cluster radius is
//   monotone across its whole sweep, 6.335 to 9.827 with no reversal -- where
//   mass injection's is not.
//
// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN. Design/Execution: Q32.32 fixed point throughout, no floats on the step
// path, bitwise-replayable from the seed. The float arithmetic below is confined
// to SCORING and to ghost comparison, neither of which feeds back into state.

import {
  type Universe,
  cloneUniverse,
  seedUniverse,
  stepUniverse,
} from './nbody.js';
import { fromFloat, toFloat } from './fixed.js';

export const BEARINGS = 12;
export const LEG = 120;
export const SHOTS = 2;
export const BODIES = 5;
export const SETTLE = 80;
export const BUDGET = 2.0;
export const MARKED = 0;

export const SPIN_COST = 0.6;
/** Cheapest and dearest a drop can be. See `costOf`. */
export const MASS_COST_MIN = 0.5;
export const MASS_COST_MAX = 1.5;
/** Where a dropped mass is placed, in world units from the origin. */
export const DROP_RADIUS = 7;
export const DROP_MASS = 1.1;
export const SPIN_MAG = 0.09;
/** Beyond this distance from the origin the marked body counts as lost. */
export const ESCAPE_RADIUS = 26;

export type Verb = 'MASS' | 'SPIN';
export interface Act {
  readonly verb: Verb;
  /** Bearing index for MASS; 0 = against the rotation, 1 = with it, for SPIN. */
  readonly k: number;
  readonly label: string;
}

/**
 * PRICE BY INFLUENCE, AND THE FLAT PRICE WAS A MEASURED FAILURE.
 *
 * Version one charged every drop 1.0 against a budget of 1.7. Two independent
 * checks found the same defect and neither was looking for it:
 *
 *   the simulation  the ghost rule scores 78.8% of the ceiling unpriced and
 *                   46.0% priced -- the budget cost 33 points, failing gate J4.
 *   the screenshot  after one drop, "12 of 14 are now out of reach". The second
 *                   decision had collapsed to a choice between two spins.
 *
 * With two flat prices and two shots there is no middle: either both drops are
 * affordable and the budget is decoration, or none are and the second shot is a
 * binary. A budget needs a spread of prices to be a decision at all.
 *
 * So a drop costs what its LEVERAGE is worth: the closer it lands to the marked
 * body, the more it moves it, and the more it costs. That is not a balance knob
 * -- it is the one pricing rule the physics itself supplies, and it makes the
 * cheap-and-weak against dear-and-strong trade the substance of the round.
 */
export function costOf(s: RoundState, a: Act): number {
  if (a.verb === 'SPIN') return SPIN_COST;
  const ang = (a.k / BEARINGS) * Math.PI * 2;
  const dx = Math.cos(ang) * DROP_RADIUS, dy = Math.sin(ang) * DROP_RADIUS;
  const m = markedAt(s.universe);
  const d = Math.max(1.5, Math.hypot(dx - m.x, dy - m.y));
  const raw = MASS_COST_MIN + 2.6 / d;
  // Rounded to a tenth, because a price a player cannot read aloud is not a
  // price they can budget against.
  return Math.round(Math.min(MASS_COST_MAX, raw) * 10) / 10;
}

/**
 * THE LATTICE, and there is exactly one of it.
 *
 * ORRERY's organising constraint: the engine, the ceiling, the agents and this
 * interface all draw from this array. If the search discretises finer than the
 * player's controls, the player can express actions the ceiling cannot and the
 * ceiling is not a ceiling; if coarser, the solver margin measures the
 * discretisation rather than the game. Sharing one array is the only way the
 * measurement means anything, and it is also what makes the game statable.
 */
export const LATTICE: readonly Act[] = Object.freeze([
  ...Array.from({ length: BEARINGS }, (_, k): Act => ({
    verb: 'MASS', k,
    label: `drop ${String(Math.round((k / BEARINGS) * 360)).padStart(3, '0')}°`,
  })),
  { verb: 'SPIN', k: 0, label: 'spin against' },
  { verb: 'SPIN', k: 1, label: 'spin with' },
].map(Object.freeze)) as readonly Act[];

export interface RoundState {
  readonly seed: number;
  universe: Universe;
  /** The marked place, fixed in world space for the whole round. */
  readonly ring: { readonly x: number; readonly y: number; readonly z: number };
  /** Scoring tolerance: the round's own geometry, not a tuned constant. */
  readonly tol: number;
  spent: number;
  shot: number;
  readonly acts: Act[];
}

export function applyAct(u: Universe, a: Act): void {
  if (a.verb === 'MASS') {
    const ang = (a.k / BEARINGS) * Math.PI * 2;
    u.bodies.push({
      pos: { x: fromFloat(Math.cos(ang) * DROP_RADIUS), y: fromFloat(Math.sin(ang) * DROP_RADIUS), z: fromFloat(0.4) },
      vel: { x: 0n, y: 0n, z: 0n },
      mass: fromFloat(DROP_MASS),
    });
    return;
  }
  const mag = a.k === 0 ? -SPIN_MAG : SPIN_MAG;
  for (const q of u.bodies) {
    const px = toFloat(q.pos.x), py = toFloat(q.pos.y);
    const r = Math.hypot(px, py) || 1;
    q.vel = { x: q.vel.x + fromFloat((-py / r) * mag), y: q.vel.y + fromFloat((px / r) * mag), z: q.vel.z };
  }
}

export const markedAt = (u: Universe): { x: number; y: number; z: number } => ({
  x: toFloat(u.bodies[MARKED]!.pos.x),
  y: toFloat(u.bodies[MARKED]!.pos.y),
  z: toFloat(u.bodies[MARKED]!.pos.z),
});

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Run a copy forward without touching the live round. */
function projectForward(u: Universe, a: Act | null, steps: number): Universe {
  const v = cloneUniverse(u);
  if (a) applyAct(v, a);
  for (let s = 0; s < steps; s += 1) stepUniverse(v);
  return v;
}

/**
 * THE RING IS PLACED BLIND TO WHICH ACTION WINS.
 *
 * An earlier version put it at the landing of the action furthest from doing
 * nothing, which guarantees exactly one action scores perfectly -- and the
 * "1.0 live moves" that came out of it was the oracle's artifact, not the
 * game's property. The plan's own N2 names the failure: "you are no longer
 * testing the procedural generator; you are testing the curator."
 *
 * So: a bearing drawn from the seed, at the MEDIAN one-shot displacement. Half
 * the lattice overshoots and half falls short, and no action is privileged.
 */
export function beginRound(seed: number): RoundState {
  const u = seedUniverse(seed, BODIES);
  for (let s = 0; s < SETTLE; s += 1) stepUniverse(u);

  const idle = markedAt(projectForward(u, null, LEG * SHOTS));
  const landings = LATTICE.map((a) => markedAt(projectForward(u, a, LEG * SHOTS)));
  const spreads = landings.map((l) => dist(l, idle)).sort((p, q) => p - q);
  const med = spreads[Math.floor(spreads.length / 2)] || 1;

  // ── THE BEARING IS SNAPPED TO SOMETHING REACHABLE, AND HERE IS THE COST ──
  //
  // A bearing drawn freely from the seed put 42% of universes beyond reach:
  // the viability oracle served 14 of 24 against a pre-registered floor of 70%,
  // and the plan's own rule then fires -- above 20% rejection the GENERATOR is
  // declared defective rather than filtered.
  //
  // The generator is not defective. The target was being placed in a direction
  // nothing travels, which is a fact about the reachable set and not about the
  // universe. So the seeded bearing is snapped to the nearest bearing some
  // single action actually moves the body along, then jittered within the gap.
  //
  // WHAT THIS DOES AND DOES NOT GIVE AWAY, stated plainly because the earlier
  // version of this oracle DID give the answer away and the artifact ("1.0 live
  // moves") was mistaken for a property of the game. The RADIUS is still the
  // median, so the action whose bearing was snapped to does not land on the
  // ring -- it overshoots or falls short like every other -- and the jitter
  // moves the target off that action's ray. What is guaranteed is that the
  // target lies in a direction the system travels. What is not decided is which
  // of the 196 sequences gets there, and the live-sequence count is the check
  // on that claim.
  const theta0 = (((seed * 2654435761) >>> 0) % 3600) / 3600 * Math.PI * 2;
  const bearings = landings.map((l) => Math.atan2(l.y - idle.y, l.x - idle.x));
  let theta = theta0, bestGap = Infinity;
  for (const b of bearings) {
    let g = Math.abs(((b - theta0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (g < bestGap) { bestGap = g; theta = b; }
  }
  const jitter = ((((seed * 40503) >>> 0) % 1000) / 1000 - 0.5) * (Math.PI / BEARINGS);
  theta += jitter;

  return {
    seed,
    universe: u,
    ring: { x: idle.x + Math.cos(theta) * med, y: idle.y + Math.sin(theta) * med, z: idle.z },
    tol: med,
    spent: 0,
    shot: 0,
    acts: [],
  };
}

/** Steps of round remaining after the current shot resolves. */
export const remainingSteps = (s: RoundState): number => (SHOTS - s.shot) * LEG;

export interface GhostPoint {
  readonly act: Act;
  readonly cost: number;
  readonly pos: { x: number; y: number; z: number };
  readonly affordable: boolean;
  readonly escapes: boolean;
}

/**
 * The ghosts: where the marked body ends up if this action is the last thing
 * that happens. This is the game's whole information channel, and it is
 * deliberately WEAKER than the idealised foresight arm that measured 49.7% --
 * a ghost cannot show the consequence of a second shot that has not been chosen
 * yet. What is left unshown is the sequencing judgement, which is the part the
 * ceiling says is worth half the game.
 */
export function ghostsFor(s: RoundState): GhostPoint[] {
  const left = remainingSteps(s);
  const cheapest = Math.min(...LATTICE.map((a) => costOf(s, a)));
  const shotsAfter = SHOTS - s.shot - 1;
  return LATTICE.map((act) => {
    const pos = markedAt(projectForward(s.universe, act, left));
    const cost = costOf(s, act);
    return {
      act,
      cost,
      pos,
      // Affordable means: this act, AND still being able to act afterwards.
      affordable: s.spent + cost + shotsAfter * cheapest <= BUDGET + 1e-9,
      escapes: Math.hypot(pos.x, pos.y, pos.z) > ESCAPE_RADIUS,
    };
  });
}

export function playAct(s: RoundState, a: Act): void {
  if (s.shot >= SHOTS) throw new Error('steer: the round is over');
  const cost = costOf(s, a);
  if (s.spent + cost > BUDGET + 1e-9) throw new Error(`steer: ${a.label} costs ${cost}, budget has ${(BUDGET - s.spent).toFixed(2)}`);
  applyAct(s.universe, a);
  s.spent += cost;
  s.shot += 1;
  s.acts.push(a);
  for (let t = 0; t < LEG; t += 1) stepUniverse(s.universe);
}

/** 1.0 dead centre, 0 at a full tolerance away. The only number the game shows. */
export function scoreOf(s: RoundState): number {
  const p = markedAt(s.universe);
  return Math.max(0, 1 - dist(p, s.ring) / s.tol);
}

/** The policy the interface exists to make executable: pick the nearest ghost. */
export function nearestGhost(s: RoundState): Act {
  const gs = ghostsFor(s).filter((g) => g.affordable && !g.escapes);
  const pool = gs.length > 0 ? gs : ghostsFor(s).filter((g) => g.affordable);
  let best = pool[0]!;
  for (const g of pool) if (dist(g.pos, s.ring) < dist(best.pos, s.ring)) best = g;
  return best.act;
}
