// EINCOL ROUND 2, STEP 1 -- LOAD THE CUE WITH MATERIAL I ACTUALLY MEASURED.
//
// The question this round is asked against:
//
//     "What is the smallest COMPLETE decision a Darkmatter player makes, and is
//      it decidable from what they can see before they make it?"
//
// That is the question games one and two can answer in a sentence and game three
// cannot. Farkle: "roll again or bank" -- decidable from the dice and the score.
// Chemical: "which adjacent set, which of three products" -- decidable from the
// board. Darkmatter currently offers a continuous placement crossed with a
// continuous magnitude, which is not a decision, it is a dial.
//
// Five numbers are measured here, and three of them are open items the last
// round left behind rather than new curiosity:
//
//   M1  DECISION LEGIBILITY. Can a rule a human can execute from a still frame
//       rank candidate actions in the order the physics actually rewards? This
//       is the straightforwardness question stated as a correlation. It carries
//       a NEGATIVE CONTROL: a random ranking must read ~0, or the statistic is
//       another 1.000-on-tied-ranks.
//   M2  PERMUTATION NULL on the novel-distance metric -- standing rule B. The
//       0.1464 / 0.1949 from round one sit in a metric whose noise floor has
//       never been measured, so they are not gateable yet.
//   M3  VERB COST. There is none. The evaluator's gap, verbatim: "without a
//       cost the player is not playing a game; they are executing a cheat code."
//       Measured as: how much does the equilibrium score fall when the same verb
//       is charged against a budget?
//   M4  HOW MANY VERBS REACH THE BAND. Round one found exactly one, which makes
//       the game a button. Six verbs are tried here, not two.
//   M5  ACTION COUNT. How many meaningfully distinct actions exist at a decision
//       point -- the anti-Nim branching number, applied to a sandbox.
import { seedUniverse, stepUniverse, type Universe, type Body } from '../../game/dark/nbody.js';
import { fromFloat, toFloat } from '../../game/dark/fixed.js';

const SEEDS = [11, 22, 33, 44, 55];
const SETTLE = 80;
const HORIZON = 360;
const BODIES = 12;

// ── the outcome vector, unchanged from the bracket probe so the numbers compare ──
interface Out { bound: number; inertia: number; maxr: number }
function outcome(u: Universe): Out {
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
  return { bound: bound / u.bodies.length, inertia: inertia / m, maxr };
}

const TARGET = 34, BAND = 6;
/** Continuous equilibrium score: 1 at the target, 0 at the band edge. */
const equil = (o: Out) => Math.max(0, 1 - Math.abs(o.inertia - TARGET) / BAND);

// ── the six verbs. Round one screened two. ───────────────────────────────────
type Action =
  | { kind: 'NONE' }
  | { kind: 'MASS'; ang: number; r: number; m: number }
  | { kind: 'IMPULSE'; body: number; ang: number; mag: number }
  | { kind: 'REMOVE'; body: number }
  | { kind: 'SPLIT'; body: number }
  | { kind: 'TORQUE'; mag: number }
  | { kind: 'PHASE'; body: number; frac: number };

function apply(u: Universe, a: Action): void {
  const bs = u.bodies;
  if (a.kind === 'NONE') return;
  if (a.kind === 'MASS') {
    bs.push({
      pos: { x: fromFloat(Math.cos(a.ang) * a.r), y: fromFloat(Math.sin(a.ang) * a.r), z: fromFloat(0.4) },
      vel: { x: 0n, y: 0n, z: 0n }, mass: fromFloat(a.m),
    });
    return;
  }
  const i = a.kind === 'TORQUE' ? 0 : (a as { body: number }).body % bs.length;
  const b = bs[i]!;
  if (a.kind === 'IMPULSE') {
    b.vel = { x: b.vel.x + fromFloat(Math.cos(a.ang) * a.mag), y: b.vel.y + fromFloat(Math.sin(a.ang) * a.mag), z: b.vel.z };
  } else if (a.kind === 'REMOVE') {
    bs.splice(i, 1);
  } else if (a.kind === 'SPLIT') {
    // Conserves mass AND momentum, adds a degree of freedom. The halving is an
    // exact shift, so the split introduces no rounding of its own.
    const half = b.mass >> 1n;
    const nb: Body = { pos: { x: b.pos.x + fromFloat(0.5), y: b.pos.y, z: b.pos.z }, vel: b.vel, mass: b.mass - half };
    bs[i] = { pos: b.pos, vel: b.vel, mass: half };
    bs.push(nb);
  } else if (a.kind === 'TORQUE') {
    // A couple: every body gets a velocity kick perpendicular to its radius.
    // Injects angular momentum with ZERO net linear momentum, which is a
    // different conserved quantity from the impulse verb and therefore -- the
    // Lie-algebra argument -- a different reachable direction.
    for (const q of bs) {
      const px = toFloat(q.pos.x), py = toFloat(q.pos.y);
      const r = Math.hypot(px, py) || 1;
      q.vel = { x: q.vel.x + fromFloat((-py / r) * a.mag), y: q.vel.y + fromFloat((px / r) * a.mag), z: q.vel.z };
    }
  } else if (a.kind === 'PHASE') {
    // Displace along its own velocity: pure geometry, no energy added.
    const s = a.frac;
    b.pos = { x: b.pos.x + fromFloat(toFloat(b.vel.x) * s), y: b.pos.y + fromFloat(toFloat(b.vel.y) * s), z: b.pos.z };
  }
}

/** Cost of an action, in one currency, so verbs compete. */
function cost(a: Action): number {
  switch (a.kind) {
    case 'NONE': return 0;
    case 'MASS': return a.m * 1.0;
    case 'IMPULSE': return Math.abs(a.mag) * 0.9;
    case 'REMOVE': return 1.4;
    case 'SPLIT': return 0.8;
    case 'TORQUE': return Math.abs(a.mag) * 12;
    case 'PHASE': return Math.abs(a.frac) * 3;
  }
}

function play(seed: number, acts: readonly Action[], horizon = HORIZON): Out {
  const u = seedUniverse(seed, BODIES);
  for (let s = 0; s < SETTLE; s += 1) stepUniverse(u);
  for (const a of acts) apply(u, a);
  for (let s = 0; s < horizon; s += 1) stepUniverse(u);
  return outcome(u);
}

/** Spearman rank correlation, with ties averaged. */
function spearman(a: readonly number[], b: readonly number[]): number {
  const rank = (v: readonly number[]): number[] => {
    const idx = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array(v.length).fill(0);
    let i = 0;
    while (i < idx.length) {
      let j = i; while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) r[idx[k]![1]!] = avg;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b);
  const ma = ra.reduce((p, q) => p + q, 0) / ra.length, mb = rb.reduce((p, q) => p + q, 0) / rb.length;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i += 1) { n += (ra[i]! - ma) * (rb[i]! - mb); da += (ra[i]! - ma) ** 2; db += (rb[i]! - mb) ** 2; }
  return da === 0 || db === 0 ? NaN : n / Math.sqrt(da * db);
}

// A deterministic stream, so "random" here replays.
let RNG = 0x2545f491;
const rnd = (): number => { RNG ^= RNG << 13; RNG ^= RNG >>> 17; RNG ^= RNG << 5; return ((RNG >>> 0) % 100000) / 100000; };

// ─────────────────────────────────────────────────────────────────────────────
console.log('── M1 · DECISION LEGIBILITY · can a rule a human can run rank the actions right? ──');
console.log('   12 mass drops around the ring. Truth = equilibrium score after 360 steps.');
console.log('   heuristic                                     | rank corr vs truth');
{
  // Three heuristics a player could actually execute from a still frame, plus a
  // random one as the mandatory negative control. If the control does not read
  // near zero the statistic is broken and nothing below it means anything.
  const heuristics: [string, (u: Universe, a: Action) => number][] = [
    ['drop toward the sparse side (mass-weighted gap)', (u, a) => {
      if (a.kind !== 'MASS') return 0;
      let s = 0;
      for (const b of u.bodies) {
        const ang = Math.atan2(toFloat(b.pos.y), toFloat(b.pos.x));
        let d = Math.abs(ang - a.ang); if (d > Math.PI) d = 2 * Math.PI - d;
        s += toFloat(b.mass) * Math.max(0, 1 - d / Math.PI);
      }
      return -s;
    }],
    ['drop toward the dense side', (u, a) => {
      if (a.kind !== 'MASS') return 0;
      let s = 0;
      for (const b of u.bodies) {
        const ang = Math.atan2(toFloat(b.pos.y), toFloat(b.pos.x));
        let d = Math.abs(ang - a.ang); if (d > Math.PI) d = 2 * Math.PI - d;
        s += toFloat(b.mass) * Math.max(0, 1 - d / Math.PI);
      }
      return s;
    }],
    ['drop ahead of the rotation (leading the disc)', (u, a) => {
      if (a.kind !== 'MASS') return 0;
      let s = 0;
      for (const b of u.bodies) {
        const px = toFloat(b.pos.x), py = toFloat(b.pos.y);
        const ang = Math.atan2(py, px);
        const lead = Math.atan2(toFloat(b.vel.y), toFloat(b.vel.x));
        let d = Math.abs((ang + (lead - ang) * 0.25) - a.ang); if (d > Math.PI) d = 2 * Math.PI - d;
        s += Math.max(0, 1 - d / Math.PI);
      }
      return s;
    }],
    ['RANDOM (negative control -- must read ~0)', () => rnd()],
  ];

  const acc = heuristics.map(() => [] as number[]);
  for (const seed of SEEDS) {
    const u0 = seedUniverse(seed, BODIES);
    for (let s = 0; s < SETTLE; s += 1) stepUniverse(u0);
    const acts: Action[] = [];
    for (let k = 0; k < 12; k += 1) acts.push({ kind: 'MASS', ang: (k / 12) * Math.PI * 2, r: 7, m: 1.1 });
    const truth = acts.map((a) => equil(play(seed, [a])));
    // Assert the truth has variance -- a flat response would make every
    // correlation below meaningless, which is failure mode "the vacuous control".
    const spread = Math.max(...truth) - Math.min(...truth);
    if (spread < 1e-9) { console.log(`   !! seed ${seed}: zero outcome variance, skipped`); continue; }
    heuristics.forEach(([, h], i) => {
      acc[i]!.push(spearman(acts.map((a) => h(u0, a)), truth));
    });
  }
  heuristics.forEach(([name], i) => {
    const v = acc[i]!.filter((x) => !Number.isNaN(x));
    const mean = v.reduce((p, q) => p + q, 0) / (v.length || 1);
    console.log(`   ${name.padEnd(45)} | ${mean >= 0 ? ' ' : ''}${mean.toFixed(3)}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── M2 · PERMUTATION NULL for novel distance (standing rule B) ──');
{
  const dist = (a: Out, b: Out) => Math.hypot(a.bound - b.bound, (a.inertia - b.inertia) / 40, (a.maxr - b.maxr) / 20);
  const BUDGET = 1;

  // The reference set and the composed points are simulated ONCE. The first
  // version of this recomputed them inside every null replicate, which cost five
  // minutes of identical arithmetic -- and rule (G) says the budget is measured
  // before the design is sized, so it was measured (605 ms per play) and the
  // design changed rather than the other way round.
  const REF = new Map<number, Out[]>();
  const COMPOSED = new Map<number, Out[]>();
  for (const seed of [11, 22, 33]) {
    const singles: Out[] = [];
    for (let i = 0; i <= 6; i += 1) {
      singles.push(play(seed, [{ kind: 'IMPULSE', body: 0, ang: 0, mag: (i / 6) * 1.2 * BUDGET }]));
      singles.push(play(seed, [{ kind: 'MASS', ang: 0.6, r: 4.2, m: (i / 6) * 1.1 * BUDGET }]));
    }
    REF.set(seed, singles);
    const comp: Out[] = [];
    for (let k = 1; k < 6; k += 1) {
      const t = (k / 6) * BUDGET, rest = BUDGET - t;
      comp.push(play(seed, [{ kind: 'IMPULSE', body: 0, ang: 0, mag: t * 1.2 }, { kind: 'MASS', ang: 0.6, r: 4.2, m: rest * 1.1 }]));
    }
    COMPOSED.set(seed, comp);
  }

  // THE NULL, AND THE FIRST ONE I WROTE WAS DEGENERATE.
  //
  // My first attempt replaced the composed point with a point DRAWN FROM the
  // reference set. That point is literally a member of the set it is measured
  // against, so its min-distance is exactly 0 by construction and the null can
  // never fail. That is the project's fifth vacuous control and I caught it
  // before running it rather than after.
  //
  // The honest null is a point that is PROVABLY NOT NOVEL but is not in the
  // reference grid: a single-verb outcome at an OFF-GRID parameter value. Its
  // true novelty is zero -- one verb, one application, inside the single-verb
  // reachable set by definition -- so whatever the estimator reports for it is
  // the metric's own resolution floor, which is exactly the quantity standing
  // rule B demands before 0.1949 can be compared to anything.
  const NULLPTS = new Map<number, Out[]>();
  for (const seed of [11, 22, 33]) {
    const pts: Out[] = [];
    for (let k = 1; k < 6; k += 1) {
      const t = (k - 0.5) / 6; // deliberately BETWEEN the reference levels
      pts.push(play(seed, [{ kind: 'IMPULSE', body: 0, ang: 0, mag: t * 1.2 * BUDGET }]));
    }
    NULLPTS.set(seed, pts);
  }

  const measure = (points: Map<number, Out[]>): number => {
    let novel = 0, n = 0;
    for (const seed of [11, 22, 33]) {
      const singles = REF.get(seed)!;
      let worst = 0;
      for (const p of points.get(seed)!) worst = Math.max(worst, Math.min(...singles.map((sg) => dist(p, sg))));
      novel += worst; n += 1;
    }
    return novel / n;
  };
  const observed = measure(COMPOSED);
  const floor = measure(NULLPTS);
  console.log(`   observed  (split, mixed operators, budget held)  | ${observed.toFixed(4)}`);
  console.log(`   NULL      (off-grid SINGLE verb -- novelty is 0) | ${floor.toFixed(4)}`);
  console.log(`   ratio                                            | ${(observed / (floor || 1e-9)).toFixed(2)}x`);
  console.log(`   VERDICT   | ${observed > floor * 2 ? 'above the resolution floor' : 'INSIDE THE RESOLUTION FLOOR -- 0.1949 is the ruler, not the liquid'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── M4 · how many verbs reach the equilibrium band? (round one found ONE) ──');
console.log('   verb      | best equil score | best at cost<=1.2 | cost of its best');
{
  const sweeps: [string, (t: number) => Action][] = [
    ['NONE', () => ({ kind: 'NONE' })],
    ['MASS', (t) => ({ kind: 'MASS', ang: 0.6, r: 4.2, m: 0.2 + t * 2.0 })],
    ['IMPULSE', (t) => ({ kind: 'IMPULSE', body: 0, ang: 0, mag: t * 1.4 })],
    ['REMOVE', (t) => ({ kind: 'REMOVE', body: Math.floor(t * 11.99) })],
    ['SPLIT', (t) => ({ kind: 'SPLIT', body: Math.floor(t * 11.99) })],
    ['TORQUE', (t) => ({ kind: 'TORQUE', mag: (t - 0.5) * 0.24 })],
    ['PHASE', (t) => ({ kind: 'PHASE', body: Math.floor(t * 11.99), frac: 0.2 + t * 1.4 })],
  ];
  for (const [name, mk] of sweeps) {
    let free = 0, budgeted = 0, costOfBest = 0, n = 0;
    for (const seed of SEEDS) {
      let bf = 0, bb = 0, cb = 0;
      for (let i = 0; i <= 8; i += 1) {
        const a = mk(i / 8);
        const sc = equil(play(seed, [a]));
        if (sc > bf) { bf = sc; cb = cost(a); }
        if (cost(a) <= 1.2 && sc > bb) bb = sc;
      }
      free += bf; budgeted += bb; costOfBest += cb; n += 1;
    }
    console.log(`   ${name.padEnd(9)} | ${(free / n).toFixed(3).padStart(16)} | ${(budgeted / n).toFixed(3).padStart(17)} | ${(costOfBest / n).toFixed(2)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── M5 · EFFECTIVE BRANCHING · how many actions are within 10% of the best? ──');
{
  // The anti-Nim number, applied to a sandbox. A grid of verb x parameter, the
  // way a real interface would present it -- not a continuous dial, because a
  // continuous dial has infinite branching and zero decision.
  const grid: Action[] = [];
  for (let k = 0; k < 8; k += 1) grid.push({ kind: 'MASS', ang: (k / 8) * Math.PI * 2, r: 5.5, m: 1.1 });
  for (let k = 0; k < 4; k += 1) grid.push({ kind: 'IMPULSE', body: k * 3, ang: (k / 4) * Math.PI * 2, mag: 0.9 });
  for (let k = 0; k < 4; k += 1) grid.push({ kind: 'SPLIT', body: k * 3 });
  for (let k = 0; k < 2; k += 1) grid.push({ kind: 'TORQUE', mag: (k === 0 ? -1 : 1) * 0.09 });
  for (let k = 0; k < 2; k += 1) grid.push({ kind: 'REMOVE', body: k * 5 });
  let live = 0, ent = 0, n = 0;
  for (const seed of SEEDS) {
    const sc = grid.map((a) => equil(play(seed, [a])));
    const best = Math.max(...sc);
    if (best <= 0) { console.log(`   !! seed ${seed}: nothing scores, skipped`); continue; }
    live += sc.filter((x) => x >= best * 0.9).length;
    const tot = sc.reduce((p, q) => p + q, 0);
    let h = 0;
    for (const x of sc) { const p = x / tot; if (p > 0) h -= p * Math.log2(p); }
    ent += h; n += 1;
  }
  console.log(`   grid size ${grid.length} | live moves (within 10% of best) ${(live / n).toFixed(1)} | move-value entropy ${(ent / n).toFixed(2)} bits`);
}
