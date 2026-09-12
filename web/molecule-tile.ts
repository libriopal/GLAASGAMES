// web/molecule-tile.ts — a molecule drawn as the structure it actually is.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE TILE IS THE LEWIS STRUCTURE, DERIVED, NOT AN ICON SOMEBODY DREW.
//
// Every molecule in the library already carries its atoms and its bond orders,
// because the solver needs them. So the tile is not a separate asset that could
// drift from the chemistry — it is a projection of the same data the scoring
// runs on. Change a bond order and the picture changes, necessarily.
//
// That is the same discipline `web/board4d.ts` follows in importing the rotor
// maths instead of re-deriving it: a second, decorative copy of a fact is the
// drift this repository refuses everywhere, and it is worse in art because
// nobody diffs a drawing.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT MUST BE TRUE OF IT, AND IT IS NOT "PRETTY".
//
// Sixteen molecules share one board. A player picks a selection by reading
// tiles, so any two library molecules MUST be distinguishable at the size and
// contrast a phone actually provides. That is a measurable property of a set of
// pictures, not a matter of taste, and `verify-tiles` measures it — including
// the case that would otherwise ship silently: two molecules that render
// near-identically and make a selection a coin flip.
//
// `verify-tokens` P1-P9 already proved the dice faces survive greyscale at the
// narrowest phone. This is the same claim for a harder alphabet.

import { MOLECULES, type Molecule } from '../game/chem/library.js';
import { ELEMENTS, BY_SYMBOL, valenceOf } from '../game/chem/elements.js';
import { FONT_FIGURE, GROUND, GROUND_EDGE, GROUND_RAISED, INK, INK_DIM, toHex } from './theme.js';
import { rampColour } from './lc-ramp.js';

/** The largest and smallest atoms in play, so the radius scale spans them. */
const R_MIN = Math.min(...ELEMENTS.map((e) => e.radius));
const R_MAX = Math.max(...ELEMENTS.map((e) => e.radius));

/**
 * The tile's size in CSS pixels at the narrowest supported phone.
 *
 * Derived rather than picked: a 393 px viewport less the 16 px gutters this
 * project requires on both sides leaves 361 px for six columns, so 60 px is what
 * the board actually gets. Designing against 48 would have been designing
 * against a tile that does not exist.
 */
export const TILE_PX = 60;

/**
 * Height of the formula label as a fraction of the tile.
 *
 * ── THE LABEL IS LOAD-BEARING, AND THAT WAS MEASURED, NOT ASSUMED ───────────
 *
 * The first tile drew structure alone. Compared pairwise across all 120 pairs of
 * the 16-molecule library, ten pairs came out at an ink distance of EXACTLY
 * ZERO — H₂, HF, HCl, F₂ and Cl₂ are all "two atoms, one bond", and drawing
 * radius from valence made every valence-1 element the same circle.
 *
 * Switching to covalent radius fixed the zeroes with a fact rather than a
 * decoration, and left H₂ against HF at 0.0104 with a field mean of 0.1138 —
 * about a tenth of the typical separation. Hydrogen is 31 pm and fluorine 57, so
 * at 60 px the difference is roughly a pixel and a half of radius.
 *
 * **So the label is not ornament.** Structure carries the shape of a molecule at
 * a glance; the formula is what resolves two molecules that share a shape. Both
 * are measured: `verify-tiles` checks the pairwise separation WITH the label and
 * records the structure-only figure as the reason it is there.
 */
export const LABEL_H = 0.22;

export interface AtomMark {
  /** Unit coordinates within the tile. */
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly symbol: string;
  /** 0..1, from the element's bonding capacity. Drives luminance only. */
  readonly weight: number;
}

export interface BondMark {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly order: 1 | 2 | 3;
}

/** A glyph box in the formula label. Ink, not decoration — see `LABEL_H`. */
export interface LabelMark {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Subscripts sit lower and smaller, as a chemist writes them. */
  readonly subscript: boolean;
  readonly char: string;
}

export interface TileGeometry {
  readonly atoms: readonly AtomMark[];
  readonly bonds: readonly BondMark[];
  readonly label: readonly LabelMark[];
  readonly formula: string;
}

/**
 * The formula, laid out as glyph boxes across the bottom of the tile.
 *
 * Boxes rather than rendered text because the ink map has to see the label: a
 * measurement of "can a player tell these apart" that ignores the one channel
 * separating H₂ from HF would be measuring the wrong tile. Digits are placed as
 * real subscripts, which is how the formula is written and is itself the lesson
 * — the 2 in H₂O belongs to the hydrogen.
 */
function labelOf(formula: string, count: number): LabelMark[] {
  const chars = [...formula];
  // Capitals start a new element; lowercase continues one; digits subscript it.
  const cw = Math.min(0.155, 0.86 / Math.max(3, chars.length));
  // ── ADVANCE WIDTH IS PER GLYPH, WHICH A SCREENSHOT CAUGHT ────────────────
  //
  // Every character had the same advance, and the render showed "HCl" as
  // "HC l" — a lowercase L given a capital's width reads as a separate letter,
  // and the one molecule whose symbol has two letters is the one it breaks.
  // Chloromethane came out "CH3C l".
  const advance = (c: string): number =>
    (/[0-9]/.test(c) ? cw * 0.62 : /[a-z]/.test(c) ? cw * 0.45 : cw);
  const totalW = chars.reduce((a, c) => a + advance(c), 0);
  let x = 0.5 - totalW / 2;
  const baseline = 1 - LABEL_H * 0.5;
  return chars.map((char) => {
    const sub = /[0-9]/.test(char);
    const w = advance(char);
    const h = LABEL_H * (sub ? 0.55 : 0.8);
    const mark: LabelMark = {
      x: x + w / 2,
      y: sub ? baseline + LABEL_H * 0.14 : baseline,
      w,
      h,
      subscript: sub,
      char,
    };
    x += w;
    return mark;
  });
}

/**
 * Where the atoms sit.
 *
 * ── A CENTRAL ATOM AND ITS SATELLITES, WHICH IS HOW THESE ARE DRAWN ─────────
 *
 * Every molecule in the library is either a diatomic pair or one central atom
 * carrying substituents — that is what restricting the library to unambiguous
 * Lewis structures bought. So the layout needs no solver: the highest-valence
 * atom takes the centre, everything bonded to it goes on a ring around it, and
 * a two-atom molecule is simply a horizontal pair.
 *
 * This is a LAYOUT, and it is explicitly not a claim about geometry. Real bond
 * angles come from electron-pair repulsion and this ring does not model them;
 * `verify-chem` C9 forbids saying otherwise anywhere. A player is being shown
 * WHAT IS BONDED TO WHAT, which is what a structural formula shows and what the
 * game's rules actually depend on.
 */
export function geometryOf(m: Molecule): TileGeometry {
  const valences = m.atoms.map((s) => valenceOf(BY_SYMBOL.get(s)!.group));
  const centre = valences.indexOf(Math.max(...valences));

  // ── LAY OUT THE BONDED TREE, NOT "EVERYTHING ELSE ON A RING" ─────────────
  //
  // The first version put every non-central atom on a ring around the centre,
  // whether or not it was BONDED to the centre. Acetylene is H–C≡C–H — a chain,
  // where one hydrogen hangs off the far carbon — and the render showed it as a
  // vertical stack of overlapping circles with a bond crossing the middle. Two
  // "satellites" landed on the same point and drew a bullseye.
  //
  // The assumption that every library molecule is a star was simply false, and
  // the picture said so immediately. Walking the actual bond graph costs a few
  // lines and cannot be wrong about which atom is attached to which, because it
  // reads the same skeleton the solver scores.
  const adjacency: number[][] = m.atoms.map(() => []);
  for (const [i, j] of m.skeleton) { adjacency[i]!.push(j); adjacency[j]!.push(i); }

  const pos: { x: number; y: number }[] = m.atoms.map(() => ({ x: 0.5, y: 0.40 }));

  if (m.atoms.length === 2) {
    pos[0] = { x: 0.30, y: 0.40 };
    pos[1] = { x: 0.70, y: 0.40 };
  } else {
    // Tabulated where the molecule has a measured angle; otherwise the 2D
    // convention a chemist draws by hand. See `Molecule.angle`.
    const conventional = (n: number): number => (n >= 4 ? 90 : 120);
    const placed = new Uint8Array(m.atoms.length);
    placed[centre] = 1;
    // Bond length shrinks as the tree deepens, so a chain stays inside the tile.
    const queue: { at: number; facing: number; depth: number }[] =
      [{ at: centre, facing: -Math.PI / 2, depth: 0 }];

    while (queue.length > 0) {
      const { at, facing, depth } = queue.shift()!;
      const children = adjacency[at]!.filter((n) => placed[n] === 0);
      if (children.length === 0) continue;
      // Only a two-substituent centre can express a measured bond angle in 2D;
      // three or four take the drawing convention, because a flat tile cannot
      // show a tetrahedron and pretending otherwise is the worse lie.
      const degrees = children.length === 2 && depth === 0 && m.angle !== undefined
        ? m.angle
        : conventional(children.length);
      const step = (degrees * Math.PI) / 180;
      const first = facing - ((children.length - 1) / 2) * step;
      const reach = depth === 0 ? 0.27 : 0.20;
      children.forEach((child, k) => {
        const t = first + k * step;
        placed[child] = 1;
        pos[child] = { x: pos[at]!.x + Math.cos(t) * reach, y: pos[at]!.y + Math.sin(t) * reach };
        queue.push({ at: child, facing: t, depth: depth + 1 });
      });
    }

    // Centre the whole structure horizontally, so a chain does not drift off one
    // side of the tile just because it grew in one direction.
    const xs = pos.map((q) => q.x);
    const shift = 0.5 - (Math.min(...xs) + Math.max(...xs)) / 2;
    for (const q of pos) q.x += shift;
  }

  const maxValence = Math.max(...valences, 1);
  const atoms: AtomMark[] = m.atoms.map((symbol, i) => {
    // ── RADIUS IS THE ATOM'S OWN, NOT ITS VALENCE ─────────────────────────
    //
    // Drawing radius from valence made every valence-1 element identical, and
    // H2, HF, HCl, F2 and Cl2 became the same picture — ten pairs at an ink
    // distance of exactly zero. Covalent radius separates them with a fact:
    // chlorine IS three times the radius of hydrogen.
    const el = BY_SYMBOL.get(symbol)!;
    const t = (el.radius - R_MIN) / Math.max(1, R_MAX - R_MIN);
    return {
      x: pos[i]!.x,
      y: pos[i]!.y,
      r: 0.075 + 0.075 * t,
      symbol,
      weight: valences[i]! / maxValence,
    };
  });

  const bonds: BondMark[] = m.skeleton.map(([i, j, order]) => ({
    x1: pos[i]!.x, y1: pos[i]!.y, x2: pos[j]!.x, y2: pos[j]!.y, order,
  }));

  return { atoms, bonds, label: labelOf(m.formula, m.atoms.length), formula: m.formula };
}

/**
 * Coverage on a sampled grid — how much ink lands in each cell.
 *
 * This is what makes "can a player tell these apart" a number rather than an
 * opinion. Two tiles are compared by their ink, at a resolution close to what
 * the eye resolves at 48 px, so a pair that differs only in a label a player
 * cannot read at that size scores as identical — which is the honest verdict.
 */
export function inkMap(g: TileGeometry, n = 24): Float64Array {
  const ink = new Float64Array(n * n);
  const near = (px: number, py: number, b: BondMark): number => {
    const dx = b.x2 - b.x1;
    const dy = b.y2 - b.y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - b.x1) * dx + (py - b.y1) * dy) / len2));
    const cx = b.x1 + t * dx;
    const cy = b.y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  };

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const px = (col + 0.5) / n;
      const py = (row + 0.5) / n;
      let v = 0;
      for (const b of g.bonds) {
        // ── MULTIPLICITY IS SEPARATE LINES, NOT A THICKER ONE ───────────────
        //
        // This drew a single stroke whose width grew with bond order, and the
        // measurement caught what that costs: O₂ and N₂ came out 0.0039 apart
        // out of a field mean of 0.1106. They are two similarly sized atoms —
        // 66 pm against 71 — differing only in a double bond versus a triple,
        // so if multiplicity is a few tenths of a pixel of extra width, the two
        // molecules are the same picture.
        //
        // Chemists draw a double bond as TWO PARALLEL LINES with a gap between
        // them, and a triple as three. Doing the same is simultaneously more
        // faithful and far more separable, because a gap is a much louder
        // signal than a width.
        const dx = b.x2 - b.x1;
        const dy = b.y2 - b.y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const gap = 0.042;
        for (let k = 0; k < b.order; k += 1) {
          const offset = (k - (b.order - 1) / 2) * gap;
          const line: BondMark = {
            x1: b.x1 + nx * offset, y1: b.y1 + ny * offset,
            x2: b.x2 + nx * offset, y2: b.y2 + ny * offset,
            order: 1,
          };
          if (near(px, py, line) <= 0.013) v = Math.max(v, 0.55);
        }
      }
      for (const a of g.atoms) {
        if (Math.hypot(px - a.x, py - a.y) <= a.r) v = Math.max(v, 0.6 + 0.4 * a.weight);
      }
      // The label is ink. A distinguishability measure that skipped it would be
      // measuring a tile the player never sees.
      for (const l of g.label) {
        if (glyphInk(px, py, l)) v = Math.max(v, l.subscript ? 0.7 : 0.95);
      }
      ink[row * n + col] = v;
    }
  }
  return ink;
}

/**
 * A 3x5 bitmap for every glyph the library's formulas use.
 *
 * ── WHY A FONT LIVES IN A MEASUREMENT FILE ──────────────────────────────────
 *
 * The first version of `inkMap` drew each label character as an identical
 * rectangle, and the result was a measurement that could not see the difference
 * between "O2" and "N2" — it reported them 0.0069 apart WITH the label, exactly
 * as without it, and would have concluded the label was useless.
 *
 * The label was not useless; the instrument was blind. A distinguishability
 * measure whose glyphs are all the same box is measuring box-counting, and it
 * underestimates precisely the channel that exists to separate molecules sharing
 * a shape.
 *
 * So the glyphs are real, at the resolution the claim needs. Nine characters
 * cover the entire library, and 3x5 is about what a 10 px cap-height resolves
 * to — coarse on purpose, because a measurement that assumed more legibility
 * than a phone provides would flatter the design rather than test it.
 */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  H: ['101', '101', '111', '101', '101'],
  C: ['111', '100', '100', '100', '111'],
  N: ['101', '111', '111', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  F: ['111', '100', '110', '100', '100'],
  l: ['010', '010', '010', '010', '010'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
};

/** Is this point inside the glyph's lit bitmap? */
function glyphInk(px: number, py: number, l: LabelMark): boolean {
  const rows = GLYPHS[l.char];
  if (rows === undefined) return false;
  const u = (px - (l.x - l.w / 2)) / l.w;
  const v = (py - (l.y - l.h / 2)) / l.h;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  const row = rows[Math.min(rows.length - 1, Math.floor(v * rows.length))]!;
  return row[Math.min(row.length - 1, Math.floor(u * row.length))] === '1';
}

/** Mean absolute difference between two tiles' ink. 0 means indistinguishable. */
export function tileDistance(a: Float64Array, b: Float64Array): number {
  let acc = 0;
  for (let i = 0; i < a.length; i += 1) acc += Math.abs(a[i]! - b[i]!);
  return acc / a.length;
}

/** The closest pair in the library, which is the one that decides playability. */
export function worstPair(): { a: string; b: string; distance: number } {
  const maps = MOLECULES.map((m) => ({ formula: m.formula, ink: inkMap(geometryOf(m)) }));
  let worst = { a: '', b: '', distance: Infinity };
  for (let i = 0; i < maps.length; i += 1) {
    for (let j = i + 1; j < maps.length; j += 1) {
      const d = tileDistance(maps[i]!.ink, maps[j]!.ink);
      if (d < worst.distance) worst = { a: maps[i]!.formula, b: maps[j]!.formula, distance: d };
    }
  }
  return worst;
}

/**
 * The tile as standalone SVG markup.
 *
 * A complete `<svg>` with its own `viewBox`, because `web/tokens.ts` records
 * what happens otherwise: a caller nested one complete SVG inside another and
 * got an empty plate, caught only by a screenshot.
 *
 * Bond multiplicity is drawn as separate parallel lines — the same geometry the
 * ink map measures, so what is measured and what is drawn cannot drift.
 */
export function tileSvg(m: Molecule, px = TILE_PX): string {
  const g = geometryOf(m);
  const f = (n: number): string => n.toFixed(4);

  const bonds = g.bonds.flatMap((b) => {
    const dx = b.x2 - b.x1;
    const dy = b.y2 - b.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const gap = 0.042;
    return Array.from({ length: b.order }, (_, k) => {
      const o = (k - (b.order - 1) / 2) * gap;
      return `<line x1="${f(b.x1 + nx * o)}" y1="${f(b.y1 + ny * o)}" ` +
        `x2="${f(b.x2 + nx * o)}" y2="${f(b.y2 + ny * o)}" ` +
        `stroke="${INK_DIM}" stroke-width="0.026" stroke-linecap="round"/>`;
    });
  }).join('');

  const atoms = g.atoms.map((a) => {
    const c = rampColour(0.45 + 0.55 * a.weight);
    return `<circle cx="${f(a.x)}" cy="${f(a.y)}" r="${f(a.r)}" fill="${toHex(c)}" ` +
      `stroke="${GROUND}" stroke-width="0.016"/>`;
  }).join('');

  const label = g.label.map((l) => {
    const size = l.h * (l.subscript ? 1.5 : 1.25);
    return `<text x="${f(l.x)}" y="${f(l.y + l.h * 0.36)}" font-size="${f(size)}" ` +
      `text-anchor="middle" font-family="${FONT_FIGURE}" ` +
      `fill="${l.subscript ? INK_DIM : INK}">${l.char}</text>`;
  }).join('');

  return `<svg width="${px}" height="${px}" viewBox="0 0 1 1" role="img" ` +
    `aria-label="${m.formula}, ${m.name}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0.02" y="0.02" width="0.96" height="0.96" rx="0.10" fill="${GROUND_RAISED}" ` +
    `stroke="${GROUND_EDGE}" stroke-width="0.014"/>${bonds}${atoms}${label}</svg>`;
}
