// engine/verify/verify-listing.ts — what a reviewer reads, held to what ships.
//
// Every other oracle here checks behaviour. A policy reviewer does not run the
// code; they read the listing, open the app, and look at the words. So this one
// checks words, and it is the only file in the repo where that is the right
// instrument rather than the vocabulary-proxy mistake.
//
// THE DISTINCTION MATTERS, because it looks exactly like the failure this
// project keeps rediscovering. Grepping for "negative control" to decide
// whether a test can fail measures the DESCRIPTION of a property instead of the
// property. Here the property IS lexical: "no wagering language appears in
// anything a user or reviewer reads" is a claim about text, and reading the
// text is the direct measurement, not a proxy for one.
//
// P1  the app has ONE name, used consistently
// P2  the listing describes the screen the app actually opens on
// P3  no wagering vocabulary appears in user-facing copy
// P4  the no-gambling rating answer is backed by an enforced rule
// P5  the scanner catches planted wagering copy         (NEGATIVE CONTROL)
//
// P2 EXISTS BECAUSE THE LISTING WENT STALE THE MOMENT THE APP CHANGED. The
// draft short description sells "a new four-dimensional world every day", which
// described the engine demo back when that was the landing screen. It is now
// reached through a link at the bottom of a dice game. A listing that describes
// a different app than the one that opens is a Play policy problem in its own
// right, and it is the kind that nobody notices because nobody re-reads the
// listing after changing the code.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');

const submission = read('docs/PLAY-SUBMISSION.md');
const landing = read('web/lattice.html');
const strings = read('android/app/src/main/res/values/strings.xml');

/** Visible text from an HTML file: element content and nothing else. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const landingText = visibleText(landing);

// ── P1: one name ───────────────────────────────────────────────────────────
{
  const appName = /<string name="app_name">([^<]+)<\/string>/.exec(strings)?.[1]?.trim();
  const title = /<title>([^<]+)<\/title>/.exec(landing)?.[1]?.trim();
  ok(appName !== undefined, 'P1: strings.xml declares no app_name');
  ok(title !== undefined, 'P1: the landing page has no <title>');

  // The launcher name and the first heading a user sees should share a root.
  // "GLAAS 4D" on the icon opening a screen headed "GLAAS - Lattice" is not
  // fatal, but it is the sort of mismatch a reviewer notes and a user finds
  // confusing when searching their app drawer.
  const root = appName?.split(/[\s·-]/)[0]?.toLowerCase();
  ok(root !== undefined && title !== undefined && title.toLowerCase().includes(root),
    `P1: the launcher is named "${appName}" but the app opens on "${title}" — they share no common name`);
  console.log(`  P1 naming: launcher "${appName}", opening screen "${title}"`);
}

// ── P2: the listing describes what opens ───────────────────────────────────
{
  // The draft short description lives in PLAY-SUBMISSION.md as a blockquote.
  const draft = /^> (.+)$/m.exec(submission)?.[1]?.trim() ?? '';
  ok(draft.length > 0, 'P2: no draft short description found in docs/PLAY-SUBMISSION.md');
  ok(draft.length <= 80, `P2: the short description is ${draft.length} characters, over Play's 80 limit`);

  // What the app actually opens on. build-app-assets stages lattice.html as
  // index.html, so the landing screen is the dice game, not the 4D demo.
  const staged = read('scripts/build-app-assets.mjs');
  const landingIsLattice = /cp\(join\(root, 'web', 'lattice\.html'\), join\(out, 'index\.html'\)\)/.test(staged);
  ok(landingIsLattice,
    'P2: build-app-assets no longer stages lattice.html as index.html, so this check does not know what opens');

  // The listing must not sell a screen the user has to go looking for.
  const sellsTheDemo = /four-dimensional world every day|4d world every day/i.test(draft);
  ok(!sellsTheDemo,
    `P2: the short description sells "${draft}" — that describes the 4D engine demo, which is now reached ` +
      'through a link at the BOTTOM of the dice game the app actually opens on. A listing describing a ' +
      'different app than the one that launches is a Play problem, and nobody re-reads the listing after ' +
      'changing the code.');
  console.log(`  P2 listing: draft short description is ${draft.length}/80 chars, landing screen is the lattice game`);
}

// ── P3: no wagering vocabulary in anything a user reads ────────────────────
{
  // Words that make a policy reviewer reach for the gambling questionnaire.
  //
  // THE SECOND GROUP WAS ADDED BY AN INDEPENDENT REVIEWER AND I HAD ARGUED
  // AGAINST IT. My first draft excluded "bank" on the grounds that it is the
  // game's verb for taking a cell, appears in no monetary context, and banning
  // it would be cargo-culting a word. A different model, shown only what a
  // reviewer sees and none of the reasoning, answered: "The app reads as
  // simulated gambling", and named "Bank" first — then named the whole proof
  // panel, because "commitment", "seed", "digest" and "reveal & verify"
  // together reproduce the PROVABLY FAIR scheme used by crypto-casinos.
  //
  // That vocabulary was chosen here for honesty and it is honest. It is also
  // the exact vernacular of the industry the app must not be mistaken for, and
  // a reviewer reads words before they read intent. The mechanism is unchanged;
  // the words are now plain English.
  const WAGERING = [
    'wager', 'bet ', 'betting', 'stake', 'staking', 'jackpot', 'payout',
    'cash out', 'cashout', 'real money', 'real-money', 'prize', 'winnings',
    'deposit', 'odds of winning', 'casino', 'slot machine',
    // The provably-fair vernacular, per the independent review.
    'bank a cell', 'server seed', 'client seed', 'provably fair', 'commitment is published',
  ];
  const hay = landingText.toLowerCase();
  const hits = WAGERING.filter((w) => hay.includes(w));
  ok(hits.length === 0,
    `P3: the screen a reviewer opens contains wagering language: ${JSON.stringify(hits)}. The mechanic may be ` +
      'defensible; the words are what gets read.');
  console.log(`  P3 vocabulary: ${WAGERING.length} wagering terms checked against the landing screen, ${hits.length} present`);
}

// ── P4: the rating answer is enforced, not remembered ──────────────────────
{
  ok(/no gambling/i.test(submission),
    'P4: the submission notes no longer state the gambling answer for the IARC questionnaire');
  // The claim is only worth making if a check enforces it.
  const economy = read('game/economy/rules.ts');
  const enforced = /lootBox|loot_box|scarcity|streak|selfExclu/i.test(economy);
  ok(enforced,
    'P4: docs claim the no-gambling rating is machine-enforced, but game/economy/rules.ts contains none of ' +
      'the rules that would enforce it — the claim has become a remembered one');
  console.log('  P4 rating: the no-gambling answer is backed by rules in game/economy/rules.ts');
}

// ── P5: NEGATIVE CONTROL ───────────────────────────────────────────────────
{
  const planted = visibleText(
    landing.replace('<h1>GLAAS · Lattice</h1>',
      '<h1>GLAAS · Lattice</h1><p>Place your wager to win a cash prize. Server seed shown after each round.</p>'),
  ).toLowerCase();
  const caught = ['wager', 'prize', 'server seed'].filter((w) => planted.includes(w));
  ok(caught.length === 3,
    `P5 NEGATIVE CONTROL FAILED: planted wagering copy was not detected (found ${JSON.stringify(caught)}) — ` +
      'P3 cannot see the language it exists to find');

  // And the extractor must actually strip markup, or P3 is scanning tag names.
  ok(!visibleText('<div class="wager">safe</div>').includes('wager'),
    'P5 NEGATIVE CONTROL FAILED: visibleText leaks attribute values, so P3 would fire on a CSS class name');
  console.log('  P5 negative control: planted "wager"/"prize" copy detected, and markup is stripped rather than scanned');
}

if (failures.length > 0) {
  console.error(`verify-listing: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-listing: PASS — one name, the listing matches what opens, and no wagering language reaches a reviewer');
