// engine/verify/verify-orrery.ts — the engine is the instrument, so it is
// verified before anything is measured with it.
//
// Across two Chemical runs, INSTRUMENT DEFECTS OUTNUMBERED DESIGN FINDINGS
// ROUGHLY TWO TO ONE: nine against four. Every one of the nine produced a
// confident, wrong number. ORRERY exists to make Darkmatter's measurements
// cheaper and it will make them wrong instead if it is not itself checked.
//
// EVERY ORACLE BELOW CARRIES A NEGATIVE CONTROL -- an input with the property
// REMOVED, asserted to fail. A check that has only ever been seen to pass is
// decoration, and this project has shipped five controls that could not
// distinguish anything before anyone noticed.

import {
  LYAPUNOV_HORIZON_STEPS,
  type Lattice,
  type LatticeAction,
  type Gate,
  type Transpositions,
  antithetic,
  clearsFloor,
  cone,
  evaluate,
  floorOf,
  memoiseByState,
  race,
  resetPrefixCache,
  runGate,
  settled,
  widthAt,
} from '../../foundry/montecarlo/orrery.js';
import { cloneUniverse, digest, seedUniverse, stepUniverse, type Universe } from '../../game/dark/nbody.js';
import { fromFloat, toFloat } from '../../game/dark/fixed.js';

let failures = 0;
function ok(name: string, pass: boolean, detail: string): void {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${detail}`);
  if (!pass) failures += 1;
}
/** Asserts a call throws. This is how a negative control is RUN rather than described. */
function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('── O1 · floorOf refuses a degenerate null ──');
{
  const good = floorOf([0.148, 0.058, 0.11]);
  ok('O1a a real null yields a floor', good.floor === 0.148, `floor ${good.floor}`);
  // NEGATIVE CONTROL: the exact mistake made and caught at the writing desk this
  // round -- a null drawn FROM the reference set scores exactly 0 everywhere.
  ok('O1b an all-zero null is REJECTED', throws(() => floorOf([0, 0, 0])), 'throws, as a floor of 0 is degenerate');
  ok('O1c an empty null is REJECTED', throws(() => floorOf([])), 'throws');
  ok('O1d clearsFloor needs 2x', !clearsFloor(0.1949, good, 2) && clearsFloor(0.40, good, 2), '0.1949 fails, 0.40 passes');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── O2 · the rollout depth is the MEASURED Lyapunov horizon ──');
{
  ok('O2a horizon = 1/lambda/dt', LYAPUNOV_HORIZON_STEPS === 204, `${LYAPUNOV_HORIZON_STEPS} steps = 10.2 sim-seconds at lambda 0.098`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── O3 · antithetic pairing is EXACT, not approximate ──');
{
  const u = settled(11, 8, 40);
  const a = antithetic(u);
  const back = antithetic(a);
  ok('O3a double negation is bitwise identity', digest(back) === digest(u), 'exact in Q32.32; would not hold in float');
  // NEGATIVE CONTROL: the single negation must actually CHANGE the state, or the
  // "pair" is one sample counted twice -- the vacuous-perturbation failure mode.
  ok('O3b single negation changes the state', digest(a) !== digest(u), 'the perturbation is read by the system');
  // And the paired universe must be a legitimate one: same masses, same positions.
  const samePos = u.bodies.every((b, i) => b.pos.x === a.bodies[i]!.pos.x && b.pos.y === a.bodies[i]!.pos.y);
  ok('O3c positions and masses preserved', samePos, 'time-reversal, not a different universe');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── O4 · the prefix cache returns the same universe it replaces ──');
{
  resetPrefixCache();
  const cold = settled(23, 9, 60);
  const warm = settled(23, 9, 60);
  const raw = seedUniverse(23, 9);
  for (let s = 0; s < 60; s += 1) stepUniverse(raw);
  ok('O4a cached == uncached', digest(cold) === digest(raw) && digest(warm) === digest(raw), 'bitwise');
  // NEGATIVE CONTROL: the cache must be keyed on everything that matters. A key
  // that ignored the seed would return this same universe for a different one.
  ok('O4b a different seed is a different state', digest(settled(24, 9, 60)) !== digest(raw), 'key includes the seed');
  ok('O4c a different settle is a different state', digest(settled(23, 9, 61)) !== digest(raw), 'key includes the depth');
  // And mutating a returned universe must not poison the cache.
  cold.bodies[0]!.pos = { x: 0n, y: 0n, z: 0n };
  ok('O4d the cache hands out clones', digest(settled(23, 9, 60)) === digest(raw), 'a caller cannot corrupt it');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── O5 · the transposition table, and its hit rate as a FINDING ──');
{
  const table = new Map<string, number>();
  const stats: Transpositions = { hits: 0, misses: 0 };
  const u = settled(31, 6, 40);
  const v = cloneUniverse(u);
  memoiseByState(table, stats, u, () => 1);
  memoiseByState(table, stats, v, () => 2);
  ok('O5a identical states collide', stats.hits === 1 && stats.misses === 1, 'exact digest match');
  // NEGATIVE CONTROL: distinct states must NOT collide. If they did, the cache
  // would be silently returning one action's value for another.
  const w = cloneUniverse(u);
  w.bodies[0]!.vel = { ...w.bodies[0]!.vel, x: w.bodies[0]!.vel.x + fromFloat(0.3) };
  memoiseByState(table, stats, w, () => 3);
  ok('O5b a perturbed state does NOT collide', stats.misses === 2, 'the key reads velocity');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── O6 · progressive widening is monotone and sublinear ──');
{
  const w = [1, 4, 16, 64, 256].map((n) => widthAt(n));
  const monotone = w.every((x, i) => i === 0 || x >= w[i - 1]!);
  const sublinear = widthAt(256) < 256;
  ok('O6a width grows with visits', monotone, w.join(' -> '));
  ok('O6b and grows slower than visits', sublinear, `widthAt(256) = ${widthAt(256)}`);
  // NEGATIVE CONTROL: alpha = 1 would be linear, i.e. no widening discipline at
  // all. The schedule must be able to tell the two apart.
  ok('O6c a linear schedule is distinguishable', widthAt(256, 1.6, 1.0) > widthAt(256), 'alpha is load-bearing');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── O7 · racing agrees with exhaustive search, for fewer plays ──');
{
  // A synthetic problem with a KNOWN answer and realistic noise: arm k has true
  // value k/10, observed with seed-dependent noise of comparable size. If racing
  // cannot recover the best arm here it cannot be trusted on the real one.
  const arms = Array.from({ length: 16 }, (_, k) => k);
  const seeds = Array.from({ length: 32 }, (_, i) => i);
  const noise = (a: number, s: number) => (Math.sin(a * 12.9898 + s * 78.233) * 43758.5453) % 1;
  const evalFn = (a: number, s: number) => a / 10 + noise(a, s) * 0.35;

  const r = race(arms, seeds, evalFn);
  const exhaustive = arms.map((a) => ({ a, m: seeds.reduce((p, s) => p + evalFn(a, s), 0) / seeds.length }));
  exhaustive.sort((x, y) => y.m - x.m);
  ok('O7a racing finds the true best arm', r.winner === exhaustive[0]!.a, `winner ${r.winner}, exhaustive ${exhaustive[0]!.a}`);
  ok('O7b and spends fewer plays', r.plays < arms.length * seeds.length, `${r.plays} vs ${arms.length * seeds.length} exhaustive`);

  // NEGATIVE CONTROL: on arms that are genuinely IDENTICAL, racing must not
  // manufacture a separation. It will still return a winner -- that is what a
  // winner-returning function does -- but the spread across surviving arms must
  // be at the noise scale, not at the signal scale.
  const flat = race(arms, seeds, (_a, s) => noise(7, s));
  const spread = Math.max(...flat.table.map((t) => t.mean)) - Math.min(...flat.table.map((t) => t.mean));
  ok('O7c identical arms are not separated', spread < 1e-9, `spread ${spread.toExponential(1)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── O8 · evaluate reports agency against a do-nothing arm ──');
{
  interface A extends LatticeAction { readonly kick: number }
  const mk = (kick: number): A => ({ id: `k${kick}`, label: `kick ${kick}`, cost: Math.abs(kick), kick });

  const live: Lattice<A> = {
    actions: () => [mk(0.0), mk(0.4), mk(0.8)],
    apply: (u, a) => { const b = u.bodies[0]!; b.vel = { ...b.vel, x: b.vel.x + fromFloat(a.kick) }; },
  };
  const score = (u: Universe) => Math.abs(toFloat(u.bodies[0]!.pos.x));
  const build = (seed: number) => settled(seed, 7, 40);
  const e = evaluate(live, [1, 2, 3], build, score, 60);
  ok('O8a agency = best - do-nothing', Math.abs(e.agency - (e.bestScore - e.doNothingScore)) < 1e-12, `agency ${e.agency.toFixed(4)}`);
  ok('O8b a do-nothing score is always reported', Number.isFinite(e.doNothingScore), `${e.doNothingScore.toFixed(4)}`);

  // NEGATIVE CONTROL: a lattice whose every action is a NO-OP must report zero
  // agency. This is the screensaver detector proving it can fire.
  const inert: Lattice<A> = { actions: () => [mk(0), mk(0)], apply: () => {} };
  const z = evaluate(inert, [1, 2, 3], build, score, 60);
  ok('O8c a no-op lattice reports ZERO agency', Math.abs(z.agency) < 1e-12, `agency ${z.agency.toExponential(1)}`);

  // And the budget must actually exclude: at budget 0 only the free action survives.
  const poor = evaluate(live, [1, 2, 3], build, score, 60, 0);
  ok('O8d a budget excludes priced actions', poor.best?.kick === 0, `best under budget 0 is ${poor.best?.label}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── O9 · the forecast cone widens, and is zero when there is nothing to be unsure of ──');
{
  const xyz = (u: Universe, i: number) => [toFloat(u.bodies[i]!.pos.x), toFloat(u.bodies[i]!.pos.y), toFloat(u.bodies[i]!.pos.z)] as const;
  const base = settled(41, 8, 40);
  const futures = [0.0, 0.05, -0.05, 0.1].map((d) => {
    const u = cloneUniverse(base);
    u.bodies[1]!.vel = { ...u.bodies[1]!.vel, x: u.bodies[1]!.vel.x + fromFloat(d) };
    return u;
  });
  const c = cone(futures, 0, 160, 40, xyz);
  ok('O9a the cone starts tight', c[0]!.radius < 1e-9, `r0 ${c[0]!.radius.toExponential(1)}`);
  ok('O9b and widens with time', c[c.length - 1]!.radius > c[0]!.radius, `r_end ${c[c.length - 1]!.radius.toFixed(4)}`);

  // NEGATIVE CONTROL: ONE future means no uncertainty, so the cone must be
  // identically zero at every step. A cone that widens on a single trajectory
  // would be drawing a graphic rather than reporting a measurement -- exactly
  // the Chemical defect where the display asserted a fact the game had not
  // produced.
  const single = cone([cloneUniverse(base)], 0, 160, 40, xyz);
  ok('O9c a single future has ZERO radius throughout', single.every((s) => s.radius < 1e-12), 'the cone reports, it does not decorate');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('── O10 · a gate must prove it can FAIL before it is allowed to pass ──');
{
  interface R { human: number; single: number }
  // THE ACTUAL DEFECT, REPRODUCED. This is the gate as it was written, verbatim
  // in shape: an OR clause whose second half passes on input the first half
  // rejects. On the real run it printed PASS while the condition it named was
  // false -- 16.3% against 54.7%.
  const broken: Gate<R> = {
    name: 'sequencing beats one shot (as originally written)',
    predicate: (r) => r.human > r.single || r.single < 0.9,
    knownPass: { human: 0.9, single: 0.4 },
    knownFail: { human: 0.163, single: 0.547 }, // the real numbers: human LOSES
  };
  ok('O10a the OR-clause gate is REJECTED as unsound', throws(() => runGate(broken, { human: 0.5, single: 0.5 })),
    'it returns TRUE on its known-fail witness');

  // The corrected gate: a ceiling against a ceiling, with no escape clause.
  const fixed: Gate<R> = {
    name: 'the 2-shot ceiling exceeds the 1-shot ceiling',
    predicate: (r) => r.single <= 0.85,
    knownPass: { human: 0, single: 0.547 },
    knownFail: { human: 0, single: 0.99 },
  };
  ok('O10b the corrected gate is accepted and passes', runGate(fixed, { human: 0.163, single: 0.547 }).pass, 'one shot reaches 54.7%');
  ok('O10c and it still FAILS on failing data', !runGate(fixed, { human: 0.163, single: 0.95 }).pass, 'a gate that cannot fail is not a gate');

  // A gate whose known-pass witness does not pass is equally broken, in the
  // other direction: the predicate is stricter than its name.
  const inverted: Gate<R> = {
    name: 'a predicate stricter than its name',
    predicate: (r) => r.single <= 0.1,
    knownPass: { human: 0, single: 0.547 },
    knownFail: { human: 0, single: 0.99 },
  };
  ok('O10d a gate failing its known-PASS witness is rejected', throws(() => runGate(inverted, { human: 0, single: 0.5 })), 'both witnesses are load-bearing');
}

console.log('');
console.log(failures === 0 ? 'verify-orrery: all oracles green' : `verify-orrery: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
