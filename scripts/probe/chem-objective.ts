// Energy extraction gives 5.7% headroom -- a math problem, not a game.
// The variance lives in the FINAL INVENTORY (199/200 boards differ).
// So: does a BUILD objective (make specific molecules) have room for skill?
import { MOLECULES } from '../../game/chem/library.js';
import { rearrangementMoves, drawReactiveBoard, UNIFORM_WEIGHTS } from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';
const SINKS=new Set(['N2','CO2','HF']);

// An order: three molecules to have ON THE BOARD when it goes inert.
function orderFor(seed:number){ const r=makeRng(seed*7919);
  const pool=MOLECULES.map(m=>m.formula);
  const pick=()=>pool[Math.abs(r())%pool.length]!;
  return [pick(),pick(),pick()];
}
type Pol='GREEDY-ENERGY'|'ORDER-AWARE'|'RANDOM'|'HYBRID';
function run(seed:number,pol:Pol){
  const order=orderFor(seed);
  const rng=makeRng(seed); const {tiles}=drawReactiveBoard(rng,UNIFORM_WEIGHTS);
  const board=[...tiles]; let energy=0;
  for(let t=0;t<60;t++){
    const moves=rearrangementMoves(board).filter(m=>m.reaction.released>0);
    if(!moves.length) break;
    const need=()=>order.filter(o=>!board.includes(o)).length;
    const sc=(m:typeof moves[0])=>{
      const makes=m.reaction.products.filter(p=>order.includes(p)&&!board.includes(p)).length;
      const destroys=m.reaction.reactants.filter(p=>order.includes(p)&&board.includes(p)).length;
      if(pol==='GREEDY-ENERGY') return m.reaction.released;
      if(pol==='RANDOM') return Math.abs(rng()%1000);
      if(pol==='ORDER-AWARE') return makes*10000 - destroys*10000 + m.reaction.released*0.01;
      return makes*4000 - destroys*4000 + m.reaction.released;   // HYBRID
    };
    const pick=moves.reduce((a,b)=>sc(b)>sc(a)?b:a);
    energy+=pick.reaction.released;
    const prods=[...pick.reaction.products];
    for(const c of pick.cells) board[c]=prods.pop()??board[c]!;
  }
  const filled=order.filter(o=>board.includes(o)).length;
  return {filled,energy,order};
}
const N=300;
console.log('BUILD OBJECTIVE: three requested molecules must be on the board at equilibrium\n');
console.log('policy           orders filled /3   full completions   energy');
const res:Record<string,number>={};
for(const pol of ['RANDOM','GREEDY-ENERGY','HYBRID','ORDER-AWARE'] as Pol[]){
  let f=0,c=0,e=0;
  for(let s=1;s<=N;s++){const r=run(s,pol); f+=r.filled; if(r.filled===3)c++; e+=r.energy;}
  res[pol]=f/N;
  console.log(`${pol.padEnd(16)} ${(f/N).toFixed(2).padStart(13)}   ${String(c).padStart(14)}  ${(e/N).toFixed(0).padStart(7)}`);
}
const best=Math.max(...Object.values(res)), worst=Math.min(...Object.values(res));
console.log(`\nSPREAD best vs worst policy: ${((best-worst)/worst*100).toFixed(1)}%   (energy objective gave 5.7% headroom)`);
console.log(`GREEDY-ENERGY as % of best: ${(res['GREEDY-ENERGY']!/best*100).toFixed(1)}%`);
