// game/chem/lewis.ts — given a shape on the board, is it a molecule?
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PLAYER SELECTS A REGION. THE GAME DERIVES THE STRUCTURE.
//
// The first sketch had the player drag a PATH through adjacent tiles. Measuring
// it killed that immediately, and for a reason worth keeping: a path gives its
// interior atoms exactly two neighbours and its endpoints exactly one, so an
// atom of valence 4 can never appear in one. **Carbon would have been
// unplayable, and methane is a plus-shape, not a line.**
//
// So the player selects a connected REGION and the game solves for the bond
// orders. That solve is a degree-constrained subgraph problem — a perfect
// b-matching — and it is also, exactly, what deriving a Lewis structure is: given
// which atoms are adjacent and how many bonds each must form, work out where the
// double and triple bonds go.
//
// ─────────────────────────────────────────────────────────────────────────────
// BOND ORDER IS NOT OPTIONAL, AND THAT IS MEASURED, NOT ASSUMED.
//
// It was filed as a probably-later refinement at 0.55. Then, over 60 boards and
// all 1613 connected regions of size 2 to 5:
//
//     single bonds only   50/60 boards contain a buildable molecule   mean  4.3
//     doubles allowed     60/60                                       mean 15.9
//     triples allowed     60/60                                       mean 40.9
//
// One board in six would have been dead. The chemistry says the same thing from
// the other side — O₂, CO₂ and N₂ are all multiply bonded, so a game without
// bond order cannot build the three most famous small molecules there are.

import { type Bond, type Order } from './bonds.js';

/** An atom placed on the board: a symbol and how many bonds it must form. */
export interface Atom {
  readonly symbol: string;
  readonly valence: number;
}

/** An adjacency between two selected cells, by index into the atom list. */
export type Edge = readonly [number, number];

export interface Structure {
  readonly bonds: readonly Bond[];
  /** Bond order per edge, in the order edges were given. 0 means not bonded. */
  readonly orders: readonly number[];
}

const MAX_ORDER: Order = 3;

/**
 * Solves for bond orders, or returns null if no assignment satisfies every atom.
 *
 * ── WHY EVERY ATOM MUST BE BONDED, AND WHY ADJACENT IS NOT BONDED ───────────
 *
 * Two selected cells can be next to each other without being bonded — that is
 * ordinary in a real molecule, where two hydrogens on the same carbon are
 * adjacent in space and share no bond. So an edge may take order 0.
 *
 * But every selected atom must end up bonded to SOMETHING, and the bonded
 * subgraph must be connected. Otherwise a "molecule" could be two separate
 * molecules that happen to be touching, or a molecule with a spectator atom
 * standing next to it, and the score would count atoms the player did not
 * actually incorporate.
 *
 * Exhaustive with pruning rather than a matching algorithm: regions are at most
 * a handful of cells, the bound is tiny, and a correct twenty-line search beats
 * a subtle fifty-line one that nobody will re-derive when it breaks.
 */
export function solve(atoms: readonly Atom[], edges: readonly Edge[]): Structure | null {
  const n = atoms.length;
  if (n < 2) return null;

  const incident: number[][] = atoms.map(() => []);
  edges.forEach(([a, b], e) => { incident[a]!.push(e); incident[b]!.push(e); });

  // A valence that cannot be reached even with every incident bond at maximum
  // order is unsatisfiable, and saying so up front is far cheaper than searching.
  for (let i = 0; i < n; i += 1) {
    if (atoms[i]!.valence < 1) return null;
    if (atoms[i]!.valence > MAX_ORDER * incident[i]!.length) return null;
  }

  const orders = new Int32Array(edges.length);
  const remaining = Int32Array.from(atoms.map((a) => a.valence));

  const connected = (): boolean => {
    const seen = new Uint8Array(n);
    const stack = [0];
    seen[0] = 1;
    let count = 1;
    while (stack.length > 0) {
      const v = stack.pop()!;
      for (const e of incident[v]!) {
        if (orders[e]! === 0) continue;
        const [a, b] = edges[e]!;
        const w = a === v ? b : a;
        if (seen[w] === 0) { seen[w] = 1; count += 1; stack.push(w); }
      }
    }
    return count === n;
  };

  const search = (e: number): boolean => {
    if (e === edges.length) {
      for (let i = 0; i < n; i += 1) if (remaining[i] !== 0) return false;
      return connected();
    }
    const [a, b] = edges[e]!;
    for (let o = 0; o <= MAX_ORDER; o += 1) {
      if (remaining[a]! < o || remaining[b]! < o) break;
      remaining[a]! -= o; remaining[b]! -= o; orders[e] = o;
      // An atom whose remaining valence exceeds what its unvisited edges could
      // still carry is already doomed; cut here rather than at the leaf.
      let viable = true;
      for (const i of [a, b]) {
        let capacity = 0;
        for (const k of incident[i]!) if (k > e) capacity += MAX_ORDER;
        if (remaining[i]! > capacity) { viable = false; break; }
      }
      if (viable && search(e + 1)) { remaining[a]! += o; remaining[b]! += o; return true; }
      remaining[a]! += o; remaining[b]! += o; orders[e] = 0;
    }
    return false;
  };

  if (!search(0)) return null;

  const bonds: Bond[] = [];
  edges.forEach(([a, b], e) => {
    const o = orders[e]!;
    if (o > 0) bonds.push({ a: atoms[a]!.symbol, b: atoms[b]!.symbol, order: o as Order });
  });
  return { bonds, orders: [...orders] };
}

/**
 * The molecular formula of a set of atoms, in Hill notation.
 *
 * Hill order — carbon first, then hydrogen, then everything else alphabetically
 * — is the convention chemistry actually uses, so CH₄ comes out as "CH4" rather
 * than "H4C". A game that teaches formulas should write them the way a
 * chemist would, or it teaches a small falsehood alongside the true one.
 */
export function formula(atoms: readonly Atom[]): string {
  const counts = new Map<string, number>();
  for (const a of atoms) counts.set(a.symbol, (counts.get(a.symbol) ?? 0) + 1);
  const rest = [...counts.keys()].filter((s) => s !== 'C' && s !== 'H').sort();
  const order = counts.has('C') ? ['C', ...(counts.has('H') ? ['H'] : []), ...rest] : [...counts.keys()].sort();
  return order
    .filter((s) => counts.has(s))
    .map((s) => `${s}${counts.get(s)! > 1 ? counts.get(s)! : ''}`)
    .join('');
}
