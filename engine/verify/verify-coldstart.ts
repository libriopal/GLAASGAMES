// engine/verify/verify-coldstart.ts — the first three seconds, on a slow phone.
//
// Every other check in this repo assumes the app came up. This one does not.
// Cold start is the only code path EVERY user takes, and it is where a WebView
// app most often fails review: a reviewer who sees a blank screen files
// "app does not work", and they are not wrong to.
//
// C1  a cold, uncached load reaches an interactive board inside the budget,
//     with the CPU throttled to stand in for a slow handset
// C2  when the module fails to load, the player is TOLD, not shown a blank
// C3  the page survives a browser with JavaScript disabled entirely
// C5  a module that loads and silently does nothing is still reported
// C4  the failure UI is absent on a healthy load            (NEGATIVE CONTROL)
//
// C2 AND C3 ARE THE ONES WITH TEETH. A blank screen and a working screen are
// indistinguishable to every other oracle here — verify-app clicks a board that
// loaded fine, and would never see the case where it did not. The difference
// between "this app is broken" and "this device needs its System WebView
// updated" is one visible sentence, and a user cannot act on a sentence nobody
// wrote.
//
// The CPU multiplier is a stand-in, not a measurement of any handset. It makes
// the check sensitive to a regression that doubles startup work; it does not
// license a claim about a particular phone, which is item 5's job.

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

/** Time-to-interactive budget on a 6x-throttled CPU, milliseconds. */
const BUDGET_MS = 4000;
const CPU_THROTTLE = 6;

try {
  execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
} catch {
  console.error('verify-coldstart: FAIL — the app assets could not be rebuilt');
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

const browser = await chromium.launch({ executablePath: findChromium() });

try {
  // ── C1: cold start, throttled ────────────────────────────────────────────
  {
    // A FRESH CONTEXT PER MEASUREMENT. Reusing one would serve the second load
    // from cache and report a warm start as if it were cold, which is the
    // measurement everyone accidentally takes.
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

    const started = Date.now();
    await page.goto(`${origin}/index.html`, { waitUntil: 'commit' });
    await page.waitForSelector('#board .cell:not([disabled])', { timeout: 30_000 });
    const interactive = Date.now() - started;

    ok(interactive < BUDGET_MS,
      `C1: a cold load took ${interactive}ms to a playable board at ${CPU_THROTTLE}x CPU throttling, over the ` +
        `${BUDGET_MS}ms budget — on a slow handset that is a blank screen long enough to be read as broken`);
    console.log(`  C1 cold start: interactive in ${interactive}ms at ${CPU_THROTTLE}x CPU throttle (budget ${BUDGET_MS}ms)`);
    await context.close();
  }

  // ── C2: the module fails to load ─────────────────────────────────────────
  {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const page = await context.newPage();
    // The exact failure a device hits when its System WebView cannot parse a
    // module, or an asset is missing from the bundle.
    await page.route('**/lattice-app.js', (route) => route.abort('failed'));
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(3500);

    const text = (await page.locator('body').innerText()).toLowerCase();
    const cells = await page.locator('#board .cell').count();
    const told =
      text.includes("couldn't start") || text.includes('could not start') ||
      text.includes('failed to load') || text.includes('unable to start') ||
      text.includes('webview');

    ok(cells === 0 || told,
      `C2: the board script failed and the page rendered ${cells} cells with no explanation. A user sees an ` +
        'empty screen and a reviewer files "does not work" — the difference between a broken app and a device ' +
        'that needs its System WebView updated is one sentence, and nobody wrote it');
    ok(told,
      'C2: no failure message appeared when the main module was blocked. The page must say something a person ' +
        'can act on rather than presenting an empty board');
    console.log(`  C2 module failure: ${cells} cells rendered, failure message present: ${told}`);
    await context.close();
  }

  // ── C3: JavaScript disabled entirely ─────────────────────────────────────
  {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
    const text = (await page.locator('body').innerText()).toLowerCase();
    const explains = text.includes('javascript') || text.includes("couldn't start") || text.includes('could not start');
    ok(explains,
      'C3: with JavaScript disabled the page says nothing at all. A <noscript> block is the cheapest possible ' +
        'insurance against a silent blank screen');
    // Reports what was measured rather than announcing success — the first
    // draft printed "the page explains itself" on a run where it did not.
    console.log(`  C3 no-script: page explains itself with scripting disabled: ${explains}`);
    await context.close();
  }

  // ── C5: the module loads, and silently does nothing ──────────────────────
  //
  // FOUND BY THE MUTATION HARNESS. C2 aborts the request, and an aborted script
  // fires an `error` event that the page's listener already catches — so
  // removing the timeout watchdog left C2 passing and the harness reported the
  // mutant as surviving. It was right: the watchdog covers a case C2 never
  // reached.
  //
  // This is that case, and it is the more realistic one. A module that is
  // served successfully but whose top-level code never runs to completion — a
  // dependency that throws during evaluation on an older engine, a feature the
  // WebView lacks — produces NO error event and NO board. Nothing but a timeout
  // can notice it.
  {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const page = await context.newPage();
    await page.route('**/lattice-app.js', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* loaded, and did nothing */\n' }));
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(3500);

    const cells = await page.locator('#board .cell').count();
    const visible = await page.locator('#startup-error').isVisible().catch(() => false);
    ok(cells === 0, `C5: ${cells} cells appeared from a script that does nothing, so the setup is not testing what it claims`);
    ok(visible,
      'C5: a module that loaded successfully but rendered nothing produced NO message. This failure fires no ' +
        'error event, so only a timeout can catch it — and a silent empty board is the exact thing a reviewer ' +
        'files as "does not work"');
    console.log(`  C5 silent module: ${cells} cells, failure message shown by the watchdog: ${visible}`);
    await context.close();
  }

  // ── C4: NEGATIVE CONTROL — no false alarm on a healthy load ──────────────
  {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const page = await context.newPage();
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#board .cell', { timeout: 15_000 });
    await page.waitForTimeout(3500);

    const visible = await page.locator('#startup-error').isVisible().catch(() => false);
    ok(!visible,
      'C4 NEGATIVE CONTROL FAILED: the startup failure message is showing on a load that worked. A warning that ' +
        'appears when nothing is wrong is a warning nobody reads');
    const cells = await page.locator('#board .cell').count();
    ok(cells === 36, `C4: a healthy load rendered ${cells} cells, so C2's comparison has no baseline`);
    console.log('  C4 negative control: healthy load shows 36 cells and no failure message');
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`verify-coldstart: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-coldstart: PASS — the app comes up fast on a slow CPU, and says something useful when it cannot');
