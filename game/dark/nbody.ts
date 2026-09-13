// game/dark/nbody.ts — a seeded universe that replays bitwise.
//
// ─────────────────────────────────────────────────────────────────────────────
// VELOCITY VERLET, AND THE EULER LEVEL WAS CUT BEFORE SCREENING RATHER THAN IN IT.
//
// The plan's round-one audit: "If you use a semi-implicit Euler to save on
// fixed-point complexity, your energy conservation will be terrible, leading to
// explosive orbits that trigger your N2 Rejection Gate."
//
// So the integrator factor lost its unstable level BEFORE stage 1. Screening a
// dial whose low level explodes spends half the design measuring an artefact,
// and energy drift under Euler is a known quantity rather than something to
// discover in a 32-cell sweep. Velocity Verlet is symplectic: it does not
// conserve energy exactly, but its error is BOUNDED AND OSCILLATORY rather than
// secular, which is the property N8 tests for.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SOFTENED POTENTIAL IS STANDARD PRACTICE, NOT A FUDGE.
//
// Force goes as 1/(r^2 + eps^2)^(3/2) rather than 1/r^2. Without softening, two
// bodies approaching closely produce an unbounded force -- and in fixed point an
// unbounded force is an OVERFLOW rather than a large number, which is a wrong
// answer that looks like a number. eps is a declared constant of the simulation.
//
// The approving audit also named it as the cheapest Lyapunov remedy, ahead of
// all three I had listed: "Increasing eps smooths the potential well, reducing
// the steepness of the force gradients. This directly lowers the Lyapunov
// exponent... and it is computationally free because the term is already being
// calculated." So the remedy order is eps, horizon, body count, and damping LAST
// -- damping last because it is in direct conflict with the requirement that the
// system have momentum of its own.

import {
  type Fx,
  type Vec3,
  ONE,
  ZERO,
  add,
  div,
  fromFloat,
  fromInt,
  inRange,
  mul,
  norm2,
  scale,
  sqrt,
  sub,
  vec,
  vecKey,
} from './fixed.js';

export interface Body {
  pos: Vec3;
  vel: Vec3;
  readonly mass: Fx;
}

export interface Universe {
  readonly bodies: Body[];
  readonly seed: number;
  step: number;
}

/** Gravitational constant, in the simulation's own units. */
export const G: Fx = fromFloat(0.45);

/**
 * Softening length. Bounds the force at close approach.
 *
 * Also the first-choice Lyapunov remedy, on the audit's reasoning that it is
 * free: the term is computed on every pair regardless.
 */
export const EPS: Fx = fromFloat(0.85);

/** Integration timestep. */
export const DT: Fx = fromFloat(0.05);

const mix32 = (x: number): number => {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

/**
 * A universe from a seed, rebuilt from nothing every run.
 *
 * The float draws happen HERE and only here, at the boundary, then convert once
 * into fixed point. A float anywhere on the step path would reintroduce the
 * platform-dependent rounding the whole module exists to remove.
 */
export function seedUniverse(seed: number, count: number): Universe {
  const bodies: Body[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = mix32(seed ^ (i * 0x9e3779b9));
    const b = mix32(a);
    const c = mix32(b);
    const r = 2 + (a % 1000) / 1000 * 9;
    const theta = ((b % 1000) / 1000) * Math.PI * 2;
    const phi = ((c % 1000) / 1000 - 0.5) * 0.7;
    const px = r * Math.cos(theta) * Math.cos(phi);
    const py = r * Math.sin(theta) * Math.cos(phi);
    const pz = r * Math.sin(phi);
    // Roughly circular initial velocities, so a fresh universe is a disc rather
    // than a collapse -- a system that simply falls together has no dynamics to
    // intervene in and would fail the momentum requirement trivially.
    const v = Math.sqrt(0.45 * count / Math.max(1.2, r)) * 0.55;
    bodies.push({
      pos: vec(fromFloat(px), fromFloat(py), fromFloat(pz)),
      vel: vec(fromFloat(-Math.sin(theta) * v), fromFloat(Math.cos(theta) * v), 0n),
      mass: fromFloat(0.6 + ((a >>> 8) % 100) / 100),
    });
  }
  return { bodies, seed, step: 0 };
}

/** Acceleration on every body, softened. */
export function accelerations(bodies: readonly Body[]): Vec3[] {
  const acc: Vec3[] = bodies.map(() => ZERO);
  for (let i = 0; i < bodies.length; i += 1) {
    let ai = acc[i]!;
    for (let j = 0; j < bodies.length; j += 1) {
      if (i === j) continue;
      const d = sub(bodies[j]!.pos, bodies[i]!.pos);
      const r2 = norm2(d) + mul(EPS, EPS);
      const r = sqrt(r2);
      const r3 = mul(r2, r);
      if (r3 === 0n) continue;
      const k = div(mul(G, bodies[j]!.mass), r3);
      ai = add(ai, scale(d, k));
    }
    acc[i] = ai;
  }
  return acc;
}

/**
 * One velocity-Verlet step. Symplectic, so the energy error is bounded and
 * oscillatory rather than secular — which is what makes N8's directional-drift
 * test meaningful rather than guaranteed to fail.
 */
export function stepUniverse(u: Universe, dt: Fx = DT): void {
  const half = dt >> 1n;
  const a0 = accelerations(u.bodies);
  for (let i = 0; i < u.bodies.length; i += 1) {
    const b = u.bodies[i]!;
    b.vel = add(b.vel, scale(a0[i]!, half));
    b.pos = add(b.pos, scale(b.vel, dt));
  }
  const a1 = accelerations(u.bodies);
  for (let i = 0; i < u.bodies.length; i += 1) {
    const b = u.bodies[i]!;
    b.vel = add(b.vel, scale(a1[i]!, half));
  }
  u.step += 1;
}

/** Total energy, kinetic plus softened potential. The conserved quantity N8 watches. */
export function totalEnergy(bodies: readonly Body[]): Fx {
  // Kinetic: sum of m v^2 / 2. The halving is an exact shift on the fixed-point
  // integer rather than a multiply by 0.5, so it introduces no rounding of its
  // own -- which matters because N8 is looking for a drift of exactly this size.
  let e = 0n;
  for (const b of bodies) e += mul(b.mass, norm2(b.vel)) >> 1n;
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const d = sub(bodies[j]!.pos, bodies[i]!.pos);
      const r = sqrt(norm2(d) + mul(EPS, EPS));
      if (r === 0n) continue;
      e -= div(mul(mul(G, bodies[i]!.mass), bodies[j]!.mass), r);
    }
  }
  return e;
}

/** Total linear momentum. A second conserved quantity, for the glitch-hunter. */
export function totalMomentum(bodies: readonly Body[]): Vec3 {
  let p = ZERO;
  for (const b of bodies) p = add(p, scale(b.vel, b.mass));
  return p;
}

/** Total angular momentum about the origin. The third. */
export function totalAngular(bodies: readonly Body[]): Vec3 {
  let L = ZERO;
  for (const b of bodies) {
    const m = scale(b.vel, b.mass);
    L = add(
      L,
      vec(
        mul(b.pos.y, m.z) - mul(b.pos.z, m.y),
        mul(b.pos.z, m.x) - mul(b.pos.x, m.z),
        mul(b.pos.x, m.y) - mul(b.pos.y, m.x),
      ),
    );
  }
  return L;
}

/** Every state variable inside the representable range. N5. */
export function rangeSafe(bodies: readonly Body[]): boolean {
  for (const b of bodies) {
    if (!inRange(b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z)) return false;
  }
  return true;
}

/** A bitwise digest of the whole universe, for replay comparison. */
export function digest(u: Universe): string {
  return u.bodies.map((b) => `${vecKey(b.pos)}|${vecKey(b.vel)}`).join(';');
}

export function cloneUniverse(u: Universe): Universe {
  return {
    seed: u.seed,
    step: u.step,
    bodies: u.bodies.map((b) => ({ pos: b.pos, vel: b.vel, mass: b.mass })),
  };
}
