// engine/verify/verify-app.ts — the shipped page, played by a robot.
//
// Every other oracle in this repo tests a module. This one loads the EXACT
// bytes staged into android/app/src/main/assets, in a real browser engine, and
// plays a round by clicking cells. It is the only check that can catch a defect
// that lives in the host rather than the library: an unwired button, a render
// that draws stale state, a module that fails to load on a device.
//
// A0  the staged assets are rebuilt from current source before anything runs
// A1  the staged page loads with no console error and no failed request
// A2  a full round can be played by clicking, and the board responds
// A3  the reveal verifies IN THE PAGE, against the seed hidden until then
// A4  the score the page shows equals what verifyRound recomputes  (PARITY)
// A5  the hidden lattice is absent from the DOM until the reveal   (THE LEAK)
//
// A5 IS THE ONE THAT COULD ONLY BE CHECKED HERE. `verify-session` proves the
// session refuses to hand over links early; it cannot prove the PAGE does not
// obtain them another way, because the page is not a module it can call. Here
// the actual rendered DOM is searched for link markers before the reveal, which
// is the same thing a player with devtools would do.
//
// WHY THE STAGED TREE AND NOT web/: the relative paths in the page only resolve
// once the files sit where the APK puts them. Testing the repo layout would be
// testing a layout that never ships.
//
// A0 EXISTS BECAUSE THE MUTATION HARNESS CAUGHT THIS ORACLE PASSING ON A BUG.
// The first version simply read the staged tree. `verify-oracles` planted a
// leak in web/lattice-app.ts — a link marker painted on every cell from the
// moment it is dealt — and this file reported PASS, because the staged
// JavaScript was compiled BEFORE the mutation and nothing here rebuilt it. The
// oracle was testing an artifact, and an artifact can be older than the defect.
// That is the self-witness failure in a new costume: the build vouching for the
// build. So the build now runs here, in-process, before the page is loaded.

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { DEFAULT_ROUND, verifyRound } from '../../lattice/round.js';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ASSETS = join(ROOT, 'android/app/src/main/assets/');

// ── A0: rebuild, so the page under test is the source under test ───────────
{
  try {
    execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
    execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
  } catch (error) {
    const e = error as { stdout?: Buffer; stderr?: Buffer };
    const detail = `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`.trim().split('\n').slice(-6).join(' | ');
    fail(`A0: the app assets could not be rebuilt, so every check below would be testing a stale artifact — ${detail}`);
    console.error('verify-app: FAIL — the build failed');
    for (const d of failures) console.error(`  ${d}`);
    process.exit(1);
  }
  console.log('  A0 freshness: web bundle and app assets rebuilt from current source');
}
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
};

// Served over http on localhost, which is a SECURE CONTEXT by specification —
// the same guarantee WebViewAssetLoader gives the APK by serving https. That
// matters: lattice/commit.ts needs crypto.subtle, which is unavailable on an
// insecure origin, so a file:// harness would fail for a reason the device
// never hits.
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

// Resolved rather than hard-coded: the pre-installed browser is versioned
// (chromium-1194), so a fixed path goes stale on the next image and the failure
// reads as "the app is broken" rather than "the harness moved".
function findChromium(): string {
  const roots = readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium'));
  for (const root of roots.sort().reverse()) {
    for (const exe of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const candidate = join('/opt/pw-browsers', root, exe);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('verify-app: no pre-installed Chromium found under /opt/pw-browsers');
}

const browser = await chromium.launch({ executablePath: findChromium() });
// A phone-shaped viewport, because the target is a handset and a desktop
// viewport would not exercise the layout anyone actually gets.
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });

const consoleErrors: string[] = [];
const failedRequests: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} — ${r.failure()?.errorText ?? 'unknown'}`));

try {
  // ── A1: the page loads clean ─────────────────────────────────────────────
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#board .cell', { timeout: 15_000 });

  const cellCount = await page.locator('#board .cell').count();
  ok(cellCount === 36, `A1: the board rendered ${cellCount} cells, expected 36`);
  ok(consoleErrors.length === 0, `A1: ${consoleErrors.length} console errors on load — ${consoleErrors.slice(0, 3).join(' | ')}`);
  ok(failedRequests.length === 0, `A1: ${failedRequests.length} requests failed — ${failedRequests.slice(0, 3).join(' | ')}`);
  console.log(`  A1 load: 36 cells rendered, 0 console errors, 0 failed requests`);

  // ── A5 (before): no link markers anywhere in the DOM ─────────────────────
  // Checked BEFORE playing, because a leak at deal time is the worst case.
  const linksBefore = await page.locator('#board .link').count();
  ok(linksBefore === 0, `A5: ${linksBefore} link markers were in the DOM before the reveal — the lattice is visible`);
  const htmlBefore = await page.locator('#board').innerHTML();
  ok(!/→\d/.test(htmlBefore), 'A5: a link arrow appeared in the board markup before the reveal');

  // ── A2: play the round by clicking ───────────────────────────────────────
  let clicks = 0;
  for (let turn = 0; turn < DEFAULT_ROUND.turns + 2; turn += 1) {
    const enabled = page.locator('#board .cell:not([disabled])');
    if (await enabled.count() === 0) break;
    await enabled.first().click();
    clicks += 1;
    if (!(await page.locator('#btn-reveal').isDisabled())) break;
  }
  ok(clicks > 0, 'A2: no cell was clickable, so the round could not be started');
  ok(clicks <= DEFAULT_ROUND.turns,
    `A2: the round accepted ${clicks} turns but the config allows ${DEFAULT_ROUND.turns}`);

  const revealEnabled = !(await page.locator('#btn-reveal').isDisabled());
  ok(revealEnabled, `A2: after ${clicks} turns the reveal button is still disabled — the round never ended`);
  const shownScore = Number((await page.locator('#s-score').textContent()) ?? 'NaN');
  ok(Number.isFinite(shownScore) && shownScore > 0,
    `A2: the page shows a score of "${shownScore}" after a full round`);
  console.log(`  A2 play: ${clicks} turns clicked through the real UI, score ${shownScore}, round ended`);

  // ── A3 + A4: reveal, and check the page's claim independently ────────────
  await page.locator('#btn-reveal').click();
  // The callback runs IN THE PAGE, not in Node, so `document` here is the
  // browser's. It is reached through the globalThis cast rather than a DOM lib
  // reference, because adding "dom" to this project's Node typecheck would let
  // browser globals leak into every other oracle.
  await page.waitForFunction(
    () => {
      const doc = (globalThis as unknown as { document: { getElementById(id: string): { textContent: string | null } | null } }).document;
      return (doc.getElementById('proof-body')?.textContent ?? '').includes('server seed');
    },
    undefined,
    { timeout: 15_000 },
  );
  const proof = (await page.locator('#proof-body').textContent()) ?? '';

  ok(!proof.includes('✗'), `A3: the page reported a FAILED check after the reveal — ${proof.slice(0, 200)}`);
  ok((proof.match(/✓/g) ?? []).length >= 2,
    `A3: expected two passing checks in the proof panel, got — ${proof.slice(0, 200)}`);

  // A4 PARITY. Recompute here, in Node, from values the page published, and
  // require agreement. The page verifying itself would be the app vouching for
  // the app.
  const seedText = /server seed ([0-9a-f]+)/.exec(proof)?.[1];
  const digestText = /digest 0x([0-9a-f]+)/.exec(proof)?.[1];
  ok(seedText !== undefined, 'A4: the proof panel did not publish the server seed, so it cannot be checked');
  ok(digestText !== undefined, 'A4: the proof panel did not publish the digest');

  if (seedText && digestText) {
    const bundle = await page.evaluate(() => (globalThis as { __bundle?: unknown }).__bundle);
    ok(bundle !== undefined,
      'A4: the page does not publish its bundle for inspection, so the parity check has nothing to recompute from');
    if (bundle) {
      const b = bundle as { seed: number; actions: number[]; score: number; digest: number };
      const check = verifyRound(b.seed, DEFAULT_ROUND, b.actions, b.score, b.digest);
      ok(check.ok,
        `A4 PARITY: the page claimed score ${b.score} / digest 0x${(b.digest >>> 0).toString(16)} but Node ` +
          `recomputed ${check.score} / 0x${(check.digest >>> 0).toString(16)} from the same seed and actions`);
      ok(b.score === shownScore, `A4: the page displayed ${shownScore} but its bundle says ${b.score}`);
      console.log(`  A3/A4 proof: reveal verified in-page, and Node independently reproduced score ${check.score} from seed ${b.seed}`);
    }
  }

  // ── A5 (after): the gate opens ───────────────────────────────────────────
  const linksAfter = await page.locator('#board .link').count();
  ok(linksAfter > 0, 'A5: no links appeared after the reveal, so the gate never opened and the check above was vacuous');
  console.log(`  A5 leak gate: 0 link markers before the reveal, ${linksAfter} after`);

  ok(consoleErrors.length === 0,
    `A5: ${consoleErrors.length} console errors accumulated during play — ${consoleErrors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`verify-app: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-app: PASS — the staged APK page plays a full round, proves it, and hides the lattice until the reveal');
