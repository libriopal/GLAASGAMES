import { dualConstraint, runLadder, dominanceProbe, seedDominance } from '../../foundry/montecarlo/farkle-harness.js';
const d = dualConstraint(2000);
console.log('=== DUAL CONSTRAINT (2000 hands, x1.35) ===');
console.log(`SCRIPT   d${d.scriptDepth}       ${d.script.toFixed(0)}`);
console.log(`READABLE risk>=${d.readableThreshold}  ${d.readable.toFixed(0)}`);
console.log(`CEILING          ${d.ceiling.toFixed(0)}`);
console.log(`SIGNAL UTILITY ${d.signalUtilityPct.toFixed(1)}%  (min 50)`);
console.log(`AGENCY FLOOR   ${d.agencyFloorPct.toFixed(1)}%  (min 25)`);
console.log(`PASSES: ${d.passes}`);
console.log('\n=== LADDER WITH MULTIPLIER (400 seeds) ===');
const L = runLadder(400);
for (const r of [...L.results].sort((a,b)=>a.meanScore-b.meanScore))
  console.log(`${r.name.padEnd(12)} ${r.meanScore.toFixed(0).padStart(7)}  farkle ${(r.farkleRate*100).toFixed(1)}%`);
console.log(`SKILL DELTA ${L.skillDeltaPct.toFixed(1)}%   SOLVER MARGIN ${L.solverMarginPct.toFixed(1)}%`);
console.log('\n=== DEGENERATE PROBE (300 seeds) ===');
const P = dominanceProbe(300);
console.log(`best thoughtful: ${P.best.meanScore.toFixed(0)}`);
for (const t of [...P.trivial].sort((a,b)=>b.meanScore-a.meanScore))
  console.log(`  ${t.name.padEnd(16)} ${t.meanScore.toFixed(0).padStart(7)} ${t.beatsBest?'<<< BEATS THOUGHT':''}`);
console.log(`DOMINATED: ${P.dominated}`);
const S = seedDominance(250);
console.log(`\nSEED SHARE OF VARIANCE ${S.seedSharePct.toFixed(1)}%`);
