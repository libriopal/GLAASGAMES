// engine/verify/verify-playlog.ts — the playtest log survives a kill, and
// nothing leaves the device.
//
// (Named for the play log rather than "telemetry" because foundry/telemetry
// already owns that word and a second `verify-telemetry` would be two oracles
// answering to one name.)
//
// L1  the log records one well-formed entry per turn
// L2  it is on disk after every turn, so a kill mid-round loses nothing
// L3  a kill — nothing written on the way out counts — and both resume
// L4  the logged choices ARE the round's actions and each record carries the
//     board AS IT WAS WHEN THE CHOICE WAS MADE, so the learner can be replayed
//     against a human's decisions and get that human's score
// L5  NOTHING IS TRANSMITTED: zero network attempts of any kind, all round
// L6  negative controls for every one of the above
// L7  no native JavaScript bridge — the channel L5 cannot see  (AUDITOR FINDING)
//
// WHY L5 IS SHAPED THIS WAY. Grepping this repository for `fetch(` would be a
// vocabulary proxy: it measures the words in the source, not the behaviour of
// the build, and it cannot see a transmission made by a dependency or by a
// string passed to `new Function`. So the page is instrumented at the seams a
// transmission has to pass through — fetch, XMLHttpRequest, sendBeacon,
// WebSocket, EventSource, and an <img> or <script> pointed off-origin — plus
// Playwright's own request log, which sees anything that reaches the network
// stack whether or not this file thought of it. L6 then plants a page that
// calls fetch and requires the instrument to catch it, because an instrument
// that has never seen a transmission is not known to be able to.
//
// The second, stronger guarantee is the platform's: the APK declares no
// permissions at all, so Android refuses the socket regardless of what the
// JavaScript asks for. L5 checks that the app does not ask; K-series checks the
// shipped artifact. Both, because either alone is one witness.
//
// AND THE INSTRUMENT ABOVE HAS A BLIND SPOT AN AUDITOR HAD TO POINT OUT. It
// watches web APIs in a browser. A WebView is not a browser: a native bridge
// installed with `addJavascriptInterface` is none of those APIs, makes no
// request, and needs no permission, so L5 would report silence while the log
// left through Kotlin. L7 closes it here and verify-apk K6 closes it on the
// built dex. The lesson is worth keeping: an instrument that measures the wrong
// environment reports confidently about a system it is not observing.

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

try {
  execFileSync('npm', ['run', 'build:web'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('npm', ['run', 'build:app-assets'], { cwd: ROOT, stdio: 'pipe' });
} catch {
  console.error('verify-playlog: FAIL — the app assets could not be rebuilt');
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
const LOG_KEY = 'glaas.lattice.log.v1';

/**
 * Wraps every way a page can put bytes on a wire, before any app code runs.
 *
 * It RECORDS rather than blocks. A blocking shim proves only that a blocked
 * call fails; recording proves the call was never made, and L6 needs the shim
 * to still be capable of reporting one.
 */
const INSTRUMENT = `(() => {
  const attempts = [];
  const note = (how, where) => { attempts.push(how + ' ' + String(where)); };
  const realFetch = window.fetch;
  window.fetch = function (input, init) { note('fetch', input && input.url || input); return realFetch.apply(this, arguments); };
  const realOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { note('xhr', u); return realOpen.apply(this, arguments); };
  if (navigator.sendBeacon) {
    const realBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) { note('beacon', u); return realBeacon(u, d); };
  }
  const RealWS = window.WebSocket;
  window.WebSocket = function (u, p) { note('websocket', u); return new RealWS(u, p); };
  if (window.EventSource) {
    const RealES = window.EventSource;
    window.EventSource = function (u, c) { note('eventsource', u); return new RealES(u, c); };
  }
  // An off-origin <img> or <script> src is a GET with a payload in the query
  // string, which is how a page with no fetch call still phones home.
  for (const [Ctor, prop] of [[HTMLImageElement, 'src'], [HTMLScriptElement, 'src']]) {
    const d = Object.getOwnPropertyDescriptor(Ctor.prototype, prop);
    Object.defineProperty(Ctor.prototype, prop, {
      configurable: true,
      get() { return d.get.call(this); },
      set(v) { note(Ctor.name + '.' + prop, v); return d.set.call(this, v); },
    });
  }
  window.__attempts = attempts;
})()`;

/** Clicks `turns` cells and reports the page state plus the stored log. */
const PLAY = (turns: number): string => `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (let t = 0; t < ${turns}; t++) {
    const cell = document.querySelector('#board .cell:not([disabled])');
    if (!cell) break;
    cell.click();
    await sleep(20);
  }
  let log = null;
  try { log = JSON.parse(localStorage.getItem('${LOG_KEY}') || 'null'); } catch (e) {}
  return {
    turn: document.getElementById('s-turn').textContent,
    score: document.getElementById('s-score').textContent,
    log: log,
    attempts: window.__attempts ? window.__attempts.slice() : null,
  };
})()`;

interface TurnRecord {
  turn: number; banked: number; charged: number[]; atMs: number;
  faces: number[]; charges: number[];
}
interface Played { turn: string; score: string; log: TurnRecord[] | null; attempts: string[] | null }

/** Every request the browser actually issued, whatever the page thought. */
const seen: string[] = [];

try {
  // ── L1 + L2 + L5: one round, watched ─────────────────────────────────────
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript({ content: INSTRUMENT });
  context.on('request', (r) => void seen.push(`${r.method()} ${r.url()}`));

  const page = await context.newPage();
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#board .cell', { timeout: 15_000 });

  const five = (await page.evaluate(PLAY(5))) as Played;

  // L1: the log exists, is the right length, and holds the pre-turn board.
  ok(Array.isArray(five.log), 'L1: nothing was logged after five turns — the closed test would produce no data at all');
  const log = five.log ?? [];
  ok(log.length === 5, `L1: five turns were played and ${log.length} were logged`);
  for (const [i, rec] of log.entries()) {
    ok(rec.turn === i, `L1: record ${i} is labelled turn ${rec.turn} — the log is not in turn order`);
    ok(rec.faces.length === 36 && rec.charges.length === 36,
      `L1: record ${i} carries ${rec.faces.length} faces and ${rec.charges.length} charges, not a 6x6 board`);
    ok(rec.banked >= 0 && rec.banked < 36, `L1: record ${i} banks cell ${rec.banked}, which is not on the board`);
    ok(rec.atMs >= 0 && rec.atMs < 3_600_000, `L1: record ${i} is stamped ${rec.atMs}ms, which is not an elapsed time`);
  }
  // WHETHER THE SNAPSHOT IS PRE-TURN IS NOT CHECKED HERE, and the two checks
  // that used to try are gone rather than kept alongside a better one.
  //
  //   `faces[banked] !== 0` — "the banked cell cannot already be empty" — is
  //   VACUOUS. The bank empties the cell and the refill fills it again on the
  //   same turn, so a post-turn snapshot shows a face there too. The mutation
  //   harness proved it: a mutant that logs the board AFTER the turn resolved
  //   SURVIVED this check.
  //
  //   "all five boards must be distinct" was worse — it fired on a legitimate
  //   round, because a refill can hand back the face that was just taken.
  //
  // The property is exact, so it gets an exact instrument: L4 replays the round
  // in Node from the seed and compares every recorded board, cell by cell,
  // against the board that actually existed when the choice was made. That
  // needs the seed, which does not exist until the reveal, which is why it
  // lives there and not here.
  ok(log.length === 5, 'L2: the log is written only at the end, so a kill mid-round loses the session');
  console.log(`  L1/L2 log: ${log.length} records, well-formed and persisted mid-round`);

  // ── L3: a kill, not a close ──────────────────────────────────────────────
  // `page.close()` fires `pagehide`, and an app that saves only on the way out
  // passes a close-and-reopen test while still losing everything to the kill
  // Android actually performs. verify-resume R1 is that weaker test; this is
  // the stronger one.
  //
  // The first version crashed the renderer through CDP `Page.crash`. It worked
  // — and took the whole headless browser's target factory with it, so every
  // later check died with "Target.createTarget: Not supported". A crash that
  // ends the instrument cannot be used to measure what survives it.
  //
  // So the kill is modelled by SEALING STORAGE instead: `setItem` is replaced
  // with a no-op immediately before the page goes away, which makes every
  // write from that instant onward — `pagehide` included — vanish exactly as a
  // SIGKILL would have made it vanish. What is on disk afterwards is only what
  // the per-turn writes put there. This is deterministic where a real crash is
  // a race against Chromium's storage flush, and it tests the same property:
  // NOTHING WRITTEN ON THE WAY OUT COUNTS.
  await page.evaluate(`(() => {
    localStorage.setItem = function () {};
    localStorage.removeItem = function () {};
    localStorage.clear = function () {};
  })()`);
  await page.close({ runBeforeUnload: false }).catch(() => { /* already gone */ });

  const after = await context.newPage();
  await after.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await after.waitForSelector('#board .cell', { timeout: 15_000 });
  const resumedTurn = await after.locator('#s-turn').textContent();
  ok(resumedTurn === five.turn,
    `L3: the round was killed at turn ${five.turn} and came back at ${resumedTurn}`);
  const recovered = (await after.evaluate(
    `JSON.parse(localStorage.getItem('${LOG_KEY}') || 'null')`,
  )) as TurnRecord[] | null;
  ok(recovered?.length === 5,
    `L3: after a kill the log holds ${recovered?.length ?? 0} of the 5 turns that were played`);

  // ── L4: the logged choices are the round's actions ───────────────────────
  const rest = (await after.evaluate(PLAY(12))) as Played;
  await after.locator('#btn-reveal').click();
  await after.waitForFunction(
    `(() => { const d = document.getElementById('proof-body'); return d && d.textContent.includes('round key'); })()`,
    undefined,
    { timeout: 15_000 },
  );
  const record = (await after.evaluate('globalThis.__session')) as
    { version: number; seed: number; turns: TurnRecord[]; score: number; conceded: boolean } | undefined;
  const bundle = (await after.evaluate('globalThis.__bundle')) as
    { seed: number; actions: number[]; score: number; digest: number } | undefined;

  ok(record !== undefined, 'L4: the finished round published no session log for the tester to export');
  ok(bundle !== undefined, 'L4: the finished round published no bundle');
  if (record && bundle) {
    ok(record.turns.length === bundle.actions.length,
      `L4: the log holds ${record.turns.length} decisions and the round records ${bundle.actions.length} actions — ` +
        'a crash silently cost the log turns the round still counted');
    const logged = record.turns.map((r) => r.banked);
    ok(logged.join(',') === bundle.actions.join(','),
      `L4: the logged choices [${logged.slice(0, 6)}…] are not the round's actions [${bundle.actions.slice(0, 6)}…], ` +
        'so replaying the learner against this log would be replaying it against a different game');
    // And the log's own seed and score must be the ones a replay would use.
    ok(record.seed === bundle.seed, `L4: the log's seed ${record.seed} is not the round's ${bundle.seed}`);
    const { DEFAULT_ROUND, advanceTurn, beginRound, verifyRound } = await import('../../lattice/round.js');
    const check = verifyRound(bundle.seed, DEFAULT_ROUND, logged, record.score, bundle.digest);
    ok(check.ok,
      `L4: replaying the LOGGED choices from the LOGGED seed gives ${check.score}, not the logged score ` +
        `${record.score} — the export cannot reproduce the session it describes`);

    // ── THE BOARD IN EACH RECORD IS THE ONE THE PLAYER CHOSE FROM ──────────
    //
    // This is the assertion L1 could not make, and it is exact rather than
    // circumstantial. The round is stepped here in Node through the same
    // `advanceTurn` the app drove; before each step the board that genuinely
    // existed at that moment is compared, cell by cell, with the board the log
    // says was on screen. A log snapshotted one instruction too late disagrees
    // on the first turn.
    //
    // It matters because the whole purpose of the log is to replay the regional
    // learner against a human's decisions. A learner shown the board as it was
    // AFTER the choice is being asked a different question — it would score the
    // human against information they did not have, and the answer would look
    // like a measurement.
    const replay = beginRound(bundle.seed);
    let mismatch = -1;
    let detail = '';
    for (const [i, rec] of record.turns.entries()) {
      const obs = replay.board.observable();
      const faces: number[] = [];
      const charges: number[] = [];
      for (let c = 0; c < obs.length / 3; c += 1) {
        faces.push(obs[c * 3]!);
        charges.push(obs[c * 3 + 2]!);
      }
      if (faces.join(',') !== rec.faces.join(',') || charges.join(',') !== rec.charges.join(',')) {
        mismatch = i;
        detail = `logged faces[${rec.banked}]=${rec.faces[rec.banked]} charges=${rec.charges[rec.banked]}, ` +
          `actual faces[${rec.banked}]=${faces[rec.banked]} charges=${charges[rec.banked]}`;
        break;
      }
      advanceTurn(replay, DEFAULT_ROUND, () => rec.banked);
    }
    ok(mismatch === -1,
      `L4: record ${mismatch} does not describe the board that existed when the choice was made (${detail}) — the ` +
        'log is snapshotted at the wrong moment, so replaying a learner against it judges the human against a ' +
        'position they never saw');
    console.log(
      `  L3/L4 kill + replay: storage sealed and killed at turn ${five.turn}, resumed, finished; ` +
        `${record.turns.length} logged choices replay to score ${check.score}`,
    );
  }

  // ── L5: nothing was transmitted ──────────────────────────────────────────
  const attempts = [...(five.attempts ?? []), ...(rest.attempts ?? [])];
  ok(attempts.length === 0,
    `L5: the page attempted ${attempts.length} transmission(s) during a round: ${attempts.slice(0, 5).join('; ')}`);
  const offOrigin = seen.filter((r) => !r.includes(`127.0.0.1:${port}`));
  ok(offOrigin.length === 0,
    `L5: the browser issued ${offOrigin.length} off-origin request(s): ${offOrigin.slice(0, 5).join('; ')}`);
  const writes = seen.filter((r) => /^(POST|PUT|PATCH) /.test(r));
  ok(writes.length === 0, `L5: the page sent ${writes.length} write request(s): ${writes.slice(0, 5).join('; ')}`);
  console.log(`  L5 silence: 0 transmission attempts, 0 off-origin requests across ${seen.length} same-origin loads`);

  // The platform's own guarantee, checked rather than assumed.
  //
  // THIS WAS "ZERO PERMISSIONS" AND IS NOW AN ALLOWLIST, and the change is worth
  // defending rather than slipping through. Item 4 added a haptic tick, which
  // needs VIBRATE — a normal permission, granted at install, never prompted,
  // that drives a motor and reads nothing. "Zero" would have forced a choice
  // between a feature and a check, and the tempting resolution is to delete the
  // assertion.
  //
  // An allowlist is the stronger instrument, not the weaker one. Every entry
  // has to carry a written argument for why it cannot carry data off the
  // device, and anything not on the list fails — INTERNET, Bluetooth, NFC,
  // storage, or something a library adds without anyone noticing. A count
  // cannot tell those apart from a vibration motor; a list has to say.
  const ALLOWED: Readonly<Record<string, string>> = {
    'android.permission.VIBRATE': 'drives the vibration motor; it is an output, reads nothing and opens no channel',
  };
  const manifest = readFileSync(join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const declared = [...manifest.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1]!);
  const unlisted = declared.filter((name) => !(name in ALLOWED));
  ok(unlisted.length === 0,
    `L5: the manifest declares ${unlisted.length} permission(s) with no argument for why they cannot carry data ` +
      `out: ${unlisted.join(', ')}. Add it to the allowlist WITH a reason, or remove it — "no data collected" is ` +
      'enforced by the platform only for as long as the platform is given nothing to enforce with');
  // The control: the allowlist must still reject the thing it exists to reject.
  ok(!('android.permission.INTERNET' in ALLOWED),
    'L5 NEGATIVE CONTROL FAILED: INTERNET is on the allowlist, so the check would pass an app that can transmit');

  // ── L7: THE NATIVE BRIDGE ────────────────────────────────────────────────
  //
  // FOUND BY THE INDEPENDENT AUDITOR, AND IT WAS RIGHT. Everything above
  // watches web APIs in Chromium. `WebView.addJavascriptInterface` injects a
  // native Kotlin object into the JavaScript context, and a call on it is not a
  // web API, not a network request, and needs no permission — so the L5
  // instrument would report perfect silence while the log walked out through
  // the host activity. The oracle was measuring a browser and calling it a
  // WebView.
  //
  // (The auditor also said Bluetooth, NFC and USB need no permission. They do,
  // and the check above requires the manifest to declare none at all. The
  // bridge finding stands on its own without that.)
  //
  // This is the SOURCE witness, so a bridge is caught by `verify:engine`
  // without waiting for an APK build. verify-apk K6 is the ARTIFACT witness,
  // scanning the dex, which also sees a bridge introduced by a library that
  // never appears in this file.
  const kotlin = readFileSync(join(ROOT, 'android/app/src/main/java/games/glaas/fourd/MainActivity.kt'), 'utf8');
  ok(!kotlin.includes('addJavascriptInterface'),
    'L7: the host activity installs a native JavaScript bridge, which carries data out of the page without a ' +
      'network request, without a permission, and without touching anything the L5 instrument watches');
  ok(!kotlin.includes('@JavascriptInterface'),
    'L7: the host activity exposes a @JavascriptInterface method to the page');
  // The control: this scan must be able to find something that IS there.
  //
  // It earned its place on the first run. The string was `setJavaScriptEnabled`
  // — the name in the dex — and the SOURCE spells it `javaScriptEnabled = true`
  // in a Kotlin property block. The control failed, correctly, and it was the
  // instrument that was wrong rather than the app: without it, "no bridge
  // found" would have been reported by a scan looking for the wrong strings.
  ok(kotlin.includes('javaScriptEnabled'),
    'L7 NEGATIVE CONTROL FAILED: javaScriptEnabled, which this activity certainly sets, was not found either — ' +
      'the scan is reading the wrong file, so its silence about addJavascriptInterface means nothing');
  console.log('  L7 bridge: no addJavascriptInterface and no @JavascriptInterface in the host activity');

  await context.close();

  // ── L6: NEGATIVE CONTROLS ────────────────────────────────────────────────
  {
    const control = await browser.newContext({ viewport: VIEWPORT });
    await control.addInitScript({ content: INSTRUMENT });
    const probe = await control.newPage();
    await probe.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await probe.waitForSelector('#board .cell', { timeout: 15_000 });

    // (a) The instrument must be able to SEE a transmission. Without this L5
    //     passes on a shim that records nothing.
    const caught = (await probe.evaluate(`(async () => {
      try { await fetch('/nothing-here'); } catch (e) {}
      try { navigator.sendBeacon && navigator.sendBeacon('/beacon', 'x'); } catch (e) {}
      const img = new Image(); img.src = '/pixel.gif';
      return window.__attempts.slice();
    })()`)) as string[];
    ok(caught.length >= 3,
      `L6 NEGATIVE CONTROL FAILED: a page that called fetch, sendBeacon and set an image src was recorded as ` +
        `${caught.length} attempt(s) — the L5 instrument cannot see a transmission, so its silence means nothing`);

    // (b) A cleared log must come back empty, or L2/L3 could be reading a log
    //     that was never written.
    await probe.evaluate(`localStorage.removeItem('${LOG_KEY}')`);
    const emptied = (await probe.evaluate(
      `JSON.parse(localStorage.getItem('${LOG_KEY}') || 'null')`,
    )) as TurnRecord[] | null;
    ok(emptied === null,
      'L6 NEGATIVE CONTROL FAILED: removing the log key left a log behind, so L3 is not reading storage');

    // (c) And a fresh round must not inherit the previous round's log.
    await probe.locator('#btn-new').click();
    await probe.waitForTimeout(200);
    const fresh = (await probe.evaluate(
      `JSON.parse(localStorage.getItem('${LOG_KEY}') || '[]')`,
    )) as TurnRecord[];
    ok(fresh.length === 0,
      `L6 NEGATIVE CONTROL FAILED: a new round starts with ${fresh.length} turns already logged, so L1's count ` +
        'could be carried over from an earlier session');
    console.log(`  L6 negative controls: instrument caught ${caught.length} planted transmissions; log clears and resets`);
    await control.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`verify-playlog: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-playlog: PASS — the log survives a kill, replays the human\'s round, and nothing is transmitted');
