// Is the depth-threshold rule actually being exercised, or is it vacuous?
import { CELL_COUNT, drawHand, riskAfter, scoringChains, survivableDepth } from '../../game/farkle/hand.js';
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import { FACE_WEIGHTS, runMultiplier } from '../../game/farkle/round.js';
function play(seed:number, stop:(sig:number,c:number)=>boolean, useDepth:boolean){
  const faces=Array.from({length:CELL_COUNT},(_,i)=>faceAtOrdinal(seed,i,FACE_WEIGHTS));
  const live=new Set(drawHand(seed));
  let run=0,chains=0;
  for(;;){
    const cs=scoringChains(faces,live);
    if(!cs.length) return 0;
    const b=cs.reduce((a,x)=>(x.score/x.cells.length>a.score/a.cells.length?x:a));
    const sig = useDepth ? survivableDepth(faces,live)-1 : riskAfter(faces,live,b.cells);
    if(chains>0 && stop(sig,chains)) break;
    run+=b.score;chains++;
    for(const c of b.cells) live.delete(c);
  }
  return Math.floor(run*runMultiplier(chains));
}
console.log('threshold | risk-rule | depth-rule');
for(let th=0;th<=4;th++){
  let r=0,d=0;
  for(let s=1;s<=2000;s++){ r+=play(s,(x)=>x>=th,false); d+=play(s,(x)=>x<=th,true); }
  console.log(`    ${th}     | ${(r/2000).toFixed(0).padStart(9)} | ${(d/2000).toFixed(0).padStart(10)}`);
}
// distribution of the depth signal, to prove it varies
const hist=new Array(6).fill(0);
for(let s=1;s<=3000;s++){
  const faces=Array.from({length:CELL_COUNT},(_,i)=>faceAtOrdinal(s,i,FACE_WEIGHTS));
  hist[Math.min(5,survivableDepth(faces,new Set(drawHand(s))))]!++;
}
console.log('\nsurvivableDepth distribution at turn start: '+hist.map((v,i)=>`${i}:${(v/3000*100).toFixed(0)}%`).join(' '));
