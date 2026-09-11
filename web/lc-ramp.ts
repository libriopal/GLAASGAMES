// web/lc-ramp.ts — a brightness channel that is uniform in what the eye reports.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE MEASUREMENT THAT MADE THIS NECESSARY.
//
// `theme.ts` pins a palette and implements APCA, and everything in this project
// that carries a magnitude carries it on brightness, because hue is unorderable
// and unusable for roughly 8% of men. So the brightness ramp is not decoration:
// it is the channel the design depends on.
//
// It was never measured. Swept, a straight sRGB interpolation from
// `GROUND_RAISED` to `CYAN` over the `GROUND` background produces:
//
//     intensity   0.0   0.1   0.2   0.3   0.4   0.5   0.6   0.7   0.8   0.9   1.0
//     |Lc|        1.0   5.7  11.4  17.9  25.0  32.9  40.9  49.9  59.4  69.3  79.9
//
// `theme.ts` states 15 as the point at which a thing disappears. So the first
// FIFTH of that ramp is invisible, and the first half sits under half the
// available contrast. A design that encoded confidence 0.0-0.5 on it would be
// encoding it on nothing.
//
// `foundry/visual/evolve.ts` found this the hard way. Given a floor parameter
// and a fitness that rewarded legibility, the search drove the floor to its
// upper bound in essentially every surviving candidate — buying visibility by
// throwing the channel's whole range away. That is the search reporting that the
// ramp is unusable, and it was right.
//
// ─────────────────────────────────────────────────────────────────────────────
// SO THE RAMP IS INVERTED THROUGH THE METRIC INSTEAD.
//
// `rampColour(i)` does not interpolate sRGB. It solves for the colour along that
// path whose measured |Lc| against the ground is `rampLc(i)` — a straight line
// from the disappearance floor to the palette's brightest available ink. Equal
// steps in `i` are then equal steps in reported contrast, which is what a player
// actually reads, and no part of the range is wasted below the floor.
//
// This is the only reason to implement APCA in a codebase rather than cite it:
// having the function means the palette can be inverted, not merely audited.

import { type Rgb, CYAN, GROUND, GROUND_RAISED, LC_INVISIBLE, apcaLc, hex } from './theme.js';

const LOW = hex(GROUND_RAISED);
const HIGH = hex(CYAN);
const BG = hex(GROUND);

/** Measured contrast of the brightest ink in the ramp. Not a chosen number. */
export const LC_TOP = Math.abs(apcaLc(HIGH, BG));

/** The contrast a normalised intensity is meant to hold. */
export function rampLc(i: number): number {
  const k = Math.max(0, Math.min(1, i));
  return LC_INVISIBLE + (LC_TOP - LC_INVISIBLE) * k;
}

function lerp(t: number): Rgb {
  return {
    r: Math.round(LOW.r + (HIGH.r - LOW.r) * t),
    g: Math.round(LOW.g + (HIGH.g - LOW.g) * t),
    b: Math.round(LOW.b + (HIGH.b - LOW.b) * t),
  };
}

/**
 * The colour holding `rampLc(i)` against the ground.
 *
 * Solved by bisection on the sRGB path, which is monotone in |Lc| here because
 * every channel increases along it. Forty steps is far past the resolution of an
 * 8-bit channel, so the result is exact in the only units that ship.
 */
export function rampColour(i: number): Rgb {
  const target = rampLc(i);
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 40; n += 1) {
    const mid = (lo + hi) / 2;
    if (Math.abs(apcaLc(lerp(mid), BG)) >= target) hi = mid;
    else lo = mid;
  }
  return lerp(hi);
}
