// BASELINE PROOF r4 · AGAINST THE SHIPPING RULESET ITSELF.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE REPLACES dark-ghost.ts RATHER THAN JOINING IT.
//
// r3 measured a copy of the rules living inside the probe. That is the project's
// own named failure mode one level up: the subject being its own witness. A
// proof of rules that exist only in the prover proves nothing about the game
// that ships, and every constant would have to be kept in sync by hand forever.
//
// So this imports `game/dark/steer.ts` and touches no rule of its own. If the
// shipping module changes, this measurement changes with it or it fails.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHAT r3 FOUND, AND WHAT CHANGED BECAUSE OF IT.
//
//   GHOST reached 78.8% of the ceiling against blind's 16.3% and random's 11.5%.
//   J6 -- the gate written to FAIL if the rule scores too high -- passed at
//   <=85%, so showing the landings makes the game playable without solving it.
//
// Two gates failed, and the screenshot found the same defect the numbers did,
// independently and while looking for something else:
//
//   J4  priced 46.0% against unpriced 78.8%. The budget cost 33 points.
//   J5  14 of 24 seeds served, against a floor of 70%.
//   the render  "12 of 14 are now out of reach" after a single drop.
//
// Both were traced to causes rather than tuned away. Flat prices with two shots
// admit no middle -- either every second shot is affordable or none is -- so a
// drop is now priced by its LEVERAGE, which is the one pricing rule the physics
// supplies. And a freely-drawn target bearing pointed where nothing travels, so
// it is snapped to the reachable set with the radius left alone.
//
// Whether those fixes work is what this file is for. They are recorded whether
// they do or not.
import { stepUniverse } from '../../game/dark/nbody.js';
import {
  BUDGET, LATTICE, LEG, SHOTS,
  beginRound, costOf, ghostsFor, markedAt, nearestGhost, playAct, scoreOf,
  type Act, type RoundState,
} from '../../game/dark/steer.js';
import { runGate, type Gate } from '../../foundry/montecarlo/orrery.js';

const SEEDS = Array.from({ length: 24 }, (_, i) => 101 + i * 7);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (v: readonly number[]) => (v.length ? v.reduce((p, q) => p + q, 0) / v.length : NaN);

let RNG = 0x6a09e667;
const rnd = () => { RNG ^= RNG << 13; RNG ^= RNG >>> 17; RNG ^= RNG << 5; return (RNG >>> 0) % 100000 / 100000; };

import * as ruleset from '../../game/dark/steer.js';
import { cloneUniverse } from '../../game/dark/nbody.js';

/**
 * Play a named pair of actions through the real rules, ignoring the budget.
 * Used only for the unpriced ceiling, which is the reference the human arms are
 * measured against.
 *
 * THE FIRST VERSION CALLED beginRound PER SEQUENCE AND DID NOT FINISH.
 * `beginRound` settles the universe and then runs fourteen forward projections
 * to place the ring, so calling it inside a 196-sequence loop re-derived the
 * whole round setup two hundred times per seed -- roughly a quarter of a million
 * integration steps to evaluate one board. The round is prepared ONCE and each
 * sequence plays on a clone of it, which is also the only way every sequence is
 * guaranteed to be scored against the SAME ring.
 */
function playPairOn(base: RoundState, a: Act | null, b: Act | null): number {
  const s: RoundState = { ...base, universe: cloneUniverse(base.universe), spent: 0, shot: 0, acts: [] };
  for (const act of [a, b]) {
    if (act) ruleset.applyAct(s.universe, act);
    for (let t = 0; t < LEG; t += 1) stepUniverse(s.universe);
  }
  return scoreOf(s);
}

/** The blind rule that failed three times: a bearing, never a magnitude. */
function aimAct(s: RoundState): Act {
  const m = markedAt(s.universe);
  const toRing = Math.atan2(s.ring.y - m.y, s.ring.x - m.x);
  let best = LATTICE[0]!, bv = -Infinity;
  for (const a of LATTICE) {
    if (a.verb !== 'MASS') continue;
    let g = Math.abs((a.k / 12) * Math.PI * 2 - toRing);
    if (g > Math.PI) g = 2 * Math.PI - g;
    if (Math.cos(g) > bv) { bv = Math.cos(g); best = a; }
  }
  return best;
}

const blind: number[] = [], ghost: number[] = [], random: number[] = [];
const lives: number[] = [], ceilings: number[] = [], prices: number[] = [];
let served = 0, agency = 0, bite = 0, affordShot2 = 0, escapesSeen = 0;

for (const seed of SEEDS) {
  const probe = beginRound(seed);

  // ── the ceiling: all 196 sequences through the real rules, unpriced ──────
  const all: number[] = [];
  for (const a of LATTICE) for (const b of LATTICE) all.push(playPairOn(probe, a, b));
  const ceiling = Math.max(...all);
  const idle = playPairOn(probe, null, null);

  // Viability: at least two sequences reach, and inaction does not.
  if (all.filter((x) => x > 0.5).length < 2 || idle > 0.2) continue;
  served += 1;
  ceilings.push(ceiling);
  agency += ceiling - idle;
  lives.push(all.filter((x) => x >= ceiling * 0.9).length);

  // The spread of prices on offer -- a budget with one price is not a budget.
  for (const g of ghostsFor(probe)) prices.push(g.cost);

  // ── BLIND · unpriced, so its failure is not the budget's fault ───────────
  {
    const s: RoundState = { ...probe, universe: cloneUniverse(probe.universe), spent: 0, shot: 0, acts: [] };
    for (let i = 0; i < SHOTS; i += 1) {
      const a = aimAct(s);
      ruleset.applyAct(s.universe, a);
      for (let t = 0; t < LEG; t += 1) stepUniverse(s.universe);
      s.shot += 1;
    }
    blind.push(scoreOf(s) / ceiling);
  }

  // ── GHOST · the shipping policy, PRICED, through playAct ────────────────
  // There is no unpriced ghost arm any more. r3 measured one and it flattered
  // the design by 33 points; the game has a budget, so the policy is measured
  // with it.
  {
    const s: RoundState = { ...probe, universe: cloneUniverse(probe.universe), spent: 0, shot: 0, acts: [] };
    for (let i = 0; i < SHOTS; i += 1) {
      const gs = ghostsFor(s);
      if (gs.some((g) => g.escapes)) escapesSeen += 1;
      if (i === 1) affordShot2 += gs.filter((g) => g.affordable).length;
      playAct(s, nearestGhost(s));
    }
    ghost.push(scoreOf(s) / ceiling);
  }

  // ── RANDOM · the negative control, also priced ──────────────────────────
  {
    let acc = 0;
    for (let t = 0; t < 8; t += 1) {
      const s: RoundState = { ...probe, universe: cloneUniverse(probe.universe), spent: 0, shot: 0, acts: [] };
      for (let i = 0; i < SHOTS; i += 1) {
        const afford = ghostsFor(s).filter((g) => g.affordable);
        playAct(s, afford[Math.floor(rnd() * afford.length)]!.act);
      }
      acc += scoreOf(s);
    }
    random.push(acc / 8 / ceiling);
  }

  // ── does the budget change the answer? ──────────────────────────────────
  {
    const s: RoundState = { ...probe, universe: cloneUniverse(probe.universe), spent: 0, shot: 0, acts: [] };
    const gs = ghostsFor(s);
    let free = gs[0]!, paid = gs.find((g) => g.affordable)!;
    for (const g of gs) {
      if (dist(g.pos, s.ring) < dist(free.pos, s.ring)) free = g;
      if (g.affordable && dist(g.pos, s.ring) < dist(paid.pos, s.ring)) paid = g;
    }
    if (free.act.label !== paid.act.label) bite += 1;
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const noise = Math.abs(mean(blind) - mean(random));
const priceSpread = Math.max(...prices) - Math.min(...prices);

console.log('BASELINE PROOF r4 · MEASURED AGAINST game/dark/steer.ts ITSELF');
console.log(`${LATTICE.length} actions x ${SHOTS} shots = ${LATTICE.length ** SHOTS} sequences · ${LEG} steps per shot · ${SEEDS.length} seeds`);
console.log('');
console.log(`served by the viability oracle       ${served}/${SEEDS.length}  (${pct(served / SEEDS.length)})`);
console.log(`mean ceiling                         ${mean(ceilings).toFixed(3)}`);
console.log('');
console.log(`RANDOM   share of ceiling            ${pct(mean(random))}   negative control, priced`);
console.log(`BLIND    share of ceiling            ${pct(mean(blind))}   aim, watch, aim again`);
console.log(`GHOST    share of ceiling            ${pct(mean(ghost))}   pick the dot nearest the ring, PRICED`);
console.log('');
console.log(`agency over doing nothing            ${(agency / Math.max(1, served)).toFixed(3)}`);
console.log(`live sequences within 10% of ceiling ${mean(lives).toFixed(1)} of ${LATTICE.length ** SHOTS}`);
console.log(`price spread on a drop               ${Math.min(...prices).toFixed(1)} to ${Math.max(...prices).toFixed(1)}  (spread ${priceSpread.toFixed(1)})`);
console.log(`affordable actions at shot 2         ${(affordShot2 / Math.max(1, served)).toFixed(1)} of ${LATTICE.length}`);
console.log(`cost changes the best action         ${pct(bite / Math.max(1, served))}`);
console.log(`noise floor (blind - random)         ${(noise * 100).toFixed(1)} points`);

interface R { ghost: number; blind: number; random: number; served: number; live: number; agency: number; bite: number; noise: number; spread: number; afford: number }
const obs: R = {
  ghost: mean(ghost), blind: mean(blind), random: mean(random), served: served / SEEDS.length,
  live: mean(lives), agency: agency / Math.max(1, served), bite: bite / Math.max(1, served),
  noise, spread: priceSpread, afford: affordShot2 / Math.max(1, served),
};
const W = (o: Partial<R>): R => ({ ghost: 0.7, blind: 0.16, random: 0.11, served: 0.8, live: 5, agency: 0.8, bite: 0.5, noise: 0.05, spread: 0.6, afford: 8, ...o });

const gates: Gate<R>[] = [
  { name: 'K1 the shipping policy reaches >=50% of the ceiling', predicate: (r) => r.ghost >= 0.5, knownPass: W({}), knownFail: W({ ghost: 0.46 }) },
  { name: 'K2 it beats the blind rule by >=20 points', predicate: (r) => r.ghost - r.blind >= 0.20, knownPass: W({}), knownFail: W({ ghost: 0.25 }) },
  { name: 'K3 and beats random by >=5x the noise floor', predicate: (r) => r.ghost - r.random >= r.noise * 5, knownPass: W({}), knownFail: W({ ghost: 0.30, noise: 0.06 }) },
  { name: 'K4 but does NOT solve it (<=85% of the ceiling)', predicate: (r) => r.ghost <= 0.85, knownPass: W({}), knownFail: W({ ghost: 0.97 }) },
  { name: 'K5 >=70% of seeds served', predicate: (r) => r.served >= 0.7, knownPass: W({}), knownFail: W({ served: 0.583 }) },
  { name: 'K6 >=3 live sequences, and not all of them', predicate: (r) => r.live >= 3 && r.live < 98, knownPass: W({}), knownFail: W({ live: 1.0 }) },
  { name: 'K7 agency over doing nothing >=0.30', predicate: (r) => r.agency >= 0.3, knownPass: W({}), knownFail: W({ agency: 0.05 }) },
  { name: 'K8 the cost changes the best action on >=30%', predicate: (r) => r.bite >= 0.3, knownPass: W({}), knownFail: W({ bite: 0.1 }) },
  // K9 and K10 exist because of the screenshot, not because of a number.
  { name: 'K9 prices actually differ (spread >=0.4)', predicate: (r) => r.spread >= 0.4, knownPass: W({}), knownFail: W({ spread: 0.0 }) },
  { name: 'K10 shot two still has >=5 affordable actions', predicate: (r) => r.afford >= 5, knownPass: W({}), knownFail: W({ afford: 2 }) },
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
  ? 'BASELINE r4 PROVEN by simulation, against the shipping rules. Valid once the auditor signs it.'
  : `BASELINE r4 NOT PROVEN: ${failed} of ${gates.length} gates failed. Recorded, not re-tuned.`);
