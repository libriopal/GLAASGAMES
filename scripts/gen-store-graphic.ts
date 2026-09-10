// scripts/gen-store-graphic.ts — the store graphic, drawn by the game.
//
// ── WHY THIS IS GENERATED AND NOT ILLUSTRATED ────────────────────────────────
//
// Two store graphics were produced through an image generator. The first was
// dark, correct about pips, and measured APCA |Lc| 20.5 against a floor of 75 —
// unreadable at thumbnail size. The second fixed the contrast to 107.2 and drew
// NUMERALS on the tiles: 4, 11, 16, 17, 21, 25. This game replaced digits with
// pip clusters deliberately, and 11 is not a dice face. It also drew ten columns
// where the board has six.
//
// A generator cannot know the rules, so it cannot be relied on to depict them.
// `verify-store-assets` caught the contrast defect and is structurally blind to
// the semantic one — it measures pixels, and "this is not what the game looks
// like" is not a property of pixels.
//
// So the board is drawn by `tokenSvg`, the same function that draws it in the
// app, from the palette pinned in `web/theme.ts`. It cannot render a face the
// game does not have, cannot use a colour the corpus did not yield, and cannot
// drift from the product — because it IS the product's renderer.

import { writeFileSync } from 'node:fs';

import { AMBER, CYAN, GROUND, GROUND_EDGE, GROUND_RAISED, INK } from '../web/theme.js';
import { type TokenKind, tokenDefs, tokenSvg } from '../web/tokens.js';

const PAINT = { ink: INK, ground: GROUND_RAISED, edge: GROUND_EDGE, accent: CYAN };
const CHARGED = { ink: INK, ground: GROUND_RAISED, edge: GROUND_EDGE, accent: AMBER };

/** A deterministic 6x6 of real dice faces — the board's actual shape. */
const FACES: readonly TokenKind[] = [
  3, 5, 1, 6, 2, 4,
  6, 2, 4, 3, 5, 1,
  1, 4, 6, 2, 3, 5,
  5, 3, 2, 4, 1, 6,
  2, 6, 5, 1, 4, 3,
  4, 1, 3, 5, 6, 2,
];
/** One charged cell, and one spent, so all three token states are shown. */
const CHARGED_AT = 15;
const SPENT_AT = 22;

const CELL = 48;
const GAP = 5;
const BOARD = 6 * CELL + 5 * GAP;
const PAD = 14;

// tokenSvg returns a COMPLETE <svg viewBox="0 0 1 1"> per token, so the board is
// laid out in CSS rather than nested inside an outer SVG — the same way the app
// lays it out. Nesting them produced an empty plate, which is exactly the kind
// of thing a screenshot catches and a code review does not.
const tiles: string[] = [];
for (let i = 0; i < 36; i += 1) {
  const state = i === CHARGED_AT ? 'charged' : i === SPENT_AT ? 'spent' : 'idle';
  const paint = i === CHARGED_AT ? CHARGED : PAINT;
  const charge = i === CHARGED_AT ? 2 : 0;
  tiles.push(`<div class="t">${tokenSvg(FACES[i]!, state, paint, true, '', charge)}</div>`);
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:${GROUND};width:1024px;height:500px;overflow:hidden}
  .wrap{position:relative;width:1024px;height:500px;
        font-family:"ibm-plex-sans-condensed","IBM Plex Sans Condensed",
                    "Roboto Condensed",system-ui,sans-serif}
  /* Adobe Fonts recommended these faces for this brief. The stack degrades to a
     condensed system face so the asset builds with no network. */
  h1{position:absolute;left:0;right:0;top:30px;margin:0;text-align:center;
     font-size:50px;font-weight:600;letter-spacing:.14em;color:${INK};
     text-transform:uppercase}
  p{position:absolute;left:0;right:0;bottom:26px;margin:0;text-align:center;
    font-size:20px;font-weight:600;letter-spacing:.02em;color:${INK};
    font-variant-numeric:tabular-nums}
  .plate{position:absolute;left:${(1024 - BOARD) / 2 - PAD}px;top:${112 - PAD}px;
         width:${BOARD + PAD * 2}px;height:${BOARD + PAD * 2}px;border-radius:16px;
         background:${GROUND_RAISED};box-shadow:0 0 70px rgba(133,227,255,.12),
         inset 0 0 0 1px ${GROUND_EDGE}}
  .board{position:absolute;left:${(1024 - BOARD) / 2}px;top:112px;
         width:${BOARD}px;height:${BOARD}px;
         display:grid;grid-template-columns:repeat(6,${CELL}px);gap:${GAP}px}
  .t{width:${CELL}px;height:${CELL}px}
  .t svg{width:100%;height:100%;display:block}
  .glow{position:absolute;left:0;right:0;top:96px;height:${BOARD + PAD * 2 + 32}px;
        background:radial-gradient(ellipse at 50% 50%,rgba(133,227,255,.09),transparent 62%);
        pointer-events:none}
</style></head><body><div class="wrap">
  ${tokenDefs([0.06, 0.10, 0.14, 0.18], GROUND_RAISED, 8)}
  <h1>GLAAS LATTICE</h1>
  <div class="glow"></div>
  <div class="plate"></div>
  <div class="board">${tiles.join('')}</div>
  <p>Read the hidden lattice. Bank what it feeds.</p>
</div></body></html>`;

writeFileSync(new URL('../design/store/feature-graphic.html', import.meta.url), html);
console.log(`wrote feature-graphic.html — 36 tiles, faces ${[...new Set(FACES)].sort().join('')}, ` +
  `board ${BOARD}px, palette from web/theme.ts`);
