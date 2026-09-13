// Is the agency floor short because construction needs more turns than it has?
// A transposition costs a whole turn, so at a 12-turn horizon setting up a
// reaction has to repay itself almost immediately or it is simply a lost turn.
import { runAgent, runCeiling, ORDER_1, planAgent } from '../../foundry/montecarlo/synth-harness.js';
import { DEFAULT_SYNTH } from '../../game/chem/synth.js';

const SEEDS = Number(process.env.SEEDS ?? 30);
console.log('turns | ORDER-1  PLAN-3  ceiling | agency floor | foreknowledge');
for (const turns of [12, 24, 40]) {
  const cfg = { ...DEFAULT_SYNTH, turns, preview: 3 };
  const o = runAgent(ORDER_1, SEEDS, cfg).shipped;
  const p = runAgent(planAgent(4, 10, 22), SEEDS, cfg).shipped;
  const c = runCeiling(SEEDS, cfg);
  console.log(`${String(turns).padStart(5)} | ${o.toFixed(2)}     ${p.toFixed(2)}    ${c.toFixed(2)} | ${(((p-o)/o)*100).toFixed(1).padStart(11)}% | ${(((c-p)/p)*100).toFixed(1)}%`);
}
