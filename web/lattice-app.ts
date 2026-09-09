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

import { BOARD_W, CELL_COUNT, EMPTY, NO_LINK, STATE_CHARGED } from '../lattice/board.js';
import { DEFAULT_ROUND } from '../lattice/round.js';
import { computeRulesFromManifest } from '../lattice/rules-manifest.js';
import { Session, type SavedSession, type SessionView } from '../lattice/session.js';
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

// ── Item 3: persistence ────────────────────────────────────────────────────
// Every storage access is wrapped: a private window, cleared site data, or a
// WebView with storage disabled all throw here, and a game that cannot save
// must still be a game that can be played.
const SAVE_KEY = 'glaas.lattice.round.v1';

function saveRound(): void {
  try {
    if (session && session.phase === 'playing') {
      localStorage.setItem(SAVE_KEY, JSON.stringify(session.save()));
    } else {
      localStorage.removeItem(SAVE_KEY);
    }
  } catch { /* storage unavailable; the round simply will not survive a close */ }
}

function loadSaved(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch { return null; }
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
  const view = session.bank(index);
  render(view);
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

applyTheme();
buildBoard();
btnNew.addEventListener('click', () => void newRound());
btnReveal.addEventListener('click', () => void onReveal());
// Android kills a backgrounded WebView without warning, so the save happens on
// the way out as well as after every turn.
globalThis.addEventListener('pagehide', saveRound);
void boot();
