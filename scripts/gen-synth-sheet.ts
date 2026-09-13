// Renders the synthesis-line screen from REAL executor state, three states side
// by side. Mockups are not evidence; these come from beginSynth/advanceSynth.
import { writeFileSync } from 'node:fs';
import { synthScreenSvg, type ScreenState } from '../web/synth-screen.js';
import { DEFAULT_SYNTH, beginSynth, advanceSynth, previewOf, optionsFor } from '../game/chem/synth.js';
import { equationOf } from '../game/chem/reaction.js';
import { ORDER_1, legalMoves } from '../foundry/montecarlo/synth-harness.js';

const SINKS = ['N2', 'CO2', 'HF'];

function shot(seed: number, turns: number, withPath: boolean, route: boolean): ScreenState {
  const cfg = { ...DEFAULT_SYNTH, options: 3, preview: 4, turns: 12, route };
  const st = beginSynth(seed, cfg);
  for (let t = 0; t < turns; t++) {
    advanceSynth(st, cfg, (ti, b, q, bk, tn) => ORDER_1.choose(ti, b, q, bk, tn, cfg));
  }
  let path: number[] = [];
  let options: string[] = [];
  if (withPath) {
    const m = legalMoves(st.tiles, cfg).sort((a, b) => b.released - a.released)[0];
    path = m ? [...m.action.cells] : [];
    // The equations the EXECUTOR offers for this exact selection, in its order.
    if (m) options = optionsFor(st.tiles, m.action.cells, 3).map((r) => equationOf(r).split(' \u2192 ')[1] ?? '');
  }
  return {
    topology: cfg.topology ?? 'SQUARE36',
    tiles: [...st.tiles],
    book: [...st.book],
    queue: previewOf(st, cfg),
    bank: st.bank,
    shipped: st.filled,
    turn: st.turn,
    turns: cfg.turns,
    path,
    declared: route ? { formula: st.book[0] ?? 'F2', turnsLeft: 2 } : null,
    sinks: SINKS,
    options,
    // Orders some legal move can MAKE this turn -- not orders sitting on the
    // board, which under ANYWHERE delivery is never true for an open order.
    reachable: (() => {
      const makeable = new Set<string>();
      for (const m of legalMoves(st.tiles, cfg)) {
        for (const p2 of m.products) if (st.book.includes(p2)) makeable.add(p2);
      }
      return [...makeable];
    })(),
  };
}

const states = [
  { name: 'opening — nothing selected', s: shot(15838, 0, false, false) },
  { name: 'mid-round — a path drawn', s: shot(15838, 4, true, false) },
  { name: 'declared route live', s: shot(7919 * 3, 3, true, true) },
];

const html = `<!doctype html><meta charset="utf-8"><title>synthesis line</title>
<style>body{margin:0;background:#05070c;font-family:ui-monospace,monospace;color:#8fa3b8}
.row{display:flex;gap:22px;padding:26px;align-items:flex-start}
figure{margin:0}figcaption{font-size:12px;padding:10px 2px;color:#7e93ab;letter-spacing:1px}</style>
<div class="row">${states.map((x) => `<figure>${x.s ? synthScreenSvg(x.s) : ''}<figcaption>${x.name}</figcaption></figure>`).join('')}</div>`;
writeFileSync('design/synth-sheet.html', html);
console.log('wrote design/synth-sheet.html');
