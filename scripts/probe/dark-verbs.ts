// EINCOL STEP 1 — the cue, loaded with real material.
//
// THE QUESTION: which intervention in a running gravitational system EXPANDS the
// set of reachable futures, and can a player STEER that expansion or only
// trigger it?
//
// The second clause is the whole difficulty. The approving audit named the lead
// -- "Energy Injection and Mass Injection can expand the reachable phase space"
// -- and in the same breath named the trap: "the screening must distinguish
// between expanding the space and creating chaos."
//
// So two numbers per verb, not one:
//
//   EXPANSION     spread of outcomes across a sweep of the verb's parameter.
//                 Near zero means a convergence engine -- the thing that made
//                 Chemical's declared route a stabiliser rather than a depth
//                 engine.
//   STEERABILITY  rank correlation between the parameter and the outcome. High
//                 means the player can AIM it. Low with high expansion is
//                 chaos, which N3 already forbids for fairness reasons.
import { seedUniverse, stepUniverse, type Universe } from '../../game/dark/nbody.js';
import { fromFloat, toFloat } from '../../game/dark/fixed.js';

type Verb = 'NONE' | 'IMPULSE' | 'MASS' | 'DRAG' | 'PIN';

/** Apply one intervention at strength t in [0,1]. */
function intervene(u: Universe, verb: Verb, t: number): void {
  const b = u.bodies[0]!;
  switch (verb) {
    case 'IMPULSE':
      // Kinetic energy into one body, along its own motion.
      b.vel = { x: b.vel.x + fromFloat(t * 1.4), y: b.vel.y + fromFloat(t * 0.6), z: b.vel.z };
      break;
    case 'MASS':
      // A new body: adds degrees of freedom rather than energy.
      u.bodies.push({
        pos: { x: fromFloat(-2 + t * 4), y: fromFloat(1.5), z: fromFloat(0.4) },
        vel: { x: 0n, y: 0n, z: 0n },
        mass: fromFloat(0.4 + t * 2.2),
      });
      break;
    case 'DRAG':
      // Remove energy from everything. The classic stabiliser.
      for (const q of u.bodies) q.vel = { x: fromFloat(toFloat(q.vel.x) * (1 - t * 0.5)), y: fromFloat(toFloat(q.vel.y) * (1 - t * 0.5)), z: fromFloat(toFloat(q.vel.z) * (1 - t * 0.5)) };
      break;
    case 'PIN':
      // Freeze one body. Constrains a degree of freedom.
      if (t > 0.5) b.vel = { x: 0n, y: 0n, z: 0n };
      break;
    default:
  }
}

/** The outcome a player would care about: how much of the cluster stays bound. */
function boundFraction(u: Universe): number {
  let cx = 0, cy = 0, cz = 0, m = 0;
  for (const b of u.bodies) { const w = toFloat(b.mass); cx += toFloat(b.pos.x)*w; cy += toFloat(b.pos.y)*w; cz += toFloat(b.pos.z)*w; m += w; }
  cx /= m; cy /= m; cz /= m;
  let n = 0;
  for (const b of u.bodies) {
    const d = Math.hypot(toFloat(b.pos.x)-cx, toFloat(b.pos.y)-cy, toFloat(b.pos.z)-cz);
    if (d < 12) n++;
  }
  return n / u.bodies.length;
}

const HORIZON = 600;
const LEVELS = 9;

function spearman(xs: number[], ys: number[]): number {
  const rank = (a: number[]) => { const idx = a.map((v,i)=>[v,i] as const).sort((p,q)=>p[0]-q[0]); const r = new Array(a.length); idx.forEach(([,i],k)=>r[i]=k); return r as number[]; };
  const rx = rank(xs), ry = rank(ys), n = xs.length;
  let d2 = 0; for (let i=0;i<n;i++) d2 += (rx[i]!-ry[i]!)**2;
  return 1 - (6*d2)/(n*(n*n-1));
}

console.log('verb    | expansion (sd of outcome) | steerability (rank corr) | mean bound');
for (const verb of ['NONE','IMPULSE','MASS','DRAG','PIN'] as Verb[]) {
  let expSum = 0, steerSum = 0, meanSum = 0, runs = 0;
  for (const seed of [11, 22, 33, 44, 55, 66]) {
    const params: number[] = [], outs: number[] = [];
    for (let l = 0; l < LEVELS; l++) {
      const t = l / (LEVELS - 1);
      const u = seedUniverse(seed, 12);
      for (let s = 0; s < 80; s++) stepUniverse(u);
      intervene(u, verb, t);
      for (let s = 0; s < HORIZON; s++) stepUniverse(u);
      params.push(t); outs.push(boundFraction(u));
    }
    const m = outs.reduce((a,b)=>a+b,0)/outs.length;
    expSum += Math.sqrt(outs.reduce((a,b)=>a+(b-m)**2,0)/outs.length);
    steerSum += Math.abs(spearman(params, outs));
    meanSum += m; runs++;
  }
  console.log(`${verb.padEnd(7)} | ${(expSum/runs).toFixed(4).padStart(25)} | ${(steerSum/runs).toFixed(3).padStart(24)} | ${(meanSum/runs).toFixed(3)}`);
}
