// Is the agency floor small because the GAME has no room above the readable
// rule, or because my planner is weak? Those are different findings and the
// gate cannot tell them apart on its own.
import { runAgent, runCeiling, ORDER_1, planAgent } from '../../foundry/montecarlo/synth-harness.js';
import { DEFAULT_SYNTH } from '../../game/chem/synth.js';

const SEEDS = Number(process.env.SEEDS ?? 50);
for (const preview of [5]) {
  const cfg = { ...DEFAULT_SYNTH, preview };
  const o = runAgent(ORDER_1, SEEDS, cfg).shipped;
  const c = runCeiling(SEEDS, cfg);
  console.log(`preview ${preview}: ORDER-1 ${o.toFixed(2)}  clairvoyant ceiling ${c.toFixed(2)} (+${(((c-o)/o)*100).toFixed(1)}%)`);
  for (const [d, w] of [[4, 12], [6, 16]] as [number, number][]) {
    const p = runAgent(planAgent(d, w, 24), SEEDS, cfg).shipped;
    console.log(`   PLAN d=${d} w=${w}: ${p.toFixed(2)}  agency floor ${(((p - o) / o) * 100).toFixed(1)}%`);
  }
}
