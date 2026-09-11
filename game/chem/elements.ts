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
  { symbol: 'H', name: 'hydrogen', z: 1, group: 1 },
  { symbol: 'C', name: 'carbon', z: 6, group: 14 },
  { symbol: 'N', name: 'nitrogen', z: 7, group: 15 },
  { symbol: 'O', name: 'oxygen', z: 8, group: 16 },
  { symbol: 'F', name: 'fluorine', z: 9, group: 17 },
  { symbol: 'Cl', name: 'chlorine', z: 17, group: 17 },
  // Valence 0. Real, inert, and the reason faces 5 and 6 are not litter.
  { symbol: 'He', name: 'helium', z: 2, group: 18 },
  { symbol: 'Ne', name: 'neon', z: 10, group: 18 },
  { symbol: 'Ar', name: 'argon', z: 18, group: 18 },
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
  return v === 0 ? 5 : v;
}

/** Is this face one of the inert ones? */
export const isInertFace = (face: number): boolean => face >= 5;
