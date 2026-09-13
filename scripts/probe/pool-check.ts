// What the multistep pool now contains, and whether it does what it says.
import { multistepPool, ORDER_POOL, DEFAULT_SYNTH, beginSynth } from '../../game/chem/synth.js';
import { legalMoves } from '../../foundry/montecarlo/synth-harness.js';

const pool = multistepPool();
console.log('multistep pool:', pool.join(' '));
console.log('rare5 pool    :', ORDER_POOL.join(' '));

// The claim to test: an order from this pool is NOT shippable in one move from
// a fresh board. Measured, not asserted.
for (const [name, p] of [['RARE5', ORDER_POOL], ['MULTISTEP', pool]] as [string, readonly string[]][]) {
  let immediate = 0, total = 0;
  for (let s = 1; s <= 40; s++) {
    const cfg = { ...DEFAULT_SYNTH };
    const st = beginSynth(s * 7919, cfg);
    const reach = new Set<string>(st.tiles);
    for (const m of legalMoves(st.tiles, cfg)) for (const f of m.products) reach.add(f);
    for (const f of p) { total++; if (reach.has(f)) immediate++; }
  }
  console.log(`${name.padEnd(10)} available within one move on ${((immediate/total)*100).toFixed(1)}% of (board, order) pairs`);
}
