// Does a 6x6 grid of dice ever fail to offer a scoring path? Measured.
import { faceAtOrdinal } from '../../lattice/draw-stream.js';
import { FACE_WEIGHTS } from '../../lattice/round.js';

const W = 6, H = 6, N = W * H;
const EMPTY = 0;

function neighbours(i: number): number[] {
  const x = i % W, y = (i / W) | 0; const out: number[] = [];
  if (y > 0) out.push(i - W); if (y < H - 1) out.push(i + W);
  if (x > 0) out.push(i - 1); if (x < W - 1) out.push(i + 1);
  return out;
}

// Exhaustive: does ANY connected simple path of length<=6 score?
function scoreHand(faces: number[]): number {
  const c = [0,0,0,0,0,0,0];
  for (const f of faces) c[f]!++;
  if (faces.length === 6) {
    if (c.slice(1).every(v => v === 1)) return 1500;
    if (c.some(v => v === 6)) return 3000;
    if (c.filter(v => v === 3).length === 2) return 2500;
    if (c.filter(v => v === 2).length === 3) return 1500;
    if (c.some(v => v === 4) && c.some(v => v === 2)) return 1500;
  }
  let s = 0;
  for (let f = 1; f <= 6; f++) {
    const n = c[f]!;
    if (n === 0) continue;
    if (n === 5) s += 2000;
    else if (n === 4) s += 1000;
    else if (n === 3) s += f === 1 ? 1000 : f * 100;
    else if (n === 2) { if (f===1) s+=200; else if (f===5) s+=100; else return 0; }
    else if (n === 1) { if (f===1) s+=100; else if (f===5) s+=50; else return 0; }
  }
  return s;
}

function bestPath(board: number[]): number {
  let best = 0;
  const path: number[] = [];
  const seen = new Set<number>();
  function go(cur: number) {
    const faces = path.map(i => board[i]!);
    const s = scoreHand(faces);
    if (s > best) best = s;
    if (path.length >= 6) return;
    for (const nb of neighbours(cur)) {
      if (seen.has(nb) || board[nb] === EMPTY) continue;
      seen.add(nb); path.push(nb); go(nb); path.pop(); seen.delete(nb);
    }
  }
  for (let i = 0; i < N; i++) {
    if (board[i] === EMPTY) continue;
    seen.clear(); path.length = 0;
    seen.add(i); path.push(i); go(i);
  }
  return best;
}

// PART 1: fresh boards — how often is there no scoring path at all?
let dead = 0, trials = 400;
for (let s = 1; s <= trials; s++) {
  const b = Array.from({length: N}, (_, i) => faceAtOrdinal(s, i, FACE_WEIGHTS));
  if (bestPath(b) === 0) dead++;
}
console.log(`fresh boards with NO scoring path: ${dead}/${trials} (${(dead/trials*100).toFixed(2)}%)`);

// PART 2: the proposed fix — cells CLEAR and are NOT refilled during a turn.
// Does farkle probability actually rise as the turn continues?
const depthDead = new Array(12).fill(0);
const depthReached = new Array(12).fill(0);
for (let s = 1; s <= trials; s++) {
  const b = Array.from({length: N}, (_, i) => faceAtOrdinal(s, i, FACE_WEIGHTS));
  for (let depth = 0; depth < 12; depth++) {
    depthReached[depth]++;
    // find best path, record it, clear it
    let best = 0, bestCells: number[] = [];
    const path: number[] = []; const seen = new Set<number>();
    function go(cur: number) {
      const sc = scoreHand(path.map(i => b[i]!));
      if (sc > best) { best = sc; bestCells = [...path]; }
      if (path.length >= 6) return;
      for (const nb of neighbours(cur)) {
        if (seen.has(nb) || b[nb] === EMPTY) continue;
        seen.add(nb); path.push(nb); go(nb); path.pop(); seen.delete(nb);
      }
    }
    for (let i = 0; i < N; i++) {
      if (b[i] === EMPTY) continue;
      seen.clear(); path.length = 0; seen.add(i); path.push(i); go(i);
    }
    if (best === 0) { depthDead[depth]++; break; }
    for (const c of bestCells) b[c] = EMPTY;
  }
}
console.log('\ncontinuation depth -> P(farkle at this step), no refill during the turn:');
for (let d = 0; d < 12; d++) {
  if (depthReached[d] === 0) break;
  console.log(`  step ${d+1}: reached ${depthReached[d]}, farkled ${depthDead[d]} (${(depthDead[d]/depthReached[d]*100).toFixed(1)}%)`);
}
