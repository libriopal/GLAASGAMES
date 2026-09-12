// scripts/gen-forecast-sheet.ts — the forecast strip, at the size a phone gives it.
//
// Written to be LOOKED AT, because every defect this project has found in a
// visual layer was found by rendering it and not one by reviewing the code. The
// sheet deliberately includes the degenerate cases — a dead board, a no-claim
// row — since those are where a forecast lies most cheaply.

import { writeFileSync } from 'node:fs';
import { Board, CELL_COUNT, OFFSET_LINK, NO_LINK } from '../lattice/board.js';
import { CONFIDENCE_MAX, FORECAST_WIDTH, forecast, liveLinkCount } from '../lattice/draw-stream.js';
import { DEFAULT_ROUND, advanceTurn, beginRound } from '../lattice/round.js';
import { cellLc, forecastStripSvg, stripGeometry, STRIP_VOID } from '../web/forecast-strip.js';
import { projectToken } from '../web/board4d.js';
import {
  FONT_DISPLAY,
  FONT_FIGURE,
  GROUND,
  GROUND_EDGE,
  GROUND_RAISED,
  INK,
  INK_DIM,
  toHex,
  hex,
} from '../web/theme.js';

const BOARD_PX = 60;

/** A board tile, drawn through the same projection the strip uses. */
function boardTile(face: number, phase: number): string {
  const px = BOARD_PX;
  const pips = face >= 1 && face <= 6 ? projectToken(face as 1 | 2 | 3 | 4 | 5 | 6, phase) : [];
  const body = pips
    .map(
      (p) =>
        `<circle cx="${(p.x * px).toFixed(1)}" cy="${(p.y * px).toFixed(1)}" r="${(p.r * px).toFixed(2)}" ` +
        `fill="${toHex(hex(INK))}" opacity="${(0.55 + 0.45 * p.depth).toFixed(2)}"/>`,
    )
    .join('');
  return (
    `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">` +
    `<rect x="1" y="1" width="${px - 2}" height="${px - 2}" rx="6" fill="${GROUND_RAISED}" stroke="${GROUND_EDGE}"/>` +
    body +
    `</svg>`
  );
}

// ── The live case: a real round, mid-play ────────────────────────────────────
const state = beginRound(0x4d21, DEFAULT_ROUND);
for (let t = 0; t < 3; t += 1) advanceTurn(state, DEFAULT_ROUND, () => t * 7);
const live = forecast(state.seed, state.draws, state.weights, state.board);

// ── The degenerate case: every link severed, so row 2 claims nothing ─────────
const dying = beginRound(0x4d21, DEFAULT_ROUND);
for (let i = 0; i < CELL_COUNT; i += 1) dying.board.set(i, OFFSET_LINK, NO_LINK);
const dead = forecast(dying.seed, dying.draws, dying.weights, dying.board);

// ── The ladder: one strip per confidence level, so the washout is visible ────
const ladder: string[] = [];
for (let c = CONFIDENCE_MAX; c >= 0; c -= 1) {
  const b = new Board();
  // Sever enough links to land in bucket `c`. Thresholds are 12 / 6 / 2.
  const target = c === 3 ? 30 : c === 2 ? 8 : c === 1 ? 3 : 0;
  const src = beginRound(0x4d21, DEFAULT_ROUND);
  let kept = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    b.set(i, 0, src.board.get(i, 0));
    const link = src.board.get(i, OFFSET_LINK);
    if (link !== NO_LINK && kept < target) { b.set(i, OFFSET_LINK, link); kept += 1; }
    else b.set(i, OFFSET_LINK, NO_LINK);
  }
  const f = forecast(src.seed, src.draws, src.weights, b);
  ladder.push(
    `<div class="cell">${forecastStripSvg(f)}<div class="nm">live links ${liveLinkCount(b)} → confidence ${f.confidence[FORECAST_WIDTH]}</div></div>`,
  );
}

const g = stripGeometry();
const lcLine = Array.from({ length: CONFIDENCE_MAX + 1 }, (_, c) => `${c}:row1 Lc ${cellLc(c, 0).toFixed(0)} / row2 Lc ${cellLc(c, 1).toFixed(0)}`).join('   ');

const boardRows = Array.from({ length: 6 }, (_, r) =>
  Array.from({ length: 6 }, (_, c) => boardTile(state.board.get(r * 6 + c, 0), ((r * 6 + c) % 5) * 0.12)).join(''),
).join('');

const html = `<!doctype html><meta charset="utf-8"><title>forecast strip</title>
<style>
 body{margin:0;background:${GROUND};color:${INK};font-family:${FONT_DISPLAY};padding:26px}
 h1{font-size:19px;margin:0 0 3px}
 p{color:${INK_DIM};font-family:${FONT_FIGURE};font-size:11px;margin:0 0 20px;line-height:1.6}
 h2{font-size:13px;color:${INK_DIM};margin:26px 0 10px;font-weight:400}
 .row{display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start}
 .cell{text-align:left}
 .nm{font-size:9px;color:${INK_DIM};margin-top:6px;font-family:${FONT_FIGURE}}
 .phone{width:${g.width}px}
 .void{height:${STRIP_VOID}px}
 .board{display:grid;grid-template-columns:repeat(6,${BOARD_PX}px);gap:0;width:max-content}
 .board svg{display:block}
</style>
<h1>Forecast strip</h1>
<p>Row 1 certain, row 2 fallible, row 3 never. Confidence is washout toward the deck, never size — ${lcLine}.<br>
Tokens drawn through the board's own 4D projection at rest orientation, so both surfaces agree what a five looks like.</p>

<h2>as a player meets it — instrument above, playfield below, ${STRIP_VOID}px of void between</h2>
<div class="phone">
  ${forecastStripSvg(live)}
  <div class="void"></div>
  <div class="board">${boardRows}</div>
</div>

<h2>the confidence ladder — the same six faces, four levels of claim</h2>
<div class="row">${ladder.join('')}</div>

<h2>a board with every link severed — row 2 must say nothing at all</h2>
<div class="row"><div class="cell">${forecastStripSvg(dead)}<div class="nm">live links 0 → row 2 is the deck</div></div></div>
`;

const out = new URL('../design/forecast-sheet.html', import.meta.url);
writeFileSync(out, html);
console.log(
  `wrote ${out.pathname}\n  live row-2 confidence ${live.confidence[FORECAST_WIDTH]}, dead ${dead.confidence[FORECAST_WIDTH]}\n  ${lcLine}`,
);
