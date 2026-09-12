// Which live-hand size reproduces the TABLETOP risk curve? Swept, not chosen.
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
function best(board:number[],live:Set<number>){let b=0,bc:number[]=[];const p:number[]=[];const seen=new Set<number>();
 function go(cur:number){const s=sc(p.map(i=>board[i]!));if(s>b){b=s;bc=[...p];}
  if(p.length>=6)return;
  for(const n2 of nb(cur)){if(!live.has(n2)||seen.has(n2))continue;seen.add(n2);p.push(n2);go(n2);p.pop();seen.delete(n2);}}
 for(const i of live){seen.clear();p.length=0;seen.add(i);p.push(i);go(i);}return{score:b,cells:bc};}
function blob(seed:number,size:number){const s=new Set<number>();let cur=Math.abs(seed*2654435761)%N;s.add(cur);let g=0;
 while(s.size<size&&g++<900){const o:number[]=[];for(const c of s)for(const n2 of nb(c))if(!s.has(n2))o.push(n2);
  if(!o.length)break;s.add(o[Math.abs(Math.imul(seed+g,2246822519)>>>7)%o.length]!);}return s;}
const TARGET=[2.3,7.8,15.8,27.8,44.3,66.8];
console.log('hand | step1  step2  step3  step4  step5  step6 | steps>=5% | rms vs tabletop');
for(const size of [6,8,9,10,12,14,16,20]){
 const trials=2000;const reached=new Array(9).fill(0),dead=new Array(9).fill(0);
 for(let s=1;s<=trials;s++){
  const board=Array.from({length:N},(_,i)=>faceAtOrdinal(s,i,FACE_WEIGHTS));
  const live=blob(s,size);
  for(let st=0;st<9;st++){if(!live.size)break;reached[st]++;
   const r=best(board,live);if(r.score===0){dead[st]++;break;}
   for(const c of r.cells)live.delete(c);}}
 const rates=[];for(let d=0;d<6;d++)rates.push(reached[d]?dead[d]/reached[d]*100:NaN);
 let ss=0,n=0;for(let d=0;d<6;d++){if(!isNaN(rates[d]!)){ss+=(rates[d]!-TARGET[d]!)**2;n++;}}
 const live5=rates.filter(r=>!isNaN(r)&&r>=5).length;
 console.log(`${String(size).padStart(4)} | ${rates.map(r=>isNaN(r)?'  -  ':r.toFixed(1).padStart(5)).join('  ')} | ${live5} | ${n?Math.sqrt(ss/n).toFixed(1):'-'}`);
}
