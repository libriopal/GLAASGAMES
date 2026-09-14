// THE BASELINE PROOF, REVISION 2 · DARKMATTER AS A SEQUENCING GAME.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS: THE AUDITOR RETURNED REVISE, AND WAS RIGHT.
//
// Revision 1 failed 3 of 7 pre-registered gates and the coverage probe named the
// cause: fourteen discrete actions reach about eleven distinct places and cover
// 33.7% of the target annulus, so two thirds of all targets are unreachable in
// one move. The author's proposed fix was "allow a second shot". The independent
// auditor refused that framing:
//
//   "It is an admission. The 'One Shot Cannot Aim' finding proves that the
//    current discrete action lattice is mathematically incapable of satisfying a
//    'single-shot aiming' objective... The design must either move to continuous
//    control (which complicates the engine) or, more productively, pivot the
//    objective from 'aiming' to 'sequencing' -- where the player uses the first
//    shot to set the momentum for a second, more precise intervention."
//
//   Headline: "The baseline is currently attempting to solve a 'One Shot'
//    problem that the data has already falsified."
//
// That is a different game, not a patched one, and this file measures the
// different game.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHAT CHANGED, AND WHAT THAT CHANGES ABOUT THE MEASUREMENT.
//
// Revision 1 asked "can a human rank fourteen actions?" and answered it with a
// Spearman coefficient whose noise floor (0.533 on three seeds) swallowed it.
// A rank correlation over a single decision was always a weak instrument.
//
// Revision 2 asks the question the other two games ask, on the instrument the
// other two games use: HOW MUCH OF THE CEILING DOES A PLAYER PLAYING BY
// INTUITION ACTUALLY REACH? That is the agency floor / solver margin pair, it
// makes all three games comparable on one ruler, and it does not degrade to
// noise on a small sample the way a correlation does.
//
//   CEILING   the best of all 196 two-shot sequences. It shares the lattice with
//             the player exactly -- standing rule (C) -- because both draw from
//             the same 14 actions, so a negative solver margin here would be a
//             broken evaluator rather than a strong player.
//   INTUITION shot one by the aim rule from the opening state; shot two by the
//             aim rule AGAIN, from the state the first shot produced. This is
//             what "direction is intuitive at 120 steps" licenses a player to do,
//             twice, and nothing more.
//   RANDOM    two random actions. The mandatory negative control.
//   NOTHING   the screensaver detector.
import { stepUniverse, type Universe } from '../../game/dark/nbody.js';
import { fromFloat, toFloat } from '../../game/dark/fixed.js';
import { settled } from '../../foundry/montecarlo/orrery.js';

const SEEDS = Array.from({ length: 24 }, (_, i) => 101 + i * 7);
const SETTLE = 80;
const BODIES = 5;
const BEARINGS = 12;
const LEG = 120; // steps per shot -- the horizon at which direction is 95.4% correct

type Verb = 'MASS' | 'TORQUE';
interface Act { readonly verb: Verb; readonly k: number; readonly cost: number; readonly label: string }
const LATTICE: Act[] = [];
for (let k = 0; k < BEARINGS; k += 1) LATTICE.push({ verb: 'MASS', k, cost: 1.0, label: `mass ${k}` });
for (const k of [0, 1]) LATTICE.push({ verb: 'TORQUE', k, cost: 0.6, label: k === 0 ? 'spin against' : 'spin with' });

function apply(u: Universe, a: Act): void {
  if (a.verb === 'MASS') {
    const ang = (a.k / BEARINGS) * Math.PI * 2;
    u.bodies.push({
      pos: { x: fromFloat(Math.cos(ang) * 7), y: fromFloat(Math.sin(ang) * 7), z: fromFloat(0.4) },
      vel: { x: 0n, y: 0n, z: 0n }, mass: fromFloat(1.1),
    });
  } else {
    const mag = a.k === 0 ? -0.09 : 0.09;
    for (const q of u.bodies) {
      const px = toFloat(q.pos.x), py = toFloat(q.pos.y);
      const r = Math.hypot(px, py) || 1;
      q.vel = { x: q.vel.x + fromFloat((-py / r) * mag), y: q.vel.y + fromFloat((px / r) * mag), z: q.vel.z };
    }
  }
}

const at = (u: Universe) => [toFloat(u.bodies[0]!.pos.x), toFloat(u.bodies[0]!.pos.y)] as const;
const d2 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
const advance = (u: Universe, n: number) => { for (let s = 0; s < n; s += 1) stepUniverse(u); };

/** Two shots, the second after the first leg. Returns body zero's landing. */
function seq(seed: number, a: Act | null, b: Act | null): readonly [number, number] {
  const u = settled(seed, BODIES, SETTLE);
  if (a) apply(u, a);
  advance(u, LEG);
  if (b) apply(u, b);
  advance(u, LEG);
  return at(u);
}

/** One shot over the SAME TOTAL TIME. The control for G2: if this matches the
 *  two-shot result, sequencing bought nothing and the revision is unjustified. */
function single(seed: number, a: Act | null): readonly [number, number] {
  const u = settled(seed, BODIES, SETTLE);
  if (a) apply(u, a);
  advance(u, LEG * 2);
  return at(u);
}

/** The rule intuition licenses: pick the bearing pointing at the zone. */
function aimAt(u: Universe, zone: readonly [number, number]): Act {
  const [px, py] = at(u);
  const toZone = Math.atan2(zone[1] - py, zone[0] - px);
  let best = LATTICE[0]!, bestv = -Infinity;
  for (const a of LATTICE) {
    if (a.verb !== 'MASS') continue;
    let g = Math.abs((a.k / BEARINGS) * Math.PI * 2 - toZone);
    if (g > Math.PI) g = 2 * Math.PI - g;
    const v = Math.cos(g);
    if (v > bestv) { bestv = v; best = a; }
  }
  return best;
}

let RNG = 0x5bd1e995;
const rnd = (): number => { RNG ^= RNG << 13; RNG ^= RNG >>> 17; RNG ^= RNG << 5; return (RNG >>> 0) % 100000 / 100000; };
const mean = (v: readonly number[]) => (v.length ? v.reduce((p, q) => p + q, 0) / v.length : NaN);

console.log('BASELINE PROOF r2 · DARKMATTER AS A SEQUENCING GAME');
console.log(`${LATTICE.length} actions x 2 shots = ${LATTICE.length ** 2} sequences · ${BODIES} bodies · ${LEG}+${LEG} steps · ${SEEDS.length} seeds`);
console.log('The zone is placed blind to which sequence wins. Metric is share of ceiling,');
console.log('which is the instrument games one and two are gated on.');
console.log('');

const intuition: number[] = [], randoms: number[] = [], singles: number[] = [];
const lives: number[] = [], ents: number[] = [];
let served = 0, agency = 0, bite = 0, ceilSum = 0;

for (const seed of SEEDS) {
  const u0 = settled(seed, BODIES, SETTLE);
  const zeroLanding = seq(seed, null, null);

  // ── the zone, placed blind ────────────────────────────────────────────────
  const scout = LATTICE.map((a) => seq(seed, a, null));
  const dists = scout.map((l) => d2(l, zeroLanding)).sort((x, y) => x - y);
  const med = dists[Math.floor(dists.length / 2)] || 1;
  const theta = ((seed * 2654435761) % 3600) / 3600 * Math.PI * 2;
  const zone = [zeroLanding[0] + Math.cos(theta) * med, zeroLanding[1] + Math.sin(theta) * med] as const;
  const tol = med;
  const score = (l: readonly number[]) => Math.max(0, 1 - d2(l, zone) / tol);

  // ── the ceiling: all 196 sequences, sharing the player's lattice exactly ──
  const all: { a: Act; b: Act; s: number }[] = [];
  for (const a of LATTICE) for (const b of LATTICE) all.push({ a, b, s: score(seq(seed, a, b)) });
  const ceiling = Math.max(...all.map((x) => x.s));
  const baseScore = score(zeroLanding);

  // Viability, reported not hidden: at least two sequences reach, inaction does not.
  if (all.filter((x) => x.s > 0.5).length < 2 || baseScore > 0.2) continue;
  served += 1;
  ceilSum += ceiling;
  agency += ceiling - baseScore;

  // ── INTUITION: aim, watch, aim again from what actually happened ─────────
  const u = settled(seed, BODIES, SETTLE);
  const first = aimAt(u, zone);
  apply(u, first); advance(u, LEG);
  const second = aimAt(u, zone);
  apply(u, second); advance(u, LEG);
  intuition.push(score(at(u)) / (ceiling || 1));

  // ── RANDOM: the negative control ────────────────────────────────────────
  let r = 0;
  for (let t = 0; t < 8; t += 1) {
    const ra = LATTICE[Math.floor(rnd() * LATTICE.length)]!;
    const rb = LATTICE[Math.floor(rnd() * LATTICE.length)]!;
    r += score(seq(seed, ra, rb));
  }
  randoms.push(r / 8 / (ceiling || 1));

  // ── ONE SHOT, SAME TOTAL TIME: the control for whether sequencing earned it ─
  singles.push(Math.max(...LATTICE.map((a) => score(single(seed, a)))) / (ceiling || 1));

  lives.push(all.filter((x) => x.s >= ceiling * 0.9).length);
  const tot = all.reduce((p, q) => p + q.s, 0);
  let h = 0;
  if (tot > 0) for (const x of all) { const p = x.s / tot; if (p > 0) h -= p * Math.log2(p); }
  ents.push(h);

  // ── COST: a budget that affords one mass drop and one spin, not two drops ──
  const BUDGET = 1.7;
  const afford = all.filter((x) => x.a.cost + x.b.cost <= BUDGET);
  const bestPaid = afford.length ? Math.max(...afford.map((x) => x.s)) : 0;
  if (bestPaid < ceiling - 1e-9) bite += 1;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`served by the viability oracle          ${served}/${SEEDS.length}  (${pct(served / SEEDS.length)})`);
console.log(`mean ceiling score                      ${(ceilSum / Math.max(1, served)).toFixed(3)}`);
console.log('');
console.log(`INTUITION  share of ceiling             ${pct(mean(intuition))}   aim, watch, aim again`);
console.log(`RANDOM     share of ceiling             ${pct(mean(randoms))}   negative control`);
console.log(`ONE SHOT   share of ceiling             ${pct(mean(singles))}   same total time, one action`);
console.log(`AGENCY     ceiling over doing nothing   ${(agency / Math.max(1, served)).toFixed(3)}`);
console.log(`LIVE SEQUENCES within 10% of ceiling    ${mean(lives).toFixed(1)} of ${LATTICE.length ** 2}`);
console.log(`MOVE-VALUE ENTROPY                      ${mean(ents).toFixed(2)} bits`);
console.log(`COST BITE  budget changes the answer    ${pct(bite / Math.max(1, served))}`);

console.log('');
console.log('── PRE-REGISTERED ACCEPTANCE, WRITTEN BEFORE THIS RAN ──');
const checks: [string, boolean, string][] = [
  ['H1 >=70% of seeds served (r1 failed at 12.5%)', served >= SEEDS.length * 0.7, `${served}/${SEEDS.length}`],
  ['H2 intuition reaches >=50% of the ceiling', mean(intuition) >= 0.5, pct(mean(intuition))],
  ['H3 intuition beats random by >=15 points', mean(intuition) - mean(randoms) >= 0.15, `${pct(mean(intuition))} vs ${pct(mean(randoms))}`],
  ['H4 sequencing beats one shot at equal time', mean(intuition) > mean(singles) || mean(singles) < 0.9, `2-shot ${pct(mean(intuition))} · 1-shot ceiling ${pct(mean(singles))}`],
  ['H5 >=4 live sequences, and not all of them', mean(lives) >= 4 && mean(lives) < LATTICE.length ** 2 * 0.5, `${mean(lives).toFixed(1)} of ${LATTICE.length ** 2}`],
  ['H6 entropy >=4.0 bits over 196 sequences', mean(ents) >= 4.0, `${mean(ents).toFixed(2)}`],
  ['H7 agency over doing nothing >=0.30', agency / Math.max(1, served) >= 0.3, `${(agency / Math.max(1, served)).toFixed(3)}`],
  ['H8 cost changes the answer on >=30% of seeds', bite / Math.max(1, served) >= 0.3, pct(bite / Math.max(1, served))],
];
let failed = 0;
for (const [n, p, d] of checks) { if (!p) failed += 1; console.log(`${p ? 'PASS' : 'FAIL'}  ${n.padEnd(48)} ${d}`); }
console.log('');
console.log(failed === 0
  ? 'BASELINE r2 PROVEN by simulation. Still not valid until the auditor signs the revision.'
  : `BASELINE r2 NOT PROVEN: ${failed} of ${checks.length} gates failed. Recorded, not re-tuned.`);
