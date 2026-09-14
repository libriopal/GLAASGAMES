// M2, REDONE ON ROUND ONE'S EXACT HARNESS.
//
// The first attempt at this null applied both operators SIMULTANEOUSLY, while
// round one separated them by 60 steps. Separation in time is the entire
// mechanism under test, so collapsing it measured a different condition and the
// two numbers were not comparable. The null was valid; the observed was not.
//
// Everything below therefore reuses round one's `run` shape verbatim -- act at
// settle, 60 steps, act again, horizon -- so the observed and the null come out
// of one instrument.
//
// WHAT THE NULL IS. A point whose true novelty is ZERO BY CONSTRUCTION: a
// SINGLE verb at a parameter value that falls BETWEEN the reference grid's
// levels. One verb, one application, so it lies in the single-verb reachable set
// by definition. Any distance the estimator reports for it is the metric's own
// resolution -- the grid spacing showing through -- and standing rule B says no
// metric is a gate until that number exists.
import { seedUniverse, stepUniverse, type Universe } from '../../game/dark/nbody.js';
import { fromFloat, toFloat } from '../../game/dark/fixed.js';

type Op = 'NONE' | 'IMP_A' | 'IMP_A2' | 'MASS_FAR';

function apply(u: Universe, op: Op, t: number): void {
  const b = u.bodies[0]!;
  if (op === 'IMP_A' || op === 'IMP_A2') b.vel = { ...b.vel, x: b.vel.x + fromFloat(t * 1.2) };
  else if (op === 'MASS_FAR') u.bodies.push({
    pos: { x: fromFloat(-3 + t * 6), y: fromFloat(2.2), z: fromFloat(0.8) },
    vel: { x: 0n, y: 0n, z: 0n }, mass: fromFloat(1.1),
  });
}

function outcome(u: Universe): number[] {
  let cx = 0, cy = 0, cz = 0, m = 0;
  for (const b of u.bodies) { const w = toFloat(b.mass); cx += toFloat(b.pos.x) * w; cy += toFloat(b.pos.y) * w; cz += toFloat(b.pos.z) * w; m += w; }
  cx /= m; cy /= m; cz /= m;
  let bound = 0, inertia = 0, maxr = 0;
  for (const b of u.bodies) {
    const d = Math.hypot(toFloat(b.pos.x) - cx, toFloat(b.pos.y) - cy, toFloat(b.pos.z) - cz);
    if (d < 12) bound += 1;
    inertia += toFloat(b.mass) * d * d;
    maxr = Math.max(maxr, d);
  }
  return [bound / u.bodies.length, inertia / m, maxr];
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, (a[1]! - b[1]!) / 40, (a[2]! - b[2]!) / 20);

function run(seed: number, ops: readonly [Op, number][], horizon = 360): number[] {
  const u = seedUniverse(seed, 12);
  for (let s = 0; s < 80; s += 1) stepUniverse(u);
  apply(u, ops[0]![0], ops[0]![1]);
  for (let s = 0; s < 60; s += 1) stepUniverse(u);
  if (ops[1]) apply(u, ops[1][0], ops[1][1]);
  for (let s = 0; s < horizon; s += 1) stepUniverse(u);
  return outcome(u);
}

const BUDGET = 1;
const SEEDS = [11, 22, 33];

// The reference set: what either verb alone reaches, swept over the full budget.
const REF = new Map<number, number[][]>();
for (const seed of SEEDS) {
  const singles: number[][] = [];
  for (let i = 0; i <= 6; i += 1) {
    singles.push(run(seed, [['IMP_A', (i / 6) * BUDGET]]));
    singles.push(run(seed, [['MASS_FAR', (i / 6) * BUDGET]]));
  }
  REF.set(seed, singles);
}

const novelty = (pointsFor: (seed: number) => number[][]): number => {
  let acc = 0;
  for (const seed of SEEDS) {
    const singles = REF.get(seed)!;
    let worst = 0;
    for (const p of pointsFor(seed)) worst = Math.max(worst, Math.min(...singles.map((s) => dist(p, s))));
    acc += worst;
  }
  return acc / SEEDS.length;
};

const splitPoints = (mixed: boolean) => (seed: number): number[][] => {
  const out: number[][] = [];
  for (let k = 1; k < 6; k += 1) {
    const t = (k / 6) * BUDGET, rest = BUDGET - t;
    out.push(run(seed, mixed ? [['IMP_A', t], ['MASS_FAR', rest]] : [['IMP_A', t], ['IMP_A2', rest]]));
  }
  return out;
};

// THE NULL. Off-grid single verbs, five of them, matching the five composed
// points so the max-of-min estimator sees the same number of chances.
const nullPoints = (verb: 'IMP_A' | 'MASS_FAR') => (seed: number): number[][] => {
  const out: number[][] = [];
  for (let k = 1; k < 6; k += 1) out.push(run(seed, [[verb, ((k - 0.5) / 6) * BUDGET]]));
  return out;
};

const rows: [string, number][] = [
  ['all at once, one operator (structural zero)', novelty((s) => [run(s, [['IMP_A', BUDGET]])])],
  ['split in time, SAME operator', novelty(splitPoints(false))],
  ['split in time, DIFFERENT operators', novelty(splitPoints(true))],
  ['NULL A - off-grid single IMPULSE (novelty = 0)', novelty(nullPoints('IMP_A'))],
  ['NULL B - off-grid single MASS (novelty = 0)', novelty(nullPoints('MASS_FAR'))],
];

console.log('── M2 · THE NOVEL-DISTANCE METRIC AGAINST ITS OWN RESOLUTION FLOOR ──');
console.log('composition                                    | novel distance');
for (const [label, v] of rows) console.log(`${label.padEnd(46)} | ${v.toFixed(4)}`);

const floor = Math.max(rows[3]![1], rows[4]![1]);
console.log('');
console.log(`RESOLUTION FLOOR (worst null)                  | ${floor.toFixed(4)}`);
for (const [label, v] of rows.slice(0, 3)) {
  console.log(`  ${label.padEnd(44)} | ${(v / floor).toFixed(2)}x floor | ${v > floor * 2 ? 'SURVIVES' : 'inside the floor -- NOT A FINDING'}`);
}
