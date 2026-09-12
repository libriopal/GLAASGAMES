// web/farkle-screen.ts — the dice game, as a phone shows it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE LIVE HAND IS A MECHANIC, NOT AN OVERLAY. THIS IS THE AUDIT'S DIRECTIVE.
//
// Asked whether sixteen touchable cells inside a thirty-six cell board reads as
// a rule or as an arbitrary fence, the independent audit answered:
//
//   "It is an arbitrary fence UNLESS the UI treats it as a Hand. If the 16 cells
//    are simply 'the ones you can touch,' the player will feel cheated by the 20
//    they cannot. If the 16 cells are visually encapsulated — highlighted,
//    contained, or glowing — as a 'Live Hand,' the player will understand they
//    are playing with a limited set of dice. The distinction is between 'the
//    board is locked' and 'this is my hand'."
//
// Its closing directive was that this "must be treated as a primary mechanic,
// not a UI overlay." So the hand is drawn as a CONTAINER: a single traced
// outline around the union of its cells, with the cells outside it pushed down
// into the deck rather than merely dimmed. The boundary is computed from the
// hand's own geometry — every edge a hand cell shares with a non-hand cell —
// which is why `drawHand` grows a connected blob and not a scatter. A scattered
// hand has no outline to draw, so the rule could not have been made visible.
//
// ─────────────────────────────────────────────────────────────────────────────
// AMBER IS FARKLE'S AXIS, AND THE THREE GAMES MUST SURVIVE A THUMBNAIL.
//
// Chemistry keeps CYAN, darkmatter takes MAGENTA. The palette's chromatic weight
// was measured off the corpus and the three hues are 194, 36 and 290 degrees
// apart enough to separate at launcher size. Everything else on this screen is
// achromatic, because the rank argument that governs the forecast layer governs
// here too: chroma is a scarce channel and it is spent on identity.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE COMBO IS NAMED, NOT NUMBERED.
//
// "Two Triplets" is the large text and 2500 is the small text, which is the one
// piece of empirical guidance the optical research actually supplied: in a
// human-observer study, signature matching gave the best target-detection
// performance of four presentations tested and mapping values onto colour gave
// the worst. A player who learns to see TWO TRIPLETS has learned the game; a
// player who learns that a number went up has not.

import {
  BOARD_W,
  BOARD_H,
  CELL_COUNT,
  RISK_CRITICAL,
  RISK_EXPOSED,
  RISK_SAFE,
  RISK_THIN,
  neighbours,
} from '../game/farkle/hand.js';
import { projectToken } from './board4d.js';
import {
  AMBER,
  FONT_DISPLAY,
  FONT_FIGURE,
  GROUND,
  GROUND_EDGE,
  GROUND_RAISED,
  INK,
  INK_DIM,
  SPENT,
  hex,
  toHex,
  type Rgb,
} from './theme.js';

/** 393px phone, 16px gutters, six columns. The same pitch every surface uses. */
export const TILE = 60;
export const GUTTER = 16;
export const SCREEN_W = TILE * BOARD_W + GUTTER * 2;

const AMBER_RGB = hex(AMBER);

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

export interface ScreenState {
  readonly faces: readonly number[];
  readonly live: ReadonlySet<number>;
  /** Cells the player has traced so far, in order. */
  readonly chain: readonly number[];
  readonly running: number;
  readonly bank: number;
  readonly combo: string;
  readonly chainScore: number;
  /** One of RISK_SAFE..RISK_CRITICAL — what the traced chain would leave behind. */
  readonly risk: number;
  readonly turn: number;
  readonly turns: number;
  /** Faces entering the board next, for the forecast strip. Six certain, six not. */
  readonly forecast: readonly number[];
  readonly forecastConfidence: readonly number[];
}

const cx = (cell: number): number => GUTTER + (cell % BOARD_W) * TILE + TILE / 2;
const cy = (cell: number): number => ((cell / BOARD_W) | 0) * TILE + TILE / 2;

/**
 * The hand's boundary, as a path.
 *
 * Every edge shared between a hand cell and a non-hand cell (or the board edge)
 * becomes a line segment. Drawn together they are the outline of the hand — one
 * closed shape, however ragged, which is the container the audit asked for.
 */
export function handOutline(live: ReadonlySet<number>, ox: number, oy: number): string {
  const seg: string[] = [];
  for (const cell of live) {
    const x = ox + (cell % BOARD_W) * TILE;
    const y = oy + ((cell / BOARD_W) | 0) * TILE;
    const col = cell % BOARD_W;
    const row = (cell / BOARD_W) | 0;
    if (row === 0 || !live.has(cell - BOARD_W)) seg.push(`M${x} ${y}h${TILE}`);
    if (row === BOARD_H - 1 || !live.has(cell + BOARD_W)) seg.push(`M${x} ${y + TILE}h${TILE}`);
    if (col === 0 || !live.has(cell - 1)) seg.push(`M${x} ${y}v${TILE}`);
    if (col === BOARD_W - 1 || !live.has(cell + 1)) seg.push(`M${x + TILE} ${y}v${TILE}`);
  }
  return seg.join('');
}

/** One die, through the board's own 4D projection. */
function die(cell: number, face: number, ox: number, oy: number, opts: {
  inHand: boolean; inChain: boolean; chainIndex: number;
}): string {
  const x = ox + (cell % BOARD_W) * TILE;
  const y = oy + ((cell / BOARD_W) | 0) * TILE;
  if (face === 0) {
    // A spent cell. Visibly a hole, not a dark die — the hand shrinking is the
    // whole risk mechanic and it must be legible at a glance.
    return `<rect x="${x + 8}" y="${y + 8}" width="${TILE - 16}" height="${TILE - 16}" rx="3" fill="none" stroke="${SPENT}" stroke-width="1" stroke-dasharray="2 3"/>`;
  }

  const body = opts.inChain
    ? toHex(mix(hex(GROUND_RAISED), AMBER_RGB, 0.22))
    : opts.inHand ? GROUND_RAISED : toHex(mix(hex(GROUND), hex(GROUND_RAISED), 0.45));
  const edge = opts.inChain ? AMBER : opts.inHand ? GROUND_EDGE : toHex(mix(hex(GROUND), hex(GROUND_EDGE), 0.5));
  const ink = opts.inChain ? INK : opts.inHand ? INK : toHex(mix(hex(GROUND), hex(INK_DIM), 0.38));

  // Dice outside the hand sit at rest; dice in the hand turn a little, so the
  // live set reads as alive without anything animating.
  const phase = opts.inHand ? ((cell * 7) % 5) * 0.05 : 0;
  const pips = projectToken(face as 1 | 2 | 3 | 4 | 5 | 6, phase)
    .map((p) =>
      `<circle cx="${(x + 3 + p.x * (TILE - 6)).toFixed(1)}" cy="${(y + 3 + p.y * (TILE - 6)).toFixed(1)}" ` +
      `r="${(p.r * (TILE - 6)).toFixed(2)}" fill="${ink}" opacity="${(0.6 + 0.4 * p.depth).toFixed(2)}"/>`)
    .join('');

  return (
    `<rect x="${x + 3}" y="${y + 3}" width="${TILE - 6}" height="${TILE - 6}" rx="7" ` +
    `fill="${body}" stroke="${edge}" stroke-width="${opts.inChain ? 1.5 : 1}"/>` + pips
  );
}

/** The chain, drawn as a ribbon threading the dice rather than as selection boxes. */
function ribbon(chain: readonly number[], ox: number, oy: number): string {
  if (chain.length === 0) return '';
  const pts = chain.map((c) => `${ox - GUTTER + cx(c)},${oy + cy(c)}`).join(' ');
  const head = chain[chain.length - 1]!;
  return (
    `<polyline points="${pts}" fill="none" stroke="${AMBER}" stroke-width="7" stroke-opacity="0.30" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polyline points="${pts}" fill="none" stroke="${AMBER}" stroke-width="2.5" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${ox - GUTTER + cx(head)}" cy="${oy + cy(head)}" r="5" fill="${AMBER}"/>`
  );
}

const RISK_NAME = ['SAFE', 'THIN', 'EXPOSED', 'CRITICAL'];

/** The risk a chain would LEAVE. Countable ticks, never a percentage. */
function riskRow(risk: number, x: number, y: number): string {
  const out: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const lit = i < risk;
    out.push(lit
      ? `<rect x="${x + i * 16}" y="${y}" width="12" height="5" fill="${risk >= RISK_CRITICAL ? AMBER : INK_DIM}"/>`
      : `<rect x="${x + i * 16 + 0.5}" y="${y + 0.5}" width="11" height="4" fill="none" stroke="${GROUND_EDGE}"/>`);
  }
  out.push(`<text x="${x + 56}" y="${y + 5}" font-family="${FONT_FIGURE}" font-size="9" fill="${INK_DIM}">${RISK_NAME[risk]}</text>`);
  return out.join('');
}

/** The forecast strip: what is coming, spatially above and never z-above the board. */
function strip(state: ScreenState, ox: number, oy: number): string {
  const P = 40;
  const out: string[] = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const i = row * 6 + col;
      const conf = state.forecastConfidence[i] ?? 0;
      const face = state.forecast[i] ?? 0;
      const x = ox + col * P;
      const y = oy + row * P;
      const t = (conf / 3) * (row === 0 ? 1 : 0.74);
      const body = toHex(mix(hex(GROUND), hex(GROUND_RAISED), t));
      const edge = toHex(mix(hex(GROUND), hex(GROUND_EDGE), t));
      const ink = toHex(mix(hex(GROUND), hex(row === 0 ? INK : INK_DIM), t));
      out.push(`<rect x="${x + 1}" y="${y + 1}" width="${P - 2}" height="${P - 2}" rx="4" fill="${body}" stroke="${edge}"${row ? ' stroke-dasharray="3 3"' : ''}/>`);
      if (face >= 1 && face <= 6 && conf > 0) {
        for (const p of projectToken(face as 1 | 2 | 3 | 4 | 5 | 6, 0)) {
          out.push(`<circle cx="${(x + 1 + p.x * (P - 2)).toFixed(1)}" cy="${(y + 1 + p.y * (P - 2)).toFixed(1)}" r="${(p.r * (P - 2)).toFixed(2)}" fill="${ink}"/>`);
        }
      }
    }
  }
  return `<g style="pointer-events:none">${out.join('')}</g>`;
}

/**
 * The whole screen.
 *
 * Laid out top to bottom: forecast instrument, void, the board with the hand
 * encapsulated inside it, the readout, and the bank action. The bank is the
 * loudest thing on screen because it is the only irreversible one.
 */
export function farkleScreenSvg(state: ScreenState): string {
  const stripH = 80;
  const VOID = 18;
  const boardY = 24 + stripH + VOID;
  const boardH = TILE * BOARD_H;
  const readoutY = boardY + boardH + 18;
  // 150, not 132: the first layout clipped the bank button by eight pixels —
  // the one control that must never look unfinished.
  const H = readoutY + 150;

  const p: string[] = [];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_W}" height="${H}" viewBox="0 0 ${SCREEN_W} ${H}" font-family="${FONT_DISPLAY}">`);
  p.push(`<rect width="${SCREEN_W}" height="${H}" fill="${GROUND}"/>`);

  // ── Chrome: the game's name in its own colour, and the turn counter ────────
  p.push(`<text x="${GUTTER}" y="20" font-size="13" fill="${AMBER}" letter-spacing="2">FARKLE</text>`);
  p.push(`<text x="${SCREEN_W - GUTTER}" y="20" font-size="11" fill="${INK_DIM}" text-anchor="end" font-family="${FONT_FIGURE}">turn ${state.turn + 1}/${state.turns}</text>`);

  // ── The instrument ─────────────────────────────────────────────────────────
  p.push(`<text x="${GUTTER}" y="${48}" font-size="9" fill="${INK_DIM}" font-family="${FONT_FIGURE}" letter-spacing="1">INCOMING</text>`);
  p.push(strip(state, GUTTER + 76, 24));
  p.push(`<rect x="${GUTTER}" y="${24 + stripH + 2}" width="${SCREEN_W - GUTTER * 2}" height="1" fill="${GROUND_EDGE}"/>`);

  // ── The board. Cells outside the hand first, so the hand sits on top. ──────
  p.push(`<g>`);
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (state.live.has(i)) continue;
    p.push(die(i, state.faces[i] ?? 0, GUTTER, boardY, { inHand: false, inChain: false, chainIndex: -1 }));
  }

  // THE HAND, AS A CONTAINER.
  //
  // ── THE FIRST VERSION USED A BOUNDING BOX AND MADE THE FENCE WORSE ─────────
  //
  // A soft rounded rect over the hand's bounding box seemed like the obvious way
  // to give it a ground. Rendered, it was plainly wrong: a hand grown by random
  // accretion is ragged, so its bounding box swallows cells that are NOT in the
  // hand, and those cells ended up sitting on the hand's own ground while still
  // being untouchable. That is the precise failure the audit warned about —
  // "the player will feel cheated by the 20 they cannot [touch]" — and the
  // bounding box manufactured it in the one element meant to prevent it.
  //
  // The ground is therefore painted PER CELL, only on cells actually in the
  // hand, so the lit region and the playable region are the same set by
  // construction rather than by coincidence. The outline then traces that same
  // set's boundary. Nothing can be lit and unplayable.
  for (const cell of state.live) {
    p.push(`<rect x="${GUTTER + (cell % BOARD_W) * TILE}" y="${boardY + (((cell / BOARD_W) | 0)) * TILE}" ` +
      `width="${TILE}" height="${TILE}" fill="${toHex(mix(hex(GROUND), AMBER_RGB, 0.07))}"/>`);
  }
  p.push(`<path d="${handOutline(state.live, GUTTER, boardY)}" fill="none" stroke="${AMBER}" stroke-width="1.5" stroke-opacity="0.6"/>`);
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (!state.live.has(i)) continue;
    p.push(die(i, state.faces[i] ?? 0, GUTTER, boardY, {
      inHand: true, inChain: state.chain.includes(i), chainIndex: state.chain.indexOf(i),
    }));
  }
  p.push(ribbon(state.chain, GUTTER, boardY));
  p.push(`</g>`);

  // ── The readout. The COMBO is the headline; the number is the footnote. ────
  if (state.combo) {
    p.push(`<text x="${GUTTER}" y="${readoutY + 18}" font-size="21" fill="${INK}">${state.combo}</text>`);
    p.push(`<text x="${GUTTER}" y="${readoutY + 36}" font-size="12" fill="${AMBER}" font-family="${FONT_FIGURE}">+${state.chainScore}</text>`);
  } else {
    p.push(`<text x="${GUTTER}" y="${readoutY + 18}" font-size="21" fill="${INK_DIM}">trace a chain</text>`);
    p.push(`<text x="${GUTTER}" y="${readoutY + 36}" font-size="12" fill="${INK_DIM}" font-family="${FONT_FIGURE}">up to six dice, orthogonally</text>`);
  }

  // Risk: what this chain would LEAVE. Not a forecast of the turn.
  p.push(`<text x="${SCREEN_W - GUTTER - 132}" y="${readoutY + 18}" font-size="9" fill="${INK_DIM}" font-family="${FONT_FIGURE}" letter-spacing="1">LEAVES THE HAND</text>`);
  p.push(riskRow(state.risk, SCREEN_W - GUTTER - 132, readoutY + 27));

  // ── Running vs banked. The unbanked figure is legible as unbanked. ─────────
  const barY = readoutY + 54;
  p.push(`<rect x="${GUTTER}" y="${barY}" width="${SCREEN_W - GUTTER * 2}" height="34" rx="6" fill="${GROUND_RAISED}" stroke="${GROUND_EDGE}"/>`);
  p.push(`<text x="${GUTTER + 12}" y="${barY + 14}" font-size="9" fill="${INK_DIM}" font-family="${FONT_FIGURE}" letter-spacing="1">AT RISK</text>`);
  p.push(`<text x="${GUTTER + 12}" y="${barY + 28}" font-size="15" fill="${AMBER}" font-family="${FONT_FIGURE}">${state.running}</text>`);
  p.push(`<text x="${SCREEN_W - GUTTER - 12}" y="${barY + 14}" font-size="9" fill="${INK_DIM}" font-family="${FONT_FIGURE}" text-anchor="end" letter-spacing="1">BANKED</text>`);
  p.push(`<text x="${SCREEN_W - GUTTER - 12}" y="${barY + 28}" font-size="15" fill="${INK}" font-family="${FONT_FIGURE}" text-anchor="end">${state.bank}</text>`);

  // ── BANK. The only irreversible action, and the loudest thing here. ────────
  //
  // With nothing at risk there is nothing to bank, and the first render offered
  // "BANK 0" — a button whose whole promise is to make a number safe, offering
  // to make zero safe. An action that does nothing must not look like the
  // loudest thing on the screen, so it drops to an outline and says what the
  // player should do instead.
  const bankY = barY + 42;
  const armed = state.running > 0;
  if (armed) {
    p.push(`<rect x="${GUTTER}" y="${bankY}" width="${SCREEN_W - GUTTER * 2}" height="44" rx="8" fill="${AMBER}"/>`);
    p.push(`<text x="${SCREEN_W / 2}" y="${bankY + 28}" font-size="16" fill="${GROUND}" text-anchor="middle" letter-spacing="2">BANK ${state.running}</text>`);
  } else {
    p.push(`<rect x="${GUTTER + 0.5}" y="${bankY + 0.5}" width="${SCREEN_W - GUTTER * 2 - 1}" height="43" rx="8" fill="none" stroke="${GROUND_EDGE}"/>`);
    p.push(`<text x="${SCREEN_W / 2}" y="${bankY + 28}" font-size="14" fill="${INK_DIM}" text-anchor="middle" letter-spacing="2">NOTHING AT RISK</text>`);
  }

  p.push('</svg>');
  return p.join('');
}
