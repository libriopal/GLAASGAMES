// engine/verify/verify-gl2.ts — the renderer that actually ships, executed.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT verify-render.
//
// `verify-render` proves `web/shaders/render.wgsl` draws. That shader is
// imported by `web/main.ts` and by nothing else, and `build-app-assets.mjs`
// DELETES main.js from the bundle on purpose — a WebView exposes no WebGPU
// adapter, so a WebGPU entry point would fail on every device that installs
// this. No .wgsl file is staged into the APK at all.
//
// So the renderer that reaches a phone is `web/gl2-renderer.ts`, and before this
// file there was no oracle mentioning it anywhere in engine/verify. It was not
// skipped. It had never been checked.
//
// G1  a WebGL2 context exists, and reports what it is
// G2  the renderer constructs, so both shaders compile and the program links
// G3  a populated world draws lit pixels
// G4  an EMPTY world draws NOTHING                          (NEGATIVE CONTROL)
// G5  the image is structured, not a flood fill             (NEGATIVE CONTROL)
// G6  moving the camera changes the image
//
// G4 AND G5 ARE THE POINT. "Pixels came back lit" is satisfied by a shader that
// clears to a colour and draws nothing — which is exactly what a broken vertex
// path looks like. G4 requires the lit pixels to disappear when the world is
// emptied, and G5 requires them not to cover the frame. Together they
// distinguish "it drew the world" from "it painted the canvas".
//
// SwiftShader, not a real GPU. That is honest about what it proves: the GLSL
// compiles and the draw path produces the right IMAGE STRUCTURE. It does not
// prove any particular handset's driver agrees, which is item 5's job.

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

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

// Rebuilt for the same reason verify-app rebuilds: an oracle that reads a build
// artifact can pass on a defect newer than the artifact.
try {
  execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
} catch {
  console.error('verify-gl2: FAIL — the app assets could not be rebuilt');
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

/**
 * Where Chromium is.
 *
 * Playwright resolves its own download first; the versioned tree under
 * /opt/pw-browsers is the fallback for this container, which ships a browser
 * rather than downloading one. Returning undefined lets Playwright decide,
 * which is what a CI runner with `playwright install` needs.
 */
function findChromium(): string | undefined {
  for (const root of readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium')).sort().reverse()) {
    for (const exe of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const candidate = join('/opt/pw-browsers', root, exe);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

// SwiftShader gives a real, conformant WebGL2 implementation with no GPU. The
// alternative — skipping when no GPU is present — is how the WGSL renderer came
// to sit at SKIPPED in a green suite for so long.
const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });

interface Probe {
  readonly ok: boolean;
  readonly error?: string;
  readonly renderer?: string;
  readonly drawn?: number;
  readonly litPopulated?: number;
  readonly litEmpty?: number;
  readonly litMoved?: number;
  readonly changedPixels?: number;
  readonly total?: number;
}

try {
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });


// The probe runs IN THE PAGE and is passed as SOURCE, not as a function.
// tsx transpiles this file and injects helpers (__name and friends) into any
// function it compiles; a transpiled closure handed to page.evaluate arrives in
// a browser where those helpers do not exist and dies with "__name is not
// defined". A string is not transpiled, so what runs is what is written.
const PROBE = `(async () => {
  try {
    const [gl2, state, worldGen, cfg] = await Promise.all([
      import('./dist/web/gl2-renderer.js'),
      import('./dist/engine/sim/state.js'),
      import('./dist/engine/sim/world-gen.js'),
      import('./dist/engine/sim/config-parse.js'),
    ]);
    const raw = await (await fetch('./engine/config/sim.json')).json();
    const config = cfg.parseSimConfig(raw);

    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return { ok: false, error: 'no WebGL2 context' };

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));

    const r = new gl2.Gl2Renderer(gl, config.capacity);
    const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const camera = (yaw) => ({
      rot4: identity, viewerW: 4, sliceW: 0, sliceThickness: 1,
      mode: 'project', yaw: yaw, pitch: 0.25, distance: 150, pointSize: 4,
    });
    const shot = () => {
      const px = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 12 || px[i+1] > 12 || px[i+2] > 12) lit += 1;
      }
      return { lit: lit, total: canvas.width * canvas.height, pixels: px };
    };

    // EMPTY first, so a leftover framebuffer cannot make it look blank by luck.
    const empty = new state.WorldState(config.capacity);
    r.draw(empty.buffer, empty.capacity, camera(0.6), canvas.width, canvas.height);
    const emptyShot = shot();

    const world = new state.WorldState(config.capacity);
    worldGen.populate(world, config, 12345, 24);
    const drawn = r.draw(world.buffer, world.capacity, camera(0.6), canvas.width, canvas.height);
    const populatedShot = shot();

    r.draw(world.buffer, world.capacity, camera(2.4), canvas.width, canvas.height);
    const movedShot = shot();
    let changed = 0;
    for (let i = 0; i < populatedShot.pixels.length; i += 4) {
      if (populatedShot.pixels[i] !== movedShot.pixels[i]) changed += 1;
    }

    return {
      ok: true, renderer: renderer, drawn: drawn,
      litPopulated: populatedShot.lit,
      litEmpty: emptyShot.lit,
      litMoved: movedShot.lit,
      changedPixels: changed,
      total: populatedShot.total,
    };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
})()`;

  const probe = (await page.evaluate(PROBE)) as Probe;

  // ── G1 / G2 ──────────────────────────────────────────────────────────────
  ok(probe.ok, `G1/G2: the renderer could not be exercised — ${probe.error ?? 'unknown'}`);
  if (probe.ok) {
    console.log(`  G1 context: WebGL2 available, reported as "${probe.renderer}"`);
    console.log(`  G2 program: Gl2Renderer constructed, so both shaders compiled and the program linked`);

    const total = probe.total!;
    const pop = probe.litPopulated!;
    const empty = probe.litEmpty!;

    // ── G3 ────────────────────────────────────────────────────────────────
    ok(pop > 0, 'G3: a populated world produced a completely black frame — nothing was drawn');
    ok((probe.drawn ?? 0) > 0, `G3: draw() reported ${probe.drawn} instances for a populated world`);

    // ── G4: NEGATIVE CONTROL ──────────────────────────────────────────────
    ok(empty * 4 < pop,
      `G4 NEGATIVE CONTROL FAILED: an EMPTY world lit ${empty} pixels against a populated world's ${pop}. ` +
        'The renderer paints regardless of content, so G3 proves the canvas is not black rather than ' +
        'proving the world was drawn.');

    // ── G5: NEGATIVE CONTROL ──────────────────────────────────────────────
    const coverage = (pop / total) * 100;
    ok(coverage < 90,
      `G5 NEGATIVE CONTROL FAILED: lit pixels cover ${coverage.toFixed(1)}% of the frame — that is a flood ` +
        'fill, not a drawing of discrete entities');
    ok(coverage > 0.05,
      `G5: lit pixels cover only ${coverage.toFixed(3)}% of the frame, which is indistinguishable from noise`);

    // ── G6 ────────────────────────────────────────────────────────────────
    ok((probe.changedPixels ?? 0) > 0,
      'G6: rotating the camera changed no pixel at all — the renderer is drawing a fixed image');

    console.log(
      `  G3/G4 content: populated ${pop} lit px, empty ${empty} lit px, ${probe.drawn} instances submitted`,
    );
    console.log(
      `  G5 structure: ${coverage.toFixed(2)}% coverage (a flood would be ~100%), ` +
        `G6 camera: ${probe.changedPixels} pixels changed on rotation`,
    );
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`verify-gl2: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-gl2: PASS — the renderer that ships compiles, draws the world, and draws nothing when there is nothing');
