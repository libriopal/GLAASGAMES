// web/forecast-strip.ts — what is coming, drawn so it cannot be mistaken for what is.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE BAND-LAW, AND WHY THIS IS A SEPARATE STRIP RATHER THAN AN OVERLAY.
//
// The external colour documentation fixes a z-order BY TRUTH STATUS: forecast
// renders beneath ground truth, synthetic annotation renders above it, and the
// stated reason is that a prediction drawn on top of a fact reads as a fact.
//
// A drop preview is a forecast. Composited over the board it breaks that rule
// outright — and the same specification records its own earlier draft making
// exactly this mistake with the infrared layer, and correcting it. Drawn as a
// spatially separate region above the board it complies, and it is also simply
// better ergonomics: on a phone the top of the screen is the region a thumb
// never covers, which is where a read-only instrument belongs while the thumb
// works the board below.
//
// So this strip is never composited over the board, has no hit region, and no
// pointer handler. Tapping it does nothing at all — not even a bounce, because
// a response would imply agency it does not have.
//
// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE IS WASHOUT, NEVER SIZE. THIS IS A BINDING, NOT A PREFERENCE.
//
// The band-law states it in one line — "a weak forecast is washed out, not
// smaller" — and calls it the rule that matters most. The reason survives the
// restatement: a smaller mark is still a crisp assertion about something, just a
// smaller one, whereas a washed-out mark degrades toward making no claim. What
// the display should do when it is unsure is approach silence.
//
// Every row-2 cell is therefore drawn at FULL SIZE and interpolated toward the
// deck value. At zero confidence it is indistinguishable from an empty slot,
// which is the correct rendering of "no claim".
//
// ─────────────────────────────────────────────────────────────────────────────
// NO READOUT ASKS THE PLAYER TO COMPARE TWO MAGNITUDES.
//
// From behavioural work on stomatopod colour vision: twelve photoreceptor
// classes, and wavelength discrimination of only 12-25 nm — worse than ours.
// Channel count buys recognition speed, not resolution. The design consequence
// the optical spec draws, and that this file obeys, is that every readout must
// answer "is this line lit" rather than "is this one bigger than that one".
//
// Confidence is therefore four NAMEABLE states carried by a tick count — three
// ticks certain, two likely, one doubtful, none no-claim — with the washout
// redundant to it. A player reads the ticks; they never measure the fade.
//
// ─────────────────────────────────────────────────────────────────────────────
// CHROMA IS RESERVED, ON A RANK ARGUMENT.
//
// A display emits a three-vector per pixel. Pushing several information bands
// into colour is a linear map onto R^3, and once the bands outnumber the
// channels the map has a null space: distinct game states produce identical
// pixels, and no palette tuning fixes a rank deficiency. The six faces need the
// whole chroma budget, so this strip introduces no saturated hue at all. It is
// distinguished from the board by GEOMETRY — pitch, scale, border, and the void
// between them.

import {
  GROUND,
  GROUND_EDGE,
  GROUND_RAISED,
  INK,
  INK_DIM,
  apcaLc,
  hex,
  toHex,
  type Rgb,
} from './theme.js';
import { CONFIDENCE_MAX, FORECAST_WIDTH, type Forecast } from '../lattice/draw-stream.js';
import { projectToken } from './board4d.js';

/** Board tile pitch on a 393px phone: 6 columns inside 16px gutters. */
export const BOARD_PITCH = 60;
/**
 * The strip renders at 68% linear scale.
 *
 * Not decoration. A forecast that matched the board's scale would read as a
 * second board, and the first thing a player would try is to touch it. The
 * reduction is the cheapest available signal that this region is an instrument
 * rather than a playfield, and it survives every tone curve and every display.
 */
export const STRIP_SCALE = 0.68;
export const STRIP_PITCH = Math.round(BOARD_PITCH * STRIP_SCALE);
/** The void between instrument and playfield. Large enough to read as a break. */
export const STRIP_VOID = 24;
/** Room under the strip for the tick row. */

const ROWS = 2;

/** Linear interpolation between two colours, in sRGB. */
function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

/**
 * The contrast each confidence level is drawn at, in APCA Lc against the deck.
 *
 * ── THESE ARE SOLVED FOR, BECAUSE MIXING sRGB PRODUCED THREE STATES, NOT FOUR ─
 *
 * The first version mixed the deck toward the ink at 0, ⅓, ⅔ and 1. Rendered and
 * measured, that gave Lc 0, 14, 49 and 95. sRGB is savagely non-linear at the
 * dark end, so the "doubtful" step landed at Lc 14 — BELOW `LC_INVISIBLE`, which
 * this palette defines as the threshold where a mark stops being a mark.
 *
 * The consequence is the defect, not the number: "doubtful" and "no claim"
 * rendered as the same thing. The scale advertised four states and delivered
 * three, and the one it lost was the one that says the forecast is probably
 * wrong. Nothing in the code was incorrect; the fault was only visible once the
 * ladder was rendered side by side and two rungs turned out to be one.
 *
 * So the levels are chosen in CONTRAST and the colour is solved to hit them,
 * the same inversion `web/lc-ramp.ts` performs — equal steps of claim are equal
 * steps of contrast. Level 0 is the deck exactly: a no-claim cell is not a faint
 * assertion, it is the background.
 */
export const CONFIDENCE_LC: readonly number[] = [0, 34, 58, 82];

/**
 * Row 2 never reaches row 1's ink, at any confidence.
 *
 * ── THE SECOND DEFECT THE RENDER FOUND, AND THE WORSE ONE ────────────────────
 *
 * On a healthy board row 2 sits at maximum confidence, so it was drawn at full
 * ink — pixel-identical to row 1 apart from a 3px dashed border. The dashed
 * border on a 4px corner radius reads as a faint texture at this scale, not as a
 * distinction, so the two rows became indistinguishable in the common case.
 *
 * That is not a polish issue. The certain/fallible split is the entire claim
 * this strip makes, and it was carried by a single cue that all but vanished.
 * Row 2 is a PREDICTION even when the prediction is confident, so it is held
 * below row 1 permanently: a confident guess is still a guess.
 *
 * The distinction is now carried three times over — contrast, the dashed border,
 * and the tick count — and two of those three are geometric, so it survives a
 * dimmed panel and a monochrome display, as the band-law requires.
 */
export const ROW_TWO_CEILING = 0.74;

const DECK = hex(GROUND);

/**
 * The colour that holds a given contrast against the deck, solved by bisection.
 *
 * Achromatic by construction: the path runs from the deck to the ink, and the
 * palette's ink is near-neutral, so nothing here spends the chroma budget the
 * six faces need.
 */
function atLc(ink: Rgb, targetLc: number): Rgb {
  if (targetLc <= 0) return DECK;
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 40; n += 1) {
    const mid = (lo + hi) / 2;
    if (Math.abs(apcaLc(mixRgb(DECK, ink, mid), DECK)) >= targetLc) hi = mid;
    else lo = mid;
  }
  return mixRgb(DECK, ink, hi);
}

/**
 * The colour a forecast cell is drawn in, given its confidence and its row.
 *
 * `row` is not cosmetic — see `ROW_TWO_CEILING`. A row-2 cell at full confidence
 * is deliberately dimmer than a row-1 cell at full confidence, because it is a
 * different kind of claim about the world.
 */
export function washout(ink: Rgb, confidence: number, row = 0): Rgb {
  const level = Math.max(0, Math.min(CONFIDENCE_MAX, Math.round(confidence)));
  const lc = (CONFIDENCE_LC[level] ?? 0) * (row === 0 ? 1 : ROW_TWO_CEILING);
  return atLc(ink, lc);
}

/**
 * The phase the forecast's tokens are drawn at.
 *
 * ── WHY THE STRIP BORROWS THE BOARD'S 4D PROJECTION INSTEAD OF A PIP TABLE ───
 *
 * The first version of this file carried its own flat table of pip positions.
 * That is two grammars for one alphabet: a player who had learned to read the
 * board's five would have had to learn the strip's five separately, and the two
 * would have drifted the first time either was touched. `projectToken` already
 * exists, already projects each face through the rotation plane that face owns,
 * and is already held to `verify-tokens` P1-P9 — so the strip calls it.
 *
 * It calls it at PHASE ZERO, and that choice is the design. At phase 0 the
 * orientation is identity, so a forecast token is the token's REST SHAPE: the
 * board's tiles turn, the forecast's do not. A prediction that animated would be
 * claiming more than it knows, and motion in this project is reserved for state
 * changes rather than ambient decoration. The strip is still drawn by the 4D
 * projection, so the two surfaces agree about what a five looks like; it simply
 * never leaves the identity orientation.
 */
export const FORECAST_PHASE = 0;

export interface StripGeometry {
  readonly width: number;
  readonly height: number;
}

export function stripGeometry(): StripGeometry {
  return { width: STRIP_PITCH * FORECAST_WIDTH, height: STRIP_PITCH * ROWS + 16 };
}

/**
 * The strip, as SVG.
 *
 * SVG rather than canvas because this surface never animates per frame — it
 * changes once per turn — and because a vector surface is what the screenshot
 * oracle can measure without a GPU. The board keeps its GL renderer; the
 * instrument does not need one, and spending a draw call per frame on a static
 * readout is how a 60fps budget gets eaten by something nobody is looking at.
 */
export function forecastStripSvg(f: Forecast): string {
  const g = stripGeometry();
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" ` +
      `viewBox="0 0 ${g.width} ${g.height}" role="img" ` +
      `aria-label="Forecast: the next ${FORECAST_WIDTH} tiles are certain, the ${FORECAST_WIDTH} after are uncertain. Not interactive.">`,
  );
  // `pointer-events: none` on the root, so the DOM itself carries the rule
  // rather than a handler that somebody could forget to attach.
  parts.push(`<g style="pointer-events:none">`);
  parts.push(`<rect width="${g.width}" height="${g.height}" fill="${GROUND}"/>`);

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < FORECAST_WIDTH; col += 1) {
      const i = row * FORECAST_WIDTH + col;
      const face = f.faces[i] ?? 0;
      const conf = f.confidence[i] ?? 0;
      const x = col * STRIP_PITCH;
      const y = row * STRIP_PITCH;
      const inset = 2;
      const size = STRIP_PITCH - inset * 2;

      // The cell body. Washed toward the deck by confidence — at zero it is the
      // deck, so an uncertain forecast approaches saying nothing.
      const body = washout(hex(GROUND_RAISED), conf, row);
      const edge = washout(hex(GROUND_EDGE), conf, row);

      // ROW 1 SOLID, ROW 2 DASHED. A topological distinction, not a contrast
      // one: it survives a dimmed panel, a tone curve and a monochrome display,
      // which a brightness difference would not.
      const dash = row === 0 ? '' : ` stroke-dasharray="3 3"`;
      parts.push(
        `<rect x="${x + inset}" y="${y + inset}" width="${size}" height="${size}" rx="4" ` +
          `fill="${toHex(body)}" stroke="${toHex(edge)}" stroke-width="1"${dash}/>`,
      );

      // Pips, through the board's own 4D projection at rest orientation.
      if (face >= 1 && face <= 6) {
        const ink = washout(hex(row === 0 ? INK : INK_DIM), conf, row);
        for (const pip of projectToken(face as 1 | 2 | 3 | 4 | 5 | 6, FORECAST_PHASE)) {
          parts.push(
            `<circle cx="${(x + inset + pip.x * size).toFixed(1)}" cy="${(y + inset + pip.y * size).toFixed(1)}" ` +
              `r="${(pip.r * size).toFixed(2)}" fill="${toHex(ink)}"/>`,
          );
        }
      }
    }
  }

  // ── The confidence tick strip ──────────────────────────────────────────────
  //
  // Three slots, filled by confidence. COUNTABLE, not measurable: the player
  // reads how many are lit and never compares two lengths, which is the rule
  // taken from a visual system that carries twelve channels and still cannot
  // discriminate finely — it recognises signatures instead.
  //
  // ── SIZED UP AFTER THE FIRST RENDER, WHERE IT FAILED ITS OWN PRINCIPLE ──────
  //
  // At 6x4px on a 9px pitch these read as a texture rather than as a set. They
  // were neither countable nor measurable, which is the one outcome the design
  // had ruled out. At 14x6 on an 18px pitch each slot is separately resolvable
  // at arm's length, and the unlit slots are drawn as outlines rather than dark
  // fills so the DENOMINATOR is visible — one of three is a different claim from
  // one, and a player cannot read a fraction whose bottom half is invisible.
  const rowTwoConf = f.confidence[FORECAST_WIDTH] ?? 0;
  const tickY = STRIP_PITCH * ROWS + 4;
  for (let t = 0; t < CONFIDENCE_MAX; t += 1) {
    const lit = t < rowTwoConf;
    parts.push(
      lit
        ? `<rect x="${t * 18}" y="${tickY}" width="14" height="6" fill="${toHex(hex(INK_DIM))}"/>`
        : `<rect x="${t * 18 + 0.5}" y="${tickY + 0.5}" width="13" height="5" fill="none" ` +
          `stroke="${toHex(hex(GROUND_EDGE))}" stroke-width="1"/>`,
    );
  }

  // A hairline under the strip. The boundary between instrument and playfield,
  // stated once in geometry so nothing has to state it in words.
  parts.push(
    `<rect x="0" y="${g.height - 1}" width="${g.width}" height="1" fill="${GROUND_EDGE}"/>`,
  );

  parts.push('</g></svg>');
  return parts.join('');
}

/**
 * Contrast of a forecast cell against the deck, for a given confidence.
 *
 * Exposed so the oracle can assert the two ends of the scale rather than
 * eyeballing them: a certain cell must be legible, and a no-claim cell must be
 * genuinely invisible rather than merely faint.
 */
export function cellLc(confidence: number, row = 0): number {
  return Math.abs(apcaLc(washout(hex(INK), confidence, row), hex(GROUND)));
}
