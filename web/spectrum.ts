// web/spectrum.ts — the five bands, and what each colour is allowed to claim.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS IS NOT A PALETTE. EACH BAND IS A CLAIM ABOUT EPISTEMIC STATUS.
//
// Taken from the CyanCode spectrum in the design corpus, which states the rule
// more sharply than a style guide would:
//
//   "Five bands. Each band is a CLAIM ABOUT THE EPISTEMIC STATUS of what you're
//    looking at. A band whose color lies about its content is a DEFECT, not a
//    style preference."
//
//   matter     what IS          board, dice, chains, scores   may mutate state
//   ir         what MIGHT go wrong   risk, foresight          forecast only
//   uv         what is HIDDEN    synthetic, always labelled   never state
//   cyan       what the ENGINE READS  skill, audit, fitness   read-only
//   voidshard  hidden tiles                                   never state
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS, WHICH IS A CORRECTION TO MY OWN EARLIER REASONING.
//
// The forecast layer was built achromatic on a rank argument: a display emits a
// three-vector per pixel, so pushing several information bands into colour is a
// map onto R^3 with a null space, and distinct states collapse onto identical
// pixels. That argument is correct and it still stands.
//
// But I then applied it as "reserve chroma", reserved it, and SPENT NONE OF IT.
// Every surface came out near-monochrome against a brief that asked for three
// colourful games. The rank argument forbids encoding SEVERAL COMPETING
// VARIABLES in one colour channel. It does not forbid giving each band its own
// reserved, non-overlapping region of colour space and encoding ONE variable in
// each — which is exactly what the corpus specifies and what this file does.
//
// The corpus also settled the specific question I got wrong. An asset pipeline
// there capped the palette at eight colours against the spectrum's twelve, and
// the recorded ruling was to raise the cap rather than cut the faces, because
// "the six die-face colors are load-bearing game information, not styling."
//
// So a die's hue IS its value, redundant with its pip count. That redundancy is
// the point: the pips survive greyscale and colour-vision deficiency, the hue
// survives distance and peripheral vision, and neither is load-bearing alone.

import { type Rgb, INK, hex } from './theme.js';

/**
 * MATTER — what is. The six die faces, and the ONLY band permitted six values.
 *
 * Index by face, so `MATTER[3]` is the colour of a three. Index 0 is unused and
 * is the deck, because face 0 means an empty cell and an empty cell is not
 * matter at all.
 */
export const MATTER: readonly string[] = [
  '#080c12', // 0 — not matter. The deck.
  '#ff2244', // 1 red
  '#ff7700', // 2 orange
  '#ffe000', // 3 yellow
  '#00ff66', // 4 green
  '#00aaff', // 5 blue
  '#cc44ff', // 6 violet
];

/** IR — what might go wrong. Risk and foresight. Never a fact. */
export const IR_CORE = '#ff2d55';
export const IR_DEEP = '#b3001b';

/** UV — what is hidden or synthetic. Always labelled as such. */
export const UV = '#b026ff';

/** CYAN — what the engine reads. Audit, fitness, banked record. Read-only. */
export const ENGINE = '#00e5ff';

/** VOIDSHARD — the rarity floor. */
export const VOID_DEEP = '#0a0410';

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

export function toCss(c: Rgb): string {
  const h = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * A matter colour pushed toward the deck.
 *
 * `presence` 1 is fully in play, 0 is gone. Used for dice outside the live hand:
 * they are still matter — they are still really there — so they keep their hue
 * and lose their intensity, rather than turning grey. A grey die would be making
 * a different claim (that it is not matter) about a cell that simply is not
 * yours this turn.
 */
export function matterAt(face: number, presence: number): string {
  const base = hex(MATTER[face] ?? MATTER[0]!);
  return toCss(mixRgb(hex(MATTER[0]!), base, presence));
}

/**
 * The deep body a die is drawn on, so a saturated pip face still reads as an
 * object rather than as a flat colour swatch.
 *
 * ── THE MIX WAS 0.16 AND THE DICE WERE NOT OBJECTS ──────────────────────────
 *
 * Measured, a body at the old mix sat at APCA Lc 0 against the deck at EVERY
 * presence — the die body was the background with a rounded corner on it. Dice
 * outside the live hand therefore rendered as mud: their pips had nothing to sit
 * on, and the top half of the board read as damage rather than as dice.
 *
 * 0.30 gives an out-of-hand body real separation from the deck while staying
 * clearly behind the hand, and the pips are lifted toward ink separately so the
 * two do not fight.
 */
export function matterBody(face: number, presence: number): string {
  const base = hex(MATTER[face] ?? MATTER[0]!);
  return toCss(mixRgb(hex(MATTER[0]!), base, 0.30 * presence + 0.05));
}

/**
 * A die's PIPS: the hue lifted toward ink so it stays identifiable and reads
 * light-on-dark.
 *
 * ── 0.78 IS MEASURED, NOT PICKED ────────────────────────────────────────────
 *
 * The first colour pass drew pips in the pure face hue, which put a red pip on a
 * dark red body: APCA Lc 29 for face 1 and 29 for face 6, against a palette that
 * calls Lc 15 invisible and Lc 75 the floor for large UI. Red and violet dice
 * were genuinely hard to count, which breaks the redundancy the whole scheme
 * rests on — hue and pip count are each supposed to carry the value alone.
 *
 * Swept: mixing the hue toward ink by k gives a worst-case Lc of 48 at k=0.45,
 * 59 at 0.62, 65 at 0.70 and 72 at 0.78. 0.78 is the first value that brings the
 * worst face to the large-UI floor, and the hue is still plainly the face's own.
 */
export function matterPip(face: number, presence = 1): string {
  const lifted = mixRgb(hex(MATTER[face] ?? MATTER[0]!), hex(INK), 0.78);
  return toCss(mixRgb(hex(MATTER[0]!), lifted, presence));
}

/**
 * Drains chroma toward the colour's own luminance, keeping hue identity.
 *
 * ── BRIGHTNESS ALONE COULD NOT SEPARATE THE HAND FROM THE BOARD ─────────────
 *
 * Out-of-hand dice were first drawn at presence 0.30 and came out as mud — their
 * bodies sat at APCA Lc 0 against the deck, so the top of the board read as
 * damage. Raised to 0.55 they became legible and immediately competed with the
 * live hand, which undoes the one directive the audit was most insistent about.
 *
 * The two requirements pull opposite ways on a single axis, so they need two
 * axes. Out-of-hand dice keep a readable LUMINANCE and lose SATURATION: still
 * plainly dice, still plainly their own colour, plainly not in play. That is
 * also the honest claim — they are still matter, merely not yours this turn —
 * where draining them to black would assert they are not there.
 */
export function desaturate(css: string, keep: number): string {
  const c = hex(css);
  const y = Math.round(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
  return toCss(mixRgb({ r: y, g: y, b: y }, c, Math.max(0, Math.min(1, keep))));
}

/** The IR ramp, for a risk reading. 0 is no risk, 1 is critical. */
export function irAt(t: number): string {
  return toCss(mixRgb(hex(IR_DEEP), hex(IR_CORE), Math.max(0, Math.min(1, t))));
}
