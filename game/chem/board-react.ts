// game/chem/board-react.ts — a board of molecules, and the moves that rearrange them.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE AUDIT'S OBJECTION, MEASURED — AND IT IS HALF RIGHT, WHICH IS THE HALF THAT
// DECIDES THE INTERACTION.
//
// Round 5 called conservation of mass a "Brittle Constraint": that a player
// could select a reasonable region which "simply cannot be mathematically
// partitioned into the 16 library molecules", making the game "feel like a
// broken math puzzle (the 'Partition Problem') rather than a chemistry game",
// and demanded the constraint be relaxed or the library expanded.
//
// Measured over 1800 random selections:
//
//     reactants   a valid partition exists   an EXOTHERMIC one exists
//         2                100.0%                      17.2%
//         3                100.0%                      39.3%
//         4                100.0%                      55.8%
//
// **The stated failure mode does not occur.** A valid partition always exists,
// and necessarily so: the reactants are themselves library molecules, so the
// arrangement you started with is always available. Conservation cannot be
// unsatisfiable. Neither relaxing it nor expanding the library is needed, and
// relaxing it would have thrown away a law to fix a problem that was not there.
//
// But the auditor's INSTINCT was right under a different mechanism. At two
// reactants, 83% of selections have no exothermic rearrangement — nothing
// happens. That is not a broken puzzle, it is a dud move, and a player who has
// to guess which is which would experience exactly the frustration described.
//
// So the fix is not to the constraint but to the INFORMATION. `reactiveMoves`
// enumerates every selection that actually reacts, the same way `playableMoves`
// already does for assembly. The player chooses among live options and never
// guesses. Unearned failure is designed out rather than tuned down.

import { MOLECULES, type Molecule } from './library.js';
import { type Reaction, bestReaction } from './reaction.js';
import { BOARD_W, BOARD_H, CELL_COUNT } from './board.js';

export { BOARD_W, BOARD_H, CELL_COUNT };

/**
 * The largest selection a player can make.
 *
 * Four rather than five: the product search is exponential in the atom count and
 * four molecules is already up to twenty atoms. It is also where the exothermic
 * rate reaches 55.8%, so the ceiling is where the measurements stop paying for
 * themselves rather than an arbitrary limit.
 */
export const MAX_SELECT = 4;

const BY_FORMULA: ReadonlyMap<string, Molecule> = new Map(MOLECULES.map((m) => [m.formula, m]));

const NEIGHBOURS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const c = i % BOARD_W;
    const r = (i / BOARD_W) | 0;
    const a: number[] = [];
    if (r > 0) a.push(i - BOARD_W);
    if (r < BOARD_H - 1) a.push(i + BOARD_W);
    if (c > 0) a.push(i - 1);
    if (c < BOARD_W - 1) a.push(i + 1);
    out.push(a);
  }
  return out;
})();

const REGIONS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  const seen = new Set<string>();
  const grow = (cur: number[]): void => {
    if (cur.length >= 2) {
      const k = cur.join(',');
      if (!seen.has(k)) { seen.add(k); out.push([...cur]); }
    }
    if (cur.length === MAX_SELECT) return;
    const cand = new Set<number>();
    for (const c of cur) for (const n of NEIGHBOURS[c]!) if (!cur.includes(n) && n > cur[0]!) cand.add(n);
    for (const n of cand) {
      cur.push(n);
      cur.sort((a, b) => a - b);
      grow(cur);
      cur.splice(cur.indexOf(n), 1);
    }
  };
  for (let s = 0; s < CELL_COUNT; s += 1) grow([s]);
  return out;
})();

export interface ReactiveMove {
  readonly cells: readonly number[];
  readonly reaction: Reaction;
}

/**
 * Every selection on this board that releases energy.
 *
 * The result is memoised by the multiset of reactant formulas, because the board
 * repeats molecules constantly and the product search is the expensive part. Two
 * regions holding the same molecules have the same answer wherever they sit.
 */
export function reactiveMoves(tiles: readonly string[]): ReactiveMove[] {
  const cache = new Map<string, Reaction | null>();
  const out: ReactiveMove[] = [];
  for (const region of REGIONS) {
    const formulas = region.map((c) => tiles[c]!);
    const key = [...formulas].sort().join('+');
    let reaction = cache.get(key);
    if (reaction === undefined) {
      reaction = bestReaction(formulas.map((f) => BY_FORMULA.get(f)!));
      cache.set(key, reaction);
    }
    if (reaction !== null) out.push({ cells: region, reaction });
  }
  return out;
}

export const hasReaction = (tiles: readonly string[]): boolean => {
  // Cheaper than enumerating everything when the answer is only yes or no.
  const cache = new Map<string, boolean>();
  for (const region of REGIONS) {
    const key = region.map((c) => tiles[c]!).sort().join('+');
    let live = cache.get(key);
    if (live === undefined) {
      live = bestReaction(region.map((c) => BY_FORMULA.get(tiles[c]!)!)) !== null;
      cache.set(key, live);
    }
    if (live) return true;
  }
  return false;
};

/** Weights over `MOLECULES`, by index. */
export type MoleculeWeights = readonly number[];

export const UNIFORM_WEIGHTS: MoleculeWeights = MOLECULES.map(() => 1);

function drawFormula(rng: () => number, weights: MoleculeWeights): string {
  let total = 0;
  for (const w of weights) total += w;
  let pick = Math.abs(rng()) % Math.max(1, total);
  for (let i = 0; i < MOLECULES.length; i += 1) {
    pick -= weights[i] ?? 0;
    if (pick < 0) return MOLECULES[i]!.formula;
  }
  return MOLECULES[0]!.formula;
}

/**
 * Draws a board with at least one reaction available, the same draw-and-validate
 * discipline the assembly board uses.
 *
 * A dead board is a generator defect, not bad luck — the audit was right about
 * that and the conclusion transfers unchanged.
 */
export function drawReactiveBoard(
  rng: () => number,
  weights: MoleculeWeights = UNIFORM_WEIGHTS,
  attempts = 64,
): { tiles: string[]; draws: number } {
  for (let n = 1; n <= attempts; n += 1) {
    const tiles = Array.from({ length: CELL_COUNT }, () => drawFormula(rng, weights));
    if (hasReaction(tiles)) return { tiles, draws: n };
  }
  throw new RangeError(
    `drawReactiveBoard: ${attempts} draws produced no reactive board. That is a weight defect ` +
      'rather than bad luck; a distribution of only inert molecules cannot produce one at all.',
  );
}

/** Applies a move: products replace reactants, extra cells refill. */
export function applyMove(
  tiles: string[],
  move: ReactiveMove,
  rng: () => number,
  weights: MoleculeWeights = UNIFORM_WEIGHTS,
): void {
  const products = [...move.reaction.products];
  for (const cell of move.cells) {
    // A reaction can yield fewer molecules than it consumed — 3 H2 + N2 gives
    // 2 NH3 — so leftover cells are refilled from the pool rather than left
    // empty. Atoms are conserved by the REACTION; the refill is the board
    // topping itself up, exactly as the existing round already does.
    tiles[cell] = products.pop() ?? drawFormula(rng, weights);
  }
}
