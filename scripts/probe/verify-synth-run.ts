import { verifySynthAll } from '../../engine/verify/verify-synth.js';
const rs = verifySynthAll();
let bad = 0;
for (const r of rs) {
  if (!r.passed) bad += 1;
  console.log(`${r.passed ? 'ok  ' : 'FAIL'} ${r.id.padEnd(4)} ${r.claim}`);
  console.log(`          ${r.detail}`);
}
console.log(bad === 0 ? `\nall ${rs.length} checks green` : `\n${bad} of ${rs.length} FAILED`);
