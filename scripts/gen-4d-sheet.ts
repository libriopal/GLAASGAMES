// scripts/gen-4d-sheet.ts — the redesign, rendered, so it can be looked at.
import { writeFileSync } from 'node:fs';
import { AMBER, CYAN, GROUND, GROUND_EDGE, GROUND_RAISED, INK } from '../web/theme.js';
import { anchorPips, chargeLift, projectToken } from '../web/board4d.js';

const CELL = 96;
const FACES = [1, 2, 3, 4, 5, 6] as const;
const PLANES = ['XY', 'XZ', 'XW', 'YZ', 'YW', 'ZW'];
const PHASES = [0, 0.5, 1.0, 1.6, 2.2];

/** One token at one phase, as SVG. */
function token(face: 1|2|3|4|5|6, phase: number, charge = 0): string {
  const lift = chargeLift(charge);
  const pips = projectToken(face, phase);
  const anchor = anchorPips(face);
  const parts: string[] = [
    `<rect x="0.02" y="0.02" width="0.96" height="0.96" rx="0.14" fill="${GROUND_RAISED}"
      stroke="${charge > 0 ? AMBER : GROUND_EDGE}" stroke-width="0.03"/>`,
  ];
  // THE ANCHOR, drawn first and never moving — the fixed ground the audit asked
  // for. Rotation is read as departure from it.
  for (const a of anchor) {
    parts.push(`<circle cx="${a.x.toFixed(4)}" cy="${a.y.toFixed(4)}" r="${(a.r * 0.9).toFixed(4)}"
      fill="none" stroke="${INK}" stroke-opacity="0.16" stroke-width="0.012"/>`);
  }
  for (const p of pips) {
    // Depth drives luminance only. Hue never moves.
    const op = (0.55 + 0.45 * p.depth).toFixed(3);
    parts.push(`<circle cx="${(p.x).toFixed(4)}" cy="${(p.y - lift * 0.2).toFixed(4)}"
      r="${Math.max(0.02, p.r).toFixed(4)}" fill="${INK}" fill-opacity="${op}"/>`);
  }
  return `<svg viewBox="0 0 1 1" width="${CELL}" height="${CELL}">${parts.join('')}</svg>`;
}

const rows: string[] = [];
for (let f = 0; f < 6; f += 1) {
  const face = FACES[f]!;
  const cells = PHASES.map((ph) => `<div class="c">${token(face, ph)}</div>`).join('');
  rows.push(`<div class="row"><div class="lbl"><b>${face}</b><span>${PLANES[f]}</span></div>${cells}</div>`);
}
// A charged example, to show the lift.
const charged = [0, 1, 2, 3].map((c) => `<div class="c">${token(5, 1.0, c)}</div>`).join('');

const W = 130 + PHASES.length * (CELL + 14);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:${GROUND};color:${INK};
    font-family:"ibm-plex-sans-condensed","Roboto Condensed",system-ui,sans-serif}
  .sheet{padding:26px 30px;width:${W}px}
  h1{margin:0 0 4px;font-size:23px;letter-spacing:.13em;text-transform:uppercase}
  .sub{margin:0 0 20px;font-size:12.5px;opacity:.72;letter-spacing:.02em;line-height:1.5}
  .row{display:flex;align-items:center;gap:14px;margin-bottom:12px}
  .lbl{width:104px;display:flex;align-items:baseline;gap:9px}
  .lbl b{font-family:"source-code-pro",ui-monospace,monospace;font-size:25px;
    font-variant-numeric:tabular-nums}
  .lbl span{font-size:11.5px;opacity:.6;letter-spacing:.16em}
  .c{width:${CELL}px;height:${CELL}px}
  .hd{display:flex;gap:14px;margin:0 0 8px 118px}
  .hd div{width:${CELL}px;font-size:10.5px;opacity:.5;letter-spacing:.1em;text-align:center}
  .foot{margin-top:22px;padding-top:16px;border-top:1px solid ${GROUND_EDGE};
    font-size:12px;opacity:.72;line-height:1.6}
  .foot b{color:${CYAN};font-weight:600}
</style></head><body><div class="sheet">
  <h1>Six planes, six faces</h1>
  <p class="sub">Face <b>n</b> turns in the <b>n</b>th of the only six rotation planes R&#8308; has.
     Pips stay countable at every phase &mdash; the motion is a second, redundant channel.
     Faint rings are the <b>anchor</b>: each token's rest position, never moving.</p>
  <div class="hd">${PHASES.map((p) => `<div>phase ${p.toFixed(1)}</div>`).join('')}</div>
  ${rows.join('')}
  <div class="foot">
    <b>Charge as depth</b> &mdash; the same face 5 at charge 0, 1, 2, 3. A charged cell is
    literally nearer the eye. Public information only; the hidden lattice appears nowhere.
    <div class="row" style="margin-top:12px">${charged}</div>
  </div>
</div></body></html>`;

writeFileSync(new URL('../design/4d-sheet.html', import.meta.url), html);
console.log(`wrote 4d-sheet.html — 6 faces x ${PHASES.length} phases + charge strip, ${W}px wide`);
