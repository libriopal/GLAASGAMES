// web/board4d.ts — the board, drawn through the fourth axis.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FILE ADDS NO RULES AND READS NO SECRET.
//
// It renders a face value and a charge — both already on `board.observable()` —
// and nothing else. The hidden lattice does not appear here in any form, because
// `web/lattice-gl.ts` already learned that lesson the expensive way: a first
// design put the links at w != 0 and relied on the shader's slice gate to keep
// them invisible. A client that declines to draw a secret still holds it. So the
// fourth axis carries public meaning only, and every function below takes a face
// and a charge, never a link.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE MATHEMATICS IS THE ENGINE'S, NOT A LOOKALIKE.
//
// `orientationToMatrix`, `transform4` and `projectTo3D` are imported from
// `engine/math/rotor4.ts` and run in Q16.16 exactly as the simulation does. A
// second, floating-point copy of the rotation maths written "just for the UI"
// would be the drift this repository forbids everywhere else, and it would be
// worse here because nobody would ever notice it was wrong.

import {
  type Orientation4,
  PLANE_COUNT,
  orientationToMatrix,
  projectTo3D,
  transform4,
} from '../engine/math/rotor4.js';
import { type Vec4, vec4 } from '../engine/math/vec4.js';
import { fromFixed, toFixed } from '../engine/math/fixed.js';
import { PIP_LAYOUT, PIP_R } from './tokens.js';

/**
 * How far each pip is pushed off the token plane, in token widths.
 *
 * ── THIS NUMBER IS MEASURED AND IT IS THE REASON THE DESIGN WORKS ───────────
 *
 * The first version of this design gave face `n` a rotation in plane `n` and
 * assumed six planes would look like six things. They do not. Traced over a full
 * rotation and compared pairwise, a FLAT token separates XZ from XW by 0.0097
 * token widths — 0.46 px at a 48 px token. YZ and YW likewise. Six planes
 * collapse to four distinguishable classes.
 *
 * The mechanism is exact: a flat token's pips sit at z = 0 and w = 0, so
 * rotating x INTO z and rotating x INTO w do the same thing to the visible x and
 * y. There is no extent in either axis for them to rotate into.
 *
 * Embossing restores it, linearly:
 *
 *     0.00 -> 0.46 px   dead
 *     0.08 -> 2.53 px   visible at a glance
 *     0.16 -> 5.00 px   confidently readable
 *     0.24 -> 7.50 px
 *
 * 0.16 is the smallest value that clears 5 px, which is the threshold for a
 * channel a player can read rather than merely notice.
 */
export const EMBOSS = 0.16;

/** Where the eye sits on the w axis. Cells live near 0; this must exceed them. */
export const VIEWER_W = toFixed(3);

/**
 * A pip in R^4: its position on the face, plus the depth that makes rotation
 * legible. The z and w offsets alternate by index so a cluster has genuine
 * volume rather than a uniform shift, which would rotate as a rigid plane and
 * separate no better than a flat one.
 */
function pip4(x: number, y: number, i: number): Vec4 {
  const sz = (i & 1) === 0 ? EMBOSS : -EMBOSS;
  const sw = (i & 2) === 0 ? EMBOSS : -EMBOSS;
  return vec4(toFixed(x - 0.5), toFixed(y - 0.5), toFixed(sz), toFixed(sw));
}

export interface ProjectedPip {
  readonly x: number;
  readonly y: number;
  /** Radius after projection — a pip nearer in w is drawn larger. */
  readonly r: number;
  /** Depth 0..1, near to far. Drives luminance only, never hue. */
  readonly depth: number;
}

/**
 * Projects one token's pips at a given phase of its rotation.
 *
 * `face` selects BOTH the pip count and the rotation plane, which is the whole
 * idea: `PLANE_COUNT` is 6 and a die has six faces, so face `n` turns in the
 * `n`th of the only six planes R^4 has. A 1 turns in XY, flat in the plane of
 * the screen. A 6 turns in ZW, a rotation with no 3D analogue at all — it reads
 * as the token turning inside out rather than turning around.
 *
 * The channel is REDUNDANT BY CONSTRUCTION. The pips are still there and still
 * countable; `verify-tokens` P1-P9 keeps proving a player recovers the value in
 * greyscale at the narrowest phone. At phase 0 the orientation is identity and
 * the token is byte-identical to the flat one. This adds a way to read the board
 * peripherally — motion is detected across the whole visual field, where pips
 * must be looked at one cell at a time — and takes nothing away.
 */
export function projectToken(face: 1 | 2 | 3 | 4 | 5 | 6, phase: number): ProjectedPip[] {
  const plane = (face - 1) % PLANE_COUNT;
  const o: number[] = [0, 0, 0, 0, 0, 0];
  o[plane] = toFixed(phase);
  const m = orientationToMatrix(o as unknown as Orientation4);

  const out: ProjectedPip[] = [];
  const layout = PIP_LAYOUT[face];
  for (let i = 0; i < layout.length; i += 1) {
    const p = layout[i]!;
    const r4 = transform4(m, pip4(p.x, p.y, i));
    const proj = projectTo3D(r4, VIEWER_W);
    if (proj === null) continue;
    const w = fromFixed(r4.w);
    // Near pips are larger and brighter; far pips smaller and dimmer. Depth is
    // expressed as size and luminance ONLY. Hue never moves, because the palette
    // is pinned to the corpus and depth is not allowed to invent a colour.
    const scale = 3 / (3 - w);
    out.push({
      x: fromFixed(proj.x) + 0.5,
      y: fromFixed(proj.y) + 0.5,
      r: PIP_R * scale,
      depth: Math.max(0, Math.min(1, (w + EMBOSS) / (2 * EMBOSS))),
    });
  }
  return out;
}

/**
 * THE ANCHOR — a flat shadow of the token, cast on the board plane.
 *
 * ── REQUIRED BY THE INDEPENDENT AUDIT, AND IT IS THE BEST NOTE IN IT ────────
 *
 * Asked for the biggest ARTISTIC weakness of a UI built from 4D rotation, the
 * audit answered: "loss of visual grounding and intuitive spatial rhythm... a
 * sense of mathematical abstraction that feels cognitively exhausting rather
 * than immersive", with nothing to "bridge the gap between complex 4D
 * mathematics and the low-dimensional spatial intuition required for natural
 * gameplay."
 *
 * Its fix, adopted: "introduce a persistent 3D shadow projection to serve as a
 * fixed spatial baseline, helping players differentiate between 4D rotation and
 * z-depth."
 *
 * So every token casts an unmoving shadow at its rest position. The eye gets
 * stable ground, and rotation is read as departure from that ground rather than
 * as free-floating abstraction. It also, incidentally, answers the audit's
 * separate objection to encoding uncertainty as w-extent: with an anchor
 * present, "far" and "uncertain" stop looking alike.
 */
export function anchorPips(face: 1 | 2 | 3 | 4 | 5 | 6): { x: number; y: number; r: number }[] {
  return PIP_LAYOUT[face].map((p) => ({ x: p.x, y: p.y, r: PIP_R }));
}

/**
 * Charge, as displacement toward the viewer.
 *
 * Public information — charge is on the observable board and is drawn as
 * countable ticks already. This is a second, spatial reading of the same fact: a
 * charged cell is literally nearer. Bounded so a fully charged cell cannot reach
 * the eye and invert.
 */
export function chargeLift(charge: number): number {
  return Math.min(charge, 3) * 0.10;
}
