// web/theme.ts — the palette, derived from the corpus rather than chosen.
//
// Every number here traces to `design/corpus-digest.json`, which is the output
// of reading all 1,129 concept images — 4,613,440 sampled pixels, zero failures
// — and reducing them to hue, saturation and luminance histograms. `verify-theme`
// re-reads that digest and fails the build if these tokens drift from it, so the
// palette cannot quietly become someone's preference later.
//
// WHAT THE MEASUREMENTS SAID, AND WHERE THEY CONTRADICT INTUITION:
//
//   59.1% of pixels sit in the darkest 6 of 16 luminance bins, and 6.7% sit in
//   the very brightest. The corpus is bimodal: a dark ground with sharp
//   speculars, not an evenly-lit scene. So the UI ground is near-black and
//   highlights are allowed to be genuinely bright.
//
//   70.5% of pixels are near-grey (saturation below 0.4) and only 9.2% are
//   vivid. COLOUR IS SCARCE IN THIS CORPUS. That falsifies the obvious reading
//   of "neon gothic" as saturated everywhere; the concept art earns its neon by
//   spending it rarely. The budget below encodes that as a rule.
//
//   By chromatic weight the hues are cyan 170-219 deg at 29.1%, amber/gold
//   20-59 deg at 23.8%, magenta/violet 280-329 deg at 13.9%, red 9.9%, and
//   green 90-149 deg at only 2.6%.
//
//   THAT LAST FIGURE IS THE LOAD-BEARING ONE and it is recorded rather than
//   smoothed over. Green is the least used hue in 1,129 images, and it is the
//   hue people reach for first when describing this kind of art from memory.
//   The palette therefore has NO green accent token. That is a decision made
//   against intuition on the strength of a measurement, so it is written down
//   here: if green ever returns to this file, it must return because the digest
//   moved, and `verify-theme` fails the build if the claim goes stale or the
//   record is deleted.

/** Where these numbers come from. Read by `verify-theme`. */
export const CORPUS_DIGEST = 'design/corpus-digest.json';
export const CORPUS_IMAGES = 1129;
export const CORPUS_PIXELS = 4_613_440;

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function hex(value: string): Rgb {
  const n = Number.parseInt(value.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function toHex(c: Rgb): string {
  return `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The ground. Measured: the corpus's most common chromatic cluster is
 * #103040/#183848 — a dark desaturated teal-blue, not neutral black. Using true
 * black would be a colour the corpus does not contain.
 */
export const GROUND = '#080c12';
export const GROUND_RAISED = '#103040';
export const GROUND_EDGE = '#183848';

/**
 * The three accents, in measured order of chromatic weight. Hues are the bin
 * centres the digest reports; LIGHTNESS IS SOLVED, not chosen — each token is
 * the darkest value in its measured hue that still clears its APCA floor
 * against the hardest background it is used on. The corpus's own contrast was
 * never held to a standard, so sampling lightness from it would import an
 * accessibility failure along with the palette.
 */
export const CYAN = '#85e3ff';    // 194 deg — 29.1% of chromatic weight
export const AMBER = '#ffce85';   // 36 deg  — 23.8%
export const MAGENTA = '#f4bdff'; // 290 deg — 13.9%

/**
 * Text. Near-white with a trace of the ground's hue so it sits in the world.
 *
 * INK_DIM was #8b97a8 until the oracle measured it. That colour scores WCAG
 * 6.62:1 — a comfortable pass, well over the 4.5:1 threshold — and APCA |Lc|
 * 42.8, barely half the 75 floor. It would have shipped as unreadable secondary
 * text with a green tick beside it. That single pairing is the whole argument
 * for enforcing APCA instead, and it was found by the check rather than by eye.
 */
export const INK = '#e9eef4';
export const INK_DIM = '#cbd0d8';

/**
 * The scarcity rule, and it is a rule rather than advice.
 *
 * Measured: 9.2% of corpus pixels are vivid (saturation >= 0.6). A UI that
 * saturates more of its area than the corpus does will not read as the same
 * world, however correct its hues are. `verify-theme` renders the board and
 * measures the actual vivid fraction against this ceiling.
 */
export const VIVID_BUDGET_PCT = 12;

// ── APCA ───────────────────────────────────────────────────────────────────
// WCAG 2's contrast ratio passes pairings that are functionally unreadable on
// dark backgrounds — it is a ratio of luminances and does not model perception,
// and the failure is documented as particularly severe in dark mode. APCA
// reports lightness contrast Lc from -105 to +105, where a negative value means
// light text on a dark ground (which is this entire design) and the magnitude is
// what matters. |Lc| 15 is the point at which text disappears; 75 is the floor
// for large UI components; 90 is the floor for body text.
//
// Implemented here rather than imported so the check has no dependency and can
// run in the same suite as everything else.

const S_TRC = 2.4;
const N_BG = 0.56;
const N_TX = 0.57;
const R_BG = 0.62;
const R_TX = 0.65;
const SCALE_BOW = 1.14;
const SCALE_WOB = 1.14;
const LO_CLIP = 0.001;
const LO_BOW_OFFSET = 0.027;
const LO_WOB_OFFSET = 0.027;
const DELTA_Y_MIN = 0.0005;

/** APCA screen luminance: sRGB channels raised to 2.4, weighted. */
function screenLuminance(c: Rgb): number {
  const f = (v: number): number => Math.pow(v / 255, S_TRC);
  return 0.2126729 * f(c.r) + 0.7151522 * f(c.g) + 0.0721750 * f(c.b);
}

function softClamp(y: number): number {
  return y > 0.022 ? y : y + Math.pow(0.022 - y, 1.414);
}

/**
 * APCA Lc for text on a background. Negative for light-on-dark, which is what
 * this design produces everywhere; callers compare the magnitude.
 */
export function apcaLc(text: Rgb, background: Rgb): number {
  const yTx = softClamp(screenLuminance(text));
  const yBg = softClamp(screenLuminance(background));
  if (Math.abs(yBg - yTx) < DELTA_Y_MIN) return 0;

  let output: number;
  if (yBg > yTx) {
    // Dark text on a light ground.
    output = (Math.pow(yBg, N_BG) - Math.pow(yTx, N_TX)) * SCALE_BOW;
    output = output < LO_CLIP ? 0 : output - LO_BOW_OFFSET;
  } else {
    // Light text on a dark ground — this design.
    output = (Math.pow(yBg, R_BG) - Math.pow(yTx, R_TX)) * SCALE_WOB;
    output = output > -LO_CLIP ? 0 : output + LO_WOB_OFFSET;
  }
  return output * 100;
}

/** Floors, from the APCA readability criterion. */
export const LC_BODY_TEXT = 90;
export const LC_LARGE_UI = 75;
export const LC_INVISIBLE = 15;

// ── Tile palette ───────────────────────────────────────────────────────────
// Hue is CATEGORICAL here and never carries a magnitude — it is unorderable and
// unusable for roughly 8% of men, and the one mechanic this game is about must
// not be delivered through it. Magnitudes ride on brightness and size.

export const FACE_INK = INK;
export const CHARGE_GLOW = CYAN;
export const LINK_FIELD = MAGENTA;
export const SPENT = '#3a4657';

/** The six die faces are one colour. A die is a die; its VALUE is its pips. */
export const DIE_BODY = '#141b26';
export const DIE_EDGE = '#263346';
