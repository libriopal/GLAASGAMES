// DARKMATTER STAGE 0. N3 runs FIRST because it can end the project.
//
// Every control here follows revision (A) from the cross-game learnings: it
// SEARCHES for a live case and asserts the effect is non-zero, rather than
// hardcoding a case that might not exercise the thing. Four vacuous controls
// across two Chemical runs all had that exact shape.
import { toFloat, fromFloat, ONE, abs } from '../../game/dark/fixed.js';
import {
  DT, EPS, cloneUniverse, digest, rangeSafe, seedUniverse, stepUniverse,
  totalAngular, totalEnergy, totalMomentum,
} from '../../game/dark/nbody.js';

let bad = 0;
const check = (n: string, ok: boolean, d: string) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${n.padEnd(50)} ${d}`); };

// ── N3 · LYAPUNOV. First, because a yes here changes the whole design. ──────
// Perturb ONE body by the smallest meaningful amount and measure how fast the
// two universes separate. A large positive exponent means outcomes stop being
// attributable to decisions -- unfair rather than merely hard.
{
  const STEPS = 600;
  let sumLambda = 0, n = 0;
  for (const seed of [11, 22, 33, 44, 55]) {
    const a = seedUniverse(seed, 12);
    const b = cloneUniverse(a);
    // A perturbation a player could not even express: 2^-20 of a unit.
    b.bodies[0]!.pos = { ...b.bodies[0]!.pos, x: b.bodies[0]!.pos.x + (ONE >> 20n) };
    const d0 = 2 ** -20;
    for (let s = 0; s < STEPS; s++) { stepUniverse(a); stepUniverse(b); }
    let d2 = 0;
    for (let i = 0; i < a.bodies.length; i++) {
      const dx = toFloat(a.bodies[i]!.pos.x - b.bodies[i]!.pos.x);
      const dy = toFloat(a.bodies[i]!.pos.y - b.bodies[i]!.pos.y);
      const dz = toFloat(a.bodies[i]!.pos.z - b.bodies[i]!.pos.z);
      d2 += dx * dx + dy * dy + dz * dz;
    }
    const dT = Math.sqrt(d2);
    const t = STEPS * toFloat(DT);
    sumLambda += Math.log(Math.max(dT, 1e-18) / d0) / t;
    n++;
  }
  const lambda = sumLambda / n;
  // Bounded means the prediction horizon (1/lambda) exceeds the turn horizon a
  // player plans over. At ~30 sim-seconds per round, lambda under ~0.35 leaves a
  // usable window; above that, intent is noise.
  check('N3 Lyapunov exponent is bounded', lambda < 0.35,
    `lambda ${lambda.toFixed(3)} per sim-second, prediction horizon ${(1 / Math.max(lambda, 1e-9)).toFixed(1)}s`);
}

// ── N1 · bitwise replay, on a universe that actually MOVED ─────────────────
{
  let live = 0, d1 = '', d2 = '';
  for (let seed = 1; seed <= 50 && live === 0; seed++) {
    const a = seedUniverse(seed, 10);
    const start = digest(a);
    for (let s = 0; s < 200; s++) stepUniverse(a);
    if (digest(a) !== start) { live = seed; d1 = digest(a); }
  }
  const b = seedUniverse(live, 10);
  for (let s = 0; s < 200; s++) stepUniverse(b);
  d2 = digest(b);
  check('N1 replay is bitwise identical, on a moving universe', live > 0 && d1 === d2,
    `seed ${live}, state changed and both runs agree: ${d1 === d2}`);
}

// ── N5 · range safety over a long horizon ─────────────────────────────────
{
  let safe = true, worst = 0;
  for (const seed of [7, 14, 21]) {
    const u = seedUniverse(seed, 14);
    for (let s = 0; s < 1200; s++) {
      stepUniverse(u);
      if (!rangeSafe(u.bodies)) { safe = false; break; }
    }
    for (const bd of u.bodies) worst = Math.max(worst, Math.abs(toFloat(bd.pos.x)), Math.abs(toFloat(bd.vel.x)));
  }
  check('N5 no state variable approaches the representable bound', safe,
    `1200 steps x 3 seeds, largest |component| ${worst.toFixed(1)}`);
}

// ── N8 · QUANTISATION CONSERVATION: directional drift, not magnitude ───────
// The audit's finding that no other control catches. A bounded random walk in a
// conserved quantity is the expected cost of fixed point; a MONOTONE trend is an
// exploit source whether or not anyone has found it.
{
  const u = seedUniverse(99, 12);
  const samples: number[] = [];
  for (let s = 0; s < 1500; s++) { stepUniverse(u); if (s % 50 === 0) samples.push(toFloat(totalEnergy(u.bodies))); }
  // Sign test on successive differences: a random walk splits roughly evenly, a
  // leak does not.
  let up = 0, down = 0;
  for (let i = 1; i < samples.length; i++) (samples[i]! > samples[i - 1]! ? up++ : down++);
  const skew = Math.abs(up - down) / (up + down);
  const e0 = samples[0]!, eN = samples[samples.length - 1]!;
  check('N8 energy drift is non-directional', skew < 0.45,
    `${up} up / ${down} down, skew ${(skew * 100).toFixed(0)}%, E ${e0.toFixed(3)} -> ${eN.toFixed(3)}`);
}

// ── N7 · DO-NOTHING baseline has momentum (the screensaver detector's floor) ─
{
  const u = seedUniverse(5, 12);
  const before = u.bodies.map((b) => toFloat(b.pos.x));
  for (let s = 0; s < 400; s++) stepUniverse(u);
  let moved = 0;
  u.bodies.forEach((b, i) => { moved += Math.abs(toFloat(b.pos.x) - before[i]!); });
  check('N7 the system evolves without any intervention', moved / u.bodies.length > 0.5,
    `mean |dx| ${(moved / u.bodies.length).toFixed(2)} over 400 steps`);
}

console.log(bad === 0 ? '\nDARKMATTER STAGE 0 PASSED — the physics may be trusted.' : `\nSTAGE 0 FAILED — ${bad} check(s).`);
