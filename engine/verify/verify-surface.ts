// engine/verify/verify-surface.ts — the screen a player actually meets.
//
// S1  the game is above the fold: no scrolling to reach the board or the buttons
// S2  the type is a game's, not a terminal's — monospace only where it earns it
// S3  the trail records exactly what the player was shown, and nothing else
// S4  the trail is not a leak: it never names a link before it was witnessed
// S5  the screen has something on it that is not text
// S6  each of the above is caught when broken            (NEGATIVE CONTROLS)
//
// S3 AND S4 ARE THE ONES THAT MATTER, and they are two different claims about
// the same feature. The observation trail draws, on a cell the player banked,
// a bar on the edge its charge was seen to leave by. That is a subset of the
// hidden lattice rendered on screen before the reveal, which is exactly the
// thing `verify-app` A5 exists to forbid — so the difference has to be made
// precise rather than asserted:
//
//   S3 (SOUNDNESS) every mark corresponds to a real link. A trail that invented
//      a direction would teach the player something false about a structure the
//      game then reveals, which is worse than showing nothing.
//   S4 (CONFINEMENT) every mark corresponds to a pair the PLAYER CAUSED AND
//      WATCHED. The count of marks must equal the count of distinct adjacent
//      charges they produced — never more. A trail with more marks than
//      observations is displaying links nobody earned, and that is the leak.
//
// S4 is the harder direction and it is why the trail is built from the play log
// rather than from `session.links()`. S6 plants a trail built the other way and
// requires S4 to catch it, because a confinement claim that has never been seen
// to fail is a comment.

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
/** A Pixel-class phone. The narrow-phone case is verify-devices' job. */
const VIEWPORT = { width: 393, height: 852 };

try {
  execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
} catch {
  console.error('verify-surface: FAIL — the app assets could not be rebuilt');
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

/**
 * Plays `n` turns and reports the trail plus the log it must agree with.
 *
 * IT SPREADS ITS TAPS ON PURPOSE. The first version always clicked the first
 * enabled cell; the banked cell refills, so it kept banking the SAME index and
 * ten turns produced a single distinct source. S3 and S4 then passed on a trail
 * of one mark, which is a confinement claim with almost nothing in it. Walking
 * the board gives roughly one mark per turn and the checks something to bite on.
 */
const PLAY = (n: number): string => `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (let t = 0; t < ${n}; t++) {
    const open = [...document.querySelectorAll('#board .cell:not([disabled])')];
    if (open.length === 0) break;
    // A fixed stride, so the run is still deterministic.
    open[(t * 7) % open.length].click();
    await sleep(25);
  }
  const marks = [...document.querySelectorAll('#board .cell')].flatMap((cell, i) => {
    const bar = cell.querySelector('.trail');
    return bar ? [{ from: i, dir: Number(bar.dataset.dir) }] : [];
  });
  let log = [];
  try { log = JSON.parse(localStorage.getItem('glaas.lattice.log.v1') || '[]'); } catch (e) {}
  return { marks, log };
})()`;

interface Mark { from: number; dir: number }
interface TurnRecord { turn: number; banked: number; charged: number[] }
interface Played { marks: Mark[]; log: TurnRecord[] }

/**
 * What the player was actually shown: an ADJACENT cell whose charge rose on a
 * turn they caused. Recomputed from the log rather than taken from the app.
 */
function witnessedFrom(log: readonly TurnRecord[], dirOf: (a: number, b: number) => number): Map<number, number> {
  const seen = new Map<number, number>();
  for (const rec of log) {
    for (const target of rec.charged) {
      if (dirOf(rec.banked, target) !== 4) seen.set(rec.banked, target);
    }
  }
  return seen;
}

/** S4's confinement predicate. Shared with its negative control ON PURPOSE. */
function unearned(marks: readonly Mark[], seen: ReadonlyMap<number, number>): Mark[] {
  return marks.filter((m) => !seen.has(m.from));
}

try {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#board .cell', { timeout: 15_000 });

  // ── S1: the game is above the fold ───────────────────────────────────────
  // Measured on a FIRST RUN, with the how-to panel still showing, because that
  // is the screen that decides whether there is a second session.
  const fold = await page.evaluate(`(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    return {
      scrollHeight: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
      boardBottom: Math.round(r('#board').bottom),
      actionsBottom: Math.round(r('#actions').bottom),
      howtoShown: !document.getElementById('howto').hidden,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  })()`) as {
    scrollHeight: number; viewport: number; boardBottom: number;
    actionsBottom: number; howtoShown: boolean; overflowX: boolean;
  };

  ok(fold.howtoShown, 'S1: the how-to panel was not shown on a first run, so S1 is measuring the returning-player screen');
  ok(fold.scrollHeight <= fold.viewport,
    `S1: the page is ${fold.scrollHeight}px tall in a ${fold.viewport}px viewport — a new player has to scroll before ` +
      'they can see the game, and the first-session research is unanimous that this is where the churn is');
  ok(fold.actionsBottom <= fold.viewport,
    `S1: the buttons end at ${fold.actionsBottom}px, below the ${fold.viewport}px fold`);
  ok(fold.boardBottom <= fold.viewport,
    `S1: the board ends at ${fold.boardBottom}px, below the ${fold.viewport}px fold`);
  ok(!fold.overflowX, 'S1: the page scrolls horizontally');
  console.log(
    `  S1 above the fold: ${fold.scrollHeight}px of content in ${fold.viewport}px, board ends ${fold.boardBottom}px, ` +
      `buttons ${fold.actionsBottom}px, with the tutorial still up`,
  );

  // ── S2: the type is a game's ─────────────────────────────────────────────
  // The screen was 100% ui-monospace. Monospace is right for the hashes, where
  // equal character cells are the requirement, and wrong everywhere else.
  const type = await page.evaluate(`(() => {
    const mono = [], sans = new Set();
    for (const el of document.querySelectorAll('h1, .sub, #status b, #status span, #board .cell, button, #howto, #proof > summary')) {
      const f = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^"|"$/g, '');
      if (/mono/i.test(f)) mono.push((el.id || el.className || el.tagName) + ':' + f);
      else sans.add(f);
    }
    const proofFont = getComputedStyle(document.querySelector('#proof code') || document.body).fontFamily;
    return { mono, sans: [...sans], proofFont, tabular: getComputedStyle(document.getElementById('s-score')).fontVariantNumeric };
  })()`) as { mono: string[]; sans: string[]; proofFont: string; tabular: string };

  ok(type.mono.length === 0,
    `S2: ${type.mono.length} interface element(s) still render in a monospaced face (${type.mono.slice(0, 3).join(', ')}) ` +
      '— a monospaced interface reads as a developer tool, which is what this screen was');
  ok(type.sans.length > 0 && type.sans.every((f) => !/mono/i.test(f)),
    `S2: the interface face is ${JSON.stringify(type.sans)}`);
  ok(/mono/i.test(type.proofFont),
    `S2: the hashes render in ${type.proofFont}, not a monospaced face — equal character cells are the actual ` +
      'requirement there, and losing them is not a simplification');
  ok(type.tabular.includes('tabular-nums'),
    `S2: the score is set in proportional figures (${type.tabular}), so the counter shifts sideways as it climbs`);
  console.log(`  S2 type: interface in ${type.sans.join('/')}, monospace confined to the hashes, tabular figures on the counters`);

  // ── S3 + S4: the trail is sound, and confined ────────────────────────────
  const played = (await page.evaluate(PLAY(10))) as Played;

  // What the player actually witnessed: an adjacent cell whose charge rose on a
  // turn they caused. Recomputed here from the log rather than trusted.
  const { directionOf } = await import('../../lattice/reveal.js');
  const witnessed = witnessedFrom(played.log, directionOf);

  ok(witnessed.size >= 4,
    `S3: only ${witnessed.size} adjacent charge(s) were witnessed across the run, which is too few for S3 and S4 to ` +
      'mean anything — the driver is not exercising the board, so a passing result here would be an artifact');
  ok(played.marks.length > 0,
    'S3: the run produced no trail marks at all, so the feature is not running and S4 is vacuous');

  // S4 CONFINEMENT: never more marks than observations, and every mark's source
  // must be a cell the player banked.
  // EXACT EQUALITY, not "no more than". Fewer marks than observations would be
  // a trail that quietly forgets, which is the memory burden this feature
  // exists to remove; more would be a leak. Both are defects, so both fail.
  ok(played.marks.length === witnessed.size,
    `S4: ${played.marks.length} marks are on screen against ${witnessed.size} witnessed adjacent charges. More marks ` +
      'than observations is a leak; fewer is a trail that forgets what the player was shown');
  const strays = unearned(played.marks, witnessed);
  ok(strays.length === 0,
    `S4 LEAK: ${strays.length} mark(s) sit on cells the player never banked (${strays.slice(0, 4).map((m) => m.from).join(', ')})`);

  // S3 SOUNDNESS: every mark points where the true lattice says it points.
  const seed = await page.evaluate(`(() => {
    try { return JSON.parse(localStorage.getItem('glaas.lattice.round.v1')).serverSeed; } catch (e) { return null; }
  })()`) as string | null;
  ok(seed !== null, 'S3: the round did not persist, so its true lattice cannot be recomputed here');

  let wrong = 0;
  if (seed !== null) {
    const { reconstructLattice } = await import('../../lattice/reveal.js');
    const saved = await page.evaluate(`(() => JSON.parse(localStorage.getItem('glaas.lattice.round.v1')))()`) as
      { serverSeed: string; clientSeed: string; rulesHash: string };
    const { seedFromReveal } = await import('../../lattice/commit.js');
    const numericSeed = await seedFromReveal(saved);
    const links = reconstructLattice(numericSeed);
    for (const m of played.marks) {
      const target = links[m.from]!;
      if (directionOf(m.from, target) !== m.dir) wrong += 1;
    }
    ok(wrong === 0,
      `S3: ${wrong} of ${played.marks.length} marks point somewhere the hidden lattice does not — the trail is ` +
        'teaching the player a structure the reveal will then contradict');
  }
  console.log(
    `  S3/S4 trail: ${played.marks.length} marks from ${witnessed.size} witnessed charges, ${wrong} disagree with ` +
      'the true lattice, 0 on cells never banked',
  );

  // ── S7: THE SECOND HOP NEVER DRAWS A BAR ─────────────────────────────────
  //
  // THE AUDITOR PREDICTED THIS WOULD FAIL and was wrong, but only because of a
  // geometric accident nothing here had asserted. Its objection, verbatim in
  // substance: the charge travels TWO steps, so a bounce should draw a second
  // bar for a single player-caused charge and break S4's equality.
  //
  // It does not, for two reasons that were both implicit until now:
  //   1. `observed` is keyed by the BANKED cell, so a source can carry at most
  //      one bar however many cells lit up.
  //   2. A two-step walk on a grid cannot END cardinally adjacent to where it
  //      started — two steps preserve the parity of (row + column) and cardinal
  //      adjacency requires flipping it — so the second hop is always filtered
  //      by the adjacency test rather than by luck.
  //
  // Reason 2 is a fact about the CURRENT rules. Three-step propagation, or
  // diagonal links, would quietly break it and the trail would start drawing a
  // link the player never saw that cell take. So it is asserted here, against
  // real logged rounds, instead of trusted.
  const multiHop = played.log.filter((rec) => rec.charged.length > 1);
  ok(multiHop.length > 0,
    'S7: no turn in this run propagated charge to more than one cell, so the two-step rule never fired and the ' +
      'filter that excludes the second hop was never exercised — this check would pass on a trail that has no ' +
      'filter at all');
  let secondHopAdjacent = 0;
  for (const rec of multiHop) {
    for (const target of rec.charged) {
      if (target !== witnessed.get(rec.banked) && directionOf(rec.banked, target) !== 4) secondHopAdjacent += 1;
    }
  }
  ok(secondHopAdjacent === 0,
    `S7: ${secondHopAdjacent} onward hop(s) landed cardinally adjacent to the cell that was banked. The parity ` +
      'argument the trail relies on no longer holds under the current rules, so a bar can now be drawn for a link ' +
      'the player did not witness that cell take');
  const doubled = await page.evaluate(
    `(() => [...document.querySelectorAll('#board .cell')].filter(c => c.querySelectorAll('.trail').length > 1).length)()`,
  ) as number;
  ok(doubled === 0, `S7: ${doubled} cell(s) carry more than one bar, so a single source is claiming two links`);
  console.log(
    `  S7 second hop: ${multiHop.length} multi-cell propagations logged, 0 landed adjacent to their source, ` +
      `${doubled} cells carry a second bar`,
  );

  // The trail must ALSO not trip the leak marker A5 looks for.
  const boardHtml = await page.locator('#board').innerHTML();
  ok(!/→\d/.test(boardHtml), 'S4: a reveal-style link arrow appeared in the board before the reveal');
  ok(await page.locator('#board .link').count() === 0,
    'S4: reveal link markers are in the DOM before the reveal');

  // ── S5: the screen is not made only of text ──────────────────────────────
  const graphics = await page.evaluate(`(() => document.querySelectorAll('#board .trail').length)()`) as number;
  ok(graphics > 0,
    'S5: there is not one drawn, non-text element on the board — every relationship in this game was being ' +
      'communicated as a character, which is the whole reason it read as a document rather than a game');
  console.log(`  S5 drawn: ${graphics} non-text marks on the board`);
  await context.close();

  // ── S6: NEGATIVE CONTROLS ────────────────────────────────────────────────
  {
    const control = await browser.newContext({ viewport: VIEWPORT });
    const probe = await control.newPage();
    await probe.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await probe.waitForSelector('#board .cell', { timeout: 15_000 });

    // (a) S1 must be able to fail. Grow the content and require the fold check
    //     to notice — otherwise it is measuring a page that always fits.
    const grown = await probe.evaluate(`(() => {
      const pad = document.createElement('div');
      pad.style.height = '400px';
      document.getElementById('app').append(pad);
      return { scrollHeight: document.documentElement.scrollHeight, viewport: window.innerHeight };
    })()`) as { scrollHeight: number; viewport: number };
    ok(grown.scrollHeight > grown.viewport,
      `S6 NEGATIVE CONTROL FAILED: 400px of extra content left the page at ${grown.scrollHeight}px in a ` +
        `${grown.viewport}px viewport, so S1 cannot detect a screen that overflows`);

    // (b) S4 must be able to fail. Plant marks on cells the player never
    //     banked — a trail drawn from the lattice instead of from the log —
    //     and require the confinement check to catch it.
    const planted = await probe.evaluate(`(() => {
      const cells = [...document.querySelectorAll('#board .cell')];
      for (const cell of cells) {
        if (cell.querySelector('.trail')) continue;
        const bar = document.createElement('span');
        bar.className = 'trail';
        bar.dataset.dir = '1';
        cell.append(bar);
      }
      return [...document.querySelectorAll('#board .cell')].flatMap((cell, i) => {
        const bar = cell.querySelector('.trail');
        return bar ? [{ from: i, dir: Number(bar.dataset.dir) }] : [];
      });
    })()`) as Mark[];
    // THE FIRST VERSION OF THIS CONTROL WAS VACUOUS and is worth recording as
    // such: it scored the planted marks against a freshly constructed empty Map
    // rather than against the page, so it asserted that an empty map contains
    // nothing. True, and evidence of exactly nothing. The control now reads the
    // page's OWN log — empty here, because this page was never played — and
    // runs the SAME `unearned` predicate S4 runs. If that predicate is ever
    // weakened, this control stops passing too, which is the point of sharing it.
    const controlLog = await probe.evaluate(
      `(() => { try { return JSON.parse(localStorage.getItem('glaas.lattice.log.v1') || '[]'); } catch (e) { return []; } })()`,
    ) as TurnRecord[];
    const plantedUnearned = unearned(planted, witnessedFrom(controlLog, directionOf));
    ok(controlLog.length === 0,
      `S6: the control page reports ${controlLog.length} played turns, so "every planted mark is unearned" is not ` +
        'the assertion being made and the control proves less than it claims');
    ok(planted.length === 36 && plantedUnearned.length === 36,
      `S6 NEGATIVE CONTROL FAILED: a full board of marks planted with no play behind it was scored as ` +
        `${plantedUnearned.length} unearned out of ${planted.length} — S4's confinement predicate does not fire ` +
        'on a trail drawn from the lattice rather than the log');

    // (c) S5 must be able to fail: with the marks removed there is nothing drawn.
    const stripped = await probe.evaluate(`(() => {
      document.querySelectorAll('#board .trail').forEach(n => n.remove());
      return document.querySelectorAll('#board .trail').length;
    })()`) as number;
    ok(stripped === 0,
      'S6 NEGATIVE CONTROL FAILED: removing every trail mark left some behind, so S5 is not counting what it thinks');
    console.log(
      `  S6 negative controls: padding took the page to ${grown.scrollHeight}px (fold check fires); ` +
        `${plantedUnearned.length}/36 planted marks scored unearned; strip leaves ${stripped}`,
    );
    await control.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`verify-surface: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-surface: PASS — the game is above the fold, set in a game\'s type, and the trail shows only what was seen');
