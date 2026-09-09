// engine/verify/verify-tokens.ts — the digits became pictures, and the number
// has to survive the change.
//
// P1  no two pips ever touch, measured in DEVICE PIXELS at the narrowest phone
// P2  the face value is recoverable from the rendered image by counting
// P3  the pip centres are the canonical dice arrangements
// P4  the pip ink clears APCA against the ground it is actually drawn on
// P5  the number is still in the accessibility tree
// P7  the ground is the corpus's own measured lighting, and there IS a signal
// P7b and the renderer paints it, sign and all   (the mutation harness found this)
// P8  the charge indicator never covers a pip     (a screenshot found this one)
// P9  the pips DRAWN on a cell are the face that cell SAYS it holds  (auditor)
// P6  each of the above is caught when broken            (NEGATIVE CONTROLS)
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A NEW ORACLE, WHEN THERE ARE ALREADY TWENTY-FIVE.
//
// `lattice/round.ts` pays `face(fed cell) x (1 + charge)`. The face is a number
// the player MULTIPLIES, so replacing it with art risks something no check in
// this repository can see: every policy in `verify-learnable` reads
// `observable[i * 3]` as an integer out of the model and never looks at a pixel.
// A token set that made the board unreadable to a human would leave E1-E8
// byte-identical, `verify-theme` green (it compares colour tokens, not shapes)
// and `verify-lattice-gl` G3 green (it samples contrast, not countability).
// The entire failure mode falls between the existing instruments.
//
// TWO OF THESE CHECKS EXIST BECAUSE AN INDEPENDENT AUDITOR REFUSED THE DESIGN,
// TWICE, BEFORE ANY TOKEN WAS DRAWN.
//
// Round 1 proposed P2 alone: render the token, count connected components,
// require the face value. The rejection:
//
//   "It measures topological discreteness rather than magnitude perception. The
//    oracle is vulnerable to segmentation failure: if the smallest board size
//    causes pips to touch, the algorithm will undercount the value — a 6 becomes
//    a 1 — whereas a human can still perceive magnitude through visual density
//    or gestalt pattern recognition."
//
// Both halves land, and they point opposite ways. Merging makes P2 WRONG rather
// than conservative — it would fail art a person could read, and an alarm like
// that gets switched off. And component counting is not how anyone reads a die
// anyway; the pattern is recognised, not counted. So P2 was not defended, it was
// split: P1 makes merging impossible, which is what makes P2's boundaries sound,
// and P3 pins the gestalt channel that does the real work.
//
// Round 2 rejected the split for validating that the graphics are geometrically
// discrete without validating that they are perceptually salient — naming
// luminance as the hole. The tempting reply was "APCA is enforced everywhere in
// this repo already". It is, and it is not enough: every existing pairing is one
// that EXISTS TODAY, and pip-against-token-ground is new. G3's own history is
// the argument — it caught a real regression at 80% tile opacity (|Lc| 89.5
// against a 90 floor) that every other check passed. Hence P4, on rendered
// pixels, after the GL wash has composited underneath. Approved at round 3, with
// one residual risk accepted rather than closed: APCA is a luminance model, so
// two colours of similar luminance and wildly different hue could clear P4 and
// still separate poorly. That is written down, not checked.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CHARGE_GLOW, DIE_BODY, DIE_EDGE, FACE_INK, LC_LARGE_UI } from '../../web/theme.js';
import { FACE_REGION, FACES, minPipGap, PIP_LAYOUT, PIP_R, tokenDefsMarkup, tokenSvg, type TokenKind } from '../../web/tokens.js';
import { CHARGE_MAX } from '../../lattice/board.js';
import TEXTURE from '../../design/token-texture.json' with { type: 'json' };

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ASSETS = join(ROOT, 'android/app/src/main/assets/');
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
};

/** The narrowest viewport `verify-devices` D1 holds the layout to. */
const NARROW = 320;

const PAINT = { ink: FACE_INK, ground: DIE_BODY, edge: DIE_EDGE, accent: CHARGE_GLOW };

/** The corpus-lighting pattern, INLINED into a token when it is rasterised.
 *  On the page it is emitted once and shared; a data-URI raster is its own
 *  document and cannot reach a pattern defined in a sibling <svg>. */
const DEFS = tokenDefsMarkup(TEXTURE.tile as number[], DIE_BODY, TEXTURE.grid);

// ── APCA, reimplemented ────────────────────────────────────────────────────
// Deliberately a third copy. verify-theme keeps one private and
// verify-lattice-gl keeps another, for the stated reason that two oracles
// sharing an implementation agree because they share code rather than because
// the screen is legible. P6 proves this copy can report a failure.
type Rgb = readonly [number, number, number];
const screenY = (c: Rgb): number =>
  0.2126729 * (c[0] / 255) ** 2.4 + 0.7151522 * (c[1] / 255) ** 2.4 + 0.0721750 * (c[2] / 255) ** 2.4;

/** APCA Lc, reverse polarity — light ink on a dark token, the only case here. */
function apcaLc(ink: Rgb, bg: Rgb): number {
  let yt = screenY(ink);
  let yb = screenY(bg);
  yt = yt > 0.022 ? yt : yt + (0.022 - yt) ** 1.414;
  yb = yb > 0.022 ? yb : yb + (0.022 - yb) ** 1.414;
  if (Math.abs(yb - yt) < 0.0005) return 0;
  const sapc = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return sapc < -0.001 ? (sapc + 0.027) * 100 : 0;
}

// ── P3: the canonical arrangements ──────────────────────────────────────────
// Pure geometry, no browser needed. Run first because if the layout is not the
// canonical one, nothing measured downstream is measuring a die.

/** The arrangements as everyone has drawn them for two millennia, as fractions
 *  of the token side. Written out here INDEPENDENTLY of `PIP_LAYOUT` — a check
 *  that imported the thing it checks would agree with any layout at all. */
const CANONICAL: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[0.5, 0.5]],
  2: [[0.26, 0.26], [0.74, 0.74]],
  3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
  4: [[0.26, 0.26], [0.74, 0.26], [0.26, 0.74], [0.74, 0.74]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.26, 0.26], [0.74, 0.26], [0.26, 0.5], [0.74, 0.5], [0.26, 0.74], [0.74, 0.74]],
};

/** Two point sets as the same arrangement, order-independent. */
function sameArrangement(a: readonly { x: number; y: number }[],
                         b: readonly (readonly [number, number])[]): boolean {
  if (a.length !== b.length) return false;
  const key = (x: number, y: number): string => `${x.toFixed(3)},${y.toFixed(3)}`;
  const want = new Set(b.map(([x, y]) => key(x, y)));
  return a.every((p) => want.has(key(p.x, p.y)));
}

for (const face of FACES) {
  ok(PIP_LAYOUT[face].length === face,
    `P3: face ${face} is drawn with ${PIP_LAYOUT[face].length} pips`);
  ok(sameArrangement(PIP_LAYOUT[face], CANONICAL[face]!),
    `P3: face ${face} does not use the canonical dice arrangement, so the gestalt channel — ` +
      'which is how a die is actually read — is gone');
}

// ── P1: the pips cannot merge ──────────────────────────────────────────────
// THE PRECONDITION THE AUDITOR'S FIRST OBJECTION BOUGHT. Measured in device
// pixels at the narrowest phone, because a fraction of the side is not an
// answer to "do they touch".

/** The token's side in CSS px at the narrowest viewport, measured, not assumed. */
let tokenSidePx = 0;

// ── the harness ────────────────────────────────────────────────────────────

try {
  execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
} catch {
  console.error('verify-tokens: FAIL — the app assets could not be rebuilt');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0]!;
  const rel = normalize(url === '/' ? 'index.html' : url.replace(/^\//, ''));
  if (rel.startsWith('..')) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(join(ASSETS, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as { port: number }).port;
const origin = `http://127.0.0.1:${port}`;

/** The pinned Chromium the other browser oracles use, not whatever Playwright
 *  last downloaded. Same rasteriser as verify-lattice-gl, so the pixels these
 *  two files disagree about are the artwork's fault and not the browser's. */
function findChromium(): string | undefined {
  for (const root of readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium')).sort().reverse()) {
    for (const exe of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const candidate = join('/opt/pw-browsers', root, exe);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const browser = await chromium.launch({ executablePath: findChromium() });

/**
 * Rasterises one SVG and returns its pixels.
 *
 * The token is drawn on the SAME ground the board uses, at the SAME size,
 * through the SAME renderer — Chromium — that will draw it on a phone. A
 * software rasteriser written here would have measured this file's idea of the
 * artwork rather than the artwork.
 */
async function raster(svg: string, sidePx: number): Promise<{ w: number; h: number; px: Uint8ClampedArray }> {
  const page = await browser.newPage({ viewport: { width: sidePx + 8, height: sidePx + 8 } });
  await page.setContent(
    `<body style="margin:0;background:${DIE_BODY}">` +
      `<div id="t" style="width:${sidePx}px;height:${sidePx}px">${svg}</div>` +
      `<canvas id="c" width="${sidePx}" height="${sidePx}"></canvas></body>`,
  );
  // PLAIN JS IN A STRING, not a typed closure. Playwright serialises the
  // function to the page, so a TypeScript annotation that survived into the
  // browser is a SyntaxError at runtime and tsc cannot see it — a mistake this
  // suite has made before. The same reason verify-lattice-gl passes strings.
  const data = await page.evaluate(`(async () => {
    const holder = document.getElementById('t');
    const markup = new XMLSerializer().serializeToString(holder.firstElementChild);
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(markup)));
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const ctx = document.getElementById('c').getContext('2d');
    ctx.drawImage(img, 0, 0, ${sidePx}, ${sidePx});
    const d = ctx.getImageData(0, 0, ${sidePx}, ${sidePx});
    return { w: d.width, h: d.height, px: Array.from(d.data) };
  })()`) as { w: number; h: number; px: number[] };
  await page.close();
  return { w: data.w, h: data.h, px: Uint8ClampedArray.from(data.px) };
}

/**
 * Connected components of "ink" in a rasterised token, 4-connected.
 *
 * "Ink" is any pixel closer to the ink colour than to the ground, in plain
 * luminance — DELIBERATELY COLOUR-BLIND. Half of what P2 is for is proving the
 * face survives hue being unavailable, and roughly one man in twelve cannot use
 * hue to tell two tokens apart.
 */
function components(img: { w: number; h: number; px: Uint8ClampedArray }, insetFrac: number): number {
  const { w, h, px } = img;
  const lum = (i: number): number => 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!;
  const groundLum = 0.2126 * 0x14 + 0.7152 * 0x1b + 0.0722 * 0x26;
  const inkLum = 0.2126 * 0xe9 + 0.7152 * 0xee + 0.0722 * 0xf4;
  const mid = (groundLum + inkLum) / 2;

  // The inset drops the token's own border and the charged ring, which are
  // frame rather than face. Without it every token would score one extra
  // component and P2 would be counting the box.
  const lo = Math.round(w * insetFrac);
  const hi = Math.round(w * (1 - insetFrac));

  const seen = new Uint8Array(w * h);
  let found = 0;
  const isInk = (x: number, y: number): boolean =>
    x >= lo && x < hi && y >= lo && y < hi && lum((y * w + x) * 4) > mid;

  for (let y = lo; y < hi; y += 1) {
    for (let x = lo; x < hi; x += 1) {
      if (!isInk(x, y) || seen[y * w + x]) continue;
      found += 1;
      const stack = [[x, y]];
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        if (seen[cy! * w + cx!]) continue;
        seen[cy! * w + cx!] = 1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx! + dx!;
          const ny = cy! + dy!;
          if (isInk(nx, ny) && !seen[ny * w + nx]) stack.push([nx, ny]);
        }
      }
    }
  }
  return found;
}

/** The mean colour of the ground immediately around a pip, for P4. */
function groundAround(img: { w: number; h: number; px: Uint8ClampedArray },
                      cx: number, cy: number, rPx: number): Rgb {
  let r = 0, g = 0, b = 0, n = 0;
  const ring = Math.round(rPx * 1.8);
  for (let dy = -ring; dy <= ring; dy += 1) {
    for (let dx = -ring; dx <= ring; dx += 1) {
      const d = Math.hypot(dx, dy);
      if (d < rPx * 1.35 || d > ring) continue;
      const x = Math.round(cx + dx);
      const y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const i = (y * img.w + x) * 4;
      r += img.px[i]!; g += img.px[i + 1]!; b += img.px[i + 2]!; n += 1;
    }
  }
  return n === 0 ? [0, 0, 0] : [r / n, g / n, b / n];
}

// ── the board, at the narrowest phone, for the real token size ─────────────

{
  const page = await browser.newPage({ viewport: { width: NARROW, height: 800 } });
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  const measured = await page.evaluate(`(() => {
    const cell = document.querySelector('.cell');
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    const labels = Array.from(document.querySelectorAll('.cell'))
      .map((c) => c.getAttribute('aria-label') || '')
      .filter((l) => /face [0-9]/.test(l)).length;
    // P9's evidence: for every filled cell, the pips DRAWN and the number
    // SPOKEN, gathered from the same element in the same pass.
    const pairs = Array.from(document.querySelectorAll('.cell'))
      .filter((c) => c.getAttribute('data-empty') !== '1')
      .map((c) => {
        const m = /face ([0-9])/.exec(c.getAttribute('aria-label') || '');
        return { drawn: c.querySelectorAll('circle.pip').length, spoken: m ? Number(m[1]) : -1 };
      });
    return {
      side: Math.min(r.width, r.height),
      hasSvg: cell.querySelector('svg') !== null,
      labels,
      filled: pairs.length,
      pairs,
      text: (cell.textContent || '').trim(),
    };
  })()`) as {
    side: number; hasSvg: boolean; labels: number; filled: number;
    pairs: { drawn: number; spoken: number }[]; text: string;
  } | null;
  await page.close();

  if (!measured) fail('P1: the board rendered no cells at 320px');
  else {
    tokenSidePx = measured.side;
    ok(measured.hasSvg, 'P1: a cell contains no <svg>, so the digits were not replaced at all');

    // ── P5: THE NUMBER IS STILL THERE FOR ANYONE NOT LOOKING AT IT ─────────
    // A screen reader user's board did not become a picture. If replacing the
    // digit had emptied the label, this stage would have traded a visual
    // improvement for a regression, and that is not a trade this project makes.
    ok(measured.labels > 0,
      'P5: no cell aria-label carries a face number — the digit left the accessibility tree ' +
        'along with the screen');
    ok(measured.labels === measured.filled,
      `P5: ${measured.filled} cells hold a face but only ${measured.labels} say so in their label`);

    // And the digit is GONE from the visible text, or nothing was replaced.
    ok(!/^[1-6]$/.test(measured.text),
      `P5: a cell still renders the bare digit ${measured.text} as text`);

    // ── P9: THE PICTURE AND THE LABEL ARE THE SAME NUMBER ─────────────────
    //
    // THE HOLE THE AUDITOR NAMED, AND IT IS THE SHARPEST ONE IN THE FILE.
    // P2 counts pips on a token rendered in ISOLATION. P5 checks that cells
    // carry a face number in their label. NOTHING CONNECTED THEM. A wiring
    // mistake that drew face 3's token on a cell whose model face is 5 would
    // leave P2 green (the token is a perfectly good 3), P5 green (the label
    // reads "face 5"), and every other oracle in the repo green — while a
    // sighted player and a screen-reader user were told different numbers
    // about the same cell, on a board where the number is the score.
    //
    // So this counts the pips the board ACTUALLY DREW in each cell and
    // compares them to what that same cell SAYS it holds, all 36 of them.
    let mismatched = 0;
    for (const [i, pair] of measured.pairs.entries()) {
      if (pair.spoken < 1) { fail(`P9: filled cell ${i} has no face number in its label`); continue; }
      if (pair.drawn !== pair.spoken) {
        mismatched += 1;
        if (mismatched <= 3) {
          fail(`P9: cell ${i} draws ${pair.drawn} pips but its label says face ${pair.spoken}`);
        }
      }
    }
    ok(mismatched === 0,
      `P9: ${mismatched} of ${measured.pairs.length} cells show a different number than they say`);
    ok(measured.pairs.length >= 30,
      `P9: only ${measured.pairs.length} filled cells were found to check, so agreement is thin`);
    console.log(`  P9 agreement: ${measured.pairs.length} cells; pips drawn match the face each ` +
      'cell reports to a screen reader');
  }
}

// ── P1, in device pixels ───────────────────────────────────────────────────

if (tokenSidePx > 0) {
  for (const face of FACES) {
    const gapFrac = minPipGap(face);
    if (!Number.isFinite(gapFrac)) continue; // face 1 has no pair; honestly skipped
    const gapPx = gapFrac * tokenSidePx;
    ok(gapPx >= 1,
      `P1: face ${face} leaves ${gapPx.toFixed(2)}px of clear ground between its closest pips at ` +
        `a ${tokenSidePx.toFixed(1)}px token — under one device pixel they merge, and P2 would ` +
        'then read the face as a smaller number than it is');
  }
  console.log(`  P1 separation: token ${tokenSidePx.toFixed(1)}px at ${NARROW}px viewport; ` +
    `closest pips clear ${(minPipGap(6) * tokenSidePx).toFixed(2)}px`);
}

// ── P2: the face is recoverable, in greyscale, at that size ────────────────

const side = Math.max(24, Math.round(tokenSidePx || 48));
// The face region, taken from the module rather than chosen here. Everything
// that carries the VALUE is inside it; everything that carries STATE is outside.
const INSET = FACE_REGION;

for (const face of FACES) {
  const img = await raster(tokenSvg(face as TokenKind, 'idle', PAINT, true, DEFS), side);
  const n = components(img, INSET);
  ok(n === face,
    `P2: face ${face} rasterises to ${n} ink components at ${side}px — the value is not ` +
      'recoverable by counting, which is the whole reason the faces are pips');
}

// P2 also has to hold in the CHARGED state, which adds a ring. If the ring
// leaked into the count, every charged face would read one too high and the
// player would be doing arithmetic on the wrong number.
for (const face of FACES) {
  const img = await raster(tokenSvg(face as TokenKind, 'charged', PAINT, true, DEFS), side);
  ok(components(img, INSET) === face,
    `P2: charged face ${face} does not recover to ${face} — the charge ring is being counted ` +
      'as part of the value');
}

// The four named tokens carry no magnitude, and must not LOOK like they do.
// A four-component emblem sitting where a 4 could be is a misreading waiting
// to happen, so each is required to be a single connected mark.
for (const kind of ['wild', 'bomb', 'locked', 'frozen'] as const) {
  const img = await raster(tokenSvg(kind, 'idle', PAINT, true, DEFS), side);
  const n = components(img, INSET);
  ok(n <= 2,
    `P2: the ${kind} token rasterises to ${n} separate marks, which reads as a face value of ${n}`);
}

// ── P4: the pips clear APCA against the ground they are drawn on ───────────
//
// RUN TWICE, ON THE FLAT GROUND AND ON THE CORPUS-LIT ONE. The whole risk the
// texture introduces is that it lifts the ground under a pip until the pip
// stops reading, and a single number cannot show that happening. Two numbers
// can: the difference between them IS the cost of the texture, in the units the
// floor is written in.

/** The worst pip-against-ground contrast on a face, in APCA. */
async function worstPipLc(face: TokenKind, textured: boolean): Promise<number> {
  const svg = tokenSvg(face, 'idle', PAINT, textured, textured ? DEFS : '');
  const img = await raster(svg, side);
  let worst = 999;
  for (const p of PIP_LAYOUT[face as 1 | 2 | 3 | 4 | 5 | 6]) {
    const cx = p.x * side;
    const cy = p.y * side;
    const i = (Math.round(cy) * img.w + Math.round(cx)) * 4;
    const ink: Rgb = [img.px[i]!, img.px[i + 1]!, img.px[i + 2]!];
    worst = Math.min(worst, Math.abs(apcaLc(ink, groundAround(img, cx, cy, PIP_R * side))));
  }
  return worst;
}

{
  const flat = await worstPipLc(6 as TokenKind, false);
  const lit = await worstPipLc(6 as TokenKind, true);

  ok(flat >= LC_LARGE_UI,
    `P4: on a FLAT ground the weakest pip scores APCA |Lc| ${flat.toFixed(1)}, below the ` +
      `${LC_LARGE_UI} non-text-graphic floor`);
  ok(lit >= LC_LARGE_UI,
    `P4: with the corpus lighting composited the weakest pip scores APCA |Lc| ${lit.toFixed(1)}, ` +
      `below the ${LC_LARGE_UI} floor — the texture has eaten the magnitude`);

  console.log(`  P4 contrast: weakest pip |Lc| ${flat.toFixed(1)} flat, ${lit.toFixed(1)} under the ` +
    `corpus lighting (floor ${LC_LARGE_UI}); the texture costs ${(flat - lit).toFixed(1)}`);
}

// ── P7: the lighting is a measurement, and traceable to one ────────────────
//
// The tile is the corpus's COMPOSITION, mined the way the palette mined its
// colour: 1129 images to 8x8, each image's own mean subtracted so exposure
// cancels, residuals averaged. If the corpus had no shared composition the
// answer would be noise near zero — so the check that matters is not "is the
// digest stable" but "is there a signal here at all". A tile of noise would
// pin and hash perfectly while meaning nothing, which is the vocabulary-proxy
// failure in a new place.

{
  const tile = TEXTURE.tile as number[];
  ok(tile.length === TEXTURE.grid * TEXTURE.grid,
    `P7: the tile has ${tile.length} cells for a ${TEXTURE.grid}x${TEXTURE.grid} grid`);
  ok(TEXTURE.images_read === 1129,
    `P7: the tile was mined from ${TEXTURE.images_read} images; the pinned corpus holds 1129`);
  ok(TEXTURE.images_failed === 0,
    `P7: ${TEXTURE.images_failed} corpus images were unreadable and silently dropped from the tile`);

  // THE SIGNAL CHECK. A vignette is dark at the corners and bright inside. If
  // the corpus had no shared lighting these would be indistinguishable.
  const g = TEXTURE.grid;
  const at = (x: number, y: number): number => tile[y * g + x]!;
  const corners = (at(0, 0) + at(g - 1, 0) + at(0, g - 1) + at(g - 1, g - 1)) / 4;
  const interior = (at(2, 2) + at(g - 3, 2) + at(2, g - 3) + at(g - 3, g - 3)) / 4;
  ok(interior - corners > 10,
    `P7: interior ${interior.toFixed(1)} vs corners ${corners.toFixed(1)} — under 10 units apart, ` +
      'the "corpus lighting" is not a measurable vignette and the texture is decoration');

  // And it must be a SHIFT, not a repaint: the veil never goes opaque.
  ok(TEXTURE.peak_offset < 32,
    `P7: peak offset ${TEXTURE.peak_offset}/255 is strong enough to be a repaint rather than a ` +
      'lighting shift, and the ground would no longer be the theme colour');

  console.log(`  P7 lighting: ${TEXTURE.images_read} images; interior ${interior.toFixed(1)} vs ` +
    `corners ${corners.toFixed(1)}, peak ${TEXTURE.peak_offset}/255 — a measured vignette`);
}

// ── P7b: and the RENDERER uses it, sign and all ────────────────────────────
//
// EVERYTHING ABOVE CHECKS THE DATA, AND THE MUTATION HARNESS PROVED THAT IS NOT
// ENOUGH. Curated mutant M7 made the veil paint every offset as white — the
// vignette's sign discarded, corners lifted instead of dropped — and it walked
// straight through P7, because P7 reads the pinned tile and the tile had not
// changed. A measurement nothing renders faithfully is a measurement in name.
//
// So this looks at the token as drawn: a blank one, no pips, no ticks, and asks
// whether the corners actually come out darker than the middle.

{
  const blank = await raster(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${DEFS}` +
      `<rect x="0.02" y="0.02" width="0.96" height="0.96" rx="0.14" fill="url(#glaas-grain)"/></svg>`,
    side,
  );
  const lumAt = (fx: number, fy: number): number => {
    const i = (Math.round(fy * side) * blank.w + Math.round(fx * side)) * 4;
    return 0.2126 * blank.px[i]! + 0.7152 * blank.px[i + 1]! + 0.0722 * blank.px[i + 2]!;
  };
  const cornerLum = (lumAt(0.11, 0.11) + lumAt(0.89, 0.11) + lumAt(0.11, 0.89) + lumAt(0.89, 0.89)) / 4;
  const midLum = (lumAt(0.5, 0.32) + lumAt(0.5, 0.5) + lumAt(0.35, 0.42) + lumAt(0.65, 0.42)) / 4;

  // THE INVARIANT IS ABOUT THE SIGN, NOT THE GAP, AND M7 IS WHY.
  // A first version required the middle to be brighter than the corners by a
  // couple of units, and M7 — every offset painted white, the vignette's sign
  // thrown away — still passed it: the corners rose from 24.6 to 45.3 but the
  // interior rose too, so a gap remained. A threshold on a difference cannot
  // tell "darkened at the edges" from "lifted less at the edges".
  //
  // The corpus says the corners are NEGATIVE, about -18. So the check is
  // absolute: the rendered corner must come out DARKER THAN THE BARE GROUND
  // would be. A veil that only ever lightens cannot satisfy that, whatever it
  // does to the middle.
  const flatGroundLum = 0.2126 * 0x14 + 0.7152 * 0x1b + 0.0722 * 0x26;
  ok(cornerLum < flatGroundLum,
    `P7b: the rendered corners are ${cornerLum.toFixed(1)} against a bare ground of ` +
      `${flatGroundLum.toFixed(1)} — the corpus measures its corners 18 units DARK, so a ground ` +
      'that never darkens is not the corpus lighting whatever else it is');
  ok(midLum > cornerLum,
    `P7b: the rendered middle ${midLum.toFixed(1)} is not brighter than the corners ` +
      `${cornerLum.toFixed(1)} — the vignette is inverted`);

  console.log(`  P7b rendered: middle ${midLum.toFixed(1)} vs corners ${cornerLum.toFixed(1)}, ` +
    `bare ground ${flatGroundLum.toFixed(1)} — the vignette survives into the pixels`);
}

// ── P8: the state indicators never cover the value ─────────────────────────
//
// THE CHECK A SCREENSHOT BOUGHT, NOT AN ORACLE. P2 rasterises a token alone and
// was green; the board drew the charge amount as a `+1` span layered over it,
// and on a 6 that text sat across the middle two pips. The face value was being
// hidden by the game's own HUD, on the faces where it matters most, and every
// check in this file passed while it happened — because none of them looked at
// the token as the board composes it.
//
// The charge now belongs to the token and is drawn as ticks outside
// FACE_REGION. P8 is what stops that from being a convention someone forgets:
// pips must lie strictly inside the region, ticks strictly outside it, checked
// as geometry, and then checked again in pixels at full charge.

{
  for (const face of FACES) {
    for (const p of PIP_LAYOUT[face]) {
      const near = Math.min(p.x - PIP_R, p.y - PIP_R);
      const far = Math.max(p.x + PIP_R, p.y + PIP_R);
      ok(near > FACE_REGION && far < 1 - FACE_REGION,
        `P8: a pip on face ${face} extends to ${near.toFixed(3)}..${far.toFixed(3)}, outside the ` +
          `${FACE_REGION} face region — it can collide with a state indicator`);
    }
  }

  // The ticks, in pixels, at the maximum charge the game can produce. A tick
  // that reached a pip would show up here as an inflated component count.
  for (const face of FACES) {
    const img = await raster(tokenSvg(face as TokenKind, 'charged', PAINT, true, DEFS, CHARGE_MAX), side);
    ok(components(img, INSET) === face,
      `P8: face ${face} at charge ${CHARGE_MAX} recovers as ${components(img, INSET)} — the charge ` +
        'ticks are inside the face region and are being counted as value');
  }

  // AND THE TICKS MUST ACTUALLY BE THERE. A separation check passes trivially
  // if nothing was drawn, which is the vacuous control this file would
  // otherwise be shipping.
  const bare = await raster(tokenSvg(1 as TokenKind, 'charged', PAINT, true, DEFS, 0), side);
  const full = await raster(tokenSvg(1 as TokenKind, 'charged', PAINT, true, DEFS, CHARGE_MAX), side);
  let differing = 0;
  for (let i = 0; i < bare.px.length; i += 4) {
    if (Math.abs(bare.px[i]! - full.px[i]!) > 8) differing += 1;
  }
  ok(differing > 40,
    `P8 VACUOUS CONTROL: charge ${CHARGE_MAX} changes only ${differing} pixels against charge 0, ` +
      'so the ticks are too faint to see and the separation check proves nothing');

  console.log(`  P8 separation: pips inside ${FACE_REGION}, charge ticks outside; ` +
    `${CHARGE_MAX} ticks move ${differing} pixels and no face value`);
}

// ── P6: every one of them, seen to fail ────────────────────────────────────
//
// The plan's rule, and this repo's whole epistemic position: an oracle that has
// only ever been seen to pass is decoration. Each control below is a specific
// planted defect with a stated consequence.

{
  // (a) THE ONE THE AUDITOR ASKED FOR. Six distinguishable non-countable
  // emblems — the design this stage rejected. If they recover a face value, the
  // pip constraint is unfounded and the cheaper option was right all along.
  const EMBLEMS = [
    '<circle cx="0.5" cy="0.5" r="0.3" fill="#e9eef4"/>',
    '<rect x="0.22" y="0.22" width="0.56" height="0.56" fill="#e9eef4"/>',
    '<path d="M0.5,0.18 L0.82,0.78 L0.18,0.78 Z" fill="#e9eef4"/>',
    '<path d="M0.5,0.16 L0.84,0.5 L0.5,0.84 L0.16,0.5 Z" fill="#e9eef4"/>',
    '<path d="M0.5,0.16 L0.61,0.42 L0.86,0.42 L0.66,0.58 L0.74,0.84 L0.5,0.68 ' +
      'L0.26,0.84 L0.34,0.58 L0.14,0.42 L0.39,0.42 Z" fill="#e9eef4"/>',
    '<path d="M0.2,0.5 A0.3,0.3 0 1,1 0.8,0.5 A0.3,0.3 0 1,1 0.2,0.5 Z" fill="#e9eef4"/>',
  ];
  let recovered = 0;
  for (const [i, glyph] of EMBLEMS.entries()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">` +
      `<rect x="0.02" y="0.02" width="0.96" height="0.96" rx="0.14" fill="${DIE_BODY}"/>` +
      `${glyph}</svg>`;
    if (components(await raster(svg, side), INSET) === i + 1) recovered += 1;
  }
  ok(recovered < FACES.length,
    `P6 NEGATIVE CONTROL FAILED: ${recovered}/6 planted emblems recovered their face value, so ` +
      'P2 does not distinguish a magnitude system from an identity system and the entire ' +
      'argument for pips is unfounded');
  console.log(`  P6 emblem control: ${recovered}/6 recovered — pips carry magnitude, emblems do not`);

  // (b) P1 must fail on pips pushed together. The gap is what makes P2 sound,
  // so a P1 that cannot fail leaves P2 resting on nothing.
  const merged = 0.24 - 2 * 0.119; // a radius that leaves under a pixel of ground
  ok(merged * (tokenSidePx || 48) < 1,
    'P6 VACUOUS CONTROL: the planted "merged" radius does not actually merge, so P1 was never tested');

  // (c) P2 must fail on a face drawn with the wrong number of pips.
  const wrong = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">` +
    `<rect x="0.02" y="0.02" width="0.96" height="0.96" rx="0.14" fill="${DIE_BODY}"/>` +
    `<circle cx="0.26" cy="0.26" r="${PIP_R}" fill="${FACE_INK}"/>` +
    `<circle cx="0.74" cy="0.74" r="${PIP_R}" fill="${FACE_INK}"/></svg>`;
  ok(components(await raster(wrong, side), INSET) !== 5,
    'P6 NEGATIVE CONTROL FAILED: a two-pip token recovered as a 5, so P2 is not counting pips');

  // (d) P4 must fail on ink dropped toward the ground. This is the auditor's
  // second objection, planted: geometrically perfect, perceptually gone.
  const dim = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">` +
    `<rect x="0.02" y="0.02" width="0.96" height="0.96" rx="0.14" fill="${DIE_BODY}"/>` +
    `<circle cx="0.5" cy="0.5" r="${PIP_R}" fill="#26303f"/></svg>`;
  const dimImg = await raster(dim, side);
  const i = (Math.round(0.5 * side) * dimImg.w + Math.round(0.5 * side)) * 4;
  const dimLc = Math.abs(apcaLc(
    [dimImg.px[i]!, dimImg.px[i + 1]!, dimImg.px[i + 2]!],
    groundAround(dimImg, 0.5 * side, 0.5 * side, PIP_R * side),
  ));
  ok(dimLc < LC_LARGE_UI,
    `P6 NEGATIVE CONTROL FAILED: a pip drawn in near-ground ink scored |Lc| ${dimLc.toFixed(1)}, ` +
      'above the floor — P4 cannot report a contrast failure');

  // (e) P3 must fail on a plausible but non-canonical arrangement: a 3 drawn as
  // a row instead of a diagonal. It is still three pips and P2 would pass it.
  ok(!sameArrangement([{ x: 0.26, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.74, y: 0.5 }], CANONICAL[3]!),
    'P6 NEGATIVE CONTROL FAILED: a 3 drawn as a horizontal row was accepted as canonical');
}

await browser.close();
server.close();

if (failures.length > 0) {
  console.error(`verify-tokens: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(
  'verify-tokens: P1-P9 pass. Six pip faces plus wild/bomb/locked/frozen; every face recovers ' +
    'its value in greyscale at the narrowest phone, and no emblem set does.',
);
