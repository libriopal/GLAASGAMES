// Does showing the next orders make planning depth worth anything?
//
// At preview 0 both a three-ply beam (2.72) and a four-ply rollout scored BELOW
// the one-ply rule (3.68), and not because either was broken: with three slots
// and no visibility of what is next, every plan saturates at "empty the book",
// every candidate ties there, and the tie-break drags the planner to greedy.
// If that diagnosis is right, revealing the queue should make depth pay. If
// depth still pays nothing, the diagnosis was wrong.
import { runAgent, ORDER_1, planAgent } from '../../foundry/montecarlo/synth-harness.js';
import { DEFAULT_SYNTH } from '../../game/chem/synth.js';

const SEEDS = Number(process.env.SEEDS ?? 60);
console.log('preview | ORDER-1  PLAN-3 | depth is worth');
for (const preview of [0, 1, 2, 3, 5]) {
  const cfg = { ...DEFAULT_SYNTH, preview };
  const o = runAgent(ORDER_1, SEEDS, cfg).shipped;
  const p = runAgent(planAgent(), SEEDS, cfg).shipped;
  console.log(`${String(preview).padStart(7)} | ${o.toFixed(2)}     ${p.toFixed(2)} | ${(((p - o) / o) * 100).toFixed(1).padStart(6)}%`);
}
