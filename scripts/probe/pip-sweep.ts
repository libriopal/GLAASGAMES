import { apcaLc, hex, INK, LC_LARGE_UI, LC_INVISIBLE } from '../../web/theme.js';
import { MATTER, matterBody, mixRgb, toCss } from '../../web/spectrum.js';
console.log('IN-HAND: pip = hue mixed toward ink by k, against body');
console.log('  k   | f1  f2  f3  f4  f5  f6 | worst');
for (const k of [0.45,0.55,0.62,0.70,0.78]) {
  const lcs=[]; for (let f=1;f<=6;f++){
    const pip = toCss(mixRgb(hex(MATTER[f]!), hex(INK), k));
    lcs.push(Math.abs(apcaLc(hex(pip), hex(matterBody(f,1)))));
  }
  console.log(`  ${k.toFixed(2)} | ${lcs.map(v=>v.toFixed(0).padStart(3)).join(' ')} | ${Math.min(...lcs).toFixed(0)}`);
}
console.log(`\n  (LC_LARGE_UI=${LC_LARGE_UI}, LC_INVISIBLE=${LC_INVISIBLE})`);
console.log('\nOUT-OF-HAND: body brightened by presence p, pip at k=0.70');
console.log('  p    | worst Lc pip-vs-body | worst Lc body-vs-deck');
for (const p of [0.35,0.45,0.55,0.65,0.75]) {
  const a=[],b=[];
  for (let f=1;f<=6;f++){
    const body = matterBody(f,p);
    const pip = toCss(mixRgb(hex(MATTER[0]!), hex(toCss(mixRgb(hex(MATTER[f]!), hex(INK),0.70))), p));
    a.push(Math.abs(apcaLc(hex(pip), hex(body))));
    b.push(Math.abs(apcaLc(hex(body), hex(MATTER[0]!))));
  }
  console.log(`  ${p.toFixed(2)} | ${Math.min(...a).toFixed(0).padStart(20)} | ${Math.min(...b).toFixed(0).padStart(20)}`);
}
