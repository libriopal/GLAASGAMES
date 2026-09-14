// THE BUDGET IS A DIAL BETWEEN TWO FAILURES, SO IT IS MEASURED RATHER THAN PICKED.
//
// ═════════════════════════════════════════════════════════════════════════════
// TWO POINTS SAMPLED, TWO OPPOSITE FAILURES.
//
//   budget 1.7, every drop flat at 1.0
//     the ghost rule scored 78.8% unpriced and 46.0% priced -- the budget cost
//     33 points -- and the screenshot said "12 of 14 are now out of reach" after
//     a single shot. The second decision had collapsed to a binary. FAILED J4.
//
//   budget 2.0, drops priced 0.6-1.5 by leverage
//     9 of 10 gates pass, but 12.5 of 14 actions are affordable at shot two and
//     the cost changes the best action on only 9.1% of seeds. FAILED K8.
//
// Too tight removes the decision; too loose makes the price decoration. Picking
// a third value by hand and stopping when it passes is tuning to the gate, which
// is the thing this project's whole method exists to avoid. So the dial is swept
// and the curve is reported, INCLUDING the possibility that no value satisfies
// both -- which would be a finding about the mechanic rather than a number to
// search harder for.
//
// The 196-sequence ceiling does not depend on the budget, so it is computed once
// per seed and reused across the sweep. Without that this file would cost five
// times what the proof does and measure less.
import { cloneUniverse, stepUniverse } from '../../game/dark/nbody.js';
import * as rules from '../../game/dark/steer.js';
import { LATTICE, LEG, SHOTS, beginRound, costOf, ghostsFor, scoreOf, type Act, type RoundState } from '../../game/dark/steer.js';

const SEEDS = Array.from({ length: 24 }, (_, i) => 101 + i * 7);
const BUDGETS = [1.4, 1.6, 1.8, 2.0, 2.2, 2.6];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (v: readonly number[]) => (v.length ? v.reduce((p, q) => p + q, 0) / v.length : NaN);

const fresh = (base: RoundState): RoundState => ({ ...base, universe: cloneUniverse(base.universe), spent: 0, shot: 0, acts: [] });

function playPairOn(base: RoundState, a: Act | null, b: Act | null): number {
  const s = fresh(base);
  for (const act of [a, b]) {
    if (act) rules.applyAct(s.universe, act);
    for (let t = 0; t < LEG; t += 1) stepUniverse(s.universe);
  }
  return scoreOf(s);
}

/**
 * The shipping policy, but with the budget passed in rather than read from the
 * module, so one process can sweep it. Every other rule comes from `steer.ts`
 * unchanged -- this file must not become a second copy of the game.
 */
function ghostRun(base: RoundState, budget: number): { score: number; afford2: number; bit: boolean } {
  const s = fresh(base);
  let afford2 = 0, bit = false;
  for (let i = 0; i < SHOTS; i += 1) {
    const gs = ghostsFor(s).map((g) => ({ ...g, cost: costOf(s, g.act) }));
    const cheapest = Math.min(...gs.map((g) => g.cost));
    const shotsAfter = SHOTS - i - 1;
    const ok = gs.filter((g) => s.spent + g.cost + shotsAfter * cheapest <= budget + 1e-9);
    if (i === 1) afford2 = ok.length;
    // Does the price change the answer? Compare the nearest ghost overall with
    // the nearest affordable one, at the moment of the decision.
    let free = gs[0]!, paid = ok[0] ?? gs[0]!;
    for (const g of gs) if (dist(g.pos, s.ring) < dist(free.pos, s.ring)) free = g;
    for (const g of ok) if (dist(g.pos, s.ring) < dist(paid.pos, s.ring)) paid = g;
    if (free.act.label !== paid.act.label) bit = true;
    rules.applyAct(s.universe, paid.act);
    s.spent += paid.cost;
    s.shot += 1;
    for (let t = 0; t < LEG; t += 1) stepUniverse(s.universe);
  }
  return { score: scoreOf(s), afford2, bit };
}

console.log('THE BUDGET SWEEP · is there a value where the price is a decision and not a wall?');
console.log(`${SEEDS.length} seeds · ${LATTICE.length} actions x ${SHOTS} shots · ceiling computed once per seed`);
console.log('');

// ── the per-seed ceiling, computed once ─────────────────────────────────────
const rounds: { base: RoundState; ceiling: number }[] = [];
for (const seed of SEEDS) {
  const base = beginRound(seed);
  const all: number[] = [];
  for (const a of LATTICE) for (const b of LATTICE) all.push(playPairOn(base, a, b));
  const ceiling = Math.max(...all);
  const idle = playPairOn(base, null, null);
  if (all.filter((x) => x > 0.5).length < 2 || idle > 0.2) continue;
  rounds.push({ base, ceiling });
}
console.log(`served by the viability oracle  ${rounds.length}/${SEEDS.length}`);
console.log('');
console.log('budget | ghost share of ceiling | affordable at shot 2 | cost changes the answer | both gates');
console.log('-------+------------------------+----------------------+------------------------+-----------');

for (const budget of BUDGETS) {
  const shares: number[] = [], aff: number[] = [];
  let bites = 0;
  for (const { base, ceiling } of rounds) {
    const r = ghostRun(base, budget);
    shares.push(r.score / ceiling);
    aff.push(r.afford2);
    if (r.bit) bites += 1;
  }
  const share = mean(shares), bite = bites / rounds.length, a2 = mean(aff);
  // K4: the mechanic must not solve the game.  K8: the price must be a decision.
  // K10: the second shot must still be a choice.
  const k4 = share <= 0.85, k8 = bite >= 0.30, k10 = a2 >= 5;
  const verdict = k4 && k8 && k10 ? 'ALL THREE' : [k4 ? '' : 'K4', k8 ? '' : 'K8', k10 ? '' : 'K10'].filter(Boolean).join('+') + ' fails';
  console.log(
    `${budget.toFixed(1).padStart(6)} |${`${(share * 100).toFixed(1)}%`.padStart(23)} |${a2.toFixed(1).padStart(21)} |` +
    `${`${(bite * 100).toFixed(1)}%`.padStart(23)} |  ${verdict}`,
  );
}

console.log('');
console.log('K4 share <= 85% (the mechanic must not solve the game)');
console.log('K8 the price changes the best action on >= 30% of seeds (or it is decoration)');
console.log('K10 >= 5 affordable actions at shot two (or the second decision is a binary)');
console.log('');
console.log('If no row reads ALL THREE, the budget is not the problem and a single currency');
console.log('cannot be both a real constraint and a preserved choice on this lattice. That is');
console.log('a finding about the mechanic, not a number to search harder for.');
