// The board is a closed system with a FINITE extractable energy. How close do
// policies get to it? That gap is where skill lives -- the physical analogue of
// Farkle's agency floor.
import { rearrangementMoves, drawReactiveBoard, UNIFORM_WEIGHTS } from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';
const SINKS = new Set(['N2','CO2','HF']);

// Beam search for the best achievable total -- the practical ceiling.
function ceiling(tiles0: readonly string[], width = 90, depth = 16): number {
  let beam: {board:string[];total:number}[] = [{board:[...tiles0],total:0}];
  let best = 0;
  for (let d = 0; d < depth; d++) {
    const next: {board:string[];total:number}[] = [];
    for (const st of beam) {
      const moves = rearrangementMoves(st.board).filter(m=>m.reaction.released>0);
      if (!moves.length) { best = Math.max(best, st.total); continue; }
      for (const m of moves.slice(0, 10)) {
        const b2 = [...st.board];
        const prods = [...m.reaction.products];
        for (const c of m.cells) b2[c] = prods.pop() ?? b2[c]!;
        const tot = st.total + m.reaction.released;
        best = Math.max(best, tot);
        next.push({board:b2,total:tot});
      }
    }
    if (!next.length) break;
    next.sort((a,b)=>b.total-a.total);
    beam = next.slice(0, width);
  }
  return best;
}
function policy(tiles0: readonly string[], sinkPenalty: number, turns=20): number {
  const board=[...tiles0]; let total=0;
  for(let t=0;t<turns;t++){
    const moves=rearrangementMoves(board).filter(m=>m.reaction.released>0);
    if(!moves.length) break;
    const sc=(m:typeof moves[0])=>m.reaction.released - sinkPenalty*m.reaction.products.filter(p=>SINKS.has(p)).length;
    const pick=moves.reduce((a,b)=>sc(b)>sc(a)?b:a);
    total+=pick.reaction.released;
    const prods=[...pick.reaction.products];
    for(const c of pick.cells) board[c]=prods.pop()??board[c]!;
  }
  return total;
}
const N=80;
let ceil=0, greedy=0, best80=0, bestPen=0;
const pens=[0,120,260,420,600];
const byPen: number[] = pens.map(()=>0);
for(let s=1;s<=N;s++){
  const {tiles}=drawReactiveBoard(makeRng(s),UNIFORM_WEIGHTS);
  ceil+=ceiling(tiles);
  pens.forEach((p,i)=>{ byPen[i]! += policy(tiles,p); });
}
console.log(`boards: ${N}\nCEILING (beam search)     ${(ceil/N).toFixed(0)}`);
pens.forEach((p,i)=>{
  const v=byPen[i]!/N;
  console.log(`  sink penalty ${String(p).padStart(3)}        ${v.toFixed(0).padStart(5)}   ${(v/(ceil/N)*100).toFixed(1)}% of ceiling`);
});
const bestPolicy = Math.max(...byPen)/N;
console.log(`\nHEADROOM above the best simple policy: ${(((ceil/N)-bestPolicy)/bestPolicy*100).toFixed(1)}%`);
