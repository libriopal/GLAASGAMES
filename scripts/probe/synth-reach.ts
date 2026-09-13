// WHY DOES LOOKAHEAD PAY NOTHING? The suspected mechanism: every open order is
// already one reaction away, so there is never a route to plan.
import { legalMoves, bookDelta } from '../../foundry/montecarlo/synth-harness.js';
import { DEFAULT_SYNTH, beginSynth, advanceSynth, previewOf } from '../../game/chem/synth.js';
import { ORDER_1 } from '../../foundry/montecarlo/synth-harness.js';

const SEEDS = Number(process.env.SEEDS ?? 60);
const cfg = { ...DEFAULT_SYNTH, preview: 2 };
let turns = 0, anyReady = 0, readyCount = 0, bookLen = 0;
for (let s = 1; s <= SEEDS; s += 1) {
  const st = beginSynth(s * 7919, cfg);
  for (let t = 0; t < cfg.turns; t += 1) {
    const moves = legalMoves(st.tiles, cfg);
    if (moves.length === 0) break;
    // How many DISTINCT open orders can be shipped by some single move now?
    const shippable = new Set<string>();
    for (const m of moves) {
      for (const p of m.products) if (st.book.includes(p)) shippable.add(p);
    }
    turns += 1;
    bookLen += st.book.length;
    readyCount += shippable.size;
    if (shippable.size > 0) anyReady += 1;
    advanceSynth(st, cfg, (tiles, book, queue, bank, turn) =>
      ORDER_1.choose(tiles, book, queue, bank, turn, cfg));
  }
}
console.log(`turns sampled                         ${turns}`);
console.log(`mean open orders                      ${(bookLen / turns).toFixed(2)}`);
console.log(`mean orders shippable THIS TURN       ${(readyCount / turns).toFixed(2)}`);
console.log(`turns where at least one is shippable ${((anyReady / turns) * 100).toFixed(1)}%`);
