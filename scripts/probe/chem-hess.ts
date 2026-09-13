// HESS'S LAW IS THE PROBLEM. Enthalpy change is a STATE FUNCTION -- it depends
// only on the initial and final state, not the path. So a game scored on total
// energy released cannot reward path choice. Test it directly, then test whether
// the FINAL INVENTORY differs (it must, or there is no game at all).
import { rearrangementMoves, drawReactiveBoard, UNIFORM_WEIGHTS } from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';
const SINKS=new Set(['N2','CO2','HF']);
type Pol='GREEDY'|'PATIENT'|'RANDOM'|'WORST';
function run(seed:number,pol:Pol){
  const rng=makeRng(seed); const {tiles}=drawReactiveBoard(rng,UNIFORM_WEIGHTS);
  const board=[...tiles]; let total=0; let steps=0;
  for(let t=0;t<80;t++){
    const moves=rearrangementMoves(board).filter(m=>m.reaction.released>0);
    if(!moves.length) break;
    steps++;
    let pick;
    if(pol==='GREEDY') pick=moves.reduce((a,b)=>b.reaction.released>a.reaction.released?b:a);
    else if(pol==='WORST') pick=moves.reduce((a,b)=>b.reaction.released<a.reaction.released?b:a);
    else if(pol==='RANDOM') pick=moves[Math.abs(rng())%moves.length]!;
    else pick=moves.reduce((a,b)=>{const sc=(m:typeof a)=>m.reaction.released-420*m.reaction.products.filter(p=>SINKS.has(p)).length; return sc(b)>sc(a)?b:a;});
    total+=pick.reaction.released;
    const prods=[...pick.reaction.products];
    for(const c of pick.cells) board[c]=prods.pop()??board[c]!;
  }
  const inv=new Map<string,number>(); for(const x of board) inv.set(x,(inv.get(x)??0)+1);
  return {total,steps,board:[...board].sort().join(','),sinks:board.filter(x=>SINKS.has(x)).length,
          distinct:new Set(board).size};
}
const N=200;
console.log('RUN TO EQUILIBRIUM (no turn cap). Does the PATH change the ENERGY?\n');
console.log('policy    energy   steps   final sinks  distinct molecules  identical final states');
const finals:Record<string,string[]>={};
for(const pol of ['WORST','RANDOM','GREEDY','PATIENT'] as Pol[]){
  let e=0,st=0,sk=0,ds=0; finals[pol]=[];
  for(let s=1;s<=N;s++){const r=run(s,pol); e+=r.total; st+=r.steps; sk+=r.sinks; ds+=r.distinct; finals[pol]!.push(r.board);}
  console.log(`${pol.padEnd(9)} ${(e/N).toFixed(0).padStart(6)}  ${(st/N).toFixed(1).padStart(6)}  ${(sk/N).toFixed(1).padStart(11)}  ${(ds/N).toFixed(1).padStart(18)}`);
}
// How often do two policies land on the SAME final board?
const base=finals['GREEDY']!;
for(const pol of ['WORST','RANDOM','PATIENT']){
  const same=finals[pol]!.filter((b,i)=>b===base[i]).length;
  console.log(`  ${pol} vs GREEDY: identical final board on ${same}/${N} (${(same/N*100).toFixed(0)}%)`);
}
// Energy spread across policies on the SAME board
let maxSpread=0, spreadSum=0;
for(let i=0;i<N;i++){
  const vals=(['WORST','RANDOM','GREEDY','PATIENT'] as Pol[]).map(p=>run(i+1,p).total);
  const sp=(Math.max(...vals)-Math.min(...vals))/Math.max(...vals)*100;
  spreadSum+=sp; maxSpread=Math.max(maxSpread,sp);
}
console.log(`\nENERGY SPREAD between best and worst policy on the same board: mean ${(spreadSum/N).toFixed(1)}%  max ${maxSpread.toFixed(1)}%`);
