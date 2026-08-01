/**
 * W7 BLOCKS W9 ABSOLUTELY: this is the permanent CI calibration reference.
 * If a faithful King of Tokyo fails any gate, the gates are wrong, not KoT.
 *
 * Run: npm run verify:kot   ·   Exit 0 = KoT PASSES every gate (W9 may proceed).
 */

import { runKotCalibration } from './kot-calibration.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const { genome, gateResult } = runKotCalibration();

ok(genome.structural.topology === 'contested-centre', 'KoT genome expresses contested spotlight (topology)');
ok(genome.structural.targeting === 'asymmetric-by-position', 'KoT genome expresses asymmetric targeting');
ok(genome.structural.interactionVerb === 'keep-reroll', 'KoT genome expresses push-your-luck-with-keeps');
ok(genome.structural.winCondition === 'plural', 'KoT genome expresses two orthogonal win conditions');
ok(genome.structural.dilemmaShape === 'stay-or-yield', 'KoT genome expresses the yield dilemma');
ok(genome.structural.inSessionMutation === 'power-cards', 'KoT genome expresses mid-game rule mutation');

for (const check of gateResult.checks) {
  ok(check.passed, `gate "${check.name}": ${check.detail}`);
}

ok(gateResult.passed, 'ALL GATES PASS for the KoT calibration artifact');

console.log('');
if (failures === 0) {
  console.log('W7 GATE HELD: KoT calibration artifact PASSES every gate. W9 (breeding) may proceed.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED. Per §7: THE GATES ARE WRONG — fix the gates, not KoT. W9 remains BLOCKED.`);
  process.exit(1);
}
