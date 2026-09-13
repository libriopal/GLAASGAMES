// web/synth-juice.ts — the bond, and the refusal.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FIRST JUICE IN THIS PROJECT, AND IT IS A PURE FUNCTION OF PHASE.
//
// `frameAt(p)` for p in [0,1] returns the whole drawing. No timers, no mutable
// animation state, no tweens owned by the renderer. Three reasons, and only the
// first is about tidiness:
//
//   · it can be RENDERED AS A FILMSTRIP and looked at, which is the only method
//     that has ever found a visual defect in this project;
//   · it can be VERIFIED — an oracle can assert that the bond and the refusal
//     are distinguishable at every phase, which is a claim about feel that is
//     usually left unfalsifiable;
//   · it replays. A recorded round can reproduce its own animation from
//     (seed, actions) like everything else here.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE TWO ANIMATIONS START IDENTICALLY. THAT IS THE WHOLE DESIGN.
//
// Both open with the selected molecules drifting together and bonds beginning to
// form. The game shows it TRYING, because the player's intent was legible and
// deserves to be honoured on screen before it is answered.
//
// They diverge at p = 0.35, the moment of truth:
//
//   BOND     converge -> flash -> RELEASE OUTWARD. Bonds complete, the product
//            assembles, and the pop blooms away from the centre. Matter band.
//   REFUSE   converge -> STRAIN -> RECOIL. The bonds stretch, whiten, and SNAP;
//            the atoms are thrown back past where they started and settle with a
//            damped shake. IR band. No pop, because nothing was made.
//
// DIRECTION CARRIES THE SIGN. Bond releases outward from a centre that holds;
// refusal recoils outward from a centre that failed. Colour is redundant with
// motion rather than load-bearing, which is what keeps it legible to a
// colour-blind player and under reduced motion.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A REFUSAL GETS AN ANIMATION AT ALL.
//
// The round-5 audit of the chemistry design named the failure this prevents:
// a player who cannot tell a dud selection from a mistake experiences "a broken
// math puzzle rather than a chemistry game". `optionsFor` already designs the
// dud out by only offering live selections — but a player can still DRAG a path
// that does not react, and what happens then is the difference between the game
// saying "not that" and the game saying nothing.

import { IR_CORE, IR_DEEP, MATTER, mixRgb, toCss } from './spectrum.js';
import { type Molecule } from '../game/chem/library.js';
import { atomFill, moleculeGlyph } from './synth-screen.js';

export type JuiceVerb = 'BOND' | 'REFUSE';

/** Where the two animations stop agreeing. Before this they are identical. */
export const DIVERGE = 0.35;

/** Total duration, ms. 420 is long enough to read and short enough not to gate input. */
export const JUICE_MS = 420;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Smooth in-out, for the converge. */
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Overshoot-and-settle, for the release. */
const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Damped oscillation, for the recoil. Amplitude decays to nothing by t = 1. */
const damped = (t: number, cycles = 3): number =>
  t >= 1 ? 0 : Math.cos(t * Math.PI * 2 * cycles) * (1 - t) ** 2;

export interface JuiceCell {
  /** Screen position of this molecule before anything happens. */
  readonly x: number;
  readonly y: number;
  readonly molecule: Molecule;
}

export interface JuiceSpec {
  readonly verb: JuiceVerb;
  readonly cells: readonly JuiceCell[];
  /** kJ released. Scales the bloom; ignored for a refusal. */
  readonly released: number;
  /** Drawn at the centre once the bond completes. */
  readonly productLabel: string;
  /**
   * The molecule that is actually FORMED, drawn from its real skeleton as the
   * bond completes.
   *
   * ── THE FIRST VERSION COLLAPSED EVERY ATOM ONTO ONE POINT ──────────────────
   *
   * The filmstrip showed it immediately: by p = 0.5 the three reactant atoms had
   * converged to the centroid and overlapped exactly, so a bond looked like
   * three dots becoming ONE DOT. That is a singularity, not a synthesis. The
   * request was to show the molecules BONDING TOGETHER before popping, and
   * merging into a point shows them annihilating.
   *
   * The product is a real molecule with a real skeleton, so it is drawn as one,
   * scaling up out of the convergence while the reactant atoms fade.
   */
  readonly product?: Molecule;
}

/**
 * A cue an audio and haptic layer can consume, emitted at the phase it fires.
 *
 * Described rather than played, because nothing in this project has an audio
 * implementation yet and inventing one here would be a second source of truth
 * for timing. The phases are the same ones the drawing uses, so sound and motion
 * cannot drift apart.
 */
export interface JuiceCue {
  readonly at: number;
  readonly kind: 'converge' | 'snap' | 'bloom' | 'recoil' | 'settle';
  /** Pitch scaled by bond energy, so a bigger exotherm sounds bigger. */
  readonly pitchHz: number;
  /** Haptic strength 0..1. Fires on the COMMIT, never on the selection. */
  readonly haptic: number;
}

export function cuesFor(spec: JuiceSpec): JuiceCue[] {
  // Pitch rises with energy released, floored so a weak reaction is still
  // audible. A refusal is pitched BELOW the whole bond range so the two are
  // distinguishable without looking.
  const e = clamp01(spec.released / 1200);
  if (spec.verb === 'BOND') {
    return [
      { at: 0.0, kind: 'converge', pitchHz: 180 + e * 60, haptic: 0 },
      { at: DIVERGE, kind: 'snap', pitchHz: 520 + e * 480, haptic: 0.35 },
      { at: 0.55, kind: 'bloom', pitchHz: 320 + e * 300, haptic: 0.8 },
    ];
  }
  return [
    { at: 0.0, kind: 'converge', pitchHz: 180, haptic: 0 },
    { at: DIVERGE, kind: 'snap', pitchHz: 96, haptic: 0.25 },
    { at: 0.5, kind: 'recoil', pitchHz: 72, haptic: 0.15 },
    { at: 0.85, kind: 'settle', pitchHz: 60, haptic: 0 },
  ];
}

const hex = (s: string): { r: number; g: number; b: number } => ({
  r: parseInt(s.slice(1, 3), 16),
  g: parseInt(s.slice(3, 5), 16),
  b: parseInt(s.slice(5, 7), 16),
});

/**
 * How far each atom has travelled from its cell toward the centroid, at phase p.
 *
 * Shared by both verbs up to DIVERGE, which is what makes them start identically.
 */
export function convergence(p: number, verb: JuiceVerb): number {
  const t = clamp01(p / DIVERGE);
  const closed = easeInOut(t) * 0.62;
  if (p <= DIVERGE) return closed;
  const after = clamp01((p - DIVERGE) / (1 - DIVERGE));
  if (verb === 'BOND') {
    // Completes the journey, then the product holds at the centre.
    return 0.62 + easeOutBack(clamp01(after / 0.4)) * 0.38;
  }
  // REFUSE: thrown back past the start, then shaken down to rest.
  return 0.62 * (1 - easeOutBack(clamp01(after / 0.35))) + damped(after) * 0.22;
}

/**
 * The whole effect at phase `p`, as SVG.
 *
 * `reduceMotion` collapses it to a single luminance step, which the project's
 * accessibility rule requires and which is also the honest fallback: the
 * information is "this worked" or "this did not", and one frame can carry that.
 */
export function frameAt(spec: JuiceSpec, p: number, reduceMotion = false): string {
  const cells = spec.cells;
  if (cells.length === 0) return '';
  const cx = cells.reduce((a, c) => a + c.x, 0) / cells.length;
  const cy = cells.reduce((a, c) => a + c.y, 0) / cells.length;
  const out: string[] = [];
  const bonded = spec.verb === 'BOND';
  const accent = bonded ? MATTER[4]! : IR_CORE;

  if (reduceMotion) {
    // ONE STEP, and it has to actually be a step. The first version drew a
    // 46px disc at every phase with opacity 0.10 rising to 0.30, which reads as
    // a permanent blob rather than a change of state -- and it swamped the three
    // atoms it was meant to annotate. A thin rim that appears only after the
    // moment of truth is the honest minimum: the information is "this worked" or
    // "this did not", and a rim carries that in one frame.
    const on = p > DIVERGE;
    for (const c of cells) {
      out.push(
        `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="11" fill="${atomFill(c.molecule.atoms[0] ?? 'H')}" opacity="0.95"/>`,
      );
    }
    if (on) {
      out.push(
        `<rect x="${(cx - 62).toFixed(1)}" y="${(cy - 30).toFixed(1)}" width="124" height="60" rx="10" fill="none" ` +
          `stroke="${accent}" stroke-width="2" opacity="0.9"/>`,
      );
      out.push(
        `<text x="${cx.toFixed(1)}" y="${(cy - 40).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" ` +
          `font-size="10" fill="${bonded ? '#d8f5e4' : '#ffc9d4'}">${bonded ? spec.productLabel : 'NO BOND'}</text>`,
      );
    }
    return out.join('');
  }

  const k = convergence(p, spec.verb);
  const pos = cells.map((c) => ({
    x: c.x + (cx - c.x) * k,
    y: c.y + (cy - c.y) * k,
    m: c.molecule,
  }));

  // ── the forming bonds ─────────────────────────────────────────────────────
  // They brighten as the atoms close, and at the moment of truth either
  // COMPLETE (bond) or SNAP (refuse). A snapped bond is drawn as two stubs
  // retreating from a gap, which is the shape of a broken thing.
  const strain = clamp01(p / DIVERGE);
  for (let i = 0; i < pos.length - 1; i += 1) {
    const a = pos[i]!;
    const b = pos[i + 1]!;
    if (!bonded && p > DIVERGE) {
      const back = clamp01((p - DIVERGE) / 0.2);
      const gap = 0.12 + back * 0.38;
      out.push(
        `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${(a.x + (b.x - a.x) * (0.5 - gap)).toFixed(1)}" y2="${(a.y + (b.y - a.y) * (0.5 - gap)).toFixed(1)}" stroke="${IR_DEEP}" stroke-width="${(2.4 * (1 - back)).toFixed(2)}" opacity="${(0.9 * (1 - back)).toFixed(2)}"/>`,
      );
      out.push(
        `<line x1="${b.x.toFixed(1)}" y1="${b.y.toFixed(1)}" x2="${(b.x + (a.x - b.x) * (0.5 - gap)).toFixed(1)}" y2="${(b.y + (a.y - b.y) * (0.5 - gap)).toFixed(1)}" stroke="${IR_DEEP}" stroke-width="${(2.4 * (1 - back)).toFixed(2)}" opacity="${(0.9 * (1 - back)).toFixed(2)}"/>`,
      );
    } else {
      const w = bonded && p > DIVERGE ? 3.2 : 1.2 + strain * 2;
      const o = bonded && p > DIVERGE ? 1 : 0.25 + strain * 0.7;
      out.push(
        `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${bonded ? accent : '#e8f0ff'}" stroke-width="${w.toFixed(2)}" opacity="${o.toFixed(2)}"/>`,
      );
    }
  }

  // ── the flash at the moment of truth ──────────────────────────────────────
  const nearSnap = 1 - clamp01(Math.abs(p - DIVERGE) / 0.09);
  if (nearSnap > 0) {
    out.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(8 + nearSnap * 16).toFixed(1)}" fill="${bonded ? '#ffffff' : IR_CORE}" opacity="${(nearSnap * (bonded ? 0.85 : 0.55)).toFixed(2)}"/>`,
    );
  }

  // ── the bloom, which only a real bond earns ───────────────────────────────
  if (bonded && p > DIVERGE) {
    const after = clamp01((p - DIVERGE) / (1 - DIVERGE));
    const energy = clamp01(spec.released / 1200);
    for (let ring = 0; ring < 3; ring += 1) {
      const lag = ring * 0.14;
      const t = clamp01((after - lag) / (1 - lag));
      if (t <= 0) continue;
      const r = 14 + t * (46 + energy * 54);
      out.push(
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" ` +
          `stroke="${toCss(mixRgb(hex(MATTER[4]!), hex(MATTER[3]!), energy))}" stroke-width="${(2.6 * (1 - t)).toFixed(2)}" opacity="${(0.7 * (1 - t)).toFixed(2)}"/>`,
      );
    }
  }

  // ── the product assembling, which is what "bonding together" looks like ───
  // It grows out of the convergence while the reactant atoms fade, so the eye
  // sees the same matter becoming a different arrangement rather than vanishing.
  let atomAlpha = 1;
  if (bonded && p > DIVERGE && spec.product !== undefined) {
    const t = clamp01((p - DIVERGE) / 0.28);
    atomAlpha = 1 - t;
    out.push(
      `<g opacity="${t.toFixed(2)}">${moleculeGlyph(spec.product, cx, cy, 8 + t * 13)}</g>`,
    );
  }

  // ── the atoms ─────────────────────────────────────────────────────────────
  for (const q of pos) {
    if (atomAlpha <= 0.02) break;
    const sym = q.m.atoms[0] ?? 'H';
    // A refusal DESATURATES rather than darkens, the two-axis separation that
    // fixed Farkle's out-of-hand dice. Darkening alone would read as "gone"
    // when the tiles are in fact still there and still selectable.
    const fill = !bonded && p > DIVERGE ? toCss(mixRgb(hex(atomFill(sym)), { r: 90, g: 70, b: 80 }, 0.55)) : atomFill(sym);
    out.push(
      `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${(9 + (bonded && p > DIVERGE ? 2 : 0)).toFixed(1)}" fill="${fill}" opacity="${atomAlpha.toFixed(2)}"/>`,
    );
  }

  // ── the product, named only once it exists ────────────────────────────────
  if (bonded && p > 0.55) {
    const t = clamp01((p - 0.55) / 0.3);
    out.push(
      `<text x="${cx.toFixed(1)}" y="${(cy - 26).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" ` +
        `font-size="${(11 + t * 3).toFixed(1)}" fill="#eaf4ff" opacity="${t.toFixed(2)}">${spec.productLabel}</text>`,
    );
  }
  if (!bonded && p > 0.5) {
    const t = clamp01((p - 0.5) / 0.25);
    out.push(
      `<text x="${cx.toFixed(1)}" y="${(cy - 26).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,monospace" ` +
        `font-size="11" fill="#ffc9d4" opacity="${(t * (1 - clamp01((p - 0.85) / 0.15))).toFixed(2)}">NO BOND</text>`,
    );
  }

  return out.join('');
}
