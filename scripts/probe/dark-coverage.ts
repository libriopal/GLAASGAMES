// WHY DID THE BASELINE SERVE 3 OF 24 SEEDS?
//
// The proof failed G3 badly: 87.5% of seeded universes were rejected by a
// viability test that asks only for TWO actions to reach the target and for
// doing nothing to miss it. The plan's pre-registered rule says above 20%
// rejection "the generator is declared defective and fixed rather than
// filtered", so something has to be named -- and the two candidate causes make
// opposite design recommendations:
//
//   CAUSE A - THE GENERATOR IS DEFECTIVE. The universes themselves are
//             degenerate and the fix is in `seedUniverse`.
//   CAUSE B - ONE SHOT CANNOT AIM. Fourteen discrete actions reach fourteen
//             places. A target placed anywhere else is unreachable no matter how
//             good the universe is, and the fix is SEQUENCES, not seeds.
//
// THE DISCRIMINATOR IS COVERAGE: what fraction of the plausible target annulus
// lies within tolerance of SOME reachable landing? Measured for one shot and for
// two shots in sequence.
//
//   If one-shot coverage is low and two-shot coverage is high -> cause B, and
//   the baseline needs a second shot rather than a better generator.
//   If both are low -> cause A, and the physics or the verb set is at fault.
//
// This also revives a thread the null model killed. EINCOL round 1 imported the
// Lie-algebra argument to claim composed verbs reach states neither reaches
// alone, and round 2's resolution floor retracted it AS A NOVELTY CLAIM -- the
// measured 0.1949 sat at 1.32x a floor of 0.1480. COVERAGE is a different
// question with a different estimator: not "is the composed point far from the
// single-verb set" but "how much of the target space can be hit at all". A
// retraction on one metric is not a verdict on the other, and conflating them
// would be the same category error that produced the DRAG false positive.
import { stepUniverse, type Universe } from '../../game/dark/nbody.js';
import { fromFloat, toFloat } from '../../game/dark/fixed.js';
import { settled } from '../../foundry/montecarlo/orrery.js';

const SEEDS = [101, 108, 115, 122, 129, 136, 143, 150];
const SETTLE = 80;
const BODIES = 5;
const BEARINGS = 12;
const HORIZON = 120;

type Verb = 'MASS' | 'TORQUE';
interface Act { readonly verb: Verb; readonly k: number }
const LATTICE: Act[] = [];
for (let k = 0; k < BEARINGS; k += 1) LATTICE.push({ verb: 'MASS', k });
for (const k of [0, 1]) LATTICE.push({ verb: 'TORQUE', k });

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

/** One shot at the start of the window. */
function once(seed: number, a: Act | null): readonly [number, number] {
  const u = settled(seed, BODIES, SETTLE);
  if (a) apply(u, a);
  for (let s = 0; s < HORIZON; s += 1) stepUniverse(u);
  return at(u);
}

/** Two shots, the second halfway through the window. Separated in time, which
 *  is the only way composition can differ from a single larger action. */
function twice(seed: number, a: Act, b: Act): readonly [number, number] {
  const u = settled(seed, BODIES, SETTLE);
  apply(u, a);
  for (let s = 0; s < HORIZON / 2; s += 1) stepUniverse(u);
  apply(u, b);
  for (let s = 0; s < HORIZON / 2; s += 1) stepUniverse(u);
  return at(u);
}

console.log('── COVERAGE · what fraction of the target annulus can actually be hit? ──');
console.log(`${LATTICE.length} actions · ${BODIES} bodies · horizon ${HORIZON} · ${SEEDS.length} seeds`);
console.log('The annulus is sampled at 72 bearings around the do-nothing landing, at the');
console.log('median displacement. A bearing is COVERED if some reachable landing is within');
console.log('half a median of it -- the same tolerance the baseline proof used.');
console.log('');
console.log('shots | distinct landings | coverage of the annulus | median nearest-miss');
console.log('------+-------------------+-------------------------+--------------------');

for (const shots of [1, 2]) {
  let cov = 0, land = 0, miss = 0, n = 0;
  for (const seed of SEEDS) {
    const zero = once(seed, null);
    const landings: (readonly [number, number])[] = [];
    if (shots === 1) {
      for (const a of LATTICE) landings.push(once(seed, a));
    } else {
      // The full 14x14 product is 196 rollouts per seed. The diagonal (the same
      // action twice) is included deliberately: it is the control for whether
      // the gain comes from COMPOSING DIFFERENT verbs or merely from acting
      // twice, which is the distinction round one got wrong.
      for (const a of LATTICE) for (const b of LATTICE) landings.push(twice(seed, a, b));
    }
    const dists = landings.map((l) => d2(l, zero)).sort((x, y) => x - y);
    const med = dists[Math.floor(dists.length / 2)] || 1;
    const tol = med * 0.5;

    // Distinct landings, at the tolerance -- so "196 rollouts" does not get
    // counted as 196 reachable places when most of them coincide.
    const distinct: (readonly [number, number])[] = [];
    for (const l of landings) if (!distinct.some((d) => d2(d, l) < tol * 0.5)) distinct.push(l);

    let covered = 0;
    const misses: number[] = [];
    for (let i = 0; i < 72; i += 1) {
      const th = (i / 72) * Math.PI * 2;
      const target = [zero[0] + Math.cos(th) * med, zero[1] + Math.sin(th) * med] as const;
      const nearest = Math.min(...landings.map((l) => d2(l, target)));
      misses.push(nearest / med);
      if (nearest <= tol) covered += 1;
    }
    misses.sort((x, y) => x - y);
    cov += covered / 72; land += distinct.length; miss += misses[36]!; n += 1;
  }
  console.log(
    `${String(shots).padStart(5)} |${(land / n).toFixed(1).padStart(18)} |${((cov / n) * 100).toFixed(1).padStart(24)}% |${(miss / n).toFixed(3).padStart(19)}`,
  );
}

console.log('');
console.log('Read it this way: if one shot covers little and two shots cover much, the baseline');
console.log('does not need a better generator -- it needs a second shot, and the "sequence" that');
console.log('round one argued for on novelty grounds is justified on coverage grounds instead.');
