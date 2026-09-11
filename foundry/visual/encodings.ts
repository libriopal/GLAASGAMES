// foundry/visual/encodings.ts — the machine chooses the visual encoding.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A SEARCH AND NOT A DESIGNER'S JUDGEMENT.
//
// The previous cycle proposed mapping each die face to one of the six rotation
// planes of R⁴, weighted it 0.75 — the highest confidence in a fourteen-candidate
// distribution — and shipped it into a specimen sheet. Three probes then killed
// it: two of the six faces had no motion signature at all, and no assignment of
// planes to faces existed that avoided merging pips. The idea rested on
// `PLANE_COUNT` being 6 and a die having six faces, which is a coincidence of
// integers rather than a design.
//
// A search would not have made that mistake, because a search does not find
// coincidences beautiful. `verify-montecarlo` M10 already demonstrated the
// pattern on policies: enumerate a grammar, measure every member, and assert
// that the declared best is actually the best. On its first run it found a rung
// stronger than two rounds of human effort had.
//
// So the belief display is not designed here. It is SEARCHED, against a fitness
// function that can reject the author's favourite.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT FITNESS MEANS FOR A PICTURE.
//
// Four properties, and the first is the one that matters:
//
//   DISCRIMINATION  a right belief and a wrong belief must LOOK different. An
//                   encoding that renders both the same is decoration, however
//                   handsome. This is measured by rendering both and comparing.
//   STABILITY       one more observation must not reorganise the whole display.
//                   A readout that jumps cannot be read during play.
//   RESPONSIVENESS  and yet it must MOVE when evidence changes, or it is inert.
//                   Stability and responsiveness pull against each other, which
//                   is why both are scored rather than one.
//   LEGIBILITY      marks large enough to see, within the palette's contrast floor.
//
// Discrimination and inertness are opposite failures and an encoding can fail
// either way. Scoring only one would select for the other.

import { type BeliefState, dominantPlane, resultant } from './belief.js';

/** A drawn mark, in unit coordinates on the belief widget. */
export interface Mark {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** 0..1, drives luminance only — never hue. The palette is pinned. */
  readonly intensity: number;
}

/** An encoding turns a belief into marks. It receives NOTHING but the belief. */
export type Encoding = (b: BeliefState) => Mark[];

/**
 * How the belief's ANGLE is chosen. The three options are genuinely different
 * claims about what the player is trying to see.
 */
const ANGLE_TERMS: readonly { readonly name: string; readonly f: (b: BeliefState) => number }[] = [
  // The direction charge actually tends to go — the literal question.
  { name: 'resultant', f: (b) => { const r = resultant(b); return Math.atan2(r.y, r.x); } },
  // Which of the six planes dominates the bivector — the abstract answer.
  { name: 'plane', f: (b) => (dominantPlane(b).plane / 6) * Math.PI * 2 },
  // The bivector's own xy component, signed — the raw geometry.
  { name: 'bivXY', f: (b) => Math.atan2(b.bivector[3] ?? 0, b.bivector[0] ?? 0) },
];

/** How much of the widget the mark fills. */
const SIZE_TERMS: readonly { readonly name: string; readonly f: (b: BeliefState) => number }[] = [
  { name: 'weight', f: (b) => Math.min(1, b.weight / 10) },
  { name: 'coherence', f: (b) => b.coherence },
  { name: 'magnitude', f: (b) => Math.min(1, resultant(b).magnitude / 6) },
  { name: 'const', f: () => 0.7 },
];

/** What drives brightness. */
const INTENSITY_TERMS: readonly { readonly name: string; readonly f: (b: BeliefState) => number }[] = [
  { name: 'coherence', f: (b) => b.coherence },
  { name: 'share', f: (b) => dominantPlane(b).share },
  { name: 'weight', f: (b) => Math.min(1, b.weight / 10) },
];

/**
 * The continuous half of the design.
 *
 * ── WHY THESE ARE PARAMETERS AND NOT LITERALS ───────────────────────────────
 *
 * The first draft of this file had `0.3`, `0.06`, `0.05` and `0.4` written
 * inline. Those are four aesthetic decisions made by the same taste that
 * weighted a numerological idea at 0.75 and was wrong. Lifting them out does not
 * make them right, but it makes them MEASURABLE — `evolve.ts` mutates this
 * vector under the same fitness the structural search uses, so the constants are
 * selected rather than asserted.
 *
 * Four numbers, and the space is continuous, which is exactly why enumeration
 * cannot handle it and a mutation loop can.
 */
export interface FormParams {
  /** How far a mark sits from the widget centre, in widget widths. */
  readonly reach: number;
  /** A mark's radius before any size term contributes. */
  readonly base: number;
  /** How much the size term grows a mark's radius. */
  readonly gain: number;
  /**
   * The normalised contrast a zero-intensity mark holds.
   *
   * In units of `web/lc-ramp.ts`: 0 is the disappearance floor, 1 is the
   * brightest ink the palette has. Raising it buys visibility and spends range,
   * and the search is what decides that trade rather than a preference.
   */
  readonly floor: number;
}

export const DEFAULT_PARAMS: FormParams = { reach: 0.30, base: 0.06, gain: 0.05, floor: 0.00 };

/** Bounds every mutation is clamped into. Outside these a widget stops working. */
export const PARAM_BOUNDS: { readonly [K in keyof FormParams]: readonly [number, number] } = {
  reach: [0.10, 0.48],
  base: [0.02, 0.14],
  gain: [0.00, 0.30],
  floor: [0.00, 0.85],
};

/** Applies the luminance floor. Intensity drives luminance only, never hue. */
const lum = (i: number, p: FormParams): number => p.floor + (1 - p.floor) * Math.max(0, Math.min(1, i));

/**
 * The anchor: a dim mark at the widget's centre, present in every form.
 *
 * ── PUT HERE BY A SCREENSHOT, WHICH IS THE ONLY THING THAT COULD HAVE ───────
 *
 * The first render of the search's winner showed five marks clinging to the
 * widget's rim with nothing in the middle. A heading needs an origin to be a
 * heading; without one the arc reads as a decorative smear whose position on the
 * ring means nothing, because there is no fixed thing it is displaced FROM.
 *
 * The 4D audit had already said this in general terms — "loss of visual
 * grounding... nothing to bridge the gap between complex mathematics and the
 * spatial intuition required for natural gameplay" — and `web/board4d.ts`
 * adopted its fix as a cast shadow. This is the same fix in the same spirit, and
 * it is in the GRAMMAR rather than the renderer so that every candidate carries
 * it and the search is not made to choose between designs that differ in whether
 * they are grounded.
 */
const anchor = (p: FormParams): Mark => ({ x: 0.5, y: 0.5, r: p.base * 0.8, intensity: lum(0, p) });

/** The mark's geometry. */
const FORMS: readonly {
  readonly name: string;
  readonly f: (angle: number, size: number, intensity: number, p: FormParams) => Mark[];
}[] = [
  {
    // A needle: one mark, offset from centre along the belief angle.
    name: 'needle',
    f: (a, s, i, p) => [
      anchor(p),
      {
        x: 0.5 + Math.cos(a) * p.reach * s,
        y: 0.5 + Math.sin(a) * p.reach * s,
        r: p.base * 1.5 + p.gain * s,
        intensity: lum(i, p),
      },
    ],
  },
  {
    // A rose: six marks around the anchor, one per rotation plane of R⁴.
    name: 'rose',
    f: (a, s, i, p) => [
      anchor(p),
      ...Array.from({ length: 6 }, (_, k) => {
        const t = a + (k / 6) * Math.PI * 2;
        return {
          x: 0.5 + Math.cos(t) * p.reach * s,
          y: 0.5 + Math.sin(t) * p.reach * s,
          r: p.base * 0.7 + p.gain * s,
          intensity: lum(i, p),
        };
      }),
    ],
  },
  {
    // An arc: marks swept along the belief angle, length by size.
    name: 'arc',
    f: (a, s, i, p) => [
      anchor(p),
      ...Array.from({ length: 5 }, (_, k) => {
        const t = a - 0.5 + (k / 4) * s;
        return {
          x: 0.5 + Math.cos(t) * (p.reach + 0.02) * s,
          y: 0.5 + Math.sin(t) * (p.reach + 0.02) * s,
          r: p.base * 0.85,
          intensity: lum(i * (0.4 + 0.6 * (k / 4)), p),
        };
      }),
    ],
  },
  {
    // A disc: a single mark whose radius is the whole message.
    name: 'disc',
    f: (a, s, i, p) => [
      anchor(p),
      { x: 0.5, y: 0.5, r: p.base + (p.reach - 0.04) * s, intensity: lum(i, p) },
    ],
  },
];

export const FORM_COUNT = FORMS.length;
export const ANGLE_COUNT = ANGLE_TERMS.length;
export const SIZE_COUNT = SIZE_TERMS.length;
export const INTENSITY_COUNT = INTENSITY_TERMS.length;

export interface Candidate {
  readonly id: string;
  readonly encode: Encoding;
  /** The same encoding, with the continuous vector supplied. */
  readonly encodeWith: (b: BeliefState, p: FormParams) => Mark[];
}

/**
 * The enumerated space: form x angle x size x intensity.
 *
 * 4 x 3 x 4 x 3 = 144 candidates, generated mechanically. As with the policy
 * grammar, nothing is hand-added — widening the space means adding a term to a
 * list, which is a number `verify-belief` counts and pins.
 */
export function encodings(): readonly Candidate[] {
  const out: Candidate[] = [];
  for (const form of FORMS) {
    for (const angle of ANGLE_TERMS) {
      for (const size of SIZE_TERMS) {
        for (const intensity of INTENSITY_TERMS) {
          out.push({
            id: `${form.name}/${angle.name}/${size.name}/${intensity.name}`,
            encode: (b) => form.f(angle.f(b), size.f(b), intensity.f(b), DEFAULT_PARAMS),
            encodeWith: (b, p) => form.f(angle.f(b), size.f(b), intensity.f(b), p),
          });
        }
      }
    }
  }
  return out;
}

/** Pixel distance between two renderings, as mean mark displacement. */
export function marksDistance(a: readonly Mark[], b: readonly Mark[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    acc += Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y)
      + Math.abs(a[i]!.r - b[i]!.r)
      + Math.abs(a[i]!.intensity - b[i]!.intensity) * 0.5;
  }
  return acc / n;
}
