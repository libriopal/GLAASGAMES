// web/lattice-app.ts — the playable surface for Slice 0.
//
// This host draws a board and collects taps. It contains NO RULES. Every
// question about what a turn does is answered by `lattice/session.ts`, which
// drives the same `advanceTurn` that `playRound` drives and that `verifyRound`
// replays. A host that decided anything itself would be a second executor, and
// the whole point of the session is that there is not one.
//
// It also cannot leak the lattice. The only board data it can reach is
// `view.observable` — three columns per cell, no links — until `session.links()`
// becomes legal after the reveal. That is enforced by the session throwing, not
// by this file being careful, and `verify-session` N3 plants a host that calls
// it early.
//
// Colours are read from `web/theme.ts` and written to CSS custom properties at
// startup, so this screen renders the palette `verify-theme` holds to measured
// pixels and APCA floors. A hex literal in the stylesheet would be a colour no
// oracle governs.

import { BOARD_W, CELL_COUNT, CHARGE_MAX, EMPTY, NO_LINK, STATE_CHARGED } from '../lattice/board.js';
import { DEFAULT_ROUND } from '../lattice/round.js';
import { directionOf } from '../lattice/reveal.js';
import { computeRulesFromManifest } from '../lattice/rules-manifest.js';
import { Session, type SavedSession, type SessionView } from '../lattice/session.js';
import { Telemetry, type TurnRecord } from '../lattice/telemetry.js';
import { Feedback } from './feedback.js';
import {
  AMBER,
  CHARGE_GLOW,
  CYAN,
  DIE_BODY,
  DIE_EDGE,
  FACE_INK,
  GROUND,
  GROUND_EDGE,
  GROUND_RAISED,
  INK,
  INK_DIM,
  LINK_FIELD,
  MAGENTA,
} from './theme.js';

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`lattice-app: #${id} is missing from the document`);
  return found as T;
};

/** Publishes the measured palette to CSS. */
function applyTheme(): void {
  const tokens: Readonly<Record<string, string>> = {
    '--ground': GROUND,
    '--ground-raised': GROUND_RAISED,
    '--ground-edge': GROUND_EDGE,
    '--ink': INK,
    '--ink-dim': INK_DIM,
    '--cyan': CYAN,
    '--amber': AMBER,
    '--magenta': MAGENTA,
    '--charge': CHARGE_GLOW,
    '--link': LINK_FIELD,
    '--face-ink': FACE_INK,
    '--die-body': DIE_BODY,
    '--die-edge': DIE_EDGE,
  };
  for (const [name, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(name, value);
  }
}

const board = el('board');
const proofBody = el('proof-body');
const btnReveal = el<HTMLButtonElement>('btn-reveal');
const btnNew = el<HTMLButtonElement>('btn-new');

const cells: HTMLButtonElement[] = [];
let session: Session | null = null;
let revealedLinks: Int32Array | null = null;
const telemetry = new Telemetry();
const feedback = new Feedback();

// ── Item 3: persistence ────────────────────────────────────────────────────
// Every storage access is wrapped: a private window, cleared site data, or a
// WebView with storage disabled all throw here, and a game that cannot save
// must still be a game that can be played.
const SAVE_KEY = 'glaas.lattice.round.v1';
// The playtest log is stored SEPARATELY from the round and written after every
// turn, because an Android WebView is killed without `pagehide` and a log
// flushed only on the way out is lost exactly when the tester hit something
// worth reporting. It is a second key rather than a field on the save so that a
// log which fails to parse cannot cost the player their round.
const LOG_KEY = 'glaas.lattice.log.v1';

function saveRound(): void {
  try {
    if (session && session.phase === 'playing') {
      localStorage.setItem(SAVE_KEY, JSON.stringify(session.save()));
      localStorage.setItem(LOG_KEY, JSON.stringify(telemetry.turns));
    } else {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(LOG_KEY);
    }
  } catch { /* storage unavailable; the round simply will not survive a close */ }
}

function loadSaved(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch { return null; }
}

// ── THE OBSERVATION TRAIL ──────────────────────────────────────────────────
//
// THE FINDING THIS CLOSES. The board shows the player the CURRENT state and
// never their own history, so the association between a cell they banked and
// the cell that lit up in response — the only thing that discloses the lattice
// — had to be held in their head across twelve turns. The regional learner in
// verify-learnable is scored with perfect recall of exactly that association.
// The human was given none, which is a plausible reason for a measurable edge
// to go unfelt.
//
// WHAT IT MAY CONTAIN, AND WHY THAT IS NOT A LEAK. Only pairs the player caused
// and watched: source cell banked by them, target cell whose charge rose in the
// same turn, on screen at the time. It is a record of what has already been
// displayed, not a window onto what has not. It is built from `Telemetry`'s
// per-turn records — banked index and charged cells — and NEVER from
// `session.links()`, which is the only thing in the app that knows the lattice
// and which throws before the reveal anyway.
//
// REJECTED ALTERNATIVE: drawing the arrow the reveal draws (`→n`). It would
// have been fewer lines and it is the wrong shape twice over — it collides with
// the marker verify-app A5 searches for, and text is what this screen already
// had too much of. The bar is drawn on the edge the charge left by, so the
// direction is seen rather than read.
const observed = new Map<number, number>();

/** Rebuilds the trail from the play log. Pure: same log, same trail. */
function rebuildTrail(turns: readonly TurnRecord[]): void {
  observed.clear();
  for (const rec of turns) {
    for (const target of rec.charged) {
      // Only an ADJACENT charge can be attributed to this bank. The charge
      // travels two steps, so the second hop lit a cell this bank did not feed
      // directly; recording it as the banked cell's target would be the trail
      // claiming an observation the player was never shown.
      if (directionOf(rec.banked, target) !== 4) observed.set(rec.banked, target);
    }
  }
}

function loadLog(): readonly TurnRecord[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed = raw ? (JSON.parse(raw) as TurnRecord[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function buildBoard(): void {
  board.replaceChildren();
  cells.length = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.type = 'button';
    cell.dataset['index'] = String(i);
    // The board is a grid of controls, so it is reachable without sight. The
    // label is rewritten on every render with the cell's actual contents.
    cell.setAttribute('role', 'gridcell');
    cell.addEventListener('click', () => onBank(i));
    // ── ANTICIPATION, AND ONLY WHILE THE CHOICE IS STILL OPEN ───────────────
    // The tone starts on press and stops on release or cancel. Everything it
    // does happens while the player can still lift their finger and pick a
    // different cell, which is the entire difference between tension and a
    // near-miss animation played to a result that is already fixed.
    cell.addEventListener('pointerdown', () => {
      if (!session || session.phase !== 'playing') return;
      const charge = session.view().observable[i * 3 + 2] ?? 0;
      feedback.anticipate(charge / CHARGE_MAX);
    });
    for (const done of ['pointerup', 'pointercancel', 'pointerleave']) {
      cell.addEventListener(done, () => feedback.release());
    }
    board.append(cell);
    cells.push(cell);
  }
}

/** Renders one cell from the observable projection alone. */
function renderCell(index: number, view: SessionView): void {
  const cell = cells[index]!;
  const face = view.observable[index * 3]!;
  const state = view.observable[index * 3 + 1]!;
  const charge = view.observable[index * 3 + 2]!;

  const empty = face === EMPTY;
  cell.dataset['empty'] = empty ? '1' : '0';
  cell.dataset['state'] = String(state);
  cell.disabled = empty || view.phase !== 'playing';

  const column = (index % BOARD_W) + 1;
  const row = Math.floor(index / BOARD_W) + 1;
  const link = revealedLinks?.[index] ?? NO_LINK;

  cell.replaceChildren();
  if (empty) {
    cell.append('·');
    cell.setAttribute('aria-label', `Row ${row} column ${column}, empty`);
  } else {
    cell.append(String(face));
    if (charge > 0) {
      const badge = document.createElement('span');
      badge.className = 'charge';
      badge.textContent = `+${charge}`;
      cell.append(badge);
    }
    if (link !== NO_LINK) {
      const badge = document.createElement('span');
      badge.className = 'link';
      badge.textContent = `→${link}`;
      cell.append(badge);
    }
    const charged = state === STATE_CHARGED ? ', charged' : '';
    cell.setAttribute('aria-label', `Row ${row} column ${column}, face ${face}, charge ${charge}${charged}`);
  }

  // The trail is drawn on every cell the player has banked, empty or not: the
  // cell refills but its link does not change for the round, so the mark is
  // still true about the cell that is there now.
  const seen = observed.get(index);
  if (seen !== undefined) {
    const dir = directionOf(index, seen);
    if (dir !== 4) {
      const bar = document.createElement('span');
      bar.className = 'trail';
      bar.dataset['dir'] = String(dir);
      cell.append(bar);
      const side = ['top', 'right', 'bottom', 'left'][dir];
      const label = cell.getAttribute('aria-label') ?? '';
      cell.setAttribute('aria-label', `${label}, you saw this feed the cell to the ${side}`);
    }
  }
}

let lastAnnouncedTurn = -1;

function render(view: SessionView): void {
  el('s-score').textContent = String(view.score);
  el('s-turn').textContent = `${view.turn}/${view.turnsTotal}`;
  el('s-shuffle').textContent = String(view.reshuffles);
  for (let i = 0; i < CELL_COUNT; i += 1) renderCell(i, view);
  btnReveal.disabled = view.phase !== 'ended';

  // Item 5. Announced only when the turn actually advances: a live region that
  // re-fires on every render talks over itself and gets switched off.
  if (view.turn !== lastAnnouncedTurn) {
    lastAnnouncedTurn = view.turn;
    el('live').textContent = view.phase === 'ended'
      ? `Round over. Final score ${view.score}.`
      : `Turn ${view.turn} of ${view.turnsTotal}. Score ${view.score}.`;
  }
}

function onBank(index: number): void {
  if (!session || session.phase !== 'playing') return;
  const before = session.view();
  const view = session.bank(index);
  // Recorded BEFORE the turn is applied for the board, after it for the
  // consequence: what the player could see when they chose, and what happened.
  telemetry.record(before.turn, index, session.lastCharged, before.observable, performance.now());
  rebuildTrail(telemetry.turns);

  // ── THE SCREEN FIRST. ALWAYS. ─────────────────────────────────────────────
  // The outcome is already decided by the line above, so nothing may come
  // between it and the player seeing it — not a sound, not a transition, not an
  // await. Feedback is what happens AFTER the truth is on screen.
  // `verify-feedback` B2 measures this gap and fails the build if it grows.
  render(view);
  feedback.commit();
  if (view.phase === 'ended') feedback.finish();

  saveRound();
  if (view.phase === 'ended') {
    proofBody.textContent = 'Round over. Show the answer to check the hidden layout against the lock made before you played.';
  }
}

/**
 * A seed pair for one round.
 *
 * The server seed is generated ON THE DEVICE here, because there is no server —
 * the app has no INTERNET permission. That is worth stating plainly rather than
 * implying a house that does not exist: in this build commit-reveal proves the
 * seed was fixed before the round and that the round replays under the
 * committed rules. It does not prove an absent operator behaved, because there
 * is no operator to constrain yet. The mechanism is here, wired and checkable,
 * ready for the round to be issued remotely.
 */
function freshSeeds(): { readonly server: string; readonly client: string } {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { server: hex.slice(0, 16), client: hex.slice(16) };
}

async function newRound(): Promise<void> {
  revealedLinks = null;
  lastAnnouncedTurn = -1;
  const seeds = freshSeeds();
  const rules = computeRulesFromManifest();
  session = await Session.open(seeds.server, seeds.client, rules, DEFAULT_ROUND);
  telemetry.begin(performance.now());
  observed.clear();
  saveRound();
  proofBody.innerHTML =
    `Layout locked <span class="ok">before</span> turn 1.<br>` +
    `lock <code>${session.commitment.hash.slice(0, 32)}…</code><br>` +
    `rules <code>${session.commitment.rulesHash.slice(0, 32)}…</code>`;
  render(session.start());
}

async function onReveal(): Promise<void> {
  if (!session || session.phase !== 'ended') return;
  const { holds } = await session.reveal();
  revealedLinks = session.links();
  const bundle = session.bundle();

  // Verified HERE, in front of the player, against the seed that was hidden
  // until a moment ago. Reporting the app's own claim would be the app
  // vouching for itself.
  const { verifyRound } = await import('../lattice/round.js');
  const check = verifyRound(bundle.seed, bundle.config, bundle.actions, bundle.score, bundle.digest);

  // The bundle is published on the global object so anything outside the page
  // can recompute the round independently — `verify-app` A4 does exactly that
  // from Node, and a curious player can do it from a console. Published only
  // here, after the reveal: exposing it mid-round would hand out the seed and
  // with it the lattice.
  (globalThis as { __bundle?: unknown }).__bundle = {
    seed: bundle.seed,
    actions: [...bundle.actions],
    score: bundle.score,
    digest: bundle.digest,
  };

  const mark = (good: boolean, text: string): string =>
    `<span class="${good ? 'ok' : 'bad'}">${good ? '✓' : '✗'}</span> ${text}`;

  // The playtest log, offered for export and sent nowhere. There is no network
  // permission, so the only way this leaves the device is the tester choosing
  // to share the text.
  (globalThis as { __session?: unknown }).__session =
    telemetry.build(bundle.seed, bundle.score, session.result?.conceded ?? false);

  proofBody.innerHTML = [
    mark(holds, 'the hidden layout matches the one locked in before turn 1 — it was not changed while you played'),
    mark(check.ok, `replaying your ${bundle.actions.length} moves gives the same score, ${check.score}`),
    `<br>round key <code>${bundle.reveal.serverSeed}</code>`,
    `fingerprint <code>0x${(bundle.digest >>> 0).toString(16)}</code>`,
    `<br>Links are now shown on each cell as <span style="color:var(--link)">→n</span>.`,
  ].join('<br>');

  render(session.view());
}

/**
 * Resumes an interrupted round, or deals a new one.
 *
 * A resume REPLAYS the saved actions through the same executor rather than
 * restoring a board, so a resumed round is indistinguishable from one that was
 * never interrupted. A save under different rules is discarded rather than
 * continued: its commitment names a ruleset this build is not playing.
 */
async function boot(): Promise<void> {
  const saved = loadSaved();
  if (saved) {
    const restored = await Session.restore(saved, computeRulesFromManifest());
    if (restored && restored.phase === 'playing') {
      session = restored;
      revealedLinks = null;
      lastAnnouncedTurn = -1;
      // The log is picked up where the kill left it, not restarted. A resumed
      // round that logged from turn 1 again would report the player's second
      // half as a whole session.
      telemetry.adopt(loadLog(), performance.now());
      rebuildTrail(telemetry.turns);
      proofBody.innerHTML =
        `Round resumed at turn ${restored.view().turn}. Layout locked ` +
        `<span class="ok">before</span> turn 1.<br>lock <code>${restored.commitment.hash.slice(0, 32)}…</code>`;
      render(restored.view());
      return;
    }
  }
  await newRound();
}

// Item 4. The dismissal is remembered so a returning player is not taught twice.
const HOWTO_KEY = 'glaas.lattice.howto.v1';
const howto = el('howto');
const btnHowto = el<HTMLButtonElement>('btn-howto');
try { if (localStorage.getItem(HOWTO_KEY) === 'done') howto.hidden = true; } catch { /* keep it shown */ }
btnHowto.addEventListener('click', () => {
  howto.hidden = true;
  try { localStorage.setItem(HOWTO_KEY, 'done'); } catch { /* nothing to remember with */ }
});

// Sound is on by default and one tap from off. A game that makes noise with no
// visible way to stop it gets muted at the OS level and never unmuted, which
// costs the feedback its whole purpose.
const btnSound = el<HTMLButtonElement>('btn-sound');
function paintSound(): void {
  btnSound.textContent = feedback.muted ? 'Sound off' : 'Sound on';
  btnSound.setAttribute('aria-pressed', feedback.muted ? 'false' : 'true');
}
btnSound.addEventListener('click', () => {
  feedback.setMuted(!feedback.muted);
  paintSound();
});
paintSound();

applyTheme();
buildBoard();
btnNew.addEventListener('click', () => void newRound());
btnReveal.addEventListener('click', () => void onReveal());
// Android kills a backgrounded WebView without warning, so the save happens on
// the way out as well as after every turn.
globalThis.addEventListener('pagehide', saveRound);
void boot();
