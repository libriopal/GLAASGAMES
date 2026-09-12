// The turn starts with SIX live cells, not thirty-six. Does risk arrive at step 1?
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import { FACE_WEIGHTS } from '../../lattice/round.js';

const W = 6, H = 6, N = W * H;
function nb(i: number): number[] {
  const x = i % W, y = (i / W) | 0; const o: number[] = [];
  if (y > 0) o.push(i - W); if (y < H - 1) o.push(i + W);
  if (x > 0) o.push(i - 1); if (x < W - 1) o.push(i + 1);
  return o;
}
function scoreHand(f: number[]): number {
  const c = [0,0,0,0,0,0,0]; for (const x of f) c[x]!++;
  if (f.length === 6) {
    if (c.slice(1).every(v => v === 1)) return 1500;
    if (c.some(v => v === 6)) return 3000;
    if (c.filter(v => v === 3).length === 2) return 2500;
    if (c.filter(v => v === 2).length === 3) return 1500;
    if (c.some(v => v === 4) && c.some(v => v === 2)) return 1500;
  }
  let s = 0;
  for (let x = 1; x <= 6; x++) { const n = c[x]!;
    if (!n) continue;
    if (n===5) s+=2000; else if (n===4) s+=1000; else if (n===3) s+= x===1?1000:x*100;
    else if (n===2){ if(x===1)s+=200; else if(x===5)s+=100; else return 0; }
    else { if(x===1)s+=100; else if(x===5)s+=50; else return 0; } }
  return s;
}
// TABLETOP BASELINE: n loose dice, any subset scores?
function tabletopFarkleRate(n: number, trials = 200000): number {
  let dead = 0;
  for (let t = 0; t < trials; t++) {
    const d: number[] = []; for (let i=0;i<n;i++) d.push(1 + ((Math.random()*6)|0));
    // any non-empty subset scores?
    let ok = false;
    for (let m = 1; m < (1<<n) && !ok; m++) {
      const sub: number[] = []; for (let i=0;i<n;i++) if (m & (1<<i)) sub.push(d[i]!);
      if (scoreHand(sub) > 0) ok = true;
    }
    if (!ok) dead++;
  }
  return dead / trials;
}
console.log('TABLETOP baseline — n loose dice, P(no scoring subset):');
for (let n = 6; n >= 1; n--) console.log(`  ${n} dice: ${(tabletopFarkleRate(n)*100).toFixed(1)}%`);

// GRID: live set of k cells; a chain must be a connected path within the live set.
function bestInLive(board: number[], live: Set<number>): {score:number, cells:number[]} {
  let best = 0, bc: number[] = []; const path: number[] = []; const seen = new Set<number>();
  function go(cur: number) {
    const s = scoreHand(path.map(i => board[i]!));
    if (s > best) { best = s; bc = [...path]; }
    for (const n2 of nb(cur)) {
      if (!live.has(n2) || seen.has(n2)) continue;
      seen.add(n2); path.push(n2); go(n2); path.pop(); seen.delete(n2);
    }
  }
  for (const i of live) { seen.clear(); path.length = 0; seen.add(i); path.push(i); go(i); }
  return { score: best, cells: bc };
}
// Pick a connected blob of 6 cells as the live hand.
function blob(seed: number, size: number): Set<number> {
  const s = new Set<number>(); let cur = Math.abs(faceAtOrdinal(seed, 999, [0,1,1,1,1,1,1]) * 7 + seed) % N;
  s.add(cur);
  let guard = 0;
  while (s.size < size && guard++ < 500) {
    const opts: number[] = []; for (const c of s) for (const n2 of nb(c)) if (!s.has(n2)) opts.push(n2);
    if (!opts.length) break;
    s.add(opts[Math.abs(faceAtOrdinal(seed, s.size + guard, [0,1,1,1,1,1,1]) * 13 + guard) % opts.length]!);
  }
  return s;
}
console.log('\nGRID, live hand of 6 connected cells — P(farkle) by continuation step:');
const trials = 3000;
const reached = new Array(8).fill(0), dead = new Array(8).fill(0);
for (let s = 1; s <= trials; s++) {
  const board = Array.from({length:N}, (_,i) => faceAtOrdinal(s, i, FACE_WEIGHTS));
  const live = blob(s, 6);
  for (let step = 0; step < 8; step++) {
    if (live.size === 0) break;
    reached[step]++;
    const r = bestInLive(board, live);
    if (r.score === 0) { dead[step]++; break; }
    for (const c of r.cells) live.delete(c);
  }
}
for (let d = 0; d < 8; d++) { if (!reached[d]) break;
  console.log(`  step ${d+1}: reached ${reached[d]}, farkled ${dead[d]} (${(dead[d]/reached[d]*100).toFixed(1)}%)`); }
