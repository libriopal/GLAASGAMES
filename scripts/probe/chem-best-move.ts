// The decision-relevant question: does the BEST move change with temperature?
// A mechanic that changes 15% of the legal set but never the chosen move is
// decoration. This measures the CHOICE, not the option count.
import { entropyChange, type Reaction } from '../../game/chem/reaction.js';
import { drawReactiveBoard, rearrangementMoves, UNIFORM_WEIGHTS } from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';
const gibbsAt = (r: Reaction, T: number): number => -r.released - (T * entropyChange(r)) / 1000;
const TEMPS = [298, 500, 800, 1200, 1800, 2500];

let boardsWhereBestChanges = 0, boards = 0;
const bestAt = new Map<number, string[]>();
const distinctCounts: number[] = [];

for (let s = 1; s <= 400; s++) {
  const rng = makeRng(s);
  const { tiles } = drawReactiveBoard(rng, UNIFORM_WEIGHTS);
  const moves = rearrangementMoves(tiles);
  if (moves.length === 0) continue;
  boards++;
  const picks: string[] = [];
  for (const T of TEMPS) {
    // Only spontaneous moves are available; among those take most energy released.
    const avail = moves.filter(m => gibbsAt(m.reaction, T) < 0);
    if (avail.length === 0) { picks.push('-none-'); continue; }
    const best = avail.reduce((a,b)=> b.reaction.released > a.reaction.released ? b : a);
    picks.push(best.reaction.products.slice().sort().join('+'));
  }
  const distinct = new Set(picks).size;
  distinctCounts.push(distinct);
  if (distinct > 1) boardsWhereBestChanges++;
}
console.log(`boards with at least one move: ${boards}`);
console.log(`boards where the BEST move changes with temperature: ${boardsWhereBestChanges} (${(boardsWhereBestChanges/boards*100).toFixed(1)}%)`);
const hist = new Map<number,number>();
for (const d of distinctCounts) hist.set(d,(hist.get(d)??0)+1);
console.log('distinct best-moves across 6 temperatures:', [...hist.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}:${v}`).join('  '));

// And: is the ENERGY of the best move temperature-sensitive?
let gains: number[] = [];
for (let s = 1; s <= 400; s++) {
  const rng = makeRng(s);
  const { tiles } = drawReactiveBoard(rng, UNIFORM_WEIGHTS);
  const moves = rearrangementMoves(tiles);
  if (!moves.length) continue;
  const at = (T:number) => { const a = moves.filter(m=>gibbsAt(m.reaction,T)<0);
    return a.length ? Math.max(...a.map(m=>m.reaction.released)) : 0; };
  const lo = at(298), hi = Math.max(...TEMPS.map(at));
  if (lo > 0) gains.push((hi-lo)/lo*100);
}
gains.sort((a,b)=>a-b);
const mean = gains.reduce((a,b)=>a+b,0)/gains.length;
console.log(`\nbest-move ENERGY gain from choosing the right temperature:`);
console.log(`  mean ${mean.toFixed(1)}%   median ${gains[Math.floor(gains.length/2)]!.toFixed(1)}%   p90 ${gains[Math.floor(gains.length*0.9)]!.toFixed(1)}%   max ${gains[gains.length-1]!.toFixed(1)}%`);
console.log(`  boards where heating gains nothing: ${gains.filter(g=>g===0).length}/${gains.length} (${(gains.filter(g=>g===0).length/gains.length*100).toFixed(0)}%)`);
