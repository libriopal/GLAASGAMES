// ADAPTIVE reached the best seed share in stage 2 (39.0%) and a throughput of
// 29-42 against a pre-registered band of 2-8. Either it solved the blocker or it
// degenerated the game. This says which, rather than inferring it from a number.
import { adaptivePool, beginSynth, DEFAULT_SYNTH, ORDER_POOL } from '../../game/chem/synth.js';
import { MOLECULES } from '../../game/chem/library.js';

let sizes = 0, onBoard = 0, pairs = 0;
for (let s = 1; s <= 40; s++) {
  const st = beginSynth(s * 7919, { ...DEFAULT_SYNTH, poolMode: 'ADAPTIVE' });
  const pool = adaptivePool(st.tiles);
  sizes += pool.length;
  const present = new Set(st.tiles);
  for (const f of pool) { pairs++; if (present.has(f)) onBoard++; }
}
console.log(`library size                       ${MOLECULES.length}`);
console.log(`ADAPTIVE pool, mean size           ${(sizes / 40).toFixed(1)}`);
console.log(`RARE5 pool size                    ${ORDER_POOL.length}`);
console.log(`pool molecules ALREADY on the board ${((onBoard / pairs) * 100).toFixed(1)}%`);
console.log('');
console.log('An order already sitting on the board ships the instant it is issued,');
console.log('and the replacement is drawn from the same pool -- so the book cascades.');
