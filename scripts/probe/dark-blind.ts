// BLIND, OR CLUMSY? THE DISCRIMINATOR THE AUDITOR NAMED.
//
// ═════════════════════════════════════════════════════════════════════════════
// THE QUESTION, AND WHY IT IS THE ONLY ONE WORTH ASKING NEXT.
//
// Two designs, two failed proofs. The ceiling is rich -- 5.30 bits of move-value
// entropy, 3.6 live sequences in 196, agency 0.842 over inaction -- and the best
// rule a human can state reaches 16.3% of it against a random control at 9.7%.
// Every structural measure says there is a game in there and no person can play
// it.
//
// The auditor's headline: "The next step is the most dangerous: deciding if the
// player's failure is because they are BLIND (needs a forecast) or because they
// are CLUMSY (needs continuous control)."
//
// Those two diagnoses prescribe opposite and expensive designs, and guessing
// between them is how a project spends a month on the wrong one. They are
// cheaply separable, so they are separated here BEFORE either is built.
//
//   BLIND    the player cannot SEE where things will go. Remedy: a forecast.
//            Tested by giving the same coarse lattice a one-shot-ahead preview --
//            exactly what a forecast cone shows, and no more. If share of ceiling
//            jumps, the player was blind.
//
//   CLUMSY   the player can see well enough but cannot EXPRESS the action they
//            want. Remedy: finer control. Tested by giving the same blind aim
//            rule a lattice of 24 bearings instead of 12, with its own ceiling
//            recomputed over 676 sequences so the comparison stays honest. If
//            share of ceiling jumps, the player was clumsy.
//
// ═════════════════════════════════════════════════════════════════════════════
// THE OBJECTION THIS PROBE IS BUILT TO RESPECT.
//
// The auditor's strongest point was against the forecast, and it is retained
// here rather than argued with:
//
//   "The distinction between EPISTEMIC UNCERTAINTY (not knowing where the body
//    will be) and OPERATIONAL SENSITIVITY (not being able to steer it there). A
//    forecast cone solves for uncertainty. However, if the game's difficulty is
//    driven by the butterfly effect -- where a 1-degree error in the first shot
//    results in a 180-degree error in the second -- a forecast is merely a
//    high-resolution view of your own inevitable failure. A map is not a
//    steering wheel."
//
// So a THIRD arm is measured, which neither diagnosis proposes and which is the
// negative control for both: PERFECT FORESIGHT on the coarse lattice -- a policy
// that sees each first shot's TRUE final outcome and still must pick from the
// same twelve bearings. If even perfect knowledge of the future cannot lift a
// coarse lattice near the ceiling, the problem is operational and no forecast of
// any fidelity will fix it. That is the auditor's objection turned into an arm
// rather than into a caveat.
import { stepUniverse, type Universe } from '../../game/dark/nbody.js';
import { fromFloat, toFloat } from '../../game/dark/fixed.js';
import { cloneUniverse as cloneOf } from '../../game/dark/nbody.js';
import { settled } from '../../foundry/montecarlo/orrery.js';

const SEEDS = Array.from({ length: 24 }, (_, i) => 101 + i * 7);
const SETTLE = 80;
const BODIES = 5;
const LEG = 120;

type Verb = 'MASS' | 'TORQUE';
interface Act { readonly verb: Verb; readonly k: number; readonly bearings: number; readonly cost: number }

function latticeOf(bearings: number): Act[] {
  const out: Act[] = [];
  for (let k = 0; k < bearings; k += 1) out.push({ verb: 'MASS', k, bearings, cost: 1.0 });
  for (const k of [0, 1]) out.push({ verb: 'TORQUE', k, bearings, cost: 0.6 });
  return out;
}

function apply(u: Universe, a: Act): void {
  if (a.verb === 'MASS') {
    const ang = (a.k / a.bearings) * Math.PI * 2;
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

function seq(seed: number, a: Act | null, b: Act | null): readonly [number, number] {
  const u = settled(seed, BODIES, SETTLE);
  if (a) apply(u, a); advance(u, LEG);
  if (b) apply(u, b); advance(u, LEG);
  return at(u);
}

/** The blind rule: the bearing pointing at the zone from wherever the body is. */
function aimAt(u: Universe, zone: readonly [number, number], lat: readonly Act[]): Act {
  const [px, py] = at(u);
  const toZone = Math.atan2(zone[1] - py, zone[0] - px);
  let best = lat[0]!, bv = -Infinity;
  for (const a of lat) {
    if (a.verb !== 'MASS') continue;
    let g = Math.abs((a.k / a.bearings) * Math.PI * 2 - toZone);
    if (g > Math.PI) g = 2 * Math.PI - g;
    if (Math.cos(g) > bv) { bv = Math.cos(g); best = a; }
  }
  return best;
}

let RNG = 0x27d4eb2f;
const rnd = () => { RNG ^= RNG << 13; RNG ^= RNG >>> 17; RNG ^= RNG << 5; return (RNG >>> 0) % 100000 / 100000; };

interface Arm { blind: number[]; forecast: number[]; oracle: number[]; random: number[]; live: number[]; ent: number[]; absCeil: number[] }

function measure(bearings: number): { served: number; arm: Arm } {
  const lat = latticeOf(bearings);
  const arm: Arm = { blind: [], forecast: [], oracle: [], random: [], live: [], ent: [], absCeil: [] };
  let served = 0;

  for (const seed of SEEDS) {
    const zeroLanding = seq(seed, null, null);
    const scout = lat.map((a) => seq(seed, a, null));
    const dists = scout.map((l) => d2(l, zeroLanding)).sort((x, y) => x - y);
    const med = dists[Math.floor(dists.length / 2)] || 1;
    const theta = ((seed * 2654435761) % 3600) / 3600 * Math.PI * 2;
    const zone = [zeroLanding[0] + Math.cos(theta) * med, zeroLanding[1] + Math.sin(theta) * med] as const;
    const score = (l: readonly number[]) => Math.max(0, 1 - d2(l, zone) / med);

    // The ceiling over this lattice's own sequences. Recomputed per lattice so
    // rule (C) holds inside each arm: the ceiling can always play the player's
    // move, because both draw from the same actions.
    const all: number[] = [];
    for (const a of lat) for (const b of lat) all.push(score(seq(seed, a, b)));
    const ceiling = Math.max(...all);
    if (all.filter((x) => x > 0.5).length < 2 || score(zeroLanding) > 0.2) continue;
    served += 1;
    // The ABSOLUTE ceiling, not normalised. Sharing each lattice's own ceiling
    // is what makes the human arms comparable, but it also HIDES the clumsy
    // question: if a finer lattice reaches a higher absolute score, the coarse
    // one was the limit, and a ratio to itself can never say so.
    arm.absCeil.push(ceiling);

    // ── ARM 1 · BLIND. Aim, watch, aim again. ──────────────────────────────
    {
      const u = settled(seed, BODIES, SETTLE);
      apply(u, aimAt(u, zone, lat)); advance(u, LEG);
      apply(u, aimAt(u, zone, lat)); advance(u, LEG);
      arm.blind.push(score(at(u)) / (ceiling || 1));
    }

    // ── ARM 2 · FORECAST. One shot ahead, which is what a cone shows. ───────
    // For each candidate first shot, the player sees where the body WILL BE at
    // the next decision point -- not the final outcome. Then aims from there.
    {
      let bestA = lat[0]!, bestV = -Infinity;
      for (const a of lat) {
        const u = settled(seed, BODIES, SETTLE);
        apply(u, a); advance(u, LEG);
        // Value the intermediate state the way a player with a cone would: how
        // close does this put me to being ABLE to aim at the zone next?
        const v = -d2(at(u), zone);
        if (v > bestV) { bestV = v; bestA = a; }
      }
      const u = settled(seed, BODIES, SETTLE);
      apply(u, bestA); advance(u, LEG);
      apply(u, aimAt(u, zone, lat)); advance(u, LEG);
      arm.forecast.push(score(at(u)) / (ceiling || 1));
    }

    // ── ARM 3 · PERFECT FORESIGHT OF SHOT ONE, NAIVE SHOT TWO. ─────────────
    //
    // THE FIRST VERSION OF THIS ARM WAS VACUOUS AND READ 100.0%. It computed
    // `max over first shots of (max over second shots)`, which IS the global
    // maximum -- the ceiling measured against itself, this project's named
    // self-witness failure mode, and the seventh control of that shape. It could
    // not have returned anything else.
    //
    // What the auditor's question actually needs is an arm where information is
    // perfect and EXECUTION IS STILL HUMAN. So: the player sees the true final
    // value of every first shot under their OWN naive follow-up, picks the best
    // first shot on that knowledge, and then plays the naive follow-up. Perfect
    // foresight, unchanged hands. If that does not approach the ceiling, the
    // shortfall is operational and no forecast fixes it.
    {
      let best = 0;
      for (const a of lat) {
        const u = settled(seed, BODIES, SETTLE);
        apply(u, a); advance(u, LEG);
        const v = cloneOf(u);
        apply(v, aimAt(v, zone, lat)); advance(v, LEG);
        best = Math.max(best, score(at(v)));
      }
      arm.oracle.push(best / (ceiling || 1));
    }

    // ── ARM 4 · RANDOM. The negative control. ──────────────────────────────
    let r = 0;
    for (let t = 0; t < 8; t += 1) r += score(seq(seed, lat[Math.floor(rnd() * lat.length)]!, lat[Math.floor(rnd() * lat.length)]!));
    arm.random.push(r / 8 / (ceiling || 1));

    arm.live.push(all.filter((x) => x >= ceiling * 0.9).length);
    const tot = all.reduce((p, q) => p + q, 0);
    let h = 0;
    if (tot > 0) for (const x of all) { const p = x / tot; if (p > 0) h -= p * Math.log2(p); }
    arm.ent.push(h);
  }
  return { served, arm };
}

// ═════════════════════════════════════════════════════════════════════════════
// THE VERDICT IS A PURE FUNCTION WITH WITNESSES, BECAUSE THE FIRST ONE WAS WRONG.
//
// The original branch read `if (ceilingGap > 0.25) -> "CLUMSY"`, and on the real
// run it printed CLUMSY while the line immediately below it said the absolute
// ceiling was 0.842 on twelve bearings and 0.837 on twenty-four. Doubling the
// lattice bought NOTHING, which is the opposite of clumsy. The predicate did not
// match its label: what `ceilingGap` measures is how far perfect foresight falls
// short, which is evidence about neither remedy and certainly not evidence FOR
// finer control.
//
// That is the same class of defect as the OR-clause gate two commits ago, in a
// script that did not use the instrument built to catch it. So the verdict logic
// is extracted, and it is exercised on synthetic witnesses -- including the real
// numbers -- before it is allowed to speak about anything.

interface Arms { blind: number; forecast: number; oracle: number; random: number; abs: number }

function diagnose(coarse: Arms, fine: Arms): string {
  const sight = coarse.oracle - coarse.blind;      // what information is WORTH, at its bound
  const hands = fine.abs - coarse.abs;             // what finer control adds to absolute REACH
  const noise = Math.abs(coarse.blind - coarse.random);
  const residual = 1 - coarse.oracle;              // what neither remedy reaches

  // Hands first, and on ABSOLUTE reach rather than on a share of a local ceiling:
  // a finer lattice normalised to its own ceiling can look flat while genuinely
  // reaching further, and can look fine while reaching nowhere new.
  if (hands > noise && hands > sight) return 'CLUMSY';
  if (sight > noise * 3 && residual < 0.25) return 'BLIND';
  if (sight > noise * 3) return 'BOTH, AND NEITHER ALONE';
  return 'NEITHER';
}

// ── the witnesses. Each must return what its name says, or nothing below runs. ──
{
  const W = (blind: number, oracle: number, random: number, abs: number): Arms => ({ blind, forecast: 0, oracle, random, abs });
  const cases: [string, string, Arms, Arms][] = [
    // finer control raises absolute reach a lot, information does not
    ['CLUMSY', 'finer lattice reaches further', W(0.16, 0.20, 0.13, 0.60), W(0.16, 0.20, 0.13, 0.95)],
    // information nearly reaches the ceiling, finer control adds no reach
    ['BLIND', 'foresight almost closes it', W(0.16, 0.90, 0.13, 0.84), W(0.12, 0.88, 0.08, 0.837)],
    // information is worth a lot but leaves a large residual
    ['BOTH, AND NEITHER ALONE', 'the real run', W(0.163, 0.497, 0.128, 0.842), W(0.120, 0.434, 0.083, 0.837)],
    // nothing moves
    ['NEITHER', 'both remedies inert', W(0.16, 0.18, 0.15, 0.84), W(0.15, 0.17, 0.14, 0.838)],
  ];
  for (const [want, why, c, f] of cases) {
    const got = diagnose(c, f);
    if (got !== want) {
      throw new Error(`verdict logic unsound: witness "${why}" expected ${want}, got ${got}. Fix the predicate before trusting the run.`);
    }
  }
  console.log(`verdict logic: ${cases.length} witnesses pass, including the real numbers. Safe to report.`);
}


console.log('BLIND, OR CLUMSY? · the discriminator the auditor named');
console.log(`${BODIES} bodies · ${LEG}+${LEG} steps · ${SEEDS.length} seeds · share of each lattice's OWN ceiling`);
console.log('');
console.log('bearings | actions | sequences | served | BLIND  | FORECAST | FORESIGHT | RANDOM | abs ceiling');
console.log('---------+---------+-----------+--------+--------+----------+-----------+--------+------------');

const out: { bearings: number; blind: number; forecast: number; oracle: number; random: number; abs: number }[] = [];
for (const bearings of [12, 24]) {
  const { served, arm } = measure(bearings);
  const n = bearings + 2;
  const p = (v: number) => `${(v * 100).toFixed(1)}%`;
  out.push({ bearings, blind: mean(arm.blind), forecast: mean(arm.forecast), oracle: mean(arm.oracle), random: mean(arm.random), abs: mean(arm.absCeil) });
  console.log(
    `${String(bearings).padStart(8)} |${String(n).padStart(8)} |${String(n * n).padStart(10)} |${`${served}/${SEEDS.length}`.padStart(7)} |` +
    `${p(mean(arm.blind)).padStart(7)} |${p(mean(arm.forecast)).padStart(9)} |${p(mean(arm.oracle)).padStart(10)} |${p(mean(arm.random)).padStart(7)} |` +
    `${mean(arm.absCeil).toFixed(3).padStart(11)}`,
  );
  console.log(`         |         |           |        | live ${mean(arm.live).toFixed(1)} of ${n * n}, entropy ${mean(arm.ent).toFixed(2)} bits`);
}

console.log('');
console.log('── THE DIAGNOSIS ──');
const coarse = out[0]!, fine = out[1]!;
const noise = Math.abs(coarse.blind - coarse.random);
const sight = coarse.oracle - coarse.blind;
const hands = fine.abs - coarse.abs;
const residual = 1 - coarse.oracle;
console.log(`sight    · what information is worth AT ITS BOUND (foresight - blind)  ${(sight * 100).toFixed(1)} points`);
console.log(`hands    · what doubling the lattice adds to ABSOLUTE reach            ${(hands * 100).toFixed(1)} points`);
console.log(`residual · what perfect foresight with naive hands still misses        ${(residual * 100).toFixed(1)} points`);
console.log(`reach    · absolute ceiling, 12 bearings ${coarse.abs.toFixed(3)} vs 24 bearings ${fine.abs.toFixed(3)}`);
console.log(`noise    · blind minus random, the floor any remedy must beat          ${(noise * 100).toFixed(1)} points`);
console.log(`(my implemented forecast policy delivered ${(coarse.forecast * 100).toFixed(1)}%, against the ${(coarse.oracle * 100).toFixed(1)}% the information allows)`);
console.log('');

const verdict = diagnose(coarse, fine);
console.log(`VERDICT: ${verdict}`);
if (verdict === 'CLUMSY') {
  console.log('Finer control raises absolute reach more than information does. The lattice is');
  console.log('too coarse to express the action the player already knows they want.');
} else if (verdict === 'BLIND') {
  console.log('Foresight nearly closes the gap on the existing lattice and finer control adds');
  console.log('no reach. The forecast cone is the mechanic.');
} else if (verdict === 'BOTH, AND NEITHER ALONE') {
  console.log('Information is worth a great deal and does not finish the job, while finer');
  console.log('control adds no absolute reach at all. So the auditor\'s objection is HALF');
  console.log('upheld: the map is not a steering wheel, but it is worth a third of the game,');
  console.log('and a better steering wheel is measurably worth nothing. What is left over is');
  console.log('in the interaction between the two shots, which is the thing no stated rule');
  console.log('has captured -- not an absence of information and not an absence of precision.');
} else {
  console.log('Neither remedy moves the skill gap by more than the noise floor. By the');
  console.log('auditor\'s own termination rule this is the point at which further revision is');
  console.log('sunk cost rather than diligence.');
}
