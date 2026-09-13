// The shipping gates for game two, on the same instrument Farkle was gated on.
import {
  runLadder, dominanceProbe, seedDominance, dualConstraint, decayProfile,
  GREEDY, ORDER_1, randomAgent,
} from '../../foundry/montecarlo/synth-harness.js';
import { DEFAULT_SYNTH } from '../../game/chem/synth.js';

const SEEDS = Number(process.env.SEEDS ?? 150);
const CFG = { ...DEFAULT_SYNTH, preview: Number(process.env.PREVIEW ?? DEFAULT_SYNTH.preview ?? 2) };
console.log(`config: preview ${CFG.preview}, book ${CFG.book ?? 3}, options ${CFG.options ?? 3}, turns ${CFG.turns}, seeds ${SEEDS}`);

const l = runLadder(SEEDS, CFG);
console.log('── ladder ──────────────────────────────────────────────');
for (const r of l.rungs) {
  console.log(`  ${r.name.padEnd(12)} shipped ${r.shipped.toFixed(2).padStart(6)}  bank ${r.bank.toFixed(0).padStart(6)}  turns ${r.turns.toFixed(1)}  stall ${(r.stalls*100).toFixed(0)}%`);
}
console.log(`  ${'CEILING (beam)'.padEnd(12)} shipped ${l.ceiling.toFixed(2).padStart(6)}   -- a plan, not a policy`);
const pop = [...l.population].sort((a,b)=>b.shipped-a.shipped);
console.log(`  population ${pop.length}: best ${pop[0]!.name} ${pop[0]!.shipped.toFixed(2)} · worst ${pop[pop.length-1]!.name} ${pop[pop.length-1]!.shipped.toFixed(2)}`);

const d = dominanceProbe(SEEDS, CFG);
console.log('── degenerate strategies ───────────────────────────────');
for (const f of d.findings) console.log(`  ${f.name.padEnd(16)} ${f.shipped.toFixed(2).padStart(6)}  ${f.pctOfBest.toFixed(1)}% of best thoughtful`);

const s = seedDominance(SEEDS, CFG);
const c = dualConstraint(SEEDS, CFG);

console.log('── decay, under the NEW rules ──────────────────────────');
for (const [n, a] of [['RANDOM', randomAgent(1)], ['GREEDY', GREEDY], ['ORDER-1', ORDER_1]] as const) {
  const p = decayProfile(a, Math.min(SEEDS, 100), CFG);
  console.log(`  ${n.padEnd(8)} options ${p.optionsFirst.toFixed(0)} -> ${p.optionsLast.toFixed(0)}   survived ${p.turnsSurvived.toFixed(1)} of ${CFG.turns}`);
}

console.log('── gates ───────────────────────────────────────────────');
console.log(`  SKILL DELTA    ${l.skillDeltaPct.toFixed(1)}%   spread across the population`);
console.log(`  SOLVER MARGIN  ${l.solverMarginPct.toFixed(1)}%   unbounded over bounded`);
console.log(`  SEED SHARE     ${s.seedSharePct.toFixed(1)}%   variance from the deal`);
console.log(`  SIGNAL UTILITY ${c.signalUtilityPct.toFixed(1)}%   ${c.signalUtilityPct>=50?'PASS':'FAIL'} (>=50)`);
console.log(`  AGENCY FLOOR   ${c.agencyFloorPct.toFixed(1)}%   ${c.agencyFloorPct>=25?'PASS':'FAIL'} (>=25)`);
console.log(`  DOMINATED      ${d.dominated}`);
