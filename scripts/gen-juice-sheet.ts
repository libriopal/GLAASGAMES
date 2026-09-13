// A filmstrip of both verbs. Rendering is the only method that has found a
// visual defect in this project, and an animation is exactly the thing you
// cannot review by reading.
import { writeFileSync } from 'node:fs';
import { frameAt, cuesFor, DIVERGE, type JuiceSpec } from '../web/synth-juice.js';
import { MOLECULES } from '../game/chem/library.js';
import { VOID_DEEP } from '../web/spectrum.js';

const BY = new Map(MOLECULES.map((m) => [m.formula, m] as const));
const cellsOf = (fs: string[]) =>
  fs.map((f, i) => ({ x: 40 + i * 46, y: 96, molecule: BY.get(f)! }));

const BOND: JuiceSpec = {
  verb: 'BOND', cells: cellsOf(['CH4', 'O2', 'O2']), released: 802, productLabel: 'CO2 + 2 H2O',
  product: BY.get('CO2')!,
};
const REFUSE: JuiceSpec = {
  verb: 'REFUSE', cells: cellsOf(['N2', 'N2', 'CO2']), released: 0, productLabel: '',
};

const N = 9;
const FW = 210, FH = 190;
function strip(spec: JuiceSpec, label: string, reduce = false): string {
  const frames: string[] = [];
  for (let i = 0; i < N; i++) {
    const p = i / (N - 1);
    frames.push(
      `<g transform="translate(${i * FW},0)">` +
      `<rect width="${FW - 6}" height="${FH}" rx="8" fill="#0b1018" stroke="${Math.abs(p - DIVERGE) < 0.06 ? '#2e3d57' : '#151d2b'}"/>` +
      `<text x="10" y="18" font-family="ui-monospace,monospace" font-size="9" fill="#5d7086">p=${p.toFixed(2)}${Math.abs(p - DIVERGE) < 0.06 ? '  DIVERGE' : ''}</text>` +
      frameAt(spec, p, reduce) + `</g>`);
  }
  return `<text x="0" y="-12" font-family="ui-monospace,monospace" font-size="12" fill="#8fa3b8" letter-spacing="2">${label}</text>` + frames.join('');
}

const W = N * FW, H = 3 * (FH + 54) + 40;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${VOID_DEEP}"/>
<g transform="translate(20,46)">${strip(BOND, 'BOND — converge, flash, RELEASE OUTWARD (CH4 + 2 O2)')}</g>
<g transform="translate(20,${46 + FH + 54})">${strip(REFUSE, 'REFUSE — converge, strain, SNAP and RECOIL (N2 + N2 + CO2)')}</g>
<g transform="translate(20,${46 + 2 * (FH + 54)})">${strip(BOND, 'BOND under reduced motion — one luminance step', true)}</g>
</svg>`;
writeFileSync('design/juice-sheet.html', `<!doctype html><meta charset="utf-8"><title>juice</title><style>body{margin:0;background:${VOID_DEEP}}</style>${svg}`);
console.log('cues BOND  ', JSON.stringify(cuesFor(BOND)));
console.log('cues REFUSE', JSON.stringify(cuesFor(REFUSE)));
