// engine/verify/verify-devices.ts — the claims that are true of one machine.
//
// The app declares minSdk 24 and uses modern DOM and WebGL2. Both are claims
// about EVERY device that can install it, and both were only ever observed on
// the machine that wrote them. Android System WebView updates through the Play
// Store independently of the OS version, so "Android 7 or newer" says very
// little about which engine a page will actually meet.
//
// D1  the board is usable at every viewport we claim to support
// D2  an engine missing a modern DOM API is TOLD, not left blank
// D3  the failure panel stays hidden on a capable engine    (NEGATIVE CONTROL)
//
// D2 IS THE ONE THAT CANNOT BE FAKED BY LOOKING. A static scan for modern
// syntax would measure vocabulary, not behaviour — the failure mode this repo
// keeps rediscovering. Instead the API is genuinely removed before any page
// script runs, which is what an older engine actually presents, and the app has
// to cope in front of the check.
//
// WHAT THIS DOES NOT PROVE: that any particular handset's driver or WebView
// build agrees. That needs real devices. What it does prove is that the app
// fails legibly rather than blankly when an engine is short of what it needs,
// which is the difference between a support reply and a one-star review.

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

/**
 * The viewport matrix.
 *
 * Chosen as the extremes rather than the popular middle: the narrowest phone
 * still sold, a common modern handset, a large phone, and a small tablet. A
 * layout that survives 320px and 800px survives everything between, and the
 * middle is where a bug is least likely to hide.
 */
const DEVICES: readonly { readonly name: string; readonly width: number; readonly height: number; readonly dpr: number }[] = [
  { name: 'narrow phone (320x568)', width: 320, height: 568, dpr: 2 },
  { name: 'Pixel-class (393x852)', width: 393, height: 852, dpr: 3 },
  { name: 'large phone (430x932)', width: 430, height: 932, dpr: 3 },
  { name: 'small tablet (800x1280)', width: 800, height: 1280, dpr: 2 },
];

/** The floor verify-controls enforces for a touch target, in CSS pixels. */
const TOUCH_FLOOR = 44;

try {
  execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
} catch {
  console.error('verify-devices: FAIL — the app assets could not be rebuilt');
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
  // ── D1: the viewport matrix ──────────────────────────────────────────────
  {
    const report: string[] = [];
    for (const device of DEVICES) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: device.dpr,
      });
      const page = await context.newPage();
      await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#board .cell', { timeout: 15_000 });

      const cells = await page.locator('#board .cell').count();
      ok(cells === 36, `D1 [${device.name}]: the board rendered ${cells} cells, expected 36`);

      // Smallest rendered cell, which is what a thumb actually has to hit.
      const smallest = await page.evaluate(
        `(() => {
          var cells = document.querySelectorAll('#board .cell');
          var min = Infinity;
          for (var i = 0; i < cells.length; i++) {
            var r = cells[i].getBoundingClientRect();
            min = Math.min(min, r.width, r.height);
          }
          return Math.round(min);
        })()`,
      ) as number;
      ok(smallest >= TOUCH_FLOOR,
        `D1 [${device.name}]: the smallest cell is ${smallest}px, under the ${TOUCH_FLOOR}px touch floor — ` +
          'unhittable on the device we claim to support');

      // The page must never scroll sideways. A horizontal scrollbar on a phone
      // is the single most obvious sign of a layout that was only ever seen on
      // a desktop.
      const overflow = await page.evaluate(
        '(document.documentElement.scrollWidth - document.documentElement.clientWidth)',
      ) as number;
      ok(overflow <= 0,
        `D1 [${device.name}]: the page overflows horizontally by ${overflow}px`);

      report.push(`${device.name} cell ${smallest}px`);
      await context.close();
    }
    console.log(`  D1 viewports: ${DEVICES.length} sizes, all 36 cells, smallest touch targets — ${report.join(', ')}`);
  }

  // ── D2: an engine short of a modern API ──────────────────────────────────
  //
  // `Element.replaceChildren` is Chrome 86 (2020) and the board rendering
  // depends on it. A WebView older than that is entirely possible on a device
  // whose owner has never updated it, and the honest question is not "will this
  // happen" but "what does the player see when it does".
  {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const page = await context.newPage();
    // Removed BEFORE any page script runs, which is what an old engine
    // presents. Deleting it afterwards would test a different thing.
    await page.addInitScript(`delete Element.prototype.replaceChildren;`);
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(3500);

    const visible = await page.locator('#startup-error').isVisible().catch(() => false);
    const cells = await page.locator('#board .cell').count();
    ok(visible,
      `D2: with Element.replaceChildren absent the page rendered ${cells} cells and showed no message. On an ` +
        'older WebView the player gets a blank screen and no idea that updating it would fix them');
    console.log(`  D2 old engine: replaceChildren removed — ${cells} cells, failure message shown: ${visible}`);
    await context.close();
  }

  // ── D3: NEGATIVE CONTROL ─────────────────────────────────────────────────
  {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const page = await context.newPage();
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#board .cell', { timeout: 15_000 });
    await page.waitForTimeout(3000);
    const visible = await page.locator('#startup-error').isVisible().catch(() => false);
    ok(!visible,
      'D3 NEGATIVE CONTROL FAILED: the "old engine" warning shows on a fully capable engine, so D2 proves ' +
        'nothing — the panel is simply always on');
    console.log('  D3 negative control: on a capable engine the warning stays hidden');
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`verify-devices: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-devices: PASS — usable across the viewport matrix, and legible on an engine that is too old');
