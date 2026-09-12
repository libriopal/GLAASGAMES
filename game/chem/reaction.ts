// game/chem/reaction.ts — rearranging atoms, which is the only thing that can
// teach stability.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS: A MEASUREMENT KILLED THE PREVIOUS SCORING RULE.
//
// Scoring the assembly of molecules from FREE ATOMS was measured over 400 paired
// rounds and found to teach nothing. Understanding valence was worth +1.43% over
// "take the biggest blob" at t = 1.23 — not significant, losing or tying on 276
// of 400 boards — while the blob heuristic itself was worth +8.37% at t = 4.13.
// The cause was structural rather than incidental:
//
//     correlation(atom count, energy) = 0.843
//
// Building from free atoms breaks no bonds, so the score is a sum over bonds
// formed, which grows with atom count. Bigger is better, and no chemistry is
// required to see it.
//
// A reaction is different in kind. Bonds break AND form, so the score is a
// DIFFERENCE, and a difference is not monotone in size. Nitrogen is the whole
// argument in one molecule: N₂ carries 941 kJ/mol, more than almost anything on
// the board, and is nearly useless as a reactant precisely because breaking that
// triple bond costs more than most rearrangements can repay. A big tile becomes
// a liability, which is a thing no amount of tile-counting will tell you.
//
// ─────────────────────────────────────────────────────────────────────────────
// CONSERVATION OF MASS IS THE CONSTRAINT, AND IT IS A LAW RATHER THAN A RULE.
//
// Atoms in equals atoms out. Nothing vanishes and nothing is conjured. Most
// match-3 games rely on tiles simply disappearing; this one cannot, and the
// refusal is not an inconvenience — it is the reason the products are forced
// rather than chosen, which is what makes a balanced equation balanced.

import { type Bond, formationEnergy } from './bonds.js';
import { MOLECULES, type Molecule, bondsOf } from './library.js';

/** How many of each element. The unit of conservation. */
export type Inventory = ReadonlyMap<string, number>;

export function inventoryOf(molecules: readonly Molecule[]): Map<string, number> {
  const inv = new Map<string, number>();
  for (const m of molecules) {
    for (const a of m.atoms) inv.set(a, (inv.get(a) ?? 0) + 1);
  }
  return inv;
}

const totalAtoms = (inv: Inventory): number => {
  let n = 0;
  for (const v of inv.values()) n += v;
  return n;
};

/** Molecules sorted largest first, so the search prunes early and hard. */
const ORDERED: readonly Molecule[] = [...MOLECULES].sort((a, b) => b.atoms.length - a.atoms.length);

/** Cached per-molecule atom counts and bond energies — both are constant. */
const MOL_ATOMS: ReadonlyMap<string, ReadonlyMap<string, number>> = new Map(
  MOLECULES.map((m) => [m.formula, inventoryOf([m])]),
);
const MOL_ENERGY: ReadonlyMap<string, number> = new Map(
  MOLECULES.map((m) => [m.formula, formationEnergy(bondsOf(m))]),
);
const MOL_ENTROPY: ReadonlyMap<string, number> = new Map(
  MOLECULES.map((m) => [m.formula, m.entropy]),
);

/**
 * Room temperature, in kelvin. The one place a temperature appears.
 *
 * ΔG depends on T, so a single number here is a modelling choice and not a
 * measurement: the game is played at 298 K. Making temperature a MECHANIC —
 * heating the board to let entropy pay for an endothermic reaction — is the
 * obvious next thing this enables, and it is deliberately not done yet.
 */
export const TEMPERATURE_K = 298;

export interface ProductSet {
  /** The molecules produced, by formula, with repeats. */
  readonly products: readonly string[];
  /** Total bond energy held by the products, kJ/mol. */
  readonly energy: number;
}

/**
 * Every multiset of library molecules whose atoms exactly equal `inventory`.
 *
 * ── THE IDENTITY PARTITION ALWAYS EXISTS, AND THAT MATTERS ──────────────────
 *
 * The independent audit's objection to this design was that conservation plus a
 * finite library makes the constraint "brittle" — that a player could select a
 * perfectly reasonable region which "simply cannot be mathematically partitioned
 * into the 16 library molecules", turning the game into a broken partition
 * puzzle.
 *
 * The premise is not quite right, and the difference is worth stating precisely
 * rather than waving away: the reactants THEMSELVES are always a valid product
 * set, because they are already library molecules whose atoms are by definition
 * the inventory. So a selection is never mathematically impossible. What it can
 * be is INERT — the only arrangement available is the one you started with, and
 * nothing happens.
 *
 * That is a real failure of a different kind, and it is the one to measure: not
 * "can this be partitioned" but "is there an arrangement BETTER than the one you
 * have". `bestReaction` answers that, and the rate is measured rather than
 * assumed.
 */
export function productSets(inventory: Inventory, limit = 4000): ProductSet[] {
  const remaining = new Map(inventory);
  const out: ProductSet[] = [];
  const chosen: string[] = [];

  const fits = (m: Molecule): boolean => {
    const need = MOL_ATOMS.get(m.formula)!;
    for (const [sym, n] of need) if ((remaining.get(sym) ?? 0) < n) return false;
    return true;
  };
  const take = (m: Molecule, sign: number): void => {
    for (const [sym, n] of MOL_ATOMS.get(m.formula)!) {
      remaining.set(sym, (remaining.get(sym) ?? 0) - sign * n);
    }
  };

  // `from` never decreases, so each multiset is generated exactly once.
  const search = (from: number): void => {
    if (out.length >= limit) return;
    if (totalAtoms(remaining) === 0) {
      out.push({
        products: [...chosen],
        energy: chosen.reduce((a, f) => a + MOL_ENERGY.get(f)!, 0),
      });
      return;
    }
    for (let i = from; i < ORDERED.length; i += 1) {
      const m = ORDERED[i]!;
      if (!fits(m)) continue;
      take(m, 1);
      chosen.push(m.formula);
      search(i);
      chosen.pop();
      take(m, -1);
    }
  };

  search(0);
  return out;
}

export interface Reaction {
  readonly reactants: readonly string[];
  readonly products: readonly string[];
  /**
   * Energy released, kJ/mol. This is −ΔH.
   *
   * POSITIVE is exothermic and pays. NEGATIVE is endothermic and costs that much
   * to drive — which is a price, not a prohibition. See `bestRearrangement`.
   */
  readonly released: number;
}

/** Does this reaction have to be driven? Absorbs heat. */
export const isEndothermic = (r: Reaction): boolean => r.released < 0;

/**
 * Does it happen on its own? ΔG < 0.
 *
 * ── ENTHALPY IS NOT SPONTANEITY, AND SAYING SO WAS THE LAST REAL ERROR ──────
 *
 * The round-7 audit: "The design teaches that Enthalpy (ΔH) is the sole arbiter
 * of spontaneity, provided energy is available. It ignores Entropy (ΔS). In real
 * chemistry, a reaction's ability to proceed (Gibbs Free Energy, ΔG = ΔH − TΔS)
 * depends on the change in disorder. A reaction can be endothermic but still
 * occur spontaneously if the entropy increase is large enough."
 *
 * Exactly so, and it is the difference between a game that models chemistry and
 * one that models heat. Ice melts while absorbing energy. Ammonium nitrate
 * dissolves and gets cold. Both are endothermic and both happen unaided, because
 * disorder increases enough to pay for the heat.
 *
 * The check on this is a number that cannot be fudged: the Haber process has a
 * published ΔG° of about −33 kJ/mol, and it is NOT ΔH, which is −92. Getting −33
 * out of tabulated bond enthalpies and tabulated entropies is only possible if
 * both tables and the formula are right.
 */
export const isSpontaneous = (r: Reaction): boolean => gibbs(r) < 0;

/**
 * The best rearrangement of these molecules, or null if nothing beats them.
 *
 * "Best" is most energy released, which is the thermodynamic answer. The audit
 * was asked whether that is right given that real reactions are governed by
 * kinetics too, and said yes for a game: "Kinetics introduces stochasticity and
 * 'unearned' failure... that would frustrate players." The thing this therefore
 * teaches wrongly is recorded rather than hidden — see `design/` — namely that
 * mixtures do not in fact spontaneously find their most stable arrangement.
 */
export function bestReaction(reactants: readonly Molecule[]): Reaction | null {
  const r = bestRearrangement(reactants);
  return r !== null && r.released > 0 ? r : null;
}

/**
 * The best rearrangement, WHETHER OR NOT IT RELEASES ENERGY.
 *
 * ── ENDOTHERMIC IS NOT IMPOSSIBLE, AND SAYING SO WAS A REAL ERROR ───────────
 *
 * `bestReaction` returned null for anything that did not pay, and the round-6
 * audit named the consequence:
 *
 *   "The design teaches that endothermic reactions are 'invalid' or 'impossible'
 *    moves rather than simply 'energy-requiring' ones. By 'refusing' the N₂ + O₂
 *    reaction, the game treats endothermicity as a violation of the game's rules
 *    rather than a fundamental thermodynamic reality where energy must be
 *    supplied to drive the process."
 *
 * That is correct and it is the kind of false that sticks. Endothermic reactions
 * are ordinary: photosynthesis runs on sunlight, the Haber process needs heat and
 * pressure, electrolysis splits water by paying for it. Refusing them implies
 * they cannot happen.
 *
 * So the sign is no longer a gate. A negative `released` means the reaction COSTS
 * that much to drive, and whether a player can afford it is a question for the
 * game rather than for chemistry.
 */
export function bestRearrangement(reactants: readonly Molecule[]): Reaction | null {
  if (reactants.length < 2) return null;
  const inventory = inventoryOf(reactants);
  const before = reactants.reduce((a, m) => a + MOL_ENERGY.get(m.formula)!, 0);
  const starting = [...reactants.map((m) => m.formula)].sort().join(' + ');

  let best: ProductSet | null = null;
  for (const set of productSets(inventory)) {
    // The identity partition is not a reaction, whatever its energy.
    if ([...set.products].sort().join(' + ') === starting) continue;
    if (best === null || set.energy > best.energy) best = set;
  }
  if (best === null) return null;

  return {
    reactants: reactants.map((m) => m.formula),
    products: best.products,
    released: best.energy - before,
  };
}

/**
 * Entropy change of a reaction, J/(mol·K). Positive means more disorder.
 *
 * The sign is usually readable from the molecule COUNT: 3 H₂ + N₂ → 2 NH₃ turns
 * four molecules into two and its entropy falls, which is exactly why the Haber
 * process is run under enormous pressure. A player who notices that has noticed
 * Le Chatelier.
 */
export function entropyChange(r: Reaction): number {
  const sum = (fs: readonly string[]): number => fs.reduce((a, f) => a + MOL_ENTROPY.get(f)!, 0);
  return sum(r.products) - sum(r.reactants);
}

/**
 * Gibbs free energy change, kJ/mol. NEGATIVE means it goes on its own.
 *
 *     ΔG = ΔH − TΔS
 *
 * `released` is −ΔH, so ΔH is `-released`, and the entropy term converts from
 * J/(mol·K) to kJ/mol.
 */
export function gibbs(r: Reaction): number {
  return -r.released - (TEMPERATURE_K * entropyChange(r)) / 1000;
}

/** The balanced equation, written the way a chemist writes one. */
export function equationOf(r: Reaction): string {
  const tally = (fs: readonly string[]): string => {
    const counts = new Map<string, number>();
    for (const f of fs) counts.set(f, (counts.get(f) ?? 0) + 1);
    return [...counts]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([f, n]) => (n > 1 ? `${n} ${f}` : f))
      .join(' + ');
  };
  return `${tally(r.reactants)} → ${tally(r.products)}`;
}

/** Bonds broken and formed, for showing the arithmetic behind a score. */
export function accounting(r: Reaction): { broken: Bond[]; formed: Bond[] } {
  const byFormula = new Map(MOLECULES.map((m) => [m.formula, m]));
  const gather = (fs: readonly string[]): Bond[] =>
    fs.flatMap((f) => bondsOf(byFormula.get(f)!));
  return { broken: gather(r.reactants), formed: gather(r.products) };
}
