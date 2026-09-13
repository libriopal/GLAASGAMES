// DOES CHOOSING THE PRODUCT OPEN THE HEADROOM THAT CHOOSING THE REGION DID NOT?
//
// Everything measured so far was measured under FORCED products: `bestReaction`
// returns the max-energy partition of a region and the rest are deleted. Under
// that rule the game has 5.7% headroom on energy, 7.7% on a build objective, and
// tightening the board to 8 live cells changed neither.
//
// `chem-partitions` measured what is being deleted: 4.8 alternative partitions
// per four-molecule region, up to 27, with the runner-up inside 10% of the top
// energy 69.5% of the time.
//
// So this is a paired comparison of the same target objective under two rules:
//
//   FORCED  a move is a region. The products are whatever pays most.
//   CHOICE  a move is a region AND a partition. The products are the decision;
//           energy prices it.
//
// If CHOICE does not widen the gap between a target-aware player and a greedy
// one, the product choice is decoration and the honest report is that this
// engine does not carry a skill game. If it does, it is not a new mechanic --
// it is the one already in the engine, stopped from being thrown away.
import { MOLECULES, type Molecule } from '../../game/chem/library.js';
import { productSets, inventoryOf } from '../../game/chem/reaction.js';
import { drawReactiveBoard, UNIFORM_WEIGHTS, CELL_COUNT } from '../../game/chem/board-react.js';
import { BOARD_W, BOARD_H } from '../../game/chem/board.js';
import { makeRng } from '../../engine/sim/world-gen.js';

const BY = new Map(MOLECULES.map((m) => [m.formula, m] as const));
const MAX_SELECT = 4;

// Connected regions of 2..4 cells, built once. Same topology the game uses.
const REGIONS: number[][] = (() => {
  const nb: number[][] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const c = i % BOARD_W;
    const r = (i / BOARD_W) | 0;
    const a: number[] = [];
    if (r > 0) a.push(i - BOARD_W);
    if (r < BOARD_H - 1) a.push(i + BOARD_W);
    if (c > 0) a.push(i - 1);
    if (c < BOARD_W - 1) a.push(i + 1);
    nb.push(a);
  }
  const out: number[][] = [];
  const seen = new Set<string>();
  const grow = (cur: number[]): void => {
    if (cur.length >= 2) {
      const k = cur.join(',');
      if (!seen.has(k)) { seen.add(k); out.push([...cur]); }
    }
    if (cur.length === MAX_SELECT) return;
    const cand = new Set<number>();
    for (const c of cur) for (const n of nb[c]!) if (!cur.includes(n) && n > cur[0]!) cand.add(n);
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

interface Option { readonly products: readonly string[]; readonly released: number }

// Every conservation-legal rearrangement of a reactant multiset, not just the
// best one. Memoised on the sorted formula key -- the board repeats molecules
// constantly and this is the expensive part.
const CACHE = new Map<string, Option[]>();
function optionsFor(formulas: readonly string[]): Option[] {
  const key = [...formulas].sort().join('+');
  const hit = CACHE.get(key);
  if (hit !== undefined) return hit;
  const mols = formulas.map((f) => BY.get(f)!) as Molecule[];
  const before = mols.reduce((a, m) => a + energyOf(m.formula), 0);
  const starting = [...formulas].sort().join(' + ');
  const out: Option[] = [];
  for (const set of productSets(inventoryOf(mols))) {
    if ([...set.products].sort().join(' + ') === starting) continue;
    out.push({ products: set.products, released: set.energy - before });
  }
  CACHE.set(key, out);
  return out;
}

// Formation energy per molecule, cached the same way the engine caches it.
const E = new Map<string, number>();
function energyOf(f: string): number {
  const hit = E.get(f);
  if (hit !== undefined) return hit;
  // productSets already prices sets; recover the single-molecule price from a
  // one-element set so this probe and the engine cannot disagree on the table.
  const m = BY.get(f)!;
  const v = productSets(inventoryOf([m])).find((p) => p.products.length === 1 && p.products[0] === f)!.energy;
  E.set(f, v);
  return v;
}

type Rule = 'FORCED' | 'CHOICE';
type Policy = 'GREEDY' | 'ORDER';

interface Result { readonly made: number; readonly banked: number; readonly turns: number }

function play(seed: number, rule: Rule, pol: Policy, order: readonly string[], turns: number): Result {
  const rng = makeRng(seed);
  const { tiles } = drawReactiveBoard(rng, UNIFORM_WEIGHTS);
  const board = [...tiles];
  let banked = 0;
  let t = 0;
  for (; t < turns; t += 1) {
    let bestScore = -Infinity;
    let bestCells: number[] | null = null;
    let bestProducts: readonly string[] | null = null;
    let bestReleased = 0;
    for (const region of REGIONS) {
      const opts = optionsFor(region.map((c) => board[c]!));
      if (opts.length === 0) continue;
      // FORCED sees only the max-energy partition. That is the current game.
      const visible = rule === 'FORCED'
        ? [opts.reduce((a, b) => (b.released > a.released ? b : a))]
        : opts;
      for (const o of visible) {
        if (o.released <= 0) continue;
        let s: number;
        if (pol === 'GREEDY') {
          s = o.released;
        } else {
          const held = new Set(board);
          const makes = o.products.filter((p) => order.includes(p) && !held.has(p)).length;
          const kills = region
            .map((c) => board[c]!)
            .filter((f) => order.includes(f) && !o.products.includes(f)).length;
          s = makes * 1e6 - kills * 1e6 + o.released;
        }
        if (s > bestScore) {
          bestScore = s;
          bestCells = region;
          bestProducts = o.products;
          bestReleased = o.released;
        }
      }
    }
    if (bestCells === null || bestProducts === null) break;
    const prods = [...bestProducts];
    for (const c of bestCells) board[c] = prods.pop() ?? board[c]!;
    banked += bestReleased;
  }
  const held = new Set(board);
  return { made: order.filter((o) => held.has(o)).length, banked, turns: t };
}

const RARE = ['F2', 'Cl2', 'CH3Cl', 'H2O2', 'C2H2'];
const N = 80;
const TURNS = 12;

console.log('rule   | policy | targets made | banked kJ | turns');
const made: Record<string, number> = {};
for (const rule of ['FORCED', 'CHOICE'] as const) {
  for (const pol of ['GREEDY', 'ORDER'] as const) {
    let m = 0;
    let b = 0;
    let t = 0;
    for (let s = 1; s <= N; s += 1) {
      const r = makeRng(s * 7919);
      const order = [0, 1, 2].map(() => RARE[Math.abs(r()) % RARE.length]!);
      const res = play(s, rule, pol, order, TURNS);
      m += res.made;
      b += res.banked;
      t += res.turns;
    }
    made[`${rule}/${pol}`] = m / N;
    console.log(
      `${rule.padEnd(6)} | ${pol.padEnd(6)} | ${(m / N).toFixed(2).padStart(12)} | ` +
        `${(b / N).toFixed(0).padStart(9)} | ${(t / N).toFixed(1)}`,
    );
  }
}

const fGap = ((made['FORCED/ORDER']! - made['FORCED/GREEDY']!) / Math.max(1e-9, made['FORCED/GREEDY']!)) * 100;
const cGap = ((made['CHOICE/ORDER']! - made['CHOICE/GREEDY']!) / Math.max(1e-9, made['CHOICE/GREEDY']!)) * 100;
console.log('');
console.log(`skill gap, products FORCED : ${fGap.toFixed(1)}%`);
console.log(`skill gap, products CHOSEN : ${cGap.toFixed(1)}%`);
