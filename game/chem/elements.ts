// game/chem/elements.ts — the periodic table, as much of it as this game needs.
//
// ─────────────────────────────────────────────────────────────────────────────
// VALENCE IS DERIVED, NOT ASSIGNED. THAT WAS THE AUDIT'S CENTRAL DEMAND.
//
// The first version of this design handed each die face an element by hand —
// face 1 is hydrogen, face 4 is carbon — and the independent auditor called it
// what it was: "a superficial coincidence dressed as a design... arbitrary and
// ignores the periodic table."
//
// The charge was fair. A table of hand-assignments cannot be wrong in any way a
// chemist could point at, because it makes no claim; it just lists. So nothing
// below assigns a valence. Every element carries its GROUP — its column in the
// periodic table, which is a fact about the element and not about this game —
// and `valenceOf` computes the rest.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE RULE, AND WHY IT IS NOT `18 - group`.
//
// The usual classroom shorthand is "valence = 8 minus the group number", which
// works for groups 15 to 17 and then quietly fails. Boron is in group 13 and
// forms THREE bonds, not five: it is electron-deficient and simply does not
// complete an octet. Carbon in group 14 forms four, which is where the two
// halves of the rule meet.
//
// So the honest statement is that a main-group atom forms as many bonds as it
// has the cheaper of two routes to a full shell — sharing its own outer
// electrons, or borrowing enough to fill the shell:
//
//     valence = min(group - 10, 18 - group)     for groups 13-17
//
//   group 13  min(3, 5) = 3   boron, three bonds
//   group 14  min(4, 4) = 4   carbon, four
//   group 15  min(5, 3) = 3   nitrogen, three
//   group 16  min(6, 2) = 2   oxygen, two
//   group 17  min(7, 1) = 1   fluorine, one
//
// Groups 1 and 2 have one and two outer electrons and form that many bonds.
// Group 18 has a full shell already and forms none.
//
// If this derivation is wrong, it is wrong in a way somebody can point at, which
// is the entire difference between it and the table it replaced.

/** A column of the periodic table. The only per-element input this game takes. */
export type Group = 1 | 2 | 13 | 14 | 15 | 16 | 17 | 18;

export interface Element {
  /** Chemical symbol, as it is actually written. */
  readonly symbol: string;
  readonly name: string;
  /** Atomic number — identity, and the reason two isotopes are one element here. */
  readonly z: number;
  readonly group: Group;
  /**
   * Single-bond covalent radius, in picometres.
   *
   * ── ADDED BECAUSE A MEASUREMENT KILLED THE FIRST TILE DESIGN ──────────────
   *
   * The molecule tile drew each atom at a radius derived from its VALENCE. That
   * seemed reasonable — carbon is the hub, so carbon is biggest — until the
   * tiles were compared pairwise. Hydrogen, fluorine and chlorine all have
   * valence 1, so H₂, HF, HCl, F₂ and Cl₂ rendered PIXEL-IDENTICALLY: ten pairs
   * at an ink distance of exactly 0.0000, out of 120.
   *
   * A player could not have told hydrogen from chlorine, and their chemistry is
   * nothing alike — 436 kJ/mol against 243.
   *
   * Covalent radius fixes it with a fact rather than a decoration: atoms really
   * are different sizes, chlorine really is three times the radius of hydrogen,
   * and drawing them that way is more truthful than drawing them the same. It is
   * also the property a chemist would reach for, since these radii are what
   * determine how molecules pack.
   */
  readonly radius: number;
}

/**
 * Bonds an atom of this group forms. See the header for the derivation.
 *
 * Returns 0 for the noble gases, which is not a failure case — it is why they
 * make honest obstacles.
 */
export function valenceOf(group: Group): number {
  if (group === 18) return 0;
  if (group <= 2) return group;
  return Math.min(group - 10, 18 - group);
}

/**
 * The elements this game uses.
 *
 * Deliberately small. Every one of them appears in at least one molecule a
 * player can actually build, and `verify-chem` asserts that — an element on the
 * board that cannot be used is the defect that 34% of tiles had before the noble
 * gases took faces 5 and 6.
 */
export const ELEMENTS: readonly Element[] = [
  { symbol: 'H', radius: 31, name: 'hydrogen', z: 1, group: 1 },
  { symbol: 'C', radius: 76, name: 'carbon', z: 6, group: 14 },
  { symbol: 'N', radius: 71, name: 'nitrogen', z: 7, group: 15 },
  { symbol: 'O', radius: 66, name: 'oxygen', z: 8, group: 16 },
  { symbol: 'F', radius: 57, name: 'fluorine', z: 9, group: 17 },
  { symbol: 'Cl', radius: 102, name: 'chlorine', z: 17, group: 17 },
  // Valence 0. Real, inert, and the reason faces 5 and 6 are not litter.
  { symbol: 'He', radius: 28, name: 'helium', z: 2, group: 18 },
  { symbol: 'Ne', radius: 58, name: 'neon', z: 10, group: 18 },
  { symbol: 'Ar', radius: 106, name: 'argon', z: 18, group: 18 },
];

export const BY_SYMBOL: ReadonlyMap<string, Element> =
  new Map(ELEMENTS.map((e) => [e.symbol, e]));

/** Every element this game knows that forms exactly `v` bonds. */
export function elementsWithValence(v: number): readonly Element[] {
  return ELEMENTS.filter((e) => valenceOf(e.group) === v);
}

/**
 * The die face an element appears on.
 *
 * ── FACES 5 AND 6, AND THE MEASUREMENT THAT PUT NOBLE GASES THERE ───────────
 *
 * A die has six faces and main-group valence runs 1 to 6, so the first design
 * simply lined them up. Measured, that was a bad idea in a way no amount of
 * reasoning had suggested: under uniform face weights, 34% of every board was
 * valence 5 or 6, and those valences appear in NONE of the molecules small
 * enough to play. The species that need them — PCl5 at six atoms, SF6 at seven —
 * are larger than the regions a player can select.
 *
 * A third of the board would have been litter. So faces 5 and 6 carry the noble
 * gases instead: valence 0, unbondable, obstacles with a true explanation rather
 * than dead tiles with none. The auditor's word for this was "honest"; it is
 * also simply what the measurement left standing.
 */
export function faceOf(e: Element): number {
  const v = valenceOf(e.group);
  return v === 0 ? INERT_FACES[0]! : v;
}

/** The faces that carry no valence. Both of them: 5 and 6. */
export const INERT_FACES: readonly number[] = [5, 6];

/** Is this face one of the inert ones? */
export const isInertFace = (face: number): boolean => INERT_FACES.includes(face);

/**
 * The elements a given face can show.
 *
 * ── A GAP A FALLBACK WAS HIDING ─────────────────────────────────────────────
 *
 * The board drew its element with `byFace.get(face) ?? byFace.get(5)!`, and
 * `faceOf` sent every noble gas to face 5. So face 6 had NO elements of its own
 * and worked only because the `??` quietly redirected it. The board was correct
 * by accident, and the accident was one edit away from becoming a crash or, far
 * worse, a face that silently drew nothing.
 *
 * Both inert faces now resolve to the inert pool deliberately, and this function
 * THROWS on a face with no elements rather than substituting another one.
 * `verify-chem` C13 sweeps all six. A default that covers a hole is how the hole
 * survives long enough to matter.
 */
export function poolForFace(face: number): readonly Element[] {
  const pool = isInertFace(face)
    ? ELEMENTS.filter((e) => valenceOf(e.group) === 0)
    : ELEMENTS.filter((e) => valenceOf(e.group) === face);
  if (pool.length === 0) {
    throw new RangeError(
      `poolForFace: face ${face} has no elements. A board that draws it would have nothing to ` +
        'put there, and substituting another face\u2019s pool would hide that rather than report it.',
    );
  }
  return pool;
}
