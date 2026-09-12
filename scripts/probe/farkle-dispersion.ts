// THE SOLVED-GAME TEST. If the per-HAND optimal depth is the same on most hands,
// a tie in the average is a script. Judgement requires the answer to MOVE.
import { CELL_COUNT, drawHand, scoringChains } from '../../game/farkle/hand.js';
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import { FACE_WEIGHTS } from '../../game/farkle/round.js';
const MAXD=6;
function turnValue(seed:number, mult:(n:number)=>number, depth:number){
  const faces = Array.from({length:CELL_COUNT},(_,i)=>faceAtOrdinal(seed,i,FACE_WEIGHTS));
  const live = new Set(drawHand(seed));
  let run=0, chains=0;
  for(;;){
    const cs=scoringChains(faces,live);
    if(!cs.length) return 0;              // farkled before reaching depth
    if(chains>=depth) break;
    const b=cs.reduce((a,c)=>(c.score/c.cells.length>a.score/a.cells.length?c:a));
    run+=b.score; chains++;
    for(const c of b.cells) live.delete(c);
  }
  return Math.round(run*mult(chains));
}
for(const [name,mult] of [['flat',()=>1],['x1.35',(n:number)=>Math.pow(1.35,Math.max(0,n-1))],['x1.5',(n:number)=>Math.pow(1.5,Math.max(0,n-1))]] as [string,(n:number)=>number][]){
  const counts=new Array(MAXD+1).fill(0);
  const SEEDS=3000;
  for(let s=1;s<=SEEDS;s++){
    let best=-1,bd=0;
    for(let d=1;d<=MAXD;d++){ const v=turnValue(s,mult,d); if(v>best){best=v;bd=d;} }
    counts[bd]++;
  }
  const share=counts.map(c=>c/SEEDS*100);
  const top=Math.max(...share);
  // Shannon entropy over depth choice: 0 = always same depth, log2(6)=2.58 = uniform
  const H=-share.filter(p=>p>0).reduce((a,p)=>a+(p/100)*Math.log2(p/100),0);
  console.log(`${name.padEnd(6)} per-hand best depth: ${share.slice(1).map((v,i)=>`d${i+1} ${v.toFixed(0)}%`).join('  ')}`);
  console.log(`       modal share ${top.toFixed(0)}%   entropy ${H.toFixed(2)} bits of ${Math.log2(MAXD).toFixed(2)}`);
}
