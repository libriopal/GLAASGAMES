// engine/verify/verify-feedback.ts — anticipation before the commit, instant
// resolution after.
//
// `design/fourd-as-the-board.md` change 4 states the rule and, unusually for a
// design document, states its own falsifier: "Falsified if: any animation
// delays the display of an outcome already decided. That is a one-line check
// worth adding." This is that check, and it turned out not to be one line.
//
// B1  the anticipation happens BEFORE the commit, and changes nothing
// B2  the outcome is on screen within one frame of the tap        (THE RULE)
// B3  nothing animates or transitions the elements that carry the outcome
// B4  a device with no audio still plays a complete round
// B5  sound can be turned off, and stays off
// B6  each of the above is caught when broken            (NEGATIVE CONTROLS)
//
// WHY B2 IS MEASURED RATHER THAN REASONED ABOUT. "We call render() before we
// play the sound" is an argument about the source; a slot machine's source also
// updates its model before it plays the reels. The claim is about what the
// PLAYER sees, so the measurement is taken from the page: a MutationObserver
// timestamps the moment each carrier of the outcome actually changes, and the
// LAST of them is compared against the timestamp of the tap that caused it. An
// await, a CSS transition, a requestAnimationFrame chain or a setTimeout
// anywhere in that path shows up as milliseconds, whatever the source looks
// like.
//
// "The last of them" is not fussiness. The first version took the FIRST carrier
// to change and B6 caught it immediately: a quarter-second delay planted on the
// score was reported as 2.3ms, because the turn counter had already ticked and
// the measurement stopped there. Half an outcome on screen is not an outcome on
// screen.
//
// AND THE DOM IS NOT THE SCREEN. The independent auditor's objection, which was
// right: a MutationObserver fires when the tree changes, and a frame still has
// to be produced. Anything blocking the main thread in between is a visual hang
// the player experiences as exactly the pause this rule forbids, and a mutation
// timestamp reports it as instant. So the tap is timed to a COMMITTED FRAME as
// well, via double requestAnimationFrame, and B6(d) plants a 250ms synchronous
// block after the app's own handler to prove the two measurements come apart.
//
// Two budgets, because they are two different claims: 32ms for the DOM to carry
// the outcome, 67ms for a frame to show it. The frame number is larger by
// construction — the measurement itself waits two animation frames — and is
// still well under the ~100ms at which a response stops feeling immediate.

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
/** Two frames at 60Hz — the budget for the DOM to carry the outcome. */
const FRAME_BUDGET_MS = 32;
/**
 * The budget to a COMMITTED FRAME, which is the number a player feels.
 *
 * Four frames rather than two. The measurement waits for two full animation
 * frames after the mutation by construction, so the floor is already one to two
 * frames of scheduling that no implementation can remove; 67ms leaves room for
 * that plus headless jitter while still being far under the ~100ms at which a
 * response stops feeling instantaneous.
 */
const PAINT_BUDGET_MS = 67;

try {
  execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
} catch {
  console.error('verify-feedback: FAIL — the app assets could not be rebuilt');
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

const browser = await chromium.launch({
  executablePath: findChromium(),
  // Without this the headless shell has no audio device and every
  // AudioContext is born useless, which would make B1 measure nothing.
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const VIEWPORT = { width: 393, height: 852 };

/**
 * Records what the page asks of the audio and haptic hardware.
 *
 * Installed before any app code runs. It wraps rather than replaces, so the
 * real AudioContext still works and B1 measures the app's actual behaviour
 * instead of the behaviour of a stub.
 */
const SPY = `(() => {
  const events = [];
  window.__fx = events;
  const stamp = (kind) => events.push({ kind: kind, at: performance.now() });
  const RealCtx = window.AudioContext || window.webkitAudioContext;
  if (RealCtx) {
    const wrapped = function () {
      const ctx = new RealCtx();
      const realOsc = ctx.createOscillator.bind(ctx);
      ctx.createOscillator = function () { stamp('oscillator'); return realOsc(); };
      return ctx;
    };
    window.AudioContext = wrapped;
    window.webkitAudioContext = wrapped;
  }
  navigator.vibrate = function (p) { stamp('vibrate:' + JSON.stringify(p)); return true; };
})()`;

/**
 * Taps one cell and measures tap -> visible outcome.
 *
 * The observer is armed BEFORE the event is dispatched and the start time is
 * read immediately before dispatch, so the interval contains the whole path
 * from input to paint-ready DOM and nothing else.
 */
const TAP_AND_TIME = `(async () => {
  const cell = document.querySelector('#board .cell:not([disabled])');
  if (!cell) return { error: 'no playable cell' };
  const score = document.getElementById('s-score');
  const turn = document.getElementById('s-turn');
  const before = { score: score.textContent, turn: turn.textContent };

  // THE LAST CARRIER TO CHANGE, NOT THE FIRST.
  //
  // The first version stopped at whichever of score-or-turn moved first, and
  // the negative control caught it: a 250ms delay planted in front of the SCORE
  // was reported as 2.3ms, because the turn counter had already ticked. Half an
  // outcome on screen is not the outcome on screen, so the measurement runs
  // until every carrier that is going to change has changed.
  const changedAt = { 's-score': null, 's-turn': null };
  // AND WHEN THE PIXELS ACTUALLY ARRIVED, which is not the same instant.
  //
  // A MutationObserver fires when the DOM changes, and a frame has to be
  // produced after that before anyone sees anything. Anything that blocks the
  // main thread in between — a long task, a synchronous loop, a layout storm —
  // is a visual hang the player experiences as exactly the pause this rule
  // forbids, and a mutation timestamp cannot see it. The independent auditor
  // named this; B6(d) plants a 250ms block after the mutation to prove it.
  //
  // Double rAF is the measurement: the first callback runs before the frame
  // carrying the change is produced, the second after it has been committed.
  let paintedAt = null;
  const markPaint = () => {
    if (paintedAt !== null) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { paintedAt ??= performance.now(); }));
  };
  const observer = new MutationObserver(() => {
    if (changedAt['s-score'] === null && score.textContent !== before.score) changedAt['s-score'] = performance.now();
    if (changedAt['s-turn'] === null && turn.textContent !== before.turn) changedAt['s-turn'] = performance.now();
    if (changedAt['s-score'] !== null && changedAt['s-turn'] !== null) markPaint();
  });
  observer.observe(document.getElementById('status'), { subtree: true, childList: true, characterData: true });

  const fxBefore = window.__fx.length;
  // Press, hold briefly, release, click — the real sequence a finger produces,
  // so the anticipation path is exercised rather than skipped.
  cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  const fxDuringHold = window.__fx.slice(fxBefore).map(e => e.kind);
  const heldButUnchanged = score.textContent === before.score && turn.textContent === before.turn;

  cell.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  const tappedAt = performance.now();
  cell.click();
  // Give the DOM every chance to change late; a fast path finishes long before.
  await new Promise(r => setTimeout(r, 400));
  observer.disconnect();

  const times = Object.entries(changedAt);
  const missing = times.filter(([, at]) => at === null).map(([id]) => id);
  const last = times.reduce((m, [, at]) => (at === null ? m : Math.max(m, at)), -Infinity);

  return {
    heldButUnchanged: heldButUnchanged,
    duringHold: fxDuringHold,
    afterTap: window.__fx.slice(fxBefore).map(e => e.kind),
    missing: missing,
    gapMs: missing.length > 0 || last === -Infinity ? null : last - tappedAt,
    paintMs: paintedAt === null ? null : paintedAt - tappedAt,
    scoreAfter: score.textContent,
  };
})()`;

interface Tap {
  error?: string;
  heldButUnchanged: boolean;
  duringHold: string[];
  afterTap: string[];
  missing: string[];
  gapMs: number | null;
  paintMs: number | null;
  scoreAfter: string;
}

try {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript({ content: SPY });
  const page = await context.newPage();
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#board .cell', { timeout: 15_000 });

  // ── B1 + B2: ten taps, measured ──────────────────────────────────────────
  const gaps: number[] = [];
  const paints: number[] = [];
  let anticipated = 0;
  let quietDuringHold = 0;
  for (let i = 0; i < 10; i += 1) {
    const tap = (await page.evaluate(TAP_AND_TIME)) as Tap;
    if (tap.error) { fail(`B2: ${tap.error} on tap ${i}`); break; }
    if (tap.duringHold.some((k) => k === 'oscillator')) anticipated += 1;
    if (tap.heldButUnchanged) quietDuringHold += 1;
    ok(tap.gapMs !== null,
      `B2: tap ${i} left ${tap.missing?.join(' and ') ?? 'part of the display'} unchanged — the outcome was ` +
        'only partly shown, and a carrier that never updates cannot be timed at all');
    if (tap.gapMs !== null) gaps.push(tap.gapMs);
    ok(tap.paintMs !== null, `B2: tap ${i} never produced a frame carrying the outcome`);
    if (tap.paintMs !== null) paints.push(tap.paintMs);
  }

  ok(anticipated > 0,
    'B1: holding a cell produced no anticipation at all, so the tension the design puts BEFORE the commit does ' +
      'not exist and there is nothing to have inverted');
  ok(quietDuringHold === 10,
    `B1: the board changed while a cell was merely being HELD (${10 - quietDuringHold} of 10) — the outcome is ` +
      'resolving before the player has committed to it');

  const worst = gaps.length > 0 ? Math.max(...gaps) : Infinity;
  ok(worst <= FRAME_BUDGET_MS,
    `B2 THE RULE: the slowest tap took ${worst.toFixed(1)}ms to put the outcome on screen, against a ${FRAME_BUDGET_MS}ms ` +
      'budget. The result was already decided when the tap was handled, so whatever consumed that time was ' +
      'suspense played to a fixed outcome — the slot-machine pattern this design exists to invert');
  // AND THE ONE THAT MATTERS: tap to PIXELS, not tap to DOM.
  const worstPaint = paints.length > 0 ? Math.max(...paints) : Infinity;
  ok(worstPaint <= PAINT_BUDGET_MS,
    `B2 THE RULE: the slowest tap took ${worstPaint.toFixed(1)}ms to reach a committed FRAME, against a ` +
      `${PAINT_BUDGET_MS}ms budget. The DOM had changed by ${worst.toFixed(1)}ms, so the delay is in the rendering ` +
      'path rather than the script — a visual hang between the release and the screen, which is the pause the ' +
      'player actually experiences whatever the mutation timestamp says');
  console.log(
    `  B1/B2 timing: 10 taps, anticipation on ${anticipated} holds with 0 early resolutions; slowest tap-to-DOM ` +
      `${worst.toFixed(1)}ms (budget ${FRAME_BUDGET_MS}ms), slowest tap-to-FRAME ${worstPaint.toFixed(1)}ms ` +
      `(budget ${PAINT_BUDGET_MS}ms)`,
  );

  // ── B3: nothing animates the outcome ─────────────────────────────────────
  // A transition on the score is the exact mechanism B2 is trying to forbid,
  // and it can be reintroduced from a stylesheet without touching any script.
  const animated = (await page.evaluate(`(() => {
    const carriers = ['s-score', 's-turn', 's-shuffle'].map(id => document.getElementById(id));
    const offenders = [];
    for (const el of carriers) {
      const s = getComputedStyle(el);
      const dur = (t) => t.split(',').reduce((m, v) => Math.max(m, parseFloat(v) || 0), 0);
      const t = dur(s.transitionDuration) + dur(s.transitionDelay);
      const a = dur(s.animationDuration) + dur(s.animationDelay);
      if (t > 0 || a > 0) offenders.push(el.id + ' transition=' + s.transitionDuration + ' animation=' + s.animationDuration);
    }
    return offenders;
  })()`)) as string[];
  ok(animated.length === 0,
    `B3: the elements that carry the outcome are animated (${animated.join('; ')}) — a transition on the score is a ` +
      'delay between the decision and the player seeing it, however small');
  console.log('  B3 no theatre: score, turn and reshuffle counters carry no transition or animation');

  // ── B5: the mute is real and is remembered ───────────────────────────────
  await page.locator('#btn-sound').click();
  const mutedLabel = await page.locator('#btn-sound').textContent();
  ok(/off/i.test(mutedLabel ?? ''), `B5: after muting the control still reads ${JSON.stringify(mutedLabel)}`);
  const silence = (await page.evaluate(`(async () => {
    const n = window.__fx.length;
    const cell = document.querySelector('#board .cell:not([disabled])');
    cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    cell.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    cell.click();
    await new Promise(r => setTimeout(r, 150));
    return window.__fx.slice(n).map(e => e.kind);
  })()`)) as string[];
  ok(!silence.includes('oscillator'),
    `B5: a muted game still made sound (${silence.join(', ')})`);
  await page.close();

  const returning = await context.newPage();
  await returning.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await returning.waitForSelector('#board .cell', { timeout: 15_000 });
  const remembered = await returning.locator('#btn-sound').textContent();
  ok(/off/i.test(remembered ?? ''),
    `B5: the mute was not remembered — the control reads ${JSON.stringify(remembered)} on the next launch`);
  console.log('  B5 mute: silences the round and survives a relaunch');
  await context.close();

  // ── B4: a device with no audio still plays ───────────────────────────────
  // Not a hypothetical. A WebView with media blocked, a device with no output,
  // or a policy that refuses a context before a gesture all land here, and a
  // round that dies because it could not make a noise is a broken game.
  {
    const deaf = await browser.newContext({ viewport: VIEWPORT });
    await deaf.addInitScript({ content: `(() => {
      const boom = function () { throw new Error('no audio on this device'); };
      window.AudioContext = boom;
      window.webkitAudioContext = boom;
      navigator.vibrate = function () { throw new Error('no vibrator'); };
    })()` });
    const page2 = await deaf.newPage();
    const errors: string[] = [];
    page2.on('pageerror', (e) => void errors.push(e.message));
    await page2.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page2.waitForSelector('#board .cell', { timeout: 15_000 });
    await page2.evaluate(`(async () => {
      for (let t = 0; t < 12; t++) {
        const cell = document.querySelector('#board .cell:not([disabled])');
        if (!cell) break;
        cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        cell.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        cell.click();
        await new Promise(r => setTimeout(r, 20));
      }
    })()`);
    const turn = await page2.locator('#s-turn').textContent();
    ok(turn === '12/12',
      `B4: with audio and haptics both throwing, the round reached ${turn} instead of 12/12 — a silent device ` +
        'cannot finish a game');
    ok(errors.length === 0,
      `B4: a device without audio raised ${errors.length} uncaught error(s): ${errors.slice(0, 3).join('; ')}`);
    console.log(`  B4 deaf device: full 12-turn round completed with audio and vibrate both throwing, 0 page errors`);
    await deaf.close();
  }

  // ── B6: NEGATIVE CONTROLS ────────────────────────────────────────────────
  // B2 and B3 both pass trivially against a page that never changes and a
  // stylesheet that is never read.
  {
    const control = await browser.newContext({ viewport: VIEWPORT });
    await control.addInitScript({ content: SPY });
    const page3 = await control.newPage();
    await page3.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page3.waitForSelector('#board .cell', { timeout: 15_000 });

    // (a) A planted delay must be measured. This is the slot machine, built on
    //     purpose: the score is held back from a player for whom it is already
    //     decided.
    await page3.evaluate(`(() => {
      const score = document.getElementById('s-score');
      const real = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      Object.defineProperty(score, 'textContent', {
        configurable: true,
        get() { return real.get.call(this); },
        set(v) { setTimeout(() => real.set.call(this, v), 250); },
      });
    })()`);
    const delayed = (await page3.evaluate(TAP_AND_TIME)) as Tap;
    ok(delayed.gapMs !== null && delayed.gapMs > FRAME_BUDGET_MS,
      `B6 NEGATIVE CONTROL FAILED: a 250ms delay planted in front of the score was measured as ` +
        `${delayed.gapMs === null ? 'no change at all' : delayed.gapMs.toFixed(1) + 'ms'}, so B2 cannot detect ` +
        'suspense played to a decided outcome. This control has already earned its place once: it caught B2 ' +
        'stopping at the FIRST carrier to change, which let a delayed score hide behind a prompt turn counter');

    // (b) A planted transition must be seen by B3's style scan.
    const seenTransition = (await page3.evaluate(`(() => {
      const el = document.getElementById('s-turn');
      el.style.transition = 'opacity 400ms ease';
      const s = getComputedStyle(el);
      return s.transitionDuration;
    })()`)) as string;
    ok(parseFloat(seenTransition) > 0,
      `B6 NEGATIVE CONTROL FAILED: a transition planted on the turn counter reads back as ` +
        `${JSON.stringify(seenTransition)}, so B3 is not reading computed styles`);

    // (d) THE AUDITOR'S SCENARIO, PLANTED — and it took two attempts to plant
    //     it honestly, which is the interesting part.
    //
    //     The first version blocked the main thread inside the click handler
    //     itself. It failed, and correctly: a MutationObserver callback is a
    //     microtask that cannot run until the executing script yields, so the
    //     block delayed the OBSERVER as well and both numbers read 251ms. That
    //     is a real result worth recording — a block in the handler is already
    //     caught by the DOM measurement, so the auditor's concern is partly
    //     covered by what was there before.
    //
    //     What is NOT covered, and what this now plants, is a block in a LATER
    //     TASK. The observer runs promptly and reports an instant DOM change;
    //     the frame that would show it cannot be produced because the thread is
    //     busy. Only the paint timestamp sees that, and if the two numbers below
    //     do not come apart, the paint measurement is decorative.
    const blocked = await (async () => {
      const fresh = await control.newPage();
      await fresh.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
      await fresh.waitForSelector('#board .cell', { timeout: 15_000 });
      await fresh.evaluate(`(() => {
        document.getElementById('board').addEventListener('click', () => {
          // A later task: the observer has already run by the time this does.
          setTimeout(() => {
            const until = performance.now() + 250;
            while (performance.now() < until) { /* hold the main thread */ }
          }, 0);
        });
      })()`);
      const tap = (await fresh.evaluate(TAP_AND_TIME)) as Tap;
      await fresh.close();
      return tap;
    })();
    ok(blocked.paintMs !== null && blocked.paintMs > PAINT_BUDGET_MS,
      `B6 NEGATIVE CONTROL FAILED: a 250ms main-thread block held after the DOM was updated produced a ` +
        `tap-to-frame of ${blocked.paintMs === null ? 'no frame at all' : blocked.paintMs.toFixed(1) + 'ms'}, so ` +
        'B2 cannot see a visual hang and its paint measurement adds nothing over the mutation timestamp');
    ok(blocked.gapMs !== null && blocked.gapMs <= FRAME_BUDGET_MS,
      `B6: the planted block was expected to leave the DOM timing alone (it ran after the render) but tap-to-DOM ` +
        `measured ${blocked.gapMs?.toFixed(1)}ms — the control is not isolating the rendering path, so it does not ` +
        'demonstrate what it claims to');

    // (c) The audio spy must be able to record. Without this B1 and B5 are
    //     both satisfied by an instrument that records nothing.
    const recorded = (await page3.evaluate(`(() => {
      const n = window.__fx.length;
      try { new (window.AudioContext)().createOscillator(); } catch (e) {}
      try { navigator.vibrate(5); } catch (e) {}
      return window.__fx.slice(n).map(e => e.kind);
    })()`)) as string[];
    ok(recorded.length >= 2,
      `B6 NEGATIVE CONTROL FAILED: a deliberate oscillator and vibrate were recorded as ${recorded.length} event(s) ` +
        '— the spy cannot see the hardware being asked for anything');
    console.log(
      `  B6 negative controls: a 250ms delay measured at ${delayed.gapMs?.toFixed(0)}ms; a blocked frame read as ` +
        `${blocked.paintMs?.toFixed(0)}ms to paint while the DOM said ${blocked.gapMs?.toFixed(1)}ms; a planted ` +
        `transition read back as ${seenTransition}; spy caught ${recorded.length} planted effects`,
    );
    await control.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`verify-feedback: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-feedback: PASS — tension before the commit, the outcome on screen within a frame after it');
