// THE HYPOTHESIS: greedy play strands atoms in thermodynamic sinks (N2, CO2)
// and destroys its own future. If true, "what am I destroying?" is the game.
import { MOLECULES } from '../../game/chem/library.js';
import { rearrangementMoves, drawReactiveBoard, UNIFORM_WEIGHTS, CELL_COUNT } from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';

type Pol = 'GREEDY' | 'SINK-AWARE' | 'RANDOM';
// Sinks: molecules whose bonds are so strong they rarely react again.
const SINKS = new Set(['N2','CO2','HF']);

function play(seed: number, pol: Pol, turns = 12) {
  const rng = makeRng(seed);
  const { tiles } = drawReactiveBoard(rng, UNIFORM_WEIGHTS);
  const board = [...tiles];
  let banked = 0;
  const optionTrace: number[] = [];
  for (let t = 0; t < turns; t++) {
    const moves = rearrangementMoves(board).filter(m => m.reaction.released > 0);
    optionTrace.push(moves.length);
    if (!moves.length) break;
    let pick;
    if (pol === 'GREEDY') pick = moves.reduce((a,b)=> b.reaction.released > a.reaction.released ? b : a);
    else if (pol === 'RANDOM') pick = moves[Math.abs(rng()) % moves.length]!;
    else {
      // SINK-AWARE: same energy, but penalise producing a sink.
      pick = moves.reduce((a,b)=>{
        const score = (m: typeof a) => m.reaction.released - 260 * m.reaction.products.filter(p=>SINKS.has(p)).length;
        return score(b) > score(a) ? b : a;
      });
    }
    banked += pick.reaction.released;
    const prods = [...pick.reaction.products];
    for (const c of pick.cells) board[c] = prods.pop() ?? board[c]!;
  }
  const sinkCount = board.filter(x=>SINKS.has(x)).length;
  return { banked, sinkCount, optionTrace, survived: optionTrace.length };
}

console.log('policy       banked   sinks@end  turns survived  options t1 -> t6 -> t12');
for (const pol of ['RANDOM','GREEDY','SINK-AWARE'] as Pol[]) {
  let banked=0, sinks=0, surv=0; const o1:number[]=[],o6:number[]=[],o12:number[]=[];
  const N=250;
  for (let s=1;s<=N;s++){ const r=play(s,pol);
    banked+=r.banked; sinks+=r.sinkCount; surv+=r.survived;
    o1.push(r.optionTrace[0]??0); o6.push(r.optionTrace[5]??0); o12.push(r.optionTrace[11]??0); }
  const avg=(a:number[])=>a.reduce((x,y)=>x+y,0)/a.length;
  console.log(`${pol.padEnd(12)} ${(banked/N).toFixed(0).padStart(6)}  ${(sinks/N).toFixed(1).padStart(9)}  ${(surv/N).toFixed(1).padStart(14)}   ${avg(o1).toFixed(0)} -> ${avg(o6).toFixed(0)} -> ${avg(o12).toFixed(0)}`);
}
// Starting sink density for reference
let s0=0; for(let s=1;s<=250;s++){ const {tiles}=drawReactiveBoard(makeRng(s),UNIFORM_WEIGHTS); s0+=tiles.filter(x=>SINKS.has(x)).length; }
console.log(`\nstarting sinks per board: ${(s0/250).toFixed(1)} of ${CELL_COUNT} cells`);
