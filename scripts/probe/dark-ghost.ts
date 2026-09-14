// BASELINE PROOF r3 · GHOST LANDINGS.
//
// ═════════════════════════════════════════════════════════════════════════════
// THIS IS WHAT THE MEASUREMENTS SAID TO BUILD, NOT WHAT SEEMED APPEALING.
//
// The discriminator ended three cycles of failure with a specific diagnosis:
//
//   finer control            -0.5 points of absolute reach     -> worthless
//   information at its bound +33.4 points                      -> a third of the game
//   my rule for using it     12.9%, against the 49.7% allowed   -> THE FAILURE
//
// So the missing thing was never the forecast. It was A RULE FOR READING ONE.
// And both policies that failed -- mine and the auditor's -- share one property:
// they reason about DIRECTION, which the intuition curve says is knowable, and
// they never touch MAGNITUDE, which no horizon makes knowable. A rule built out
// of the half a player cannot estimate was always going to lose.
//
// GHOST LANDINGS removes the estimation instead of improving it. For each action
// on the lattice, the engine already integrates the future; draw where the marked
// body ENDS UP. The player does not read a cone and infer a magnitude -- they see
// fourteen dots and pick the one nearest the ring.
//
// That converts an unrankable magnitude judgement into a NEAREST-NEIGHBOUR
// COMPARISON, which is the one spatial task humans do instantly and without
// training. It is candidate #46 of the fifty-five ("render the reachable set
// itself") and ORRERY's E7 ("the cone is the search's by-product, not a second
// computation") arriving at the same place from opposite ends.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHY THIS IS NOT THE PREVIEW DIAL AGAIN.
//
// Game two measured order preview buying 31.6 points of agency floor for 47
// points of solver margin: it converted unreachable ceiling into reachable skill
// WITHOUT CREATING SKILL, and that trade is the standing objection to every
// observability mechanic in this project.
//
// The distinction here is measured rather than asserted. A ghost is strictly
// LESS information than the FORESIGHT arm had: foresight valued each first shot
// by its outcome under an optimal-ish follow-up, whereas a ghost shows only where
// the body goes IF NOTHING ELSE HAPPENS. The second shot's consequence is not
// shown and cannot be, because it has not been chosen yet. So the skill that
// remains is the sequencing skill -- what the second shot can still rescue --
// and that is the part the ceiling says is worth 50 points.
//
// If ghosts reach the ceiling, this objection is upheld and the game is solved
// rather than made playable. That is gate J6 and it is written to FAIL on a
// score that is too high.
import { stepUniverse, type Universe } from '../../game/dark/nbody.js';
import { fromFloat, toFloat } from '../../game/dark/fixed.js';
import { settled, runGate, type Gate } from '../../foundry/montecarlo/orrery.js';

const SEEDS = Array.from({ length: 24 }, (_, i) => 101 + i * 7);
const SETTLE = 80;
const BODIES = 5;
const BEARINGS = 12;
const LEG = 120;

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
const mean = (v: readonly number[]) => (v.length ? v.reduce((p, q) => p + q, 0) / v.length : NaN);

const clone = (u: Universe): Universe => ({ seed: u.seed, step: u.step, bodies: u.bodies.map((b) => ({ pos: b.pos, vel: b.vel, mass: b.mass })) });

function seq(seed: number, a: Act | null, b: Act | null): readonly [number, number] {
  const u = settled(seed, BODIES, SETTLE);
  if (a) apply(u, a); advance(u, LEG);
  if (b) apply(u, b); advance(u, LEG);
  return at(u);
}

/**
 * THE GHOSTS. For each action, where the marked body ends up if this is the last
 * thing that happens. Exactly what an interface can draw, and nothing more.
 *
 * `remaining` is how much round is left, so the ghosts shown before shot two are
 * honest about there being only one leg to go.
 */
function ghosts(state: Universe, lat: readonly Act[], remaining: number): (readonly [number, number])[] {
  return lat.map((a) => { const u = clone(state); apply(u, a); advance(u, remaining); return at(u); });
}

/** The blind rule both earlier policies used: a bearing, never a magnitude. */
function aimAt(u: Universe, zone: readonly [number, number]): Act {
  const [px, py] = at(u);
  const toZone = Math.atan2(zone[1] - py, zone[0] - px);
  let best = LATTICE[0]!, bv = -Infinity;
  for (const a of LATTICE) {
    if (a.verb !== 'MASS') continue;
    let g = Math.abs((a.k / BEARINGS) * Math.PI * 2 - toZone);
    if (g > Math.PI) g = 2 * Math.PI - g;
    if (Math.cos(g) > bv) { bv = Math.cos(g); best = a; }
  }
  return best;
}

let RNG = 0x6a09e667;
const rnd = () => { RNG ^= RNG << 13; RNG ^= RNG >>> 17; RNG ^= RNG << 5; return (RNG >>> 0) % 100000 / 100000; };

const blind: number[] = [], ghost: number[] = [], ghostBudget: number[] = [], random: number[] = [];
const lives: number[] = [], ents: number[] = [], absCeil: number[] = [];
let served = 0, agency = 0, bite = 0, ghostsDrawn = 0;

for (const seed of SEEDS) {
  const zeroLanding = seq(seed, null, null);
  const scout = LATTICE.map((a) => seq(seed, a, null));
  const dists = scout.map((l) => d2(l, zeroLanding)).sort((x, y) => x - y);
  const med = dists[Math.floor(dists.length / 2)] || 1;
  const theta = ((seed * 2654435761) % 3600) / 3600 * Math.PI * 2;
  const zone = [zeroLanding[0] + Math.cos(theta) * med, zeroLanding[1] + Math.sin(theta) * med] as const;
  const score = (l: readonly number[]) => Math.max(0, 1 - d2(l, zone) / med);

  const all: number[] = [];
  for (const a of LATTICE) for (const b of LATTICE) all.push(score(seq(seed, a, b)));
  const ceiling = Math.max(...all);
  if (all.filter((x) => x > 0.5).length < 2 || score(zeroLanding) > 0.2) continue;
  served += 1;
  absCeil.push(ceiling);
  agency += ceiling - score(zeroLanding);

  // ── BLIND · the policy that failed three times ───────────────────────────
  {
    const u = settled(seed, BODIES, SETTLE);
    apply(u, aimAt(u, zone)); advance(u, LEG);
    apply(u, aimAt(u, zone)); advance(u, LEG);
    blind.push(score(at(u)) / ceiling);
  }

  // ── GHOST · pick the dot nearest the ring, watch, pick again ─────────────
  {
    const u = settled(seed, BODIES, SETTLE);
    // Shot one: ghosts run the WHOLE remaining round, because the player does
    // not yet know what their second shot will be and the interface must not
    // pretend otherwise.
    const g1 = ghosts(u, LATTICE, LEG * 2);
    ghostsDrawn += g1.length;
    let bi = 0;
    for (let i = 1; i < g1.length; i += 1) if (d2(g1[i]!, zone) < d2(g1[bi]!, zone)) bi = i;
    apply(u, LATTICE[bi]!); advance(u, LEG);
    // Shot two: ghosts run the one leg that is left.
    const g2 = ghosts(u, LATTICE, LEG);
    ghostsDrawn += g2.length;
    let bj = 0;
    for (let i = 1; i < g2.length; i += 1) if (d2(g2[i]!, zone) < d2(g2[bj]!, zone)) bj = i;
    apply(u, LATTICE[bj]!); advance(u, LEG);
    ghost.push(score(at(u)) / ceiling);
  }

  // ── GHOST UNDER A BUDGET · the same rule, but it must afford both shots ──
  // A budget of 1.7 buys one mass drop and one spin, never two drops. If the
  // ghost policy is only good when it is free, the cost is not a mechanic.
  {
    const BUDGET = 1.7;
    const u = settled(seed, BODIES, SETTLE);
    const g1 = ghosts(u, LATTICE, LEG * 2);
    let bi = -1;
    for (let i = 0; i < g1.length; i += 1) {
      // Affordable only if SOMETHING is still affordable afterwards.
      const cheapestNext = Math.min(...LATTICE.map((a) => a.cost));
      if (LATTICE[i]!.cost + cheapestNext > BUDGET) continue;
      if (bi < 0 || d2(g1[i]!, zone) < d2(g1[bi]!, zone)) bi = i;
    }
    if (bi < 0) bi = 0;
    const spent = LATTICE[bi]!.cost;
    apply(u, LATTICE[bi]!); advance(u, LEG);
    const g2 = ghosts(u, LATTICE, LEG);
    let bj = -1;
    for (let i = 0; i < g2.length; i += 1) {
      if (spent + LATTICE[i]!.cost > BUDGET) continue;
      if (bj < 0 || d2(g2[i]!, zone) < d2(g2[bj]!, zone)) bj = i;
    }
    if (bj < 0) bj = LATTICE.findIndex((a) => a.verb === 'TORQUE');
    apply(u, LATTICE[bj]!); advance(u, LEG);
    ghostBudget.push(score(at(u)) / ceiling);
  }

  // ── RANDOM · the negative control ───────────────────────────────────────
  let r = 0;
  for (let t = 0; t < 8; t += 1) r += score(seq(seed, LATTICE[Math.floor(rnd() * LATTICE.length)]!, LATTICE[Math.floor(rnd() * LATTICE.length)]!));
  random.push(r / 8 / ceiling);

  lives.push(all.filter((x) => x >= ceiling * 0.9).length);
  const tot = all.reduce((p, q) => p + q, 0);
  let h = 0;
  if (tot > 0) for (const x of all) { const p = x / tot; if (p > 0) h -= p * Math.log2(p); }
  ents.push(h);

  const afford = [];
  for (let i = 0; i < LATTICE.length; i += 1) for (let j = 0; j < LATTICE.length; j += 1) {
    if (LATTICE[i]!.cost + LATTICE[j]!.cost <= 1.7) afford.push(all[i * LATTICE.length + j]!);
  }
  if ((afford.length ? Math.max(...afford) : 0) < ceiling - 1e-9) bite += 1;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const noise = Math.abs(mean(blind) - mean(random));

console.log('BASELINE PROOF r3 · GHOST LANDINGS');
console.log(`${LATTICE.length} actions x 2 shots = ${LATTICE.length ** 2} sequences · ${BODIES} bodies · ${LEG}+${LEG} steps · ${SEEDS.length} seeds`);
console.log('');
console.log(`served by the viability oracle       ${served}/${SEEDS.length}  (${pct(served / SEEDS.length)})`);
console.log(`mean absolute ceiling                ${mean(absCeil).toFixed(3)}`);
console.log('');
console.log(`RANDOM        share of ceiling       ${pct(mean(random))}   negative control`);
console.log(`BLIND         share of ceiling       ${pct(mean(blind))}   aim, watch, aim again`);
console.log(`GHOST         share of ceiling       ${pct(mean(ghost))}   pick the dot nearest the ring`);
console.log(`GHOST+BUDGET  share of ceiling       ${pct(mean(ghostBudget))}   the same rule, priced`);
console.log('');
console.log(`agency over doing nothing            ${(agency / Math.max(1, served)).toFixed(3)}`);
console.log(`live sequences within 10% of ceiling ${mean(lives).toFixed(1)} of ${LATTICE.length ** 2}`);
console.log(`move-value entropy                   ${mean(ents).toFixed(2)} bits`);
console.log(`cost bite                            ${pct(bite / Math.max(1, served))}`);
console.log(`ghosts an interface must draw        ${(ghostsDrawn / Math.max(1, served) / 2).toFixed(0)} per decision`);
console.log(`noise floor (blind - random)         ${(noise * 100).toFixed(1)} points`);

// ═════════════════════════════════════════════════════════════════════════════
// THE GATES, RUN THROUGH THE INSTRUMENT BUILT FOR THEM.
//
// Every gate below carries a known-pass and a known-fail witness and is executed
// by `runGate`, which throws on a predicate that passes where it must not. That
// instrument exists because a gate in revision 2 printed PASS for a condition it
// was not testing, and because the verdict line of the discriminator did the
// same thing one commit later in a script that did not use it.
interface R {
  ghost: number; ghostBudget: number; blind: number; random: number;
  served: number; live: number; ent: number; agency: number; bite: number; noise: number;
}
const obs: R = {
  ghost: mean(ghost), ghostBudget: mean(ghostBudget), blind: mean(blind), random: mean(random),
  served: served / SEEDS.length, live: mean(lives), ent: mean(ents),
  agency: agency / Math.max(1, served), bite: bite / Math.max(1, served), noise,
};
const W = (o: Partial<R>): R => ({ ghost: 0.6, ghostBudget: 0.55, blind: 0.16, random: 0.12, served: 0.8, live: 5, ent: 5, agency: 0.8, bite: 0.5, noise: 0.04, ...o });

const gates: Gate<R>[] = [
  { name: 'J1 a human rule reaches >=50% of the ceiling', predicate: (r) => r.ghost >= 0.5,
    knownPass: W({}), knownFail: W({ ghost: 0.163 }) },
  { name: 'J2 it beats the blind rule by >=20 points', predicate: (r) => r.ghost - r.blind >= 0.20,
    knownPass: W({}), knownFail: W({ ghost: 0.25, blind: 0.16 }) },
  { name: 'J3 and beats random by >=5x the noise floor', predicate: (r) => r.ghost - r.random >= r.noise * 5,
    knownPass: W({}), knownFail: W({ ghost: 0.30, random: 0.12, noise: 0.06 }) },
  { name: 'J4 it survives a budget (>=90% of its free score)', predicate: (r) => r.ghostBudget >= r.ghost * 0.9,
    knownPass: W({}), knownFail: W({ ghost: 0.6, ghostBudget: 0.2 }) },
  { name: 'J5 >=70% of seeds served', predicate: (r) => r.served >= 0.7,
    knownPass: W({}), knownFail: W({ served: 0.583 }) },
  // J6 IS WRITTEN TO FAIL ON A SCORE THAT IS TOO HIGH. If ghosts reach the
  // ceiling the game is solved rather than made playable, and the standing
  // objection to every observability mechanic in this project is upheld.
  { name: 'J6 but does NOT solve it (<=85% of the ceiling)', predicate: (r) => r.ghost <= 0.85,
    knownPass: W({}), knownFail: W({ ghost: 0.97 }) },
  { name: 'J7 >=3 live sequences, and not all of them', predicate: (r) => r.live >= 3 && r.live < 98,
    knownPass: W({}), knownFail: W({ live: 1.0 }) },
  { name: 'J8 entropy >=4.0 bits', predicate: (r) => r.ent >= 4.0,
    knownPass: W({}), knownFail: W({ ent: 2.3 }) },
  { name: 'J9 agency over doing nothing >=0.30', predicate: (r) => r.agency >= 0.3,
    knownPass: W({}), knownFail: W({ agency: 0.05 }) },
  { name: 'J10 the cost changes the answer on >=30%', predicate: (r) => r.bite >= 0.3,
    knownPass: W({}), knownFail: W({ bite: 0.1 }) },
];

console.log('');
console.log('── PRE-REGISTERED ACCEPTANCE · each gate proved it can fail before it ran ──');
let failed = 0;
for (const g of gates) {
  const res = runGate(g, obs);
  if (!res.pass) failed += 1;
  console.log(`${res.pass ? 'PASS' : 'FAIL'}  ${g.name}`);
}
console.log('');
console.log(failed === 0
  ? 'BASELINE r3 PROVEN by simulation. Still not valid until the auditor signs it.'
  : `BASELINE r3 NOT PROVEN: ${failed} of ${gates.length} gates failed. Recorded, not re-tuned.`);
