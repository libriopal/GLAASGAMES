// HOW MANY PRODUCT OPTIONS DOES THE MECHANIC ACTUALLY NEED?
//
// `chem-choice` reported a 120% gap between a target-aware policy and a greedy
// one on a rare-target objective. That number is worth very little on its own and
// it is worth naming why: a policy that PURSUES the objective will beat one that
// IGNORES it on every objective ever written. EINCOL calls this the vacuous
// control, and the energy objective already died on exactly this distinction --
// greedy-vs-random looked fine there too, and greedy-vs-CEILING was 5.7%.
//
// So the number that decides whether this is a game is the one the energy
// objective failed: how far is a NAIVE target-aware player from the best play
// available on the same board?
//
//   FLOOR     random legal move
//   ORDER-1   one ply. Take any move that completes a target, else most energy.
//   ORDER-2   two ply. Look one move ahead before committing.
//   CEILING   beam search over the whole horizon.
//
// Run under both rules, because if the product choice only widens the gap to a
// policy that was not trying, it is decoration.
import { MOLECULES, type Molecule } from '../../game/chem/library.js';
import { productSets, inventoryOf } from '../../game/chem/reaction.js';
import { drawReactiveBoard, UNIFORM_WEIGHTS, CELL_COUNT } from '../../game/chem/board-react.js';
import { BOARD_W, BOARD_H } from '../../game/chem/board.js';
import { makeRng } from '../../engine/sim/world-gen.js';

const BY = new Map(MOLECULES.map((m) => [m.formula, m] as const));
const MAX_SELECT = 4;

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

const E = new Map<string, number>();
function energyOf(f: string): number {
  const hit = E.get(f);
  if (hit !== undefined) return hit;
  const m = BY.get(f)!;
  const v = productSets(inventoryOf([m])).find(
    (p) => p.products.length === 1 && p.products[0] === f,
  )!.energy;
  E.set(f, v);
  return v;
}

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

/**
 * How many product options a region offers the player, best-energy first.
 *
 * 1 is the current game -- the engine computes every conservation-legal
 * partition and hands back only the most exothermic one. Infinity is the whole
 * set, which reached 27 on one region in the partition census and is not a menu
 * anyone can read.
 *
 * The number that matters is where the curve flattens: if two or three options
 * carry most of the gain, the mechanic fits on a phone. If it needs all of them,
 * it is a solver's mechanic and not a player's, and that is a reason to reject
 * it however good the ceiling looks.
 */
type Rule = number;
interface Move { readonly cells: readonly number[]; readonly products: readonly string[]; readonly released: number }

function legalMoves(board: readonly string[], rule: Rule): Move[] {
  const out: Move[] = [];
  for (const region of REGIONS) {
    const opts = optionsFor(region.map((c) => board[c]!));
    if (opts.length === 0) continue;
    // Ranked by energy so that "the top K" is a stable, explainable shortlist
    // rather than whatever order the partition search happened to emit.
    const visible = [...opts].sort((a, b) => b.released - a.released).slice(0, rule);
    for (const o of visible) {
      if (o.released <= 0) continue;
      out.push({ cells: region, products: o.products, released: o.released });
    }
  }
  return out;
}

function applied(board: readonly string[], m: Move): string[] {
  const next = [...board];
  const prods = [...m.products];
  for (const c of m.cells) next[c] = prods.pop() ?? next[c]!;
  return next;
}

// Targets held, counted as a multiset: three orders for the same molecule need
// three copies of it on the board. Counting distinct formulas would let one tile
// satisfy every order at once, which is not what an order is.
function score(board: readonly string[], order: readonly string[]): number {
  const have = new Map<string, number>();
  for (const f of board) have.set(f, (have.get(f) ?? 0) + 1);
  let made = 0;
  const used = new Map<string, number>();
  for (const o of order) {
    const u = used.get(o) ?? 0;
    if ((have.get(o) ?? 0) > u) { made += 1; used.set(o, u + 1); }
  }
  return made;
}

/**
 * An order, once met, is DELIVERED: banked and struck off, and the molecule that
 * met it leaves the board.
 *
 * ── THIS IS A DESIGN DECISION THAT TWO MEASUREMENTS FORCED ──────────────────
 *
 * Without it, a target sits on the board as a hostage. Two separate measurements
 * caught the consequence before it was noticed as a rule:
 *
 *   · the target objective scored WORSE at 60 turns than at 12 -- players were
 *     making targets and then destroying them with later moves;
 *   · the beam search read `best` as the high-water mark across its whole search
 *     while every other agent was scored on its FINAL board, which is not a
 *     ceiling, it is a different scoring rule wearing one.
 *
 * Delivering on completion fixes both at once and it is also the honest reading
 * of what an order IS. It removes the hostage, and it makes the high-water mark
 * and the final score the same number for every agent, which is what made the
 * comparison unfair.
 *
 * The molecule is consumed rather than left behind because leaving it would let
 * one tile fill an order and then go on being a reactant, which is having it
 * both ways. Its CELL is refilled rather than removed -- shortening the board
 * array would leave every later cell index pointing at the wrong tile, which is
 * the defect that crashed the first tightening probe.
 */
function deliver(board: string[], pending: string[], refill: () => string): number {
  let filled = 0;
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    const at = board.indexOf(pending[i]!);
    if (at === -1) continue;
    board[at] = refill();
    pending.splice(i, 1);
    filled += 1;
  }
  return filled;
}

type Agent = 'FLOOR' | 'ORDER-1' | 'ORDER-2' | 'CEILING';

/**
 * The refill a delivery leaves behind, keyed on the run seed and on HOW MANY
 * orders have already been filled.
 *
 * Not drawn from the playing rng: the beam branches, so a shared stream would
 * hand different agents -- and different nodes of the same search -- different
 * boards for the same history, and the comparison between them would be
 * measuring the refill rather than the play.
 */
function refillFor(seed: number, filled: number): string {
  let h = (seed ^ Math.imul(filled + 1, 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return MOLECULES[((h ^ (h >>> 16)) >>> 0) % MOLECULES.length]!.formula;
}

/**
 * The order book is STANDING: three open at all times, and filling one draws the
 * next.
 *
 * A fixed list of three was measured first and it saturates -- with orders
 * banked on completion, even random play fills 2.48 of 3 and the whole ladder
 * lands inside 1.2% of the ceiling. The objective was not binding, so it could
 * not separate anyone.
 *
 * A standing book turns the score from "did you finish" into THROUGHPUT: how
 * many orders you can route before the board winds down. That is the quantity
 * the sink measurements were already about -- greedy play poisons the board and
 * dies at turn 9.5 with one legal move left -- and it is the first objective
 * that puts those two facts in the same number.
 */
const BOOK = 3;

function issueFor(seed: number, index: number, pool: readonly string[]): string {
  let h = (seed ^ Math.imul(index + 0x9e37, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return pool[((h ^ (h >>> 16)) >>> 0) % pool.length]!;
}

interface State {
  board: string[];
  pending: string[];
  filled: number;
  /** Orders issued so far, so the next draw is a function of history, not of a stream. */
  issued: number;
}

function top(seed: number, st: State, pool: readonly string[]): void {
  while (st.pending.length < BOOK) {
    st.pending.push(issueFor(seed, st.issued, pool));
    st.issued += 1;
  }
}

function step(seed: number, st: State, m: Move, pool: readonly string[]): State {
  const next: State = {
    board: applied(st.board, m),
    pending: [...st.pending],
    filled: st.filled,
    issued: st.issued,
  };
  // Deliver repeatedly: one move can complete more than one order, and the
  // replacement order it draws may already be satisfied by the same board.
  for (;;) {
    const got = deliver(next.board, next.pending, () => refillFor(seed, next.filled));
    if (got === 0) break;
    next.filled += got;
    top(seed, next, pool);
  }
  return next;
}

function playout(seed: number, rule: Rule, agent: Agent, pool: readonly string[], turns: number): number {
  const rng = makeRng(seed);
  const { tiles } = drawReactiveBoard(rng, UNIFORM_WEIGHTS);
  const start: State = { board: [...tiles], pending: [], filled: 0, issued: 0 };
  top(seed, start, pool);
  // A board that already satisfies its opening book would hand out free fills
  // before anyone moved, so the book settles before the first turn.
  for (;;) {
    const got = deliver(start.board, start.pending, () => refillFor(seed, start.filled));
    if (got === 0) break;
    start.filled += got;
    top(seed, start, pool);
  }
  start.filled = 0;

  if (agent === 'CEILING') {
    const WIDTH = 24;
    let beam: State[] = [start];
    let best = start.filled;
    for (let t = 0; t < turns; t += 1) {
      const next: State[] = [];
      const seen = new Set<string>();
      for (const node of beam) {
        const moves = legalMoves(node.board, rule);
        // Rank candidates before expanding: the full move list under CHOICE is
        // thousands wide and a beam that expands all of it is a search, not a
        // ceiling anyone could reach.
        const ranked = moves
          .map((m) => step(seed, node, m, pool))
          .sort((a, b) => b.filled - a.filled)
          .slice(0, 40);
        for (const r of ranked) {
          const k = `${r.filled}|${r.board.join(',')}`;
          if (seen.has(k)) continue;
          seen.add(k);
          if (r.filled > best) best = r.filled;
          next.push(r);
        }
      }
      if (next.length === 0) break;
      next.sort((a, b) => b.filled - a.filled);
      beam = next.slice(0, WIDTH);
    }
    return best;
  }

  let st = start;
  for (let t = 0; t < turns; t += 1) {
    const moves = legalMoves(st.board, rule);
    if (moves.length === 0) break;
    let pick: Move | null = null;
    if (agent === 'FLOOR') {
      pick = moves[Math.abs(rng()) % moves.length]!;
    } else if (agent === 'ORDER-1') {
      let bs = -Infinity;
      for (const m of moves) {
        const n = step(seed, st, m, pool);
        const s = (n.filled - st.filled) * 1e6 + m.released;
        if (s > bs) { bs = s; pick = m; }
      }
    } else {
      // ORDER-2: for the top candidates by the one-ply rule, look one move
      // further. Bounded to 20 because the point is a PLAYER's lookahead.
      const ranked = moves
        .map((m) => ({ m, n: step(seed, st, m, pool) }))
        .sort((a, b) => (b.n.filled + b.m.released / 1e9) - (a.n.filled + a.m.released / 1e9))
        .slice(0, 20);
      let bs = -Infinity;
      for (const r of ranked) {
        const follow = legalMoves(r.n.board, rule);
        let bestFollow = r.n.filled;
        for (const f of follow.slice(0, 200)) {
          const f2 = step(seed, r.n, f, pool);
          if (f2.filled > bestFollow) bestFollow = f2.filled;
        }
        const s = bestFollow * 1e6 + r.m.released;
        if (s > bs) { bs = s; pick = r.m; }
      }
    }
    if (pick === null) break;
    st = step(seed, st, pick, pool);
  }
  return st.filled;
}

const RARE = ['F2', 'Cl2', 'CH3Cl', 'H2O2', 'C2H2'];
const N = 60;
const TURNS = 12;

console.log('orders filled in 12 turns, standing book of 3');
console.log('options/region | FLOOR  ORDER-1  ORDER-2  CEILING | ORDER-1 % of ceiling | headroom');
for (const rule of [1, 2, 3, 5, 8, Infinity]) {
  const res: Record<Agent, number> = { FLOOR: 0, 'ORDER-1': 0, 'ORDER-2': 0, CEILING: 0 };
  for (const agent of ['FLOOR', 'ORDER-1', 'ORDER-2', 'CEILING'] as Agent[]) {
    let m = 0;
    // The book is drawn inside the playout from the seed, so every agent faces
    // the identical sequence of orders on the identical board. Drawing it out
    // here would have made the order stream a function of the agent's play.
    for (let s = 1; s <= N; s += 1) m += playout(s, rule, agent, RARE, TURNS);
    res[agent] = m / N;
  }
  const pct = (res['ORDER-1'] / Math.max(1e-9, res.CEILING)) * 100;
  console.log(
    `${(rule === Infinity ? 'all' : String(rule)).padStart(14)} | ` +
      `${res.FLOOR.toFixed(2)}   ${res['ORDER-1'].toFixed(2)}     ` +
      `${res['ORDER-2'].toFixed(2)}     ${res.CEILING.toFixed(2)} | ${pct.toFixed(1).padStart(19)}% | ` +
      `${(100 - pct).toFixed(1)}%`,
  );
}
