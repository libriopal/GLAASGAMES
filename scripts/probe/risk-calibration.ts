// What does each risk state ACTUALLY mean? The agent assumed risk/3 as a
// probability and was beaten by a stub. Measure the real conditional.
import { CELL_COUNT, drawHand, isFarkled, riskAfter, scoringChains } from '../../game/farkle/hand.js';
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import { FACE_WEIGHTS } from '../../game/farkle/round.js';
const obs=[0,0,0,0], dead=[0,0,0,0];
for(let s=1;s<=4000;s++){
  const faces=Array.from({length:CELL_COUNT},(_,i)=>faceAtOrdinal(s,i,FACE_WEIGHTS));
  const live=new Set(drawHand(s));
  for(let step=0;step<8;step++){
    const cs=scoringChains(faces,live);
    if(!cs.length) break;
    const b=cs.reduce((a,x)=>(x.score/x.cells.length>a.score/a.cells.length?x:a));
    const r=riskAfter(faces,live,b.cells);
    obs[r]!++;
    for(const c of b.cells) live.delete(c);
    if(isFarkled(faces,live)) { dead[r]!++; break; }
  }
}
console.log('risk | observed | farkled next | ACTUAL P | assumed risk/3');
for(let r=0;r<4;r++){
  const p = obs[r]! ? dead[r]!/obs[r]! : NaN;
  console.log(`  ${r}  | ${String(obs[r]).padStart(8)} | ${String(dead[r]).padStart(12)} | ${(p*100).toFixed(1).padStart(7)}% | ${(r/3*100).toFixed(0).padStart(13)}%`);
}
