import { runLadder, riskCurve, dominanceProbe, seedDominance, EFFICIENT, PRUDENT, searchAgent } from '../../foundry/montecarlo/farkle-harness.js';
console.log('=== AGENT LADDER (400 seeds, 10 turns) ===');
const L = runLadder(400);
console.log('agent        mean    median    p10     p90   farkle%  banks/game');
for (const r of [...L.results].sort((a,b)=>a.meanScore-b.meanScore)) {
  console.log(`${r.name.padEnd(12)} ${r.meanScore.toFixed(0).padStart(6)} ${r.medianScore.toFixed(0).padStart(8)} ${r.p10.toFixed(0).padStart(6)} ${r.p90.toFixed(0).padStart(7)} ${(r.farkleRate*100).toFixed(1).padStart(8)} ${r.meanTurnsBanked.toFixed(2).padStart(11)}`);
}
console.log(`\nSKILL DELTA   ${L.skillDeltaPct.toFixed(1)}%   (benchmark: >5% or it is a slot in a costume)`);
console.log(`SOLVER MARGIN ${L.solverMarginPct.toFixed(1)}%   (unbounded search over bounded)`);

console.log('\n=== DEGENERATE STRATEGY PROBE (300 seeds) ===');
const D = dominanceProbe(300);
console.log(`best thoughtful agent (SEARCH-24): ${D.best.meanScore.toFixed(0)}`);
for (const t of [...D.trivial].sort((a,b)=>b.meanScore-a.meanScore)) {
  console.log(`  ${t.name.padEnd(16)} ${t.meanScore.toFixed(0).padStart(6)}  ${t.beatsBest ? '<<< BEATS THOUGHT' : ''}`);
}
console.log(`DOMINATED: ${D.dominated}`);

console.log('\n=== SEED vs POLICY (250 seeds) ===');
const S = seedDominance(250);
console.log(`between-seed var ${S.betweenSeed.toFixed(0)}, between-policy var ${S.betweenPolicy.toFixed(0)}`);
console.log(`SEED SHARE OF VARIANCE: ${S.seedSharePct.toFixed(1)}%  (high = lottery)`);

console.log('\n=== RISK CURVE per step ===');
for (const [n,a] of [['EFFICIENT',EFFICIENT],['PRUDENT',PRUDENT],['SEARCH-24',searchAgent(24)]] as const) {
  console.log(`${String(n).padEnd(10)} ${riskCurve(a as any, 600).map(v=>isNaN(v)?'  - ':v.toFixed(1).padStart(5)).join(' ')}`);
}
