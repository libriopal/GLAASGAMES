// Is the risk curve a property of the DESIGN or of the PLAYER'S POLICY?
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import { FACE_WEIGHTS } from '../../lattice/round.js';
const W=6,H=6,N=W*H;
function nb(i:number){const x=i%W,y=(i/W)|0;const o:number[]=[];if(y>0)o.push(i-W);if(y<H-1)o.push(i+W);if(x>0)o.push(i-1);if(x<W-1)o.push(i+1);return o;}
function sc(f:number[]){const c=[0,0,0,0,0,0,0];for(const x of f)c[x]!++;
 if(f.length===6){if(c.slice(1).every(v=>v===1))return 1500;if(c.some(v=>v===6))return 3000;if(c.filter(v=>v===3).length===2)return 2500;if(c.filter(v=>v===2).length===3)return 1500;if(c.some(v=>v===4)&&c.some(v=>v===2))return 1500;}
 let s=0;for(let x=1;x<=6;x++){const n=c[x]!;if(!n)continue;
  if(n===5)s+=2000;else if(n===4)s+=1000;else if(n===3)s+=x===1?1000:x*100;
  else if(n===2){if(x===1)s+=200;else if(x===5)s+=100;else return 0;}
  else{if(x===1)s+=100;else if(x===5)s+=50;else return 0;}}return s;}
// enumerate every scoring chain in the live set
function chains(board:number[],live:Set<number>){const out:{score:number,cells:number[]}[]=[];
 const p:number[]=[];const seen=new Set<number>();
 function go(cur:number){const s=sc(p.map(i=>board[i]!));if(s>0)out.push({score:s,cells:[...p]});
  if(p.length>=6)return;
  for(const n2 of nb(cur)){if(!live.has(n2)||seen.has(n2))continue;seen.add(n2);p.push(n2);go(n2);p.pop();seen.delete(n2);}}
 for(const i of live){seen.clear();p.length=0;seen.add(i);p.push(i);go(i);}return out;}
function blob(seed:number,size:number){const s=new Set<number>();s.add(Math.abs(seed*2654435761)%N);let g=0;
 while(s.size<size&&g++<900){const o:number[]=[];for(const c of s)for(const n2 of nb(c))if(!s.has(n2))o.push(n2);
  if(!o.length)break;s.add(o[Math.abs(Math.imul(seed+g,2246822519)>>>7)%o.length]!);}return s;}
const TARGET=[2.3,7.8,15.8,27.8,44.3,66.8];
type Pol='MAXSCORE'|'FEWEST'|'EFFICIENT';
function pick(cs:{score:number,cells:number[]}[],pol:Pol){
 if(pol==='MAXSCORE')return cs.reduce((a,b)=>b.score>a.score?b:a);
 if(pol==='FEWEST')return cs.reduce((a,b)=>b.cells.length<a.cells.length||(b.cells.length===a.cells.length&&b.score>a.score)?b:a);
 return cs.reduce((a,b)=>(b.score/b.cells.length)>(a.score/a.cells.length)?b:a);}
console.log('HAND=16, same boards, three policies. Risk is a consequence of how fast you burn the board.\n');
console.log('policy     | step1 step2 step3 step4 step5 step6 | mean cells/step | mean turn score | rms vs tabletop');
for(const pol of ['MAXSCORE','FEWEST','EFFICIENT'] as Pol[]){
 const trials=2000;const reached=new Array(10).fill(0),dead=new Array(10).fill(0);
 let cellsTaken=0,steps=0,totalScore=0;
 for(let s=1;s<=trials;s++){
  const board=Array.from({length:N},(_,i)=>faceAtOrdinal(s,i,FACE_WEIGHTS));
  const live=blob(s,16);let run=0;
  for(let st=0;st<10;st++){if(!live.size)break;reached[st]++;
   const cs=chains(board,live);
   if(!cs.length){dead[st]++;run=0;break;}
   const ch=pick(cs,pol);run+=ch.score;cellsTaken+=ch.cells.length;steps++;
   for(const c of ch.cells)live.delete(c);}
  totalScore+=run;}
 const rates=[];for(let d=0;d<6;d++)rates.push(reached[d]?dead[d]/reached[d]*100:NaN);
 let ss=0,n=0;for(let d=0;d<6;d++)if(!isNaN(rates[d]!)){ss+=(rates[d]!-TARGET[d]!)**2;n++;}
 console.log(`${pol.padEnd(10)} | ${rates.map(r=>isNaN(r)?'  -  ':r.toFixed(1).padStart(5)).join(' ')} | ${(cellsTaken/steps).toFixed(2).padStart(15)} | ${(totalScore/trials).toFixed(0).padStart(15)} | ${Math.sqrt(ss/n).toFixed(1)}`);
}
console.log(`\nTABLETOP     | ${TARGET.map(t=>t.toFixed(1).padStart(5)).join(' ')}`);
