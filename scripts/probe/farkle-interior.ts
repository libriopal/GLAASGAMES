// Where is the optimum? A decision only exists if the best fixed stop-depth is
// INTERIOR. If bank1 wins there is no push; if bank-forever wins there is no stop.
import { CELL_COUNT, drawHand, scoringChains } from '../../game/farkle/hand.js';
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import { FACE_WEIGHTS } from '../../game/farkle/round.js';
const TURNS = 10, SEEDS = 500, MAXD = 7;
function play(seed:number, mult:(n:number)=>number, depth:number): number {
  let bank = 0;
  for (let t=0;t<TURNS;t++){
    const faces = Array.from({length:CELL_COUNT},(_,i)=>faceAtOrdinal(seed*97+t,i,FACE_WEIGHTS));
    const live = new Set(drawHand(seed*31+t));
    let run=0, chains=0;
    for(;;){
      const cs = scoringChains(faces, live);
      if(!cs.length){ run=0; chains=0; break; }
      if(chains>=depth) break;
      const best = cs.reduce((a,b)=>(b.score/b.cells.length>a.score/a.cells.length?b:a));
      run+=best.score; chains++;
      for(const c of best.cells) live.delete(c);
    }
    bank += Math.round(run*mult(chains));
  }
  return bank;
}
const curves: [string,(n:number)=>number][] = [
  ['flat',        ()=>1],
  ['x1.15',       n=>Math.pow(1.15,Math.max(0,n-1))],
  ['x1.25',       n=>Math.pow(1.25,Math.max(0,n-1))],
  ['x1.35',       n=>Math.pow(1.35,Math.max(0,n-1))],
  ['x1.5',        n=>Math.pow(1.50,Math.max(0,n-1))],
];
console.log('curve  ' + Array.from({length:MAXD},(_,i)=>`  d${i+1}`).join('    ') + '   | best depth');
for(const [name,mult] of curves){
  const res:number[]=[];
  for(let d=1;d<=MAXD;d++){ let tot=0; for(let s=1;s<=SEEDS;s++) tot+=play(s,mult,d); res.push(tot/SEEDS); }
  const bi = res.indexOf(Math.max(...res))+1;
  const interior = bi>1 && bi<MAXD;
  console.log(`${name.padEnd(6)} ${res.map(v=>(v/1000).toFixed(1).padStart(6)).join(' ')}   | d${bi} ${interior?'INTERIOR':'<< endpoint'}`);
}
