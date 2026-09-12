// THE DECISIVE TEST. Three tiers on identical hands:
//   SCRIPT    best fixed stop-depth (no information used)
//   READABLE  best fixed rule on the OBSERVABLE risk signal the UI already shows
//   CEILING   hindsight optimum (knows the future; unattainable)
// If READABLE ~ CEILING the game is solved by a rule printed on the screen.
// The gap CEILING - READABLE is the headroom judgement can occupy.
import { CELL_COUNT, drawHand, riskAfter, scoringChains } from '../../game/farkle/hand.js';
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import { FACE_WEIGHTS } from '../../game/farkle/round.js';
const SEEDS=4000;
function hand(seed:number){
  const faces=Array.from({length:CELL_COUNT},(_,i)=>faceAtOrdinal(seed,i,FACE_WEIGHTS));
  return {faces, live:new Set(drawHand(seed))};
}
function run(seed:number, mult:(n:number)=>number, stop:(risk:number,chains:number,run:number)=>boolean){
  const {faces,live}=hand(seed);
  let r=0,c=0;
  for(;;){
    const cs=scoringChains(faces,live);
    if(!cs.length) return 0;
    const b=cs.reduce((a,x)=>(x.score/x.cells.length>a.score/a.cells.length?x:a));
    const risk=riskAfter(faces,live,b.cells);
    if(c>0 && stop(risk,c,r)) break;
    r+=b.score;c++;
    for(const x of b.cells) live.delete(x);
  }
  return Math.round(r*mult(c));
}
function ceiling(seed:number, mult:(n:number)=>number){
  const {faces,live}=hand(seed);
  let r=0,c=0,best=0;
  for(;;){
    const cs=scoringChains(faces,live);
    if(!cs.length) break;
    const b=cs.reduce((a,x)=>(x.score/x.cells.length>a.score/a.cells.length?x:a));
    r+=b.score;c++;
    for(const x of b.cells) live.delete(x);
    best=Math.max(best, Math.round(r*mult(c)));   // could have banked here
  }
  return best;
}
for(const [name,mult] of [['flat',()=>1],['x1.35',(n:number)=>Math.pow(1.35,Math.max(0,n-1))],['x1.5',(n:number)=>Math.pow(1.5,Math.max(0,n-1))]] as [string,(n:number)=>number][]){
  let bestScript=0,bestScriptD=0;
  for(let d=1;d<=6;d++){let t=0;for(let s=1;s<=SEEDS;s++)t+=run(s,mult,(_r,c)=>c>=d);t/=SEEDS;if(t>bestScript){bestScript=t;bestScriptD=d;}}
  let bestRead=0,bestReadT=0;
  for(let th=0;th<=3;th++){let t=0;for(let s=1;s<=SEEDS;s++)t+=run(s,mult,(risk)=>risk>=th);t/=SEEDS;if(t>bestRead){bestRead=t;bestReadT=th;}}
  let ceil=0;for(let s=1;s<=SEEDS;s++)ceil+=ceiling(s,mult);ceil/=SEEDS;
  const headroom=(ceil-bestRead)/bestRead*100;
  console.log(`${name.padEnd(6)} SCRIPT d${bestScriptD} ${bestScript.toFixed(0).padStart(6)} | READABLE risk>=${bestReadT} ${bestRead.toFixed(0).padStart(6)} | CEILING ${ceil.toFixed(0).padStart(6)} | HEADROOM ${headroom.toFixed(1)}%`);
}
