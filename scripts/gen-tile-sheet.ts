// scripts/gen-tile-sheet.ts — every molecule tile, at the size a phone gives it.
import { writeFileSync } from 'node:fs';
import { MOLECULES } from '../game/chem/library.js';
import { TILE_PX, geometryOf, inkMap, tileDistance, tileSvg } from '../web/molecule-tile.js';
import { FONT_DISPLAY, FONT_FIGURE, GROUND, INK, INK_DIM } from '../web/theme.js';

const maps = MOLECULES.map((m) => ({ f: m.formula, ink: inkMap(geometryOf(m), 32) }));
let worst = { a: '', b: '', d: Infinity };
for (let i = 0; i < maps.length; i += 1) for (let j = i + 1; j < maps.length; j += 1) {
  const d = tileDistance(maps[i]!.ink, maps[j]!.ink);
  if (d < worst.d) worst = { a: maps[i]!.f, b: maps[j]!.f, d };
}

const cell = (m: typeof MOLECULES[number], px: number) =>
  `<div class="cell">${tileSvg(m, px)}<div class="nm">${m.name}</div></div>`;

const html = `<!doctype html><meta charset="utf-8"><title>molecule tiles</title>
<style>
 body{margin:0;background:${GROUND};color:${INK};font-family:${FONT_DISPLAY};padding:26px}
 h1{font-size:19px;margin:0 0 3px} p{color:${INK_DIM};font-family:${FONT_FIGURE};font-size:11px;margin:0 0 20px}
 h2{font-size:13px;color:${INK_DIM};margin:24px 0 10px;font-weight:400}
 .row{display:flex;gap:10px;flex-wrap:wrap}
 .cell{text-align:center}
 .cell svg{display:block;margin:0 auto}
 .nm{font-size:8.5px;color:${INK_DIM};margin-top:4px;font-family:${FONT_FIGURE}}
 .board{display:grid;grid-template-columns:repeat(6,${TILE_PX}px);gap:4px;width:max-content}
</style>
<h1>Molecule tiles</h1>
<p>${TILE_PX}px — a 393px phone less 16px gutters, over six columns. Closest pair ${worst.a} / ${worst.b} at ${worst.d.toFixed(4)}.</p>
<h2>the alphabet — all ${MOLECULES.length}</h2>
<div class="row">${MOLECULES.map((m) => cell(m, TILE_PX)).join('')}</div>
<h2>at 2x, to see what the structure is doing</h2>
<div class="row">${MOLECULES.slice(0, 8).map((m) => cell(m, TILE_PX * 2)).join('')}</div>
<h2>a board, as a player meets it</h2>
<div class="board">${Array.from({ length: 36 }, (_, i) => tileSvg(MOLECULES[(i * 7 + 3) % MOLECULES.length]!, TILE_PX)).join('')}</div>`;

const out = new URL('../design/tile-specimen.html', import.meta.url);
writeFileSync(out, html);
console.log(`wrote ${out.pathname}; closest pair ${worst.a}/${worst.b} at ${worst.d.toFixed(4)}`);
