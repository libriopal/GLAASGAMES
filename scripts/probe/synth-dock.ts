// THE DECISIVE EXPERIMENT. Does making delivery POSITIONAL open the agency floor?
//
// Under ANYWHERE a molecule ships the instant it exists, so position is free,
// the transposition verb has nothing to carry anything to, and the one-ply rule
// captures ~95% of what any planner reaches -- agency floor 4.1% against a
// required 25%. Under DOCK it has to reach the bottom row.
import { runAgent, runCeiling, ORDER_1, ORDER_2, GREEDY, planAgent, randomAgent } from '../../foundry/montecarlo/synth-harness.js';
import { DEFAULT_SYNTH, type DeliveryRule } from '../../game/chem/synth.js';

const SEEDS = Number(process.env.SEEDS ?? 40);
console.log('deliver  | RANDOM GREEDY ORDER-1 ORDER-2 PLAN-3 ceiling | signal | agency | seed-free');
for (const deliver of ['ANYWHERE', 'DOCK'] as DeliveryRule[]) {
  const cfg = { ...DEFAULT_SYNTH, deliver, preview: 2 };
  const r = runAgent(randomAgent(1), SEEDS, cfg).shipped;
  const g = runAgent(GREEDY, SEEDS, cfg).shipped;
  const o1 = runAgent(ORDER_1, SEEDS, cfg).shipped;
  const o2 = runAgent(ORDER_2, SEEDS, cfg).shipped;
  const p = runAgent(planAgent(3, 8, 20), SEEDS, cfg).shipped;
  const c = runCeiling(SEEDS, cfg);
  const best = Math.max(o1, o2, p);
  console.log(
    `${deliver.padEnd(8)} | ${r.toFixed(2)}   ${g.toFixed(2)}   ${o1.toFixed(2)}    ${o2.toFixed(2)}    ${p.toFixed(2)}   ${c.toFixed(2)} | ` +
    `${g > 0 ? (((o1 - g) / g) * 100).toFixed(0) : 'inf'}% | ${(((best - o1) / Math.max(1e-9, o1)) * 100).toFixed(1)}% | ${(((c - best) / Math.max(1e-9, best)) * 100).toFixed(1)}%`,
  );
}
