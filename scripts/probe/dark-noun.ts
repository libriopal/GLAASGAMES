// EINCOL ROUND 2, STEP 4 -- THE FALSIFICATION, WRITTEN AS A PROGRAM.
//
// THE CLAIM UNDER ATTACK:
//
//   "Darkmatter is illegible because its objective is a STATISTIC OF THE WHOLE
//    SYSTEM. Make the objective a NAMED BODY REACHING A NAMED PLACE and a player
//    can rank actions without understanding the physics -- which is what makes
//    pool legible to a novice and an n-body inertia band illegible to everyone."
//
// The structural analogy is pool, and it is imported for a specific reason
// rather than for flavour. Pool is a continuous-control physics game with genuine
// chaotic sensitivity that novices nonetheless play competently on their first
// afternoon. Three properties do that work: the objective is a noun reaching a
// noun, the player acts once and then watches, and the table COMES TO REST so
// the next decision starts from a readable state. Darkmatter has none of three.
//
// THE CASE THE CLAIM WOULD GET WRONG, AND I AM LOOKING FOR IT HARDEST:
// a noun objective may be legible because it is TRIVIAL. If "aim at the target"
// ranks actions perfectly AND only one action ever scores, the game became
// straightforward by ceasing to be a game -- the exact mirror of Chemical's
// convergence-engine finding, where the declared route narrowed the tree and
// every metric except the horizon called it depth. So legibility and branching
// are measured TOGETHER, and a legibility win with a branching collapse is
// recorded as a failure rather than as a result.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO DEFECTS IN THE FIRST VERSION OF THIS PROBE, BOTH FOUND BY RUNNING IT.
//
// (1) IT USED ONE HEURISTIC FOR BOTH OBJECTIVES. The "aim at the zone" rule was
//     scored against the inertia band as well, where it means nothing -- so the
//     BAND column measured how well an unrelated rule predicts an unrelated
//     response. A heuristic must be matched to the objective it is a heuristic
//     FOR, or the comparison is between a real rule and a wrong one rather than
//     between two objectives.
//
// (2) THE ZONE WAS A FIXED POINT IN WORLD SPACE, AND IT WAS UNREACHABLE. Best
//     score across every seed and action was 0.142 out of 1.0, and only 2 of 7
//     seeds were live. An objective nothing reaches measures nothing. The plan's
//     own N2 VIABILITY ORACLE is the fix and it was already specified: a seed is
//     served only if some strategy reaches a declared floor. So the zone is now
//     placed per seed, at a position an action actually reaches and doing
//     nothing does not.
//
// Both objectives are also made SCALE-FREE below, because the band target of 34
// was calibrated at twelve bodies and moment of inertia scales with body count
// -- at three bodies doing nothing scored 0.000 against a target it could never
// approach, which would have been read as tension rather than as a broken ruler.
import { seedUniverse, stepUniverse, type Universe } from '../../game/dark/nbody.js';
import { fromFloat, toFloat } from '../../game/dark/fixed.js';

const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88, 99];
const SETTLE = 80;
const HORIZON = 360;

interface Drop { ang: number }
const GRID: Drop[] = [];
for (let k = 0; k < 12; k += 1) GRID.push({ ang: (k / 12) * Math.PI * 2 });

function play(seed: number, bodies: number, drop: Drop | null): Universe {
  const u = seedUniverse(seed, bodies);
  for (let s = 0; s < SETTLE; s += 1) stepUniverse(u);
  if (drop) {
    u.bodies.push({
      pos: { x: fromFloat(Math.cos(drop.ang) * 7), y: fromFloat(Math.sin(drop.ang) * 7), z: fromFloat(0.4) },
      vel: { x: 0n, y: 0n, z: 0n }, mass: fromFloat(1.1),
    });
  }
  for (let s = 0; s < HORIZON; s += 1) stepUniverse(u);
  return u;
}

const P = (b: { pos: { x: bigint; y: bigint; z: bigint } }) => [toFloat(b.pos.x), toFloat(b.pos.y), toFloat(b.pos.z)] as const;

/** Moment of inertia about the mass centre. The current objective's raw quantity. */
function inertiaOf(u: Universe): number {
  let cx = 0, cy = 0, cz = 0, m = 0;
  for (const b of u.bodies) { const w = toFloat(b.mass); const [x, y, z] = P(b); cx += x * w; cy += y * w; cz += z * w; m += w; }
  cx /= m; cy /= m; cz /= m;
  let I = 0;
  for (const b of u.bodies) { const [x, y, z] = P(b); I += toFloat(b.mass) * ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2); }
  return I / m;
}

/** Body zero's final position. The noun objective's raw quantity. */
const bodyZero = (u: Universe) => P(u.bodies[0]!);
const d3 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

let RNG = 0x9e3779b9;
const rnd = (): number => { RNG ^= RNG << 13; RNG ^= RNG >>> 17; RNG ^= RNG << 5; return ((RNG >>> 0) % 100000) / 100000; };

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

const mean = (v: readonly number[]) => (v.length ? v.reduce((p, q) => p + q, 0) / v.length : NaN);

console.log('LEGIBILITY vs DEPTH · two objectives, ONE action grid of 12 mass drops, 9 seeds.');
console.log('Each objective is scored against ITS OWN human rule, and both are scale-free.');
console.log('A legibility win with a branching collapse is a FAILURE, not a result.');
console.log('');
console.log('bodies | objective | legibility | random | live | live moves | entropy | do-nothing | best');
console.log('-------+-----------+------------+--------+------+------------+---------+------------+------');

for (const bodies of [12, 6, 3]) {
  const legB: number[] = [], ctlB: number[] = [], liveB: number[] = [], entB: number[] = [];
  const legN: number[] = [], ctlN: number[] = [], liveN: number[] = [], entN: number[] = [];
  let nliveB = 0, nliveN = 0, dnB = 0, dnN = 0, bsB = 0, bsN = 0, nB = 0, nN = 0;

  for (const seed of SEEDS) {
    const u0 = seedUniverse(seed, bodies);
    for (let s = 0; s < SETTLE; s += 1) stepUniverse(u0);

    const outs = GRID.map((d) => play(seed, bodies, d));
    const base = play(seed, bodies, null);

    // ── OBJECTIVE A · the band, made scale-free ──────────────────────────────
    // Target is doing-nothing's own inertia raised by 25%: "spread it out by a
    // quarter and hold it there". Doing nothing scores 0 by construction, which
    // is tension rather than a miscalibrated constant.
    const I0 = inertiaOf(base);
    const bandScore = (u: Universe) => Math.max(0, 1 - Math.abs(inertiaOf(u) - I0 * 1.25) / (I0 * 0.25));
    const scB = outs.map(bandScore);
    const bestB = Math.max(...scB);
    dnB += bandScore(base); bsB += bestB; nB += 1;

    // The rule a player runs FOR THE BAND: add mass on the sparse side to push
    // the distribution outward. Physics knowledge required: "mass pulls".
    const sparseRule = (d: Drop) => {
      let s = 0;
      for (const b of u0.bodies) {
        const [x, y] = P(b);
        let g = Math.abs(Math.atan2(y, x) - d.ang); if (g > Math.PI) g = 2 * Math.PI - g;
        s += toFloat(b.mass) * Math.max(0, 1 - g / Math.PI);
      }
      return -s;
    };
    if (bestB - Math.min(...scB) > 1e-9) {
      nliveB += 1;
      legB.push(spearman(GRID.map(sparseRule), scB));
      ctlB.push(spearman(GRID.map(() => rnd()), scB));
      liveB.push(scB.filter((x) => x >= bestB * 0.9).length);
      const t = scB.reduce((p, q) => p + q, 0);
      let h = 0; if (t > 0) for (const x of scB) { const p = x / t; if (p > 0) h -= p * Math.log2(p); }
      entB.push(h);
    }

    // ── OBJECTIVE B · a named body reaching a named place ────────────────────
    // THE VIABILITY ORACLE, doing the job the plan already gave it. The zone is
    // the body-zero landing furthest from where doing nothing puts it, so at
    // least one action reaches it and inaction does not. A fixed world-space
    // point was unreachable on 5 of 7 seeds, which measured nothing.
    const zeroBase = bodyZero(base);
    const landings = outs.map(bodyZero);
    let far = landings[0]!, fd = -1;
    for (const l of landings) { const dd = d3(l, zeroBase); if (dd > fd) { fd = dd; far = l; } }
    // Self-scaling tolerance: the spread of the landings themselves, so the
    // ruler is the game's own geometry rather than a constant tuned at twelve
    // bodies.
    const spread = mean(landings.map((l) => d3(l, zeroBase))) || 1;
    const nounScore = (u: Universe) => Math.max(0, 1 - d3(bodyZero(u), far) / (spread * 1.5));
    const scN = outs.map(nounScore);
    const bestN = Math.max(...scN);
    dnN += nounScore(base); bsN += bestN; nN += 1;

    // The rule a player runs FOR THE NOUN: drop the mass on the bearing of the
    // zone, so its gravity pulls my body across. Physics knowledge required:
    // "mass pulls".
    const aimRule = (d: Drop) => {
      const b = u0.bodies[0]!;
      const [x, y] = P(b);
      const toZone = Math.atan2(far[1]! - y, far[0]! - x);
      let g = Math.abs(d.ang - toZone); if (g > Math.PI) g = 2 * Math.PI - g;
      return Math.cos(g);
    };
    if (bestN - Math.min(...scN) > 1e-9) {
      nliveN += 1;
      legN.push(spearman(GRID.map(aimRule), scN));
      ctlN.push(spearman(GRID.map(() => rnd()), scN));
      liveN.push(scN.filter((x) => x >= bestN * 0.9).length);
      const t = scN.reduce((p, q) => p + q, 0);
      let h = 0; if (t > 0) for (const x of scN) { const p = x / t; if (p > 0) h -= p * Math.log2(p); }
      entN.push(h);
    }
  }

  const f = (x: number, w: number) => (Number.isNaN(x) ? '  n/a' : (x >= 0 ? ' ' : '') + x.toFixed(3)).padStart(w);
  const row = (name: string, leg: number[], ctl: number[], live: number[], ent: number[], nlive: number, dn: number, bs: number, n: number) =>
    console.log(
      `${String(bodies).padStart(6)} | ${name.padEnd(9)} |${f(mean(leg), 11)} |${f(mean(ctl), 7)} |` +
      `${`${nlive}/${SEEDS.length}`.padStart(5)} |${(Number.isNaN(mean(live)) ? 'n/a' : mean(live).toFixed(1)).padStart(11)} |` +
      `${(Number.isNaN(mean(ent)) ? 'n/a' : mean(ent).toFixed(2)).padStart(8)} |${(dn / n).toFixed(3).padStart(11)} |${(bs / n).toFixed(3).padStart(6)}`,
    );
  row('BAND', legB, ctlB, liveB, entB, nliveB, dnB, bsB, nB);
  row('NOUN', legN, ctlN, liveN, entN, nliveN, dnN, bsN, nN);
}

console.log('');
console.log('Read it this way: LEGIBILITY must beat RANDOM by more than the sampling noise of a');
console.log('Spearman over 12 points (about 0.30 at these sample sizes), LIVE MOVES must not');
console.log('collapse toward 1, and DO-NOTHING must stay well below BEST or there is no game.');
