// game/chem/bonds.ts — bond energies, and the two different questions they answer.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SIGN, AND WHY IT NEEDED AN AUDITOR TO CATCH.
//
// Round 1 of the independent audit said scoring by summed bond energy was "a
// real number used decoratively, as players are merely collecting high-value
// numbers rather than learning to optimize stability", and asked for enthalpy
// change instead. That was accepted, written as "bonds broken minus bonds
// formed", and it is WRONG — round 3 caught it:
//
//   "If the score is 'Energy released' (which should be positive for stable
//    molecules), but the formula is 'bonds broken minus bonds formed,' a player
//    who forms many bonds will receive a low or negative score. The formula as
//    written rewards the destruction of bonds (instability) rather than the
//    formation of them (stability)."
//
// Exactly so. ΔH = Σ(broken) − Σ(formed), and ΔH is NEGATIVE when energy is
// released. Scoring ΔH directly would have penalised every stable molecule a
// player completed. The score is energy released, which is −ΔH.
//
// ─────────────────────────────────────────────────────────────────────────────
// AND THEN THE INTERESTING PART, WHICH FALLS OUT OF FIXING THE SIGN.
//
// Getting the sign right exposes something the design had been glossing. The
// board's tiles are FREE ATOMS. Building a molecule out of free atoms breaks
// nothing, so:
//
//     energyReleased = Σ(formed) − 0 = Σ(formed)
//
// which is the atomisation enthalpy — a real quantity, always positive, and
// **numerically identical to the summed bond energy round 1 objected to**. The
// fix and the thing it was fixing are the same number, in this one case.
//
// So round 1's objection is not answered by arithmetic. It is answered by giving
// the player something where the two differ, and there is exactly one such
// thing: a REACTION between molecules that already exist. There, bonds really
// are broken, ΔH can go either way, and "which arrangement of these same atoms
// is more stable" becomes the actual question. That is what combustion is.
//
//     CH₄ + 2 O₂ → CO₂ + 2 H₂O
//
// releases energy because the bonds in the products are collectively stronger
// than the bonds in the reactants — not because anything got bigger.
//
// Hence two functions below rather than one. `formationEnergy` prices building
// from atoms; `reactionEnergy` prices rearranging. Only the second can be
// negative, and only the second teaches stability.

/** Bond multiplicity. Chemistry has no fourth. */
export type Order = 1 | 2 | 3;

/**
 * Mean bond enthalpies, kJ/mol, as integers.
 *
 * INTEGERS BECAUSE THIS FEEDS SCORING. The repository forbids floats anywhere a
 * score or a settlement can reach, and these are published to two or three
 * significant figures anyway — a tenth of a kJ/mol is noise in a mean bond
 * enthalpy, which varies by molecular context.
 *
 * These are MEAN values across compounds, which is a real approximation and is
 * stated rather than hidden: the C–H in methane is not exactly the C–H in
 * ethanol. For a game that teaches the shape of the idea, means are the right
 * grain; a player who later learns that bond enthalpies are context-dependent
 * learns a refinement, not a correction.
 */
const TABLE: readonly (readonly [string, string, Order, number])[] = [
  // Single bonds to hydrogen — the ones a beginner meets first.
  ['H', 'H', 1, 436], ['C', 'H', 1, 413], ['N', 'H', 1, 391], ['O', 'H', 1, 463],
  ['F', 'H', 1, 567], ['Cl', 'H', 1, 431],
  // Carbon–carbon, the whole of organic chemistry in three numbers.
  ['C', 'C', 1, 348], ['C', 'C', 2, 614], ['C', 'C', 3, 839],
  // Carbon–nitrogen.
  ['C', 'N', 1, 293], ['C', 'N', 2, 615], ['C', 'N', 3, 891],
  // Carbon–oxygen. The 799 is why combustion pays.
  ['C', 'O', 1, 358], ['C', 'O', 2, 799],
  // Nitrogen–nitrogen. 941 is the reason the atmosphere is inert.
  ['N', 'N', 1, 163], ['N', 'N', 2, 418], ['N', 'N', 3, 941],
  // Oxygen–oxygen. Note how weak the single bond is: that is why H₂O₂ decomposes.
  ['O', 'O', 1, 146], ['O', 'O', 2, 495],
  // Halogens.
  ['F', 'F', 1, 155], ['Cl', 'Cl', 1, 243], ['C', 'F', 1, 485], ['C', 'Cl', 1, 328],
  ['N', 'O', 1, 201], ['N', 'O', 2, 607], ['O', 'F', 1, 190], ['O', 'Cl', 1, 203],
];

const key = (a: string, b: string, order: Order): string =>
  `${a < b ? a : b}-${a < b ? b : a}:${order}`;

/**
 * The lookup, built THROUGH `key` rather than written out by hand.
 *
 * ── A BUG THAT ONLY RUNNING IT COULD FIND ─────────────────────────────────
 *
 * The table was originally a map of literal strings: `['O-H:1', 463]`. But a
 * bond has no inherent direction, so `bondEnergy` normalises its two symbols
 * alphabetically before looking them up — and 'H' sorts before 'O'. Every entry
 * I had happened to write in non-alphabetical order was therefore unreachable:
 * O–H, N–H, O–F and O–Cl all silently resolved to null. Water could not be
 * priced.
 *
 * Two literal forms of the same fact drifted apart, which is the defect this
 * repository refuses everywhere else. Building the map through the same
 * function that reads it means the two CANNOT disagree — the normalisation is
 * applied once, to both sides, by construction.
 */
const ENERGY: ReadonlyMap<string, number> = new Map(
  TABLE.map(([a, b, order, e]) => [key(a, b, order), e]),
);

/** One bond in a molecule: two atoms and how many pairs they share. */
export interface Bond {
  readonly a: string;
  readonly b: string;
  readonly order: Order;
}

/**
 * The energy of one bond, kJ/mol, or null if this project has no value for it.
 *
 * NULL RATHER THAN A GUESS. A missing bond energy is a gap in the data, and
 * inventing a plausible number for it would put a fabricated quantity into a
 * score that the game presents to players as real. `verify-chem` asserts that
 * every bond in every library molecule resolves, so a gap fails the suite rather
 * than silently scoring zero.
 */
export function bondEnergy(b: Bond): number | null {
  return ENERGY.get(key(b.a, b.b, b.order)) ?? null;
}

/** Every bond this project can price. Exposed so an oracle can sweep them. */
export function knownBonds(): readonly string[] {
  return [...ENERGY.keys()];
}

/**
 * Energy released by assembling these bonds FROM FREE ATOMS, kJ/mol.
 *
 * The atomisation enthalpy. Always ≥ 0, because forming a bond from separated
 * atoms always releases energy — that is what a bond IS. Throws on an unpriced
 * bond rather than returning a number that pretends to be complete.
 */
export function formationEnergy(bonds: readonly Bond[]): number {
  let total = 0;
  for (const b of bonds) {
    const e = bondEnergy(b);
    if (e === null) {
      throw new RangeError(
        `formationEnergy: no bond energy for ${b.a}-${b.b} order ${b.order}. A score must not ` +
          'be computed from an invented quantity; add the measured value or remove the molecule.',
      );
    }
    total += e;
  }
  return total;
}

/**
 * Energy released by a reaction, kJ/mol. This is −ΔH.
 *
 * Positive means EXOTHERMIC — the products hold their atoms more tightly than
 * the reactants did, and the difference comes out as heat. Negative means the
 * reaction has to be driven.
 *
 * This is the only function here that can return a negative number, and it is
 * the only one that can teach what stability means. Rearranging a fixed set of
 * atoms into a better arrangement is the whole idea; building something large is
 * not.
 */
export function reactionEnergy(broken: readonly Bond[], formed: readonly Bond[]): number {
  return formationEnergy(formed) - formationEnergy(broken);
}
