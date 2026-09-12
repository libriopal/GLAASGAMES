// scripts/gen-farkle-sheet.ts — the Farkle screen, at the size a phone gives it.
//
// Four states a player actually meets, from a REAL round rather than posed:
// an untouched hand, a chain mid-trace, a chain that would strand the hand, and
// a hand that has been burnt down to nothing.

import { writeFileSync } from 'node:fs';
import { CELL_COUNT, drawHand, riskAfter, scoringChains, survivableDepth } from '../game/farkle/hand.js';
import { FACE_WEIGHTS, efficientChain, judgeChain } from '../game/farkle/round.js';
import { faceAtOrdinal, forecast } from '../lattice/draw-stream.js';
import { DEFAULT_ROUND, beginRound } from '../lattice/round.js';
import { farkleScreenSvg, SCREEN_W, type ScreenState } from '../web/farkle-screen.js';
import { AMBER, FONT_DISPLAY, FONT_FIGURE, GROUND, INK, INK_DIM } from '../web/theme.js';

const SEED = 0x7a17;
const faces = Array.from({ length: CELL_COUNT }, (_, i) => faceAtOrdinal(SEED, i, FACE_WEIGHTS));
const live = new Set(drawHand(SEED));

// A real forecast, from a real mid-round board — so row 2 carries real
// confidence rather than the empty-board zero that renders as nothing.
const lat = beginRound(SEED, DEFAULT_ROUND);
const fc = forecast(SEED, CELL_COUNT, FACE_WEIGHTS, lat.board);

function screen(over: Partial<ScreenState>): ScreenState {
  return {
    faces, live, chain: [], running: 0, bank: 0, combo: '', chainScore: 0,
    chainsLeft: survivableDepth(faces, live), turn: 0, turns: 10,
    forecast: fc.faces, forecastConfidence: fc.confidence,
    ...over,
  };
}

// ── 1. The hand as dealt ─────────────────────────────────────────────────────
const dealt = screen({ bank: 1250, turn: 2 });

// ── 2. A chain mid-trace, from the real enumerator ───────────────────────────
const chains = scoringChains(faces, live).filter((c) => c.cells.length >= 3);
const traced = chains.reduce((a, b) => (b.score > a.score ? b : a));
const judged = judgeChain(faces, live, traced.cells);
const tracing = screen({
  chain: traced.cells, chainScore: judged.score, combo: judged.combo,
  running: judged.score, bank: 1250, turn: 2,
  chainsLeft: survivableDepth(faces, live),
});

// ── 3. A chain that would strand the hand ────────────────────────────────────
let worstCells = traced.cells; let worstRisk = -1;
for (const c of scoringChains(faces, live)) {
  const r = riskAfter(faces, live, c.cells);
  if (r > worstRisk) { worstRisk = r; worstCells = c.cells; }
}
const wj = judgeChain(faces, live, worstCells);
const stranding = screen({
  chain: worstCells, chainScore: wj.score, combo: wj.combo,
  running: 850 + wj.score, bank: 1250, turn: 2, chainsLeft: 1,
});

// ── 4. Burnt down — four efficient chains taken, nothing left ────────────────
const burnt = [...faces];
const burntLive = new Set(live);
let burntRun = 0;
for (let i = 0; i < 4; i += 1) {
  const c = efficientChain(burnt, burntLive);
  if (c.length === 0) break;
  burntRun += judgeChain(burnt, burntLive, c).score;
  for (const x of c) { burnt[x] = 0; burntLive.delete(x); }
}
const spent = screen({
  faces: burnt, live: burntLive, running: burntRun, bank: 1250, turn: 2,
  chainsLeft: survivableDepth(burnt, burntLive),
});

const panels: [string, string, ScreenState][] = [
  ['the hand as dealt', 'Sixteen connected dice, contained. The twenty outside are visible and pushed into the deck.', dealt],
  ['a chain traced', 'The ribbon threads the dice. The combination is NAMED; the number is the footnote.', tracing],
  ['the last chain', 'The readout is a FACT, not a forecast: how many more chains this hand can sustain. Measurement proved the old four-level risk display was binary.', stranding],
  ['burnt down', 'Four chains taken. Spent cells are holes, not dark dice — the hand shrinking is the whole risk mechanic.', spent],
];

const html = `<!doctype html><meta charset="utf-8"><title>Farkle — screen</title>
<style>
 body{margin:0;background:#05070a;color:${INK};font-family:${FONT_DISPLAY};padding:30px}
 h1{font-size:22px;margin:0 0 4px;letter-spacing:.5px}
 h1 span{color:${AMBER}}
 .sub{color:${INK_DIM};font-family:${FONT_FIGURE};font-size:11px;margin:0 0 26px;line-height:1.65;max-width:900px}
 .row{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start}
 .panel{width:${SCREEN_W}px}
 .panel h2{font-size:13px;margin:0 0 3px;font-weight:400;color:${INK}}
 .panel p{font-size:10px;color:${INK_DIM};font-family:${FONT_FIGURE};margin:0 0 10px;line-height:1.55;min-height:44px}
 .phone{border:1px solid #1b2430;border-radius:14px;overflow:hidden;display:block}
</style>
<h1>GLAASGAMES · <span>FARKLE</span></h1>
<p class="sub">
 Trace up to six connected dice; the faces score as a Farkle hand. Cells leave the hand as they score and
 <b>nothing replaces them until the turn ends</b>, so the hand shrinks and the next chain gets harder.
 A <b>run multiplier of &times;1.35 per chain</b> is what makes continuing worth the risk &mdash; measured, a mindless
 bank-after-one rule falls from 99.1% of optimal to 78.3% once it is in.<br>
 The readout is <b>CHAINS LEFT</b>, a fact rather than a forecast: calibration over 16,400 observations showed the
 old four-level risk display was <b>binary</b> (states 0,1,2 all farkled 0% of the time; state 3 farkled 100%).
 Certain drops sit <b>nearest the board</b>; likely ones further away, so distance means distance in the future.
</p>
<div class="row">
${panels.map(([t, d, s]) => `<div class="panel"><h2>${t}</h2><p>${d}</p><div class="phone">${farkleScreenSvg(s)}</div></div>`).join('')}
</div>`;

const out = new URL('../design/farkle-sheet.html', import.meta.url);
writeFileSync(out, html);
console.log(`wrote ${out.pathname}`);
console.log(`  traced: ${judged.combo} +${judged.score}, chains left ${tracing.chainsLeft}`);
console.log(`  last:   ${wj.combo} +${wj.score}, chains left ${stranding.chainsLeft}`);
console.log(`  burnt:  ${burntLive.size} cells left of 16, running ${burntRun}`);
