// scripts/gen-belief-sheet.ts — a specimen sheet of what the search chose.
//
// Rendered so the result can be LOOKED AT. The 4D cycle's headline candidate
// survived three rounds of reasoning and died to a renderer, so a design that
// has not been drawn is not a design that has been checked.

import { writeFileSync } from 'node:fs';
import { believe, trial } from '../foundry/visual/evolve.js';
import { beliefSvg, ariaLabel } from '../web/belief-widget.js';
import { DECLARED_BEST_ID, DECLARED_BEST_PARAMS } from '../foundry/visual/evolve.js';
import { EMPTY_BELIEF } from '../foundry/visual/belief.js';
import { FONT_DISPLAY, FONT_FIGURE, GROUND, GROUND_RAISED, INK, INK_DIM } from '../web/theme.js';

const t = trial(1000, 0, 8);
const cells: { label: string; svg: string; note: string }[] = [];
cells.push({ label: 'turn 0', svg: beliefSvg(EMPTY_BELIEF, 120), note: ariaLabel(EMPTY_BELIEF) });
for (const n of [1, 2, 4, 8]) {
  const b = believe(t.truth.slice(0, n));
  cells.push({ label: `turn ${n}`, svg: beliefSvg(b, 120), note: ariaLabel(b) });
}
const decoy = believe(t.decoys[1]!);
cells.push({ label: 'wrong belief (quarter turn)', svg: beliefSvg(decoy, 120), note: ariaLabel(decoy) });
const rev = believe(t.decoys[0]!);
cells.push({ label: 'wrong belief (reversed)', svg: beliefSvg(rev, 120), note: ariaLabel(rev) });

const html = `<!doctype html><meta charset="utf-8"><title>belief specimen</title>
<style>
  body { margin:0; background:${GROUND}; color:${INK}; font-family:${FONT_DISPLAY}; padding:28px; }
  h1 { font-size:20px; letter-spacing:.02em; margin:0 0 4px; }
  p.sub { color:${INK_DIM}; font-family:${FONT_FIGURE}; font-size:11px; margin:0 0 24px; }
  .row { display:flex; gap:18px; flex-wrap:wrap; }
  .cell { background:${GROUND_RAISED}22; border-radius:10px; padding:12px; width:150px; }
  .cell .label { font-size:12px; margin-top:8px; }
  .cell .note { color:${INK_DIM}; font-family:${FONT_FIGURE}; font-size:9.5px; margin-top:4px; line-height:1.35; }
</style>
<h1>Belief readout — ${DECLARED_BEST_ID}</h1>
<p class="sub">reach ${DECLARED_BEST_PARAMS.reach.toFixed(4)} &middot; base ${DECLARED_BEST_PARAMS.base.toFixed(4)} &middot; gain ${DECLARED_BEST_PARAMS.gain.toFixed(4)} &middot; floor ${DECLARED_BEST_PARAMS.floor.toFixed(4)} &mdash; evolved, not chosen</p>
<div class="row">
${cells.map((c) => `<div class="cell">${c.svg}<div class="label">${c.label}</div><div class="note">${c.note}</div></div>`).join('\n')}
</div>`;

const out = new URL('../design/belief-specimen.html', import.meta.url);
writeFileSync(out, html);
console.log(`wrote ${out.pathname} — ${cells.length} states of ${DECLARED_BEST_ID}`);
