import { configFor, screeningDesign, labelFor } from '../../foundry/montecarlo/design.js';
import { runAgent, runCeiling, ORDER_1, planAgent, decisionDensity, seedDominance } from '../../foundry/montecarlo/synth-harness.js';
const rows = screeningDesign();
for (const i of [0, 32, 63]) {
  const t0 = Date.now();
  const cfg = configFor(rows[i]!);
  const o = runAgent(ORDER_1, 30, cfg).score;
  const p = runAgent(planAgent(3,8,20), 30, cfg).score;
  const c = runCeiling(30, cfg);
  seedDominance(20, cfg); decisionDensity(15, cfg);
  console.log(labelFor(rows[i]!), 'order', o.toFixed(2), 'plan', p.toFixed(2), 'ceil', c.toFixed(2), '--', ((Date.now()-t0)/1000).toFixed(1)+'s');
}
