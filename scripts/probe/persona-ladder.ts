import { runLadder, dualConstraint, dominanceProbe } from '../../foundry/montecarlo/farkle-harness.js';
import { personas, styleOf, personaSource } from '../../foundry/sim/personas.js';
console.log('persona source:', personaSource());
console.log('population:', personas().length, '\n');
console.log('persona            slip  search  risk  explore');
for (const p of personas()) { const s = styleOf(p);
  console.log(`${p.name.padEnd(18)} ${s.slipRate.toFixed(2)}   ${s.searchDepth.toFixed(2)}  ${s.riskAppetite.toFixed(2)}    ${s.exploration.toFixed(2)}`); }
console.log('\n=== LADDER (300 seeds) ===');
const L = runLadder(300);
for (const r of [...L.results].sort((a,b)=>a.meanScore-b.meanScore))
  console.log(`${r.name.padEnd(20)} ${r.meanScore.toFixed(0).padStart(7)}  farkle ${(r.farkleRate*100).toFixed(1)}%  banks/game ${r.meanTurnsBanked.toFixed(1)}`);
console.log(`\nSKILL DELTA (population only) ${L.skillDeltaPct.toFixed(1)}%`);
console.log(`SOLVER MARGIN ${L.solverMarginPct.toFixed(1)}%`);
const D = dualConstraint(1200);
console.log(`\nSIGNAL UTILITY ${D.signalUtilityPct.toFixed(1)}%  AGENCY FLOOR ${D.agencyFloorPct.toFixed(1)}%  PASSES ${D.passes}`);
