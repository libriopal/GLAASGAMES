// game/chem/library.ts — the molecules that exist.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS TABLE IS THE SCARCITY MECHANISM, AND IT IS ALSO THE HONESTY MECHANISM.
//
// The independent audit's directive after round 1 was "introduce scarcity by
// making most connectivity patterns chemically impossible". Measured over the
// same 60 boards, requiring a satisfiable region to ALSO appear here cuts the
// available moves from 40.9 per board to 10.3 — three quarters of the
// arithmetically valid shapes are not molecules and are rejected.
//
// The thing worth noticing is that this is ONE constraint doing TWO jobs. A
// difficulty knob would have been a number somebody tuned. This is a fact:
// either the molecule exists or it does not, and the game gets harder because
// reality is specific. Every other match-3 pays in points someone invented; this
// one refuses shapes because they are not things.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS IN HERE AND WHAT IS DELIBERATELY NOT.
//
// Only molecules with unambiguous Lewis structures that a player can build from
// valence alone. Excluded on purpose, with reasons, because the exclusions are
// where a chemistry game usually starts lying:
//
//   CO      carbon monoxide. A triple bond with formal charges on both atoms;
//           carbon ends up with valence 3, not 4. Real, important, and it would
//           teach that carbon's valence is negotiable before a player has
//           learned that it usually is not.
//   O₃      ozone. Resonance — the two bonds are equivalent and neither is
//           purely single or double. A game that drew one of each would be
//           teaching a picture chemists specifically warn against.
//   NO, NO₂ odd electron counts. Genuine radicals; no closed-shell structure.
//   benzene resonance again, and six carbons is outside playable region sizes.
//
// Each of those is a good thing to learn LATER. None of them can be learned from
// a rule that says "valence is exact", which is the rule this game runs on.

import { type Bond } from './bonds.js';

export interface Molecule {
  /** Hill-notation formula, as a chemist writes it. */
  readonly formula: string;
  readonly name: string;
  /** Atom symbols, indexed; bonds refer to these positions. */
  readonly atoms: readonly string[];
  /** Connectivity as [i, j, order] over `atoms`. */
  readonly skeleton: readonly (readonly [number, number, 1 | 2 | 3])[];
  /**
   * Standard molar entropy S° at 298 K, in J/(mol·K), gas phase.
   *
   * ── WHY A SECOND TABLE OF MEASURED NUMBERS ──────────────────────────────
   *
   * The round-7 audit's finding, and it is the deepest one this design
   * received: "The design teaches that Enthalpy (ΔH) is the sole arbiter of
   * spontaneity, provided energy is available. It ignores Entropy (ΔS)... A
   * reaction can be endothermic but still occur spontaneously if the entropy
   * increase is large enough."
   *
   * Correct, and it is the one place left where the game would mark a student
   * wrong. Ice melts while absorbing heat; ammonium nitrate dissolves and gets
   * cold. Enthalpy alone cannot express either.
   *
   * These are tabulated standard entropies, on the same footing as the bond
   * enthalpies — measured values, not a model. Gas phase throughout, because
   * every molecule the board holds is treated as a gas and mixing phases would
   * quietly change what the numbers mean.
   */
  readonly entropy: number;
  /**
   * The angle at the central atom, in degrees, for molecules that have one.
   *
   * ── TABULATED, BECAUSE A SCHEMATIC ANGLE CANNOT BE RIGHT FOR BOTH ─────────
   *
   * The tile first spread substituents evenly around a circle, which drew water
   * as a straight line of three atoms. Water is famously BENT, and a drawing
   * that straightens it is not neutral about shape — it is wrong about it.
   *
   * Capping the spread fixed water and immediately broke carbon dioxide, which
   * IS linear at 180 degrees. One schematic angle cannot serve both, and picking
   * the one that flatters more molecules would be choosing which to misdraw.
   *
   * So these are measured values, on the same footing as the bond enthalpies and
   * the entropies: 104.5 for water, 180 for CO₂ and the other linear species,
   * about 95 across the O–O–H of hydrogen peroxide. Molecules with three or four
   * substituents take the 2D conventions a chemist draws by hand — 120 and 90 —
   * because a flat tile cannot show a tetrahedron and pretending otherwise would
   * be a worse lie than the convention.
   *
   * This is the SHAPE OF A MOLECULE, which is a fact about that molecule. It is
   * not the hidden lattice, and `verify-chem` C9 still forbids describing that
   * as geometry anywhere in the rules.
   */
  readonly angle?: number;
  /** One true thing a player is told when they build it. */
  readonly fact: string;
}

export const MOLECULES: readonly Molecule[] = [
  {
    formula: 'H2', name: 'hydrogen', atoms: ['H', 'H'], skeleton: [[0, 1, 1]],
    entropy: 130.7,
    fact: 'The simplest molecule there is: two atoms sharing one pair of electrons.',
  },
  {
    formula: 'HF', name: 'hydrogen fluoride', atoms: ['H', 'F'], skeleton: [[0, 1, 1]],
    entropy: 173.8,
    fact: 'The H–F bond is 567 kJ/mol, the strongest single bond to hydrogen there is.',
  },
  {
    formula: 'HCl', name: 'hydrogen chloride', atoms: ['H', 'Cl'], skeleton: [[0, 1, 1]],
    entropy: 186.9,
    fact: 'Dissolved in water this is hydrochloric acid — the acid in your stomach.',
  },
  {
    formula: 'O2', name: 'oxygen', atoms: ['O', 'O'], skeleton: [[0, 1, 2]],
    entropy: 205.2,
    fact: 'A double bond. Oxygen is an oxidiser, not a fuel — it makes other things burn.',
  },
  {
    formula: 'N2', name: 'nitrogen', atoms: ['N', 'N'], skeleton: [[0, 1, 3]],
    entropy: 191.6,
    fact: 'A triple bond of 941 kJ/mol. It is why 78% of the air does almost nothing.',
  },
  {
    formula: 'F2', name: 'fluorine', atoms: ['F', 'F'], skeleton: [[0, 1, 1]],
    entropy: 202.8,
    fact: 'Only 155 kJ/mol — a weak bond, which is why fluorine is so ferociously reactive.',
  },
  {
    formula: 'Cl2', name: 'chlorine', atoms: ['Cl', 'Cl'], skeleton: [[0, 1, 1]],
    entropy: 223.1,
    fact: 'A greenish gas. The Cl–Cl bond is weak enough that light alone can break it.',
  },
  {
    angle: 104.5, formula: 'H2O', name: 'water', atoms: ['O', 'H', 'H'], skeleton: [[0, 1, 1], [0, 2, 1]],
    entropy: 188.8,
    fact: 'Oxygen forms two bonds, so it takes TWO hydrogens. That is where the 2 comes from.',
  },
  {
    angle: 180, formula: 'CO2', name: 'carbon dioxide', atoms: ['C', 'O', 'O'], skeleton: [[0, 1, 2], [0, 2, 2]],
    entropy: 213.8,
    fact: 'Two double bonds. Carbon uses all four of its bonds, two to each oxygen.',
  },
  {
    angle: 180, formula: 'HCN', name: 'hydrogen cyanide', atoms: ['C', 'H', 'N'], skeleton: [[0, 1, 1], [0, 2, 3]],
    entropy: 201.8,
    fact: 'Carbon holds one hydrogen and triple-bonds the nitrogen. Famously toxic.',
  },
  {
    formula: 'NH3', name: 'ammonia', atoms: ['N', 'H', 'H', 'H'],
    skeleton: [[0, 1, 1], [0, 2, 1], [0, 3, 1]],
    entropy: 192.8,
    fact: 'Nitrogen forms three bonds. Making this from N2 feeds roughly half the world.',
  },
  {
    angle: 95, formula: 'H2O2', name: 'hydrogen peroxide', atoms: ['O', 'O', 'H', 'H'],
    skeleton: [[0, 1, 1], [0, 2, 1], [1, 3, 1]],
    entropy: 232.9,
    fact: 'The O–O single bond is only 146 kJ/mol — so weak the molecule falls apart on its own.',
  },
  {
    angle: 180, formula: 'C2H2', name: 'acetylene', atoms: ['C', 'C', 'H', 'H'],
    skeleton: [[0, 1, 3], [0, 2, 1], [1, 3, 1]],
    entropy: 200.9,
    fact: 'A carbon–carbon triple bond. Burns hot enough to cut steel.',
  },
  {
    formula: 'CH4', name: 'methane', atoms: ['C', 'H', 'H', 'H', 'H'],
    skeleton: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
    entropy: 186.3,
    fact: 'Carbon forms four bonds, so four hydrogens fit. Natural gas.',
  },
  {
    formula: 'CH3Cl', name: 'chloromethane', atoms: ['C', 'H', 'H', 'H', 'Cl'],
    skeleton: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
    entropy: 234.6,
    fact: 'Methane with one hydrogen swapped for chlorine — both form exactly one bond.',
  },
  {
    angle: 120, formula: 'CH2O', name: 'formaldehyde', atoms: ['C', 'O', 'H', 'H'],
    skeleton: [[0, 1, 2], [0, 2, 1], [0, 3, 1]],
    entropy: 218.8,
    fact: 'A carbon–oxygen double bond plus two hydrogens: carbon’s four bonds, spent.',
  },
];

/** A molecule's bonds, resolved to symbols for pricing. */
export function bondsOf(m: Molecule): Bond[] {
  return m.skeleton.map(([i, j, order]) => ({ a: m.atoms[i]!, b: m.atoms[j]!, order }));
}

/** Sorted valence-multiset key, for looking a shape up by what it is made of. */
export function shapeKey(valences: readonly number[]): string {
  return [...valences].sort((a, b) => a - b).join(',');
}
