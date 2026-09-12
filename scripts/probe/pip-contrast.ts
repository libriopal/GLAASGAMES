import { apcaLc, hex, INK } from '../../web/theme.js';
import { MATTER, matterAt, matterBody, mixRgb, toCss } from '../../web/spectrum.js';
console.log('face | body      pip(now)   Lc now | pip(ink-mixed) Lc fixed');
for (let f = 1; f <= 6; f++) {
  const body = matterBody(f, 1);
  const now = matterAt(f, 0.92);
  const lcNow = Math.abs(apcaLc(hex(now), hex(body)));
  // proposed: lift the hue toward ink so it stays identifiable but reads light
  const fixed = toCss(mixRgb(hex(MATTER[f]!), hex(INK), 0.45));
  const lcFix = Math.abs(apcaLc(hex(fixed), hex(body)));
  console.log(`  ${f}  | ${body} ${now}  ${lcNow.toFixed(0).padStart(5)} | ${fixed}      ${lcFix.toFixed(0).padStart(5)}`);
}
// and out-of-hand legibility
console.log('\nout-of-hand presence sweep — Lc of pip against its own body:');
for (const pres of [0.30, 0.45, 0.55, 0.65]) {
  const lcs = [];
  for (let f = 1; f <= 6; f++) {
    const body = matterBody(f, pres);
    const pip = toCss(mixRgb(hex(MATTER[f]!), hex(INK), 0.45));
    const dim = toCss(mixRgb(hex(MATTER[0]!), hex(pip), pres));
    lcs.push(Math.abs(apcaLc(hex(dim), hex(body))));
  }
  console.log(`  presence ${pres.toFixed(2)}: worst Lc ${Math.min(...lcs).toFixed(0)}, best ${Math.max(...lcs).toFixed(0)}`);
}
