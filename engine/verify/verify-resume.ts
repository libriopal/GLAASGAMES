// engine/verify/verify-resume.ts — the round survives, the rules are readable,
// and the screen can be used without sight or steady eyes.
//
// Items 3, 4 and 5 land on the same surface, so they are checked together in
// one browser.
//
// R1  a round interrupted mid-play RESUMES on the exact same board
// R2  a resumed round still verifies — same score, same digest      (PARITY)
// R3  a save made under DIFFERENT RULES is discarded, not continued
// R4  the rules are learnable in the app, in non-wagering language
// R5  score and turn are announced to a screen reader
// R6  focus is visible, and motion can be turned off
// R7  each of the above is absent when it should be   (NEGATIVE CONTROLS)
//
// R2 IS THE ONE THAT MATTERS. A resume that restored a BOARD could drift from a
// replay and nothing would say which was right. The session instead replays the
// saved actions through `advanceTurn` — the same executor `playRound` and
// `verifyRound` use — so a resumed round is indistinguishable from one that was
// never interrupted, and R2 is what holds that to be true.

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

try {
  execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
} catch {
  console.error('verify-resume: FAIL — the app assets could not be rebuilt');
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
const VIEWPORT = { width: 393, height: 852 };

/** Clicks `turns` cells and returns what the page shows. */
const PLAY = (turns: number): string => `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (let t = 0; t < ${turns}; t++) {
    const cell = document.querySelector('#board .cell:not([disabled])');
    if (!cell) break;
    cell.click();
    await sleep(20);
  }
  return {
    score: document.getElementById('s-score').textContent,
    turn: document.getElementById('s-turn').textContent,
    saved: localStorage.getItem('glaas.lattice.round.v1'),
    live: document.getElementById('live') ? document.getElementById('live').textContent : null,
  };
})()`;

interface Played { score: string; turn: string; saved: string | null; live: string | null }

try {
  // ── R1 + R2: interrupt, resume, and still verify ─────────────────────────
  {
    // ONE PERSISTENT CONTEXT, two page loads. A fresh context would clear
    // storage and quietly test "a new round starts", which always passes.
    const context = await browser.newContext({ viewport: VIEWPORT });
    const first = await context.newPage();
    await first.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await first.waitForSelector('#board .cell', { timeout: 15_000 });
    const midway = (await first.evaluate(PLAY(5))) as Played;

    ok(midway.saved !== null, 'R1: nothing was written to storage after five turns, so no round can survive a close');
    await first.close();

    // The app is gone. This is the reopen.
    const second = await context.newPage();
    await second.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await second.waitForSelector('#board .cell', { timeout: 15_000 });
    const resumed = (await second.evaluate(
      `({ score: document.getElementById('s-score').textContent,
          turn: document.getElementById('s-turn').textContent })`,
    )) as { score: string; turn: string };

    ok(resumed.turn === midway.turn,
      `R1: the round was at turn ${midway.turn} and reopened at ${resumed.turn} — the player lost their round`);
    ok(resumed.score === midway.score,
      `R1: the score was ${midway.score} and reopened as ${resumed.score}`);

    // ── R2: finish the resumed round and verify it end to end ─────────────
    await second.evaluate(PLAY(12));
    await second.locator('#btn-reveal').click();
    await second.waitForFunction(
      `(() => {
        const d = document.getElementById('proof-body');
        return d && d.textContent.includes('round key');
      })()`,
      undefined,
      { timeout: 15_000 },
    );
    const proof = (await second.locator('#proof-body').textContent()) ?? '';
    ok(!proof.includes('✗'),
      `R2 PARITY: a resumed round failed its own verification — ${proof.slice(0, 200)}`);

    const bundle = await second.evaluate('globalThis.__bundle') as
      { seed: number; actions: number[]; score: number; digest: number } | undefined;
    ok(bundle !== undefined, 'R2: the resumed round published no bundle to check');
    if (bundle) {
      const { verifyRound } = await import('../../lattice/round.js');
      const { DEFAULT_ROUND } = await import('../../lattice/round.js');
      const check = verifyRound(bundle.seed, DEFAULT_ROUND, bundle.actions, bundle.score, bundle.digest);
      ok(check.ok,
        `R2 PARITY: Node replayed the resumed round's ${bundle.actions.length} actions and got ` +
          `${check.score}/0x${(check.digest >>> 0).toString(16)} against the page's ` +
          `${bundle.score}/0x${(bundle.digest >>> 0).toString(16)} — a resumed round is not the same round`);
      console.log(
        `  R1/R2 resume: interrupted at turn ${midway.turn}, reopened at ${resumed.turn}, finished and ` +
          `independently verified at score ${check.score}`,
      );
    }
    await context.close();
  }

  // ── R3: a save from a different ruleset must not be continued ────────────
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#board .cell', { timeout: 15_000 });
    await page.evaluate(PLAY(4));

    // TAMPER FROM A PAGE WHERE THE APP IS NOT RUNNING.
    //
    // Two earlier attempts failed for the same reason and it is worth recording.
    // The app saves on `pagehide`, so rewriting the stored rules hash and then
    // closing — or reloading — fired that handler and wrote the REAL state back
    // over the tamper. Both times the check reported a resume that was entirely
    // legitimate: the app was right and the setup was defeated by the app's own
    // on-exit save.
    //
    // So the tamper happens on a same-origin page with no app on it. Storage is
    // per-origin, not per-document, so the write lands; nothing is listening for
    // pagehide to undo it.
    await page.close();

    const scratch = await context.newPage();
    await scratch.goto(`${origin}/no-app-here`, { waitUntil: 'domcontentloaded' });
    await scratch.evaluate(`(() => {
      const k = 'glaas.lattice.round.v1';
      const s = JSON.parse(localStorage.getItem(k));
      s.rulesHash = 'f'.repeat(64);
      localStorage.setItem(k, JSON.stringify(s));
      return s.rulesHash;
    })()`);
    await scratch.close();

    const after = await context.newPage();
    await after.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await after.waitForSelector('#board .cell', { timeout: 15_000 });
    const turn = await after.locator('#s-turn').textContent();
    ok(turn?.startsWith('0/') === true,
      `R3: a round saved under DIFFERENT RULES resumed anyway, at turn ${turn}. Its commitment names a ruleset ` +
        'this build is not playing, so every proof it produced afterwards would be wrong');
    console.log(`  R3 rules guard: a save under foreign rules is discarded and a fresh round dealt (turn ${turn})`);
    await context.close();
  }

  // ── R4 + R5 + R6: learnable, announced, navigable ────────────────────────
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#board .cell', { timeout: 15_000 });

    // R4: the rules, in the app.
    const howto = (await page.locator('#howto').innerText()).toLowerCase();
    ok(await page.locator('#howto').isVisible(),
      'R4: the how-to-play panel is not shown on a first run, so the rules are learnable only from outside the app');
    for (const idea of ['hidden', 'feed', 'tap']) {
      ok(howto.includes(idea),
        `R4: the how-to-play text never mentions "${idea}", so it does not explain the one mechanic the game has`);
    }
    // It must not reintroduce the vocabulary verify-listing P3 removed.
    for (const banned of ['wager', 'stake', 'prize', 'bet ', 'server seed']) {
      ok(!howto.includes(banned), `R4: the tutorial reintroduces wagering language: "${banned}"`);
    }

    // R5: the live region.
    const live = page.locator('#live');
    ok(await live.count() === 1, 'R5: there is no live region, so a screen reader is told nothing when the board changes');
    ok(await live.getAttribute('aria-live') === 'polite',
      'R5: the live region is not aria-live="polite"');
    await page.locator('#board .cell:not([disabled])').first().click();
    await page.waitForTimeout(150);
    const announced = (await live.textContent()) ?? '';
    ok(/turn \d+ of \d+/i.test(announced) && /score/i.test(announced),
      `R5: after a move the live region says ${JSON.stringify(announced)}, which does not report turn and score`);

    // R6: focus and motion.
    const focusRing = await page.evaluate(`(() => {
      const sheets = Array.from(document.styleSheets);
      let text = '';
      for (const s of sheets) { try { for (const r of s.cssRules) text += r.cssText; } catch (e) {} }
      return { focus: text.includes(':focus-visible'), motion: text.includes('prefers-reduced-motion') };
    })()`) as { focus: boolean; motion: boolean };
    ok(focusRing.focus, 'R6: no :focus-visible rule, so a keyboard or switch user cannot see where they are');
    ok(focusRing.motion, 'R6: no prefers-reduced-motion rule, so motion cannot be turned off by someone it makes ill');

    console.log(`  R4/R5/R6: rules shown in-app, live region announced ${JSON.stringify(announced.slice(0, 40))}, focus and motion rules present`);
    await context.close();
  }

  // ── R7: NEGATIVE CONTROLS ────────────────────────────────────────────────
  // Every check above passes trivially if the page always shows everything.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#board .cell', { timeout: 15_000 });

    // The tutorial must GO AWAY once dismissed, or R4 is measuring a panel
    // nobody can get rid of.
    await page.locator('#btn-howto').click();
    ok(!(await page.locator('#howto').isVisible()),
      'R7 NEGATIVE CONTROL FAILED: the how-to-play panel is still visible after being dismissed');
    await page.close();

    const returning = await context.newPage();
    await returning.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await returning.waitForSelector('#board .cell', { timeout: 15_000 });
    ok(!(await returning.locator('#howto').isVisible()),
      'R7 NEGATIVE CONTROL FAILED: the tutorial returns on every launch, so the dismissal is not remembered');

    // And a cleared store must deal a NEW round rather than resuming nothing.
    await returning.evaluate(`localStorage.clear()`);
    await returning.reload({ waitUntil: 'networkidle' });
    await returning.waitForSelector('#board .cell', { timeout: 15_000 });
    const turn = await returning.locator('#s-turn').textContent();
    ok(turn?.startsWith('0/') === true,
      `R7 NEGATIVE CONTROL FAILED: with storage cleared the page reports turn ${turn}, so R1 could be reading a ` +
        'round that was never saved');
    console.log('  R7 negative controls: tutorial dismisses and stays dismissed; cleared storage deals a fresh round');
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`verify-resume: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-resume: PASS — rounds survive a close, resume identically, and the screen is usable and learnable');
