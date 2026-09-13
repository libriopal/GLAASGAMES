// STAGE 0. The instrument, before any design question is asked.
import { negativeControls, assertSameVerbs } from '../../foundry/montecarlo/assert-instrument.js';
import { DEFAULT_SYNTH } from '../../game/chem/synth.js';
import { degreeHistogram, cellCount, regions } from '../../game/chem/topology.js';

console.log('── topology, so the hex is a fact and not a claim ───────');
for (const t of ['SQUARE36', 'HEX37'] as const) {
  const h = [...degreeHistogram(t)].sort((a, b) => a[0] - b[0]);
  console.log(`  ${t.padEnd(9)} ${String(cellCount(t)).padStart(2)} cells · ${regions(t, 4).length} regions · degrees ${h.map(([d, n]) => `${d}x${n}`).join(' ')}`);
}

console.log('── negative controls, watched failing ──────────────────');
const rs = negativeControls();
let bad = 0;
for (const r of rs) {
  const ok = r.passed;
  if (!ok) bad += 1;
  console.log(`  ${ok ? 'ok  ' : 'BAD '} ${r.name.padEnd(48)} ${r.expected}  ${r.detail}`);
}
try {
  assertSameVerbs({ ...DEFAULT_SYNTH, swap: 'FREE', swapBudget: 3 });
  console.log('  ok   verb parity: enumerator offers transpositions when the rule is on');
} catch (e) {
  bad += 1;
  console.log(`  BAD  ${(e as Error).message}`);
}
console.log(bad === 0 ? '\nSTAGE 0 PASSED — the instrument may be trusted for stage 1.' : `\nSTAGE 0 FAILED — ${bad} check(s). The run does not start.`);
