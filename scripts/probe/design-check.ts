// The design checks ITSELF before it is used. A transcription error in the
// generators would produce something that looks like a screen and silently
// confounds the comparison every later stage rests on.
import { fraction, foldOver, screeningDesign, designResolution, FACTORS, labelFor, ruleCount, GLYPH_LEGEND } from '../../foundry/montecarlo/design.js';

const full = screeningDesign();
console.log(`factors                     ${FACTORS.length}`);
console.log(`design cells                ${full.length}   RESOLUTION ${designResolution(full)}`);
// The plan's fold-over, re-tested rather than trusted. It is expected to come
// back 4 -- a fold-over cannot break an even-length defining word.
const foldedPlan = [...full, ...foldOver(full)];
console.log(`  + its fold-over           ${foldedPlan.length}   resolution ${designResolution(foldedPlan)}   (double the cells, no gain over V)`);
console.log(GLYPH_LEGEND);
console.log('');
// Orthogonality: every factor high in exactly half the runs, and every pair
// balanced. If this fails the main effects are not main effects.
let bad = 0;
for (let i = 0; i < FACTORS.length; i++) {
  const hi = full.filter((r) => r[i] === 1).length;
  if (hi !== full.length / 2) { bad++; console.log(`  UNBALANCED ${FACTORS[i]!.key}: ${hi}/${full.length}`); }
  for (let j = i + 1; j < FACTORS.length; j++) {
    const plus = full.filter((r) => r[i]! * r[j]! === 1).length;
    if (plus !== full.length / 2) { bad++; console.log(`  CONFOUNDED ${FACTORS[i]!.key}x${FACTORS[j]!.key}: ${plus}/${full.length}`); }
  }
}
console.log(bad === 0 ? 'orthogonal: every factor and every pair is balanced' : `${bad} balance defects`);
console.log('');
console.log('cells (letter = factor at HIGH):');
for (const r of full.slice(0, 8)) console.log(`  ${labelFor(r)}  rules=${ruleCount(r)}`);
console.log('  ...');
