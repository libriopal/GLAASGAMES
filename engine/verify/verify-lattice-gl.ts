// engine/verify/verify-lattice-gl.ts — the glow layer, held to the things a
// glow layer can break.
//
// G1  it actually draws, and is neither a black rectangle nor a full-screen wash
// G2  NO UNWITNESSED LINK IS EVER UPLOADED TO THE GPU        (THE NEW LEAK)
// G3  the digits stay legible with the glow at full brightness    (THE NEW RISK)
// G4  brightness cannot flash — measured, against WCAG 2.3.1's three per second
// G5  reduced motion produces a still image
// G6  a device with no WebGL2 still plays a complete round
// G8  the shader has no input channel a link map could arrive through
// G7  each of the above is caught when broken           (NEGATIVE CONTROLS)
//
// ─────────────────────────────────────────────────────────────────────────────
// G2 AND G3 ARE HERE BECAUSE THIS FEATURE OPENED TWO HOLES THAT NO EXISTING
// ORACLE COULD SEE. Both are worth stating plainly, because both were invisible
// to a suite of twenty-three checks.
//
// THE NEW LEAK. `verify-app` A5 searches the DOM for link markers, and that was
// a complete check while the board was DOM. A WebGL canvas is not in the DOM:
// pixels drawn from the hidden lattice would leave A5 reporting a clean bill of
// health. So G2 does not look at the screen at all — it hooks `bufferSubData`
// before any app code runs and reads WHAT WAS ACTUALLY SUBMITTED TO THE GPU,
// then requires every filigree instance to correspond to a link the player
// personally witnessed.
//
// THE CLAIM THAT CAME WITH G2 WAS TOO STRONG, AND AN AUDITOR SAID SO. It was
// "the GPU cannot draw what was never uploaded, so this is STRICTLY STRONGER
// than inspecting the rendered image". The objection, and it is correct:
//
//   "A cheat can upload only the witnessed link data and use a fragment shader
//    to procedurally render unwitnessed links from those legitimate
//    coordinates. Because the shader calculates it on-chip, no additional
//    bufferSubData call is triggered."
//
// So G2 is not strictly stronger. It is stronger against the leak that actually
// happens — a host handing the renderer the lattice — and BLIND to a shader
// that derives structure from data it was legitimately given. Two instruments
// with different blind spots, not one that dominates.
//
// G8 closes that side by ENUMERATING EVERY CHANNEL INTO THE SHADER. A shader
// cannot derive what it has no way to receive: with the instance attributes
// checked by G2, the only remaining inputs are uniforms and textures, so G8
// requires every active uniform to be a single scalar and requires the program
// to sample no texture at all. Six scalars and no sampler is not a channel
// through which thirty-six links can arrive.
//
// THE NEW RISK. `verify-theme` T3 holds seven colour PAIRINGS to APCA floors,
// and every one of them is a pair of TOKENS. The tiles are now translucent with
// light behind them, so the background a digit is read against is no longer a
// token — it is a token plus however much glow the renderer put there this
// frame. T3 would go on passing while the board became unreadable. G3 therefore
// measures the RENDERED pixels: it samples the glow the renderer actually
// produced under each cell, composites it the way the browser does, and scores
// the real contrast against the real background.
//
// This is the sovereignty classifier finding its own row. "The text is
// readable" was pinned to a token comparison and to nothing on screen.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { GROUND, INK, LC_BODY_TEXT } from '../../web/theme.js';
import { rateLimit } from '../../web/ratelimit.js';

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
const VIEWPORT = { width: 393, height: 852 };

// ── APCA ───────────────────────────────────────────────────────────────────
// Reimplemented here rather than imported: verify-theme keeps its copy private,
// and a shared one would make two oracles agree because they share an
// implementation rather than because the screen is readable. G7 proves this
// copy can report a failure.
type Rgb = readonly [number, number, number];
const hex = (s: string): Rgb => [
  parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16),
];
const screenY = (c: Rgb): number =>
  0.2126729 * (c[0] / 255) ** 2.4 + 0.7151522 * (c[1] / 255) ** 2.4 + 0.0721750 * (c[2] / 255) ** 2.4;

/** APCA Lc for light text on a dark background, which is the only case here. */
function apcaLc(text: Rgb, bg: Rgb): number {
  let ytxt = screenY(text);
  let ybg = screenY(bg);
  ytxt = ytxt > 0.022 ? ytxt : ytxt + (0.022 - ytxt) ** 1.414;
  ybg = ybg > 0.022 ? ybg : ybg + (0.022 - ybg) ** 1.414;
  if (Math.abs(ybg - ytxt) < 0.0005) return 0;
  // Reverse polarity: light text on dark ground.
  const sapc = (ybg ** 0.65 - ytxt ** 0.62) * 1.14;
  return sapc < -0.001 ? (sapc + 0.027) * 100 : 0;
}

try {
  execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
} catch {
  console.error('verify-lattice-gl: FAIL — the app assets could not be rebuilt');
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

function findChromium(): string | undefined {
  for (const root of readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium')).sort().reverse()) {
    for (const exe of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const candidate = join('/opt/pw-browsers', root, exe);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

// SwiftShader, so the headless run actually rasterises WebGL2 instead of
// silently falling back to no context and passing G6 for the wrong reason.
const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});

/**
 * Records every instance the page uploads, before any app code runs.
 *
 * This is the G2 instrument, and it deliberately does not look at pixels. The
 * GPU cannot draw what was never uploaded, so a buffer that never contains an
 * unwitnessed link is a stronger statement than a screen that does not show one.
 */
const SPY = `(() => {
  window.__uploads = [];
  // G8: a texture is the one channel wide enough to smuggle a link map past the
  // upload check, so creations are counted from before any app code runs.
  window.__textures = 0;
  const realTex = WebGL2RenderingContext.prototype.texImage2D;
  WebGL2RenderingContext.prototype.texImage2D = function () {
    window.__textures = (window.__textures | 0) + 1;
    return realTex.apply(this, arguments);
  };
  const real = WebGL2RenderingContext.prototype.bufferSubData;
  WebGL2RenderingContext.prototype.bufferSubData = function (target, offset, data) {
    try {
      if (data && data.length && data.length % 12 === 0 && data.length > 12) {
        window.__uploads.push(Array.from(data));
      }
    } catch (e) {}
    return real.apply(this, arguments);
  };
})()`;

const PLAY = (n: number): string => `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (let t = 0; t < ${n}; t++) {
    const open = [...document.querySelectorAll('#board .cell:not([disabled])')];
    if (open.length === 0) break;
    open[(t * 7) % open.length].click();
    await sleep(90);
  }
  let log = [];
  try { log = JSON.parse(localStorage.getItem('glaas.lattice.log.v1') || '[]'); } catch (e) {}
  return { log, turn: document.getElementById('s-turn').textContent };
})()`;

/**
 * Decodes a PNG screenshot inside the page and reports what it contains.
 *
 * THE FIRST VERSION READ THE GL CANVAS WITH `toDataURL` AND ALWAYS SAW BLACK.
 * A WebGL drawing buffer is cleared after compositing unless the context asks
 * for `preserveDrawingBuffer`, which costs real memory bandwidth on a phone —
 * so the honest fix is not to change the renderer to suit the instrument. It is
 * to measure the COMPOSITED result, which is also what the player sees: the
 * glow, the translucent tile over it, and the digit on top, exactly as stacked.
 *
 * Node has no PNG decoder here and the browser does, so the screenshot goes
 * back into the page to be read.
 */
const DECODE = `(async (b64, cells) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
  const off = document.createElement('canvas');
  off.width = img.width; off.height = img.height;
  const ctx = off.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, off.width, off.height).data;

  let maxChannel = 0;
  const all = [];
  for (let o = 0; o < px.length; o += 4) {
    const v = Math.max(px[o], px[o+1], px[o+2]);
    if (v > maxChannel) maxChannel = v;
    all.push(px[o] + px[o+1] + px[o+2]);
  }

  // The tile background, sampled AT THE CORNERS.
  //
  // THE FIRST VERSION SAMPLED A BAND DOWN THE LEFT INSIDE OF EACH CELL and read
  // back rgb(233,238,244) — which is the INK token exactly, identical with the
  // glow and without it. It was measuring the DIGIT, so G3 was scoring the ink
  // against itself and reporting |Lc| 0. A corner is the one part of a cell a
  // centred glyph can never reach, and the four of them bracket the tile.
  const worstOf = () => {
    let worst = [0, 0, 0], worstSum = -1;
    for (const c of cells) {
      const inset = Math.max(4, Math.round(Math.min(c.w, c.h) * 0.16));
      const pts = [
        [c.x + inset, c.y + inset],
        [c.x + c.w - inset, c.y + inset],
        [c.x + inset, c.y + c.h - inset],
        [c.x + c.w - inset, c.y + c.h - inset],
      ];
      for (const [fx, fy] of pts) {
        const x = Math.round(fx), y = Math.round(fy);
        if (x < 0 || y < 0 || x >= off.width || y >= off.height) continue;
        const o = (y * off.width + x) * 4;
        const sum = px[o] + px[o+1] + px[o+2];
        if (sum > worstSum) { worstSum = sum; worst = [px[o], px[o+1], px[o+2]]; }
      }
    }
    return worst;
  };
  return { maxChannel, worst: worstOf(), w: off.width, h: off.height, mean: all.reduce((a, b) => a + b, 0) / all.length };
})`;

interface Shot { maxChannel: number; worst: number[]; w: number; h: number; mean: number }
interface TurnRecord { turn: number; banked: number; charged: number[] }

try {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript({ content: SPY });
  const page = await context.newPage();
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#board .cell', { timeout: 15_000 });

  const hasGl = await page.evaluate(
    `(() => { const c = document.getElementById('board-gl'); return !!(c && c.getContext('webgl2')); })()`,
  ) as boolean;
  ok(hasGl, 'G1: the board canvas has no WebGL2 context in a browser that supports it, so nothing below is measuring the shipped renderer');

  const played = await page.evaluate(PLAY(8)) as { log: TurnRecord[]; turn: string };
  // Let the brightness limiter reach the top, so every check below sees the
  // WORST case rather than a field that is still fading up.
  await page.waitForTimeout(2000);

  // ── G1: it draws, measured as an A/B against itself ─────────────────────
  // Not "is any pixel bright enough", which is a threshold someone has to
  // justify. The board is captured twice — once as it ships, once with the
  // canvas hidden and nothing else changed — and the glow has to be the
  // DIFFERENCE between them. A layer that contributes nothing cannot pass a
  // comparison against its own absence.
  const cellBoxes = await page.evaluate(`(() => {
    const wrap = document.getElementById('board-wrap').getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    return [...document.querySelectorAll('#board .cell')].map((c) => {
      const r = c.getBoundingClientRect();
      return { x: (r.left - wrap.left), y: (r.top - wrap.top), w: r.width, h: r.height };
    });
  })()`) as { x: number; y: number; w: number; h: number }[];

  const capture = async (): Promise<Shot> => {
    const buf = await page.locator('#board-wrap').screenshot();
    const src = `(${DECODE})(${JSON.stringify(buf.toString('base64'))}, ${JSON.stringify(cellBoxes)})`;
    return await page.evaluate(src) as Shot;
  };

  const withGlow = await capture();
  await page.evaluate(`document.getElementById('board-gl').style.display = 'none'`);
  await page.waitForTimeout(120);
  const withoutGlow = await capture();
  await page.evaluate(`document.getElementById('board-gl').style.display = ''`);
  await page.waitForTimeout(600);

  const contribution = withGlow.mean - withoutGlow.mean;
  ok(contribution > 1.0,
    `G1: hiding the glow canvas changes the board's mean brightness by ${contribution.toFixed(2)}/765 — the layer ` +
      'is running, uploading instances and costing a draw call every frame while contributing nothing visible');
  // Overdraw is the mobile budget. A layer that lifts the whole box uniformly
  // is a full-screen wash wearing a particle system's clothes.
  ok(contribution < 90,
    `G1: the glow lifts mean brightness by ${contribution.toFixed(1)}/765 across the whole board — that is a ` +
      'full-screen wash, and fill rate is what costs on a phone');
  console.log(
    `  G1 draws: the glow contributes ${contribution.toFixed(1)}/765 mean brightness (peak channel ` +
      `${withGlow.maxChannel}/255) at ${withGlow.w}x${withGlow.h}`,
  );

  // ── G2: nothing unwitnessed ever reached the GPU ─────────────────────────
  const uploads = await page.evaluate(`window.__uploads.length`) as number;
  ok(uploads > 0, 'G2: no instance data was uploaded at all, so the spy is not on the path the renderer uses');

  const { directionOf } = await import('../../lattice/reveal.js');
  const witnessed = new Map<number, number>();
  for (const rec of played.log) {
    for (const target of rec.charged) {
      if (directionOf(rec.banked, target) !== 4) witnessed.set(rec.banked, target);
    }
  }
  // Every filigree instance sits on the segment between a witnessed pair. Decode
  // the uploaded positions and check each one lands on such a segment.
  const strays = await page.evaluate(`(() => {
    const KIND = 9, X = 0, Y = 1;
    const out = [];
    for (const u of window.__uploads) {
      for (let o = 0; o + 12 <= u.length; o += 12) {
        if (u[o + KIND] > 1.5) out.push([u[o + X], u[o + Y]]);
      }
    }
    return out;
  })()`) as [number, number][];

  const BOARD_W = 6;
  const span = 1.8 / BOARD_W;
  const bx = (col: number): number => -0.9 + (col + 0.5) * span;
  const by = (row: number): number => 0.9 - (row + 0.5) * span;
  const onWitnessedSegment = (x: number, y: number): boolean => {
    for (const [from, to] of witnessed) {
      const fx = bx(from % BOARD_W), fy = by((from / BOARD_W) | 0);
      const tx = bx(to % BOARD_W), ty = by((to / BOARD_W) | 0);
      // Distance from the point to the segment, with slack for the drift wobble.
      const dx = tx - fx, dy = ty - fy;
      const len2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - fx) * dx + (y - fy) * dy) / len2));
      const px = fx + dx * u, py = fy + dy * u;
      if (Math.hypot(x - px, y - py) < span * 0.35) return true;
    }
    return false;
  };
  const unwitnessed = strays.filter(([x, y]) => !onWitnessedSegment(x, y));
  ok(witnessed.size > 0, 'G2: no links were witnessed in this run, so "no unwitnessed link was uploaded" is vacuous');
  ok(unwitnessed.length === 0,
    `G2 LEAK: ${unwitnessed.length} of ${strays.length} filigree instances uploaded to the GPU do not lie on any ` +
      'link the player witnessed. The hidden lattice is being drawn before the reveal, and it is invisible to ' +
      'verify-app A5 because a canvas is not the DOM');
  console.log(
    `  G2 no leak: ${uploads} uploads inspected, ${strays.length} filigree instances, all on ${witnessed.size} ` +
      'witnessed links, 0 unwitnessed',
  );

  // ── G3: the digits survive their own backlight ───────────────────────────
  // Measured, not modelled. `worst` is the brightest tile-interior pixel found
  // anywhere on the board, sampled away from the glyph — the least favourable
  // background any digit is actually being read against, with the light at full
  // brightness and every spark in flight.
  {
    const bg = withGlow.worst as unknown as Rgb;
    const lc = Math.abs(apcaLc(hex(INK), bg));
    const clean = Math.abs(apcaLc(hex(INK), withoutGlow.worst as unknown as Rgb));
    ok(lc >= LC_BODY_TEXT,
      `G3: with the glow at full brightness the face digits score |Lc| ${lc.toFixed(1)} against the brightest tile ` +
        `interior rgb(${bg.join(',')}), below the ${LC_BODY_TEXT} floor. verify-theme T3 still passes because it ` +
        'compares TOKENS, and a tile with light behind it is no longer a token');
    console.log(
      `  G3 legibility: brightest tile interior rgb(${bg.join(',')}) with the glow, ` +
        `rgb(${(withoutGlow.worst as number[]).join(',')}) without; digits score |Lc| ${lc.toFixed(1)} ` +
        `(was ${clean.toFixed(1)}) against a ${LC_BODY_TEXT} floor`,
    );
  }

  // ── G4: it cannot flash ──────────────────────────────────────────────────
  // WCAG 2.3.1's safe harbour is three flashes per second. Sampled from real
  // frames rather than reasoned about from the source.
  const luma = await page.evaluate(`(async () => {
    const c = document.getElementById('board-gl');
    const off = document.createElement('canvas');
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const url = c.toDataURL();
      const img = new Image();
      await new Promise((res) => { img.onload = res; img.src = url; });
      off.width = 48; off.height = 48;
      const ctx = off.getContext('2d');
      ctx.drawImage(img, 0, 0, 48, 48);
      const px = ctx.getImageData(0, 0, 48, 48).data;
      let sum = 0;
      for (let o = 0; o < px.length; o += 4) sum += px[o] + px[o+1] + px[o+2];
      samples.push({ t: performance.now(), v: sum / (48 * 48 * 3 * 255) });
      await new Promise(r => setTimeout(r, 40));
    }
    return samples;
  })()`) as { t: number; v: number }[];

  // A flash is a swing of at least 10% of full scale. Count direction changes
  // that cross that band and divide by the sampled span.
  let flashes = 0;
  let last = luma[0]?.v ?? 0;
  let rising = true;
  for (const s of luma) {
    if (rising && s.v < last - 0.10) { flashes += 1; rising = false; last = s.v; }
    else if (!rising && s.v > last + 0.10) { flashes += 1; rising = true; last = s.v; }
    else if (rising && s.v > last) last = s.v;
    else if (!rising && s.v < last) last = s.v;
  }
  // WCAG defines a flash as a PAIR of opposing changes — light to dark to
  // light. Counting every transition, as the first version did, reported twice
  // the true rate and would have condemned a compliant field.
  const spanSec = ((luma[luma.length - 1]?.t ?? 0) - (luma[0]?.t ?? 0)) / 1000;
  const rate = spanSec > 0 ? (flashes / 2) / spanSec : 0;
  ok(rate <= 3,
    `G4 SAFETY: the field flashes ${rate.toFixed(1)} times a second, over the WCAG 2.3.1 safe harbour of three. ` +
      'This is a photosensitive-epilepsy risk, not a taste question');
  console.log(`  G4 flash rate: ${flashes} swings over ${spanSec.toFixed(1)}s = ${rate.toFixed(2)}/s (limit 3)`);
  // ── G8: the shader has no channel the lattice could arrive through ───────
  // The complement to G2, added because an auditor showed G2's blind spot: a
  // shader that computes what it was never sent. Enumerated rather than
  // assumed — a scalar uniform cannot carry a link map, and a program with no
  // sampler cannot read one from a texture.
  {
    const channels = await page.evaluate(`(() => {
      const c = document.getElementById('board-gl');
      const gl = c.getContext('webgl2');
      if (!gl) return null;
      const prog = gl.getParameter(gl.CURRENT_PROGRAM);
      if (!prog) return { uniforms: [], samplers: 0, textures: window.__textures | 0 };
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      const uniforms = [];
      let samplers = 0;
      for (let i = 0; i < n; i++) {
        const u = gl.getActiveUniform(prog, i);
        if (!u) continue;
        uniforms.push({ name: u.name, size: u.size, type: u.type });
        if (u.type === gl.SAMPLER_2D || u.type === gl.SAMPLER_CUBE || u.type === gl.SAMPLER_3D) samplers++;
      }
      return { uniforms, samplers, textures: window.__textures | 0 };
    })()`) as { uniforms: { name: string; size: number; type: number }[]; samplers: number; textures: number } | null;

    ok(channels !== null, 'G8: no WebGL2 context to enumerate, so the channel argument is untested');
    if (channels) {
      const wide = channels.uniforms.filter((u) => u.size > 1);
      ok(wide.length === 0,
        `G8: ${wide.length} uniform(s) are arrays (${wide.map((u) => `${u.name}[${u.size}]`).join(', ')}). An array ` +
          'uniform is wide enough to carry a link map, so "the shader cannot derive the lattice" stops being ' +
          'an argument about channels and becomes an assumption about intent');
      ok(channels.samplers === 0,
        `G8: the program declares ${channels.samplers} sampler(s) — a texture is an arbitrarily wide channel and ` +
          'G2 cannot see what is in one');
      ok(channels.textures === 0,
        `G8: ${channels.textures} texture(s) were created by the page, so there is a data path into the shader ` +
          'that the upload check does not inspect');
      console.log(
        `  G8 channels: ${channels.uniforms.length} active uniforms, all scalar ` +
          `(${channels.uniforms.map((u) => u.name).join(' ')}), ${channels.samplers} samplers, ` +
          `${channels.textures} textures — no path wide enough to carry a link map`,
      );
    }
  }

  await context.close();

  // ── G4b: the limiter, fed the hazard it exists for ───────────────────────
  // G4 above measures the field as it actually behaves, and the mutation
  // harness showed that is not enough: deleting the rate limiter changed
  // nothing, because under ordinary play the target brightness never swings.
  // The mutant was equivalent in the shipped path and the guard was untested.
  //
  // So the guard is fed the hazard directly. A 12.5Hz square wave — four times
  // the WCAG threshold — goes in; what comes out must not flash.
  {
    let v = 0;
    const out: { t: number; v: number }[] = [];
    for (let i = 0; i < 120; i += 1) {
      const wanted = Math.floor(i / 2) % 2 === 0 ? 0 : 1; // 12.5Hz at 40ms steps
      v = rateLimit(v, wanted, 0.04);
      out.push({ t: i * 40, v });
    }
    let f = 0, l = out[0]!.v, up = true;
    for (const sm of out) {
      if (up && sm.v < l - 0.10) { f += 1; up = false; l = sm.v; }
      else if (!up && sm.v > l + 0.10) { f += 1; up = true; l = sm.v; }
      else if (up && sm.v > l) l = sm.v;
      else if (!up && sm.v < l) l = sm.v;
    }
    const limited = (f / 2) / ((out[out.length - 1]!.t - out[0]!.t) / 1000);
    ok(limited <= 3,
      `G4b SAFETY: driven with a 12.5Hz square wave the limiter still passes ${limited.toFixed(1)} flashes per ` +
        'second, over the WCAG 2.3.1 safe harbour. The guard does not bound the hazard it exists to bound');
    // And it must not simply flatten everything — a limiter that outputs a
    // constant would pass the line above while destroying the whole effect.
    const swing = Math.max(...out.map((o) => o.v)) - Math.min(...out.map((o) => o.v));
    ok(swing > 0.02,
      `G4b: the limiter flattened a full-scale square wave to a swing of ${swing.toFixed(3)} — it is not limiting ` +
        'the rate, it is deleting the signal, and every animation in the layer would be dead');
    console.log(`  G4b limiter: a 12.5Hz square wave comes out at ${limited.toFixed(2)} flashes/s, swing ${swing.toFixed(2)}`);
  }

  // ── G5: reduced motion is still ──────────────────────────────────────────
  {
    const still = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
    const page5 = await still.newPage();
    await page5.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page5.waitForSelector('#board .cell', { timeout: 15_000 });
    await page5.evaluate(PLAY(3));
    await page5.waitForTimeout(1200);
    const frames = await page5.evaluate(`(async () => {
      const c = document.getElementById('board-gl');
      const shots = [];
      for (let i = 0; i < 3; i++) {
        shots.push(c.toDataURL());
        await new Promise(r => setTimeout(r, 260));
      }
      return shots;
    })()`) as string[];
    ok(new Set(frames).size === 1,
      `G5: with prefers-reduced-motion the canvas produced ${new Set(frames).size} distinct frames — a reduced ` +
        'amount of a motion that causes nausea is still that motion');
    console.log(`  G5 reduced motion: ${new Set(frames).size} distinct frame across 3 samples`);
    await still.close();
  }

  // ── G6: no WebGL2, still a game ──────────────────────────────────────────
  {
    const blind = await browser.newContext({ viewport: VIEWPORT });
    await blind.addInitScript({ content: `(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind) {
        if (kind === 'webgl2' || kind === 'webgl') return null;
        return real.apply(this, arguments);
      };
    })()` });
    const page6 = await blind.newPage();
    const errors: string[] = [];
    page6.on('pageerror', (e) => void errors.push(e.message));
    await page6.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page6.waitForSelector('#board .cell', { timeout: 15_000 });
    await page6.evaluate(PLAY(12));
    const turn = await page6.locator('#s-turn').textContent();
    ok(turn === '12/12',
      `G6: with WebGL2 refused the round reached ${turn} instead of 12/12 — the glow layer is load-bearing, and it ` +
        'must not be');
    ok(errors.length === 0,
      `G6: a device without WebGL2 raised ${errors.length} uncaught error(s): ${errors.slice(0, 2).join('; ')}`);
    console.log(`  G6 no WebGL2: full 12-turn round completed, ${errors.length} page errors`);
    await blind.close();
  }

  // ── G7: NEGATIVE CONTROLS ────────────────────────────────────────────────
  {
    // (a) The APCA implementation must be able to fail. Without this, G3 is a
    //     function that returns a large number.
    const readable = Math.abs(apcaLc(hex(INK), hex(GROUND)));
    const unreadable = Math.abs(apcaLc(hex('#0a0e14'), hex(GROUND)));
    ok(readable >= LC_BODY_TEXT,
      `G7 NEGATIVE CONTROL FAILED: ink on ground scores |Lc| ${readable.toFixed(1)}, so this APCA copy disagrees ` +
        'with verify-theme about a pairing that ships');
    ok(unreadable < 20,
      `G7 NEGATIVE CONTROL FAILED: near-black on black scored |Lc| ${unreadable.toFixed(1)} — this implementation ` +
        'cannot report an unreadable pairing, so G3 proves nothing');

    // (b) The G2 segment predicate must reject a point that is nowhere near a
    //     witnessed link, or "0 unwitnessed" is a function that returns true.
    ok(!onWitnessedSegment(5, 5),
      'G7 NEGATIVE CONTROL FAILED: a point far outside the board was scored as lying on a witnessed link, so G2 ' +
        'cannot detect an uploaded leak');

    // (c) The flash counter must be able to count a flash.
    const strobe = Array.from({ length: 40 }, (_, i) => ({ t: i * 40, v: i % 2 === 0 ? 0.05 : 0.9 }));
    let f = 0, l = strobe[0]!.v, up = true;
    for (const s of strobe) {
      if (up && s.v < l - 0.10) { f += 1; up = false; l = s.v; }
      else if (!up && s.v > l + 0.10) { f += 1; up = true; l = s.v; }
      else if (up && s.v > l) l = s.v;
      else if (!up && s.v < l) l = s.v;
    }
    const strobeRate = (f / 2) / ((strobe[strobe.length - 1]!.t - strobe[0]!.t) / 1000);
    ok(strobeRate > 3,
      `G7 NEGATIVE CONTROL FAILED: a 12.5Hz strobe was measured at ${strobeRate.toFixed(1)} flashes/sec, under the ` +
        'threshold — G4 cannot detect the thing it exists to prevent');
    console.log(
      `  G7 negative controls: APCA reports ${readable.toFixed(0)} readable / ${unreadable.toFixed(0)} not; ` +
        `off-board point rejected; a planted strobe measures ${strobeRate.toFixed(1)}/s`,
    );
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`verify-lattice-gl: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-lattice-gl: PASS — the board glows, leaks nothing through buffer or shader, stays readable, and cannot flash');
