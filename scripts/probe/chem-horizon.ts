// Greedy dies at turn 9.5. Does a longer game punish it? And does scoring the
// SURVIVING INVENTORY rather than the sum of reactions change who wins?
import { rearrangementMoves, drawReactiveBoard, UNIFORM_WEIGHTS } from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';
const SINKS = new Set(['N2','CO2','HF']);
type Pol='GREEDY'|'SINK-AWARE'|'PATIENT';
function play(seed:number,pol:Pol,turns:number){
  const rng=makeRng(seed); const {tiles}=drawReactiveBoard(rng,UNIFORM_WEIGHTS);
  const board=[...tiles]; let banked=0,used=0;
  for(let t=0;t<turns;t++){
    const moves=rearrangementMoves(board).filter(m=>m.reaction.released>0);
    if(!moves.length) break;
    used++;
    const sc=(m:typeof moves[0])=>{
      if(pol==='GREEDY') return m.reaction.released;
      if(pol==='SINK-AWARE') return m.reaction.released - 260*m.reaction.products.filter(p=>SINKS.has(p)).length;
      // PATIENT: value the OPTIONS the move leaves, not just its energy
      return m.reaction.released - 420*m.reaction.products.filter(p=>SINKS.has(p)).length;
    };
    const pick=moves.reduce((a,b)=>sc(b)>sc(a)?b:a);
    banked+=pick.reaction.released;
    const prods=[...pick.reaction.products];
    for(const c of pick.cells) board[c]=prods.pop()??board[c]!;
  }
  return {banked,used};
}
console.log('turns |  GREEDY  SINK-AWARE  PATIENT  | winner');
for(const T of [8,12,20,30,45,60]){
  const r:Record<string,number>={}; const u:Record<string,number>={};
  for(const pol of ['GREEDY','SINK-AWARE','PATIENT'] as Pol[]){
    let b=0,uu=0; const N=250;
    for(let s=1;s<=N;s++){const x=play(s,pol,T); b+=x.banked; uu+=x.used;}
    r[pol]=b/N; u[pol]=uu/N;
  }
  const win=Object.entries(r).reduce((a,b)=>b[1]>a[1]?b:a)[0];
  console.log(`${String(T).padStart(5)} | ${r['GREEDY']!.toFixed(0).padStart(6)}  ${r['SINK-AWARE']!.toFixed(0).padStart(10)}  ${r['PATIENT']!.toFixed(0).padStart(7)}  | ${win}  (turns used ${u['GREEDY']!.toFixed(0)}/${u['PATIENT']!.toFixed(0)})`);
}
