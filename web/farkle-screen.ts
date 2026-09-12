// web/farkle-screen.ts — the dice game, as a phone shows it.
//
// ─────────────────────────────────────────────────────────────────────────────
// EVERY COLOUR ON THIS SCREEN IS A CLAIM ABOUT EPISTEMIC STATUS.
//
// See `web/spectrum.ts`. The short version, and it decides the whole layout:
//
//   MATTER   the six die hues. What IS. The only band with six values, and the
//            only band allowed to mutate state.
//   IR       what MIGHT go wrong. The forecast strip, and the risk readout.
//            Never a fact — a forecast rendered as a fact is a defect.
//   ENGINE   what the engine READS. The banked total: the number already
//            recorded, which the player can no longer lose.
//
// The first version of this screen was near-monochrome. That was a MISAPPLIED
// rank argument — I reserved chroma correctly and then spent none of it, so the
// game came out grey against a brief asking for a colourful one. The rank
// argument forbids several competing variables sharing one colour channel; it
// does not forbid each band owning a reserved region and encoding one variable.
//
// ─────────────────────────────────────────────────────────────────────────────
// HUE IS REDUNDANT WITH THE PIPS, AND THAT IS THE POINT.
//
// A die's colour IS its value. So is its pip count. Neither is load-bearing
// alone: pips survive greyscale and colour-vision deficiency, hue survives
// distance and peripheral vision, and a player reads whichever the moment gives
// them. The corpus settled this when an asset pipeline tried to cut the face
// colours to fit a palette cap — the recorded ruling was to raise the cap,
// because "the six die-face colors are load-bearing game information, not
// styling."
//
// ─────────────────────────────────────────────────────────────────────────────
// THE LIVE HAND IS A MECHANIC, NOT AN OVERLAY. THIS IS THE AUDIT'S DIRECTIVE.
//
//   "It is an arbitrary fence UNLESS the UI treats it as a Hand... The
//    distinction is between 'the board is locked' and 'this is my hand'."
//
// Dice outside the hand keep their hue and lose their intensity. They are still
// matter — still really there — so draining them to grey would make a different
// and false claim about a cell that is merely not yours this turn.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE COMBO IS NAMED, NOT NUMBERED.
//
// The one piece of empirical guidance the optical research supplied: in a
// human-observer study, signature matching gave the best target-detection
// performance of four presentations tested and mapping values onto colour gave
// the worst. So "Two Triplets" is the headline and 2500 is the footnote.

import { BOARD_W, BOARD_H, CELL_COUNT } from '../game/farkle/hand.js';
import { projectToken } from './board4d.js';
import {
  ENGINE,
  IR_CORE,
  MATTER,
  irAt,
  matterAt,
  matterBody,
  matterPip,
  desaturate,
  mixRgb,
  toCss,
} from './spectrum.js';
import {
  FONT_DISPLAY,
  FONT_FIGURE,
  GROUND,
  GROUND_EDGE,
  GROUND_RAISED,
  INK,
  INK_DIM,
  hex,
} from './theme.js';

/** 393px phone, 16px gutters, six columns. The pitch every surface shares. */
export const TILE = 60;
export const GUTTER = 16;
export const SCREEN_W = TILE * BOARD_W + GUTTER * 2;

/** How present an out-of-hand die is. Enough to read, not enough to reach for. */
const DIM_PRESENCE = 0.50;
/** How much of its chroma an out-of-hand die keeps. See `desaturate`. */
const DIM_CHROMA = 0.34;

export interface ScreenState {
  readonly faces: readonly number[];
  readonly live: ReadonlySet<number>;
  readonly chain: readonly number[];
  readonly running: number;
  readonly bank: number;
  readonly combo: string;
  readonly chainScore: number;
  readonly risk: number;
  readonly turn: number;
  readonly turns: number;
  readonly forecast: readonly number[];
  readonly forecastConfidence: readonly number[];
}

/** The hand's boundary: every edge a hand cell shares with a non-hand cell. */
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

/**
 * One die, through the board's own 4D projection.
 *
 * The body is a deep tint of the face's matter colour and the pips are that
 * colour at full strength, so the hue reads twice — once as the object and once
 * as the marks on it — and a die is identifiable at arm's length before its pips
 * resolve.
 */
function die(cell: number, face: number, ox: number, oy: number, inHand: boolean, inChain: boolean): string {
  const x = ox + (cell % BOARD_W) * TILE;
  const y = oy + ((cell / BOARD_W) | 0) * TILE;

  if (face === 0) {
    // A spent cell: a hole, not a dark die. The hand shrinking is the whole risk
    // mechanic and it has to be legible at a glance.
    return `<rect x="${x + 9}" y="${y + 9}" width="${TILE - 18}" height="${TILE - 18}" rx="3" ` +
      `fill="none" stroke="${GROUND_EDGE}" stroke-width="1" stroke-dasharray="2 3"/>`;
  }

  const presence = inHand ? 1 : DIM_PRESENCE;
  const body = inHand ? matterBody(face, presence) : desaturate(matterBody(face, presence), DIM_CHROMA);
  const pip = inHand ? matterPip(face, presence) : desaturate(matterPip(face, presence), DIM_CHROMA);
  const edge = inChain ? matterAt(face, 1) : toCss(mixRgb(hex(GROUND_EDGE), hex(matterAt(face, presence)), 0.45));

  const phase = inHand ? ((cell * 7) % 5) * 0.05 : 0;
  const pips = projectToken(face as 1 | 2 | 3 | 4 | 5 | 6, phase)
    .map((q) =>
      `<circle cx="${(x + 4 + q.x * (TILE - 8)).toFixed(1)}" cy="${(y + 4 + q.y * (TILE - 8)).toFixed(1)}" ` +
      `r="${(q.r * (TILE - 8)).toFixed(2)}" fill="${pip}" opacity="${(0.65 + 0.35 * q.depth).toFixed(2)}"/>`)
    .join('');

  // A one-pixel lit lip along the top edge, so a die is an object with a light
  // on it rather than a coloured rectangle. Cheap, and it is most of what makes
  // the board read as physical.
  const lip = inHand
    ? `<path d="M${x + 9} ${y + 4.5}h${TILE - 18}" stroke="${matterAt(face, 0.55)}" stroke-width="1" fill="none" opacity="0.85"/>`
    : '';

  return (
    `<rect x="${x + 3}" y="${y + 3}" width="${TILE - 6}" height="${TILE - 6}" rx="8" ` +
    `fill="${body}" stroke="${edge}" stroke-width="${inChain ? 2 : 1}"/>` + lip + pips
  );
}

/** The chain, as a ribbon threading the dice rather than as selection boxes. */
function ribbon(chain: readonly number[], faces: readonly number[], ox: number, oy: number): string {
  if (chain.length === 0) return '';
  const px = (c: number): number => ox + (c % BOARD_W) * TILE + TILE / 2;
  const py = (c: number): number => oy + ((c / BOARD_W) | 0) * TILE + TILE / 2;
  const pts = chain.map((c) => `${px(c)},${py(c)}`).join(' ');
  const head = chain[chain.length - 1]!;
  // The ribbon takes the hue of the die it STARTS on, so a chain reads as a
  // thing made of matter rather than a selection drawn over the game.
  const tint = matterAt(faces[chain[0]!] ?? 1, 1);
  return (
    `<polyline points="${pts}" fill="none" stroke="${tint}" stroke-width="10" stroke-opacity="0.25" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polyline points="${pts}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${px(head)}" cy="${py(head)}" r="5.5" fill="${INK}"/>` +
    `<circle cx="${px(head)}" cy="${py(head)}" r="2.5" fill="${tint}"/>`
  );
}

const RISK_NAME = ['SAFE', 'THIN', 'EXPOSED', 'CRITICAL'];

/**
 * The risk a chain would LEAVE. Countable ticks in IR, never a percentage.
 *
 * IR because this is the band for "what might go wrong". A reading that borrowed
 * a matter hue would be asserting a fact about something that has not happened.
 * No readout asks the player to compare two magnitudes.
 */
function riskRow(risk: number, x: number, y: number): string {
  const out: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const lit = i < risk;
    out.push(lit
      ? `<rect x="${x + i * 17}" y="${y}" width="13" height="6" rx="1" fill="${irAt(risk / 3)}"/>`
      : `<rect x="${x + i * 17 + 0.5}" y="${y + 0.5}" width="12" height="5" rx="1" fill="none" stroke="${GROUND_EDGE}"/>`);
  }
  out.push(`<text x="${x + 58}" y="${y + 6}" font-family="${FONT_FIGURE}" font-size="9" ` +
    `fill="${risk >= 2 ? irAt(risk / 3) : INK_DIM}" letter-spacing="1">${RISK_NAME[risk]}</text>`);
  return out.join('');
}

/**
 * The forecast strip. Framed in IR, because it is foresight.
 *
 * Spatially above the board and never composited over it: a prediction drawn on
 * top of a fact reads as a fact. The certain faces sit at full strength; the
 * fallible ones wash toward the deck as confidence falls, and at zero confidence
 * they ARE the deck, which is the correct rendering of "no claim".
 *
 * ── THE ROWS ARE FLIPPED: CERTAIN AT THE BOTTOM, NEAREST THE BOARD ──────────
 *
 * The first layout put the certain row on top and the fallible row below it,
 * reading top-to-bottom like prose. That is backwards for an instrument. The
 * strip sits ABOVE the board and its contents fall INTO the board, so the row
 * physically adjacent to the playfield is the row that arrives next — and the
 * one further away is the one further off in time. Distance from the board now
 * means distance in the future, which is a spatial statement of the same fact
 * the confidence washout makes chromatically.
 *
 * It also puts the certain row where the eye already is. A player's attention
 * lives on the board; the certain faces are the ones they will act on first, and
 * they are now the nearest thing to it rather than the furthest.
 *
 * The cells carry matter hue because the forecast is about WHICH FACE arrives —
 * held down, and fenced by an IR frame so the region says "forecast" before any
 * individual cell says "six".
 */
function strip(state: ScreenState, ox: number, oy: number): string {
  const P = 38;
  const out: string[] = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const i = row * 6 + col;
      const conf = state.forecastConfidence[i] ?? 0;
      const face = state.forecast[i] ?? 0;
      const x = ox + col * P;
      // Row 0 (certain) draws on the LOWER line, row 1 (fallible) on the upper.
      const y = oy + (1 - row) * P;
      const t = (conf / 3) * (row === 0 ? 1 : 0.7);
      if (t <= 0) continue;
      out.push(`<rect x="${x + 1}" y="${y + 1}" width="${P - 2}" height="${P - 2}" rx="5" ` +
        `fill="${toCss(mixRgb(hex(GROUND), hex(matterBody(face, 1)), t))}" ` +
        `stroke="${toCss(mixRgb(hex(GROUND), hex(IR_CORE), t * 0.55))}"${row ? ' stroke-dasharray="3 3"' : ''}/>`);
      if (face >= 1 && face <= 6) {
        const pip = toCss(mixRgb(hex(GROUND), hex(matterPip(face, 1)), t));
        for (const q of projectToken(face as 1 | 2 | 3 | 4 | 5 | 6, 0)) {
          out.push(`<circle cx="${(x + 1 + q.x * (P - 2)).toFixed(1)}" cy="${(y + 1 + q.y * (P - 2)).toFixed(1)}" ` +
            `r="${(q.r * (P - 2)).toFixed(2)}" fill="${pip}"/>`);
        }
      }
    }
  }
  return `<g style="pointer-events:none">${out.join('')}</g>`;
}

export function farkleScreenSvg(state: ScreenState): string {
  const stripY = 28;
  const stripH = 76;
  const VOID = 16;
  const boardY = stripY + stripH + VOID;
  const boardH = TILE * BOARD_H;
  const readoutY = boardY + boardH + 16;
  const H = readoutY + 152;

  const p: string[] = [];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_W}" height="${H}" viewBox="0 0 ${SCREEN_W} ${H}" font-family="${FONT_DISPLAY}">`);
  p.push(`<rect width="${SCREEN_W}" height="${H}" fill="${GROUND}"/>`);

  // ── Chrome. The wordmark is built from the six matter hues, because the six
  //    faces ARE the game — a title made of its own tokens rather than of a
  //    brand colour invented for it.
  const word = 'FARKLE';
  for (let i = 0; i < word.length; i += 1) {
    p.push(`<text x="${GUTTER + i * 12}" y="19" font-size="14" fill="${matterAt(i + 1, 1)}" letter-spacing="1">${word[i]}</text>`);
  }
  p.push(`<text x="${SCREEN_W - GUTTER}" y="19" font-size="11" fill="${INK_DIM}" text-anchor="end" font-family="${FONT_FIGURE}">turn ${state.turn + 1}/${state.turns}</text>`);

  // ── The instrument ─────────────────────────────────────────────────────────
  p.push(`<text x="${GUTTER}" y="${stripY + 12}" font-size="9" fill="${IR_CORE}" font-family="${FONT_FIGURE}" letter-spacing="1">INCOMING</text>`);
  p.push(`<text x="${GUTTER}" y="${stripY + 30}" font-size="8" fill="${INK_DIM}" font-family="${FONT_FIGURE}">likely</text>`);
  p.push(`<text x="${GUTTER}" y="${stripY + 68}" font-size="8" fill="${INK}" font-family="${FONT_FIGURE}">certain</text>`);
  p.push(strip(state, GUTTER + 58, stripY));
  p.push(`<rect x="${GUTTER}" y="${stripY + stripH + 2}" width="${SCREEN_W - GUTTER * 2}" height="1" fill="${GROUND_EDGE}"/>`);

  // ── The board. Out-of-hand dice first, so the hand sits above them. ────────
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (state.live.has(i)) continue;
    p.push(die(i, state.faces[i] ?? 0, GUTTER, boardY, false, false));
  }

  // THE HAND AS A CONTAINER. The ground is painted PER CELL, never over a
  // bounding box — a hand grown by accretion is ragged, and a box would light
  // cells that are NOT in the hand, manufacturing the exact fence the audit
  // warned about inside the one element meant to prevent it.
  for (const cell of state.live) {
    p.push(`<rect x="${GUTTER + (cell % BOARD_W) * TILE}" y="${boardY + (((cell / BOARD_W) | 0)) * TILE}" ` +
      `width="${TILE}" height="${TILE}" fill="${GROUND_RAISED}" opacity="0.6"/>`);
  }
  p.push(`<path d="${handOutline(state.live, GUTTER, boardY)}" fill="none" stroke="${INK}" stroke-width="4" stroke-opacity="0.10"/>`);
  p.push(`<path d="${handOutline(state.live, GUTTER, boardY)}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-opacity="0.85"/>`);
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (!state.live.has(i)) continue;
    p.push(die(i, state.faces[i] ?? 0, GUTTER, boardY, true, state.chain.includes(i)));
  }
  p.push(ribbon(state.chain, state.faces, GUTTER, boardY));

  // ── The readout. The COMBO is the headline; the number is the footnote. ────
  if (state.combo) {
    const tint = matterAt(state.faces[state.chain[0] ?? 1] ?? 1, 1);
    p.push(`<text x="${GUTTER}" y="${readoutY + 18}" font-size="22" fill="${INK}">${state.combo}</text>`);
    p.push(`<text x="${GUTTER}" y="${readoutY + 37}" font-size="13" fill="${tint}" font-family="${FONT_FIGURE}">+${state.chainScore}</text>`);
  } else {
    p.push(`<text x="${GUTTER}" y="${readoutY + 18}" font-size="22" fill="${INK_DIM}">trace a chain</text>`);
    p.push(`<text x="${GUTTER}" y="${readoutY + 37}" font-size="10" fill="${INK_DIM}" font-family="${FONT_FIGURE}">up to six dice, orthogonally</text>`);
  }

  p.push(`<text x="${SCREEN_W - GUTTER - 134}" y="${readoutY + 18}" font-size="9" fill="${INK_DIM}" font-family="${FONT_FIGURE}" letter-spacing="1">LEAVES THE HAND</text>`);
  p.push(riskRow(state.risk, SCREEN_W - GUTTER - 134, readoutY + 27));

  // ── At risk (IR — it can still be lost) vs banked (ENGINE — already read). ─
  const barY = readoutY + 54;
  p.push(`<rect x="${GUTTER}" y="${barY}" width="${SCREEN_W - GUTTER * 2}" height="36" rx="7" fill="${GROUND_RAISED}" stroke="${GROUND_EDGE}"/>`);
  p.push(`<rect x="${GUTTER}" y="${barY}" width="3" height="36" rx="1.5" fill="${state.running > 0 ? IR_CORE : GROUND_EDGE}"/>`);
  p.push(`<text x="${GUTTER + 14}" y="${barY + 15}" font-size="9" fill="${INK_DIM}" font-family="${FONT_FIGURE}" letter-spacing="1">AT RISK</text>`);
  p.push(`<text x="${GUTTER + 14}" y="${barY + 30}" font-size="16" fill="${state.running > 0 ? IR_CORE : INK_DIM}" font-family="${FONT_FIGURE}">${state.running}</text>`);
  p.push(`<text x="${SCREEN_W - GUTTER - 14}" y="${barY + 15}" font-size="9" fill="${INK_DIM}" font-family="${FONT_FIGURE}" text-anchor="end" letter-spacing="1">BANKED</text>`);
  p.push(`<text x="${SCREEN_W - GUTTER - 14}" y="${barY + 30}" font-size="16" fill="${ENGINE}" font-family="${FONT_FIGURE}" text-anchor="end">${state.bank}</text>`);

  // ── BANK. The only irreversible action, so the loudest thing here.
  //
  // GREEN, and the choice is not decoration: banking is the act that turns a
  // forecast into matter. A number at risk is IR — it might go wrong; a number
  // banked is a fact. The button is the transition, so it wears a matter hue.
  //
  // With nothing at risk it drops to an outline. The first render offered
  // "BANK 0" — a control whose whole promise is to make a number safe, offering
  // to make zero safe — and an action that does nothing must not look like the
  // primary one.
  const bankY = barY + 44;
  if (state.running > 0) {
    p.push(`<rect x="${GUTTER}" y="${bankY}" width="${SCREEN_W - GUTTER * 2}" height="44" rx="9" fill="${MATTER[4]}"/>`);
    p.push(`<text x="${SCREEN_W / 2}" y="${bankY + 28}" font-size="16" fill="${GROUND}" text-anchor="middle" letter-spacing="2">BANK ${state.running}</text>`);
  } else {
    p.push(`<rect x="${GUTTER + 0.5}" y="${bankY + 0.5}" width="${SCREEN_W - GUTTER * 2 - 1}" height="43" rx="9" fill="none" stroke="${GROUND_EDGE}"/>`);
    p.push(`<text x="${SCREEN_W / 2}" y="${bankY + 28}" font-size="13" fill="${INK_DIM}" text-anchor="middle" letter-spacing="2">NOTHING AT RISK</text>`);
  }

  p.push('</svg>');
  return p.join('');
}
