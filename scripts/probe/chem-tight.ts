// The board is ergodic: 299 legal moves at turn 1, so any path lands in a
// similar soup. Energy scoring gave 5.7% headroom over greedy; a build objective
// gave 7.7%. Both are at or under the auditor's 5% failure line.
//
// Does TIGHTENING the system open skill room? Fewer live cells means fewer
// options per turn and a sharper consequence per move. Crossed with a RARE
// target pool, where the needed atoms are not lying around in quantity.
//
// ── THE BUG THIS FILE HAD, RECORDED SO IT IS NOT REPEATED ───────────────────
// The first version restricted the system with `tiles.slice(0, live)`, which
// SHORTENS the array while `rearrangementMoves` still enumerates every region of
// the full 36-cell grid — so it indexed past the end and handed `undefined` to
// the formula lookup. The board must stay full length. Cells outside the live
// region are MASKED to one inert formula instead: that keeps every index valid,
// and because the move memo is keyed on the reactant multiset, collapsing the
// dead area to a single formula also collapses its cache keys, so masking is
// cheaper than filtering after the fact rather than more expensive.
import { MOLECULES } from '../../game/chem/library.js';
import {
  rearrangementMoves,
  drawReactiveBoard,
  UNIFORM_WEIGHTS,
  CELL_COUNT,
} from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';

// N2 carries a 941 kJ/mol triple bond — the engine's own named sink, and the
// least reactive thing in the library. The mask is not meant to participate.
const MASK = 'N2';

type Policy = 'RANDOM' | 'GREEDY' | 'ORDER';

function run(seed: number, live: number, pol: Policy, order: readonly string[]): number {
  const rng = makeRng(seed);
  const { tiles } = drawReactiveBoard(rng, UNIFORM_WEIGHTS);
  const board = [...tiles];
  for (let i = live; i < CELL_COUNT; i += 1) board[i] = MASK;

  const held = (f: string): boolean => board.slice(0, live).includes(f);

  for (let t = 0; t < 60; t += 1) {
    const moves = rearrangementMoves(board).filter(
      (m) => m.reaction.released > 0 && m.cells.every((c) => c < live),
    );
    if (moves.length === 0) break;
    const sc = (m: (typeof moves)[number]): number => {
      if (pol === 'GREEDY') return m.reaction.released;
      if (pol === 'RANDOM') return Math.abs(rng()) % 1000;
      const makes = m.reaction.products.filter((p) => order.includes(p) && !held(p)).length;
      const kills = m.reaction.reactants.filter((p) => order.includes(p) && held(p)).length;
      return makes * 10000 - kills * 10000 + m.reaction.released * 0.01;
    };
    const pick = moves.reduce((a, b) => (sc(b) > sc(a) ? b : a));
    const prods = [...pick.reaction.products];
    for (const c of pick.cells) board[c] = prods.pop() ?? board[c]!;
  }
  return order.filter((o) => held(o)).length;
}

const RARE = ['F2', 'Cl2', 'CH3Cl', 'H2O2', 'C2H2'];
const COMMON = MOLECULES.map((m) => m.formula);
const N = 120;

console.log('live | pool   | RANDOM GREEDY  ORDER | spread | greedy as % of best');
for (const live of [36, 20, 12, 8]) {
  for (const [label, pool] of [
    ['common', COMMON],
    ['rare', RARE],
  ] as [string, string[]][]) {
    const res: Record<string, number> = {};
    for (const pol of ['RANDOM', 'GREEDY', 'ORDER'] as const) {
      let f = 0;
      for (let s = 1; s <= N; s += 1) {
        const r = makeRng(s * 7919);
        const order = [0, 1, 2].map(() => pool[Math.abs(r()) % pool.length]!);
        f += run(s, live, pol, order);
      }
      res[pol] = f / N;
    }
    const best = Math.max(...Object.values(res));
    const worst = Math.min(...Object.values(res));
    const spread = worst > 0 ? ((best - worst) / worst) * 100 : 0;
    console.log(
      `${String(live).padStart(4)} | ${label.padEnd(6)} | ` +
        `${res['RANDOM']!.toFixed(2)}   ${res['GREEDY']!.toFixed(2)}   ${res['ORDER']!.toFixed(2)} | ` +
        `${spread.toFixed(1).padStart(6)}% | ${((res['GREEDY']! / best) * 100).toFixed(0)}%`,
    );
  }
}
