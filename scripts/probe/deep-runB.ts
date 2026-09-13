// RUN B only, re-run after two instrument defects were fixed.
import { headToHead, denyingAgent, rivalBook } from '../../foundry/montecarlo/deep-harness.js';
import { GREEDY, ORDER_1, ORDER_2, planAgent } from '../../foundry/montecarlo/synth-harness.js';
import { DEFAULT_SYNTH } from '../../game/chem/synth.js';
const SEEDS = Number(process.env.SEEDS ?? 30);
const cfg = { ...DEFAULT_SYNTH, mode: 'VS' as const, options: 3, preview: 0, swap: 'NONE' as const, turns: 12 };
console.log('matchup                 | win rate | draws | mean scores');
for (const [n, a, b] of [['ORDER-1 vs GREEDY', ORDER_1, GREEDY], ['ORDER-2 vs ORDER-1', ORDER_2, ORDER_1], ['PLAN-3  vs ORDER-1', planAgent(3,8,20), ORDER_1]] as const) {
  const h = headToHead(SEEDS, cfg, a, b);
  console.log(`${n.padEnd(23)} | ${h.winRateA.toFixed(1).padStart(7)}% | ${h.draws.toFixed(0).padStart(4)}% | ${h.meanA.toFixed(2)} / ${h.meanB.toFixed(2)}`);
}
const hD = headToHead(SEEDS, cfg, denyingAgent(1, rivalBook), ORDER_1);
console.log(`\nDENIAL   denier vs ORDER-1: ${hD.winRateA.toFixed(1)}% win, means ${hD.meanA.toFixed(2)} / ${hD.meanB.toFixed(2)}  ->  denial value ${(hD.winRateA - 50).toFixed(1)} pts`);
