// Does temperature actually change WHICH reactions are available?
// If the spontaneous set is the same at 200K and 2000K, a temperature mechanic
// is decoration. Measured over real boards before any design is drafted.
import { MOLECULES } from '../../game/chem/library.js';
import { bestRearrangement, entropyChange, type Reaction } from '../../game/chem/reaction.js';
import { drawReactiveBoard, reactiveMoves, rearrangementMoves, UNIFORM_WEIGHTS } from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';

// ΔG at an arbitrary T (the shipped gibbs() hardcodes 298).
const gibbsAt = (r: Reaction, T: number): number => -r.released - (T * entropyChange(r)) / 1000;

const TEMPS = [200, 298, 500, 800, 1200, 1800, 2500];
console.log('Spontaneous-reaction counts by temperature, 120 boards\n');
console.log('   T(K) | rearrangements | spontaneous | %    | newly-unlocked vs 298');

const base = new Map<string, boolean>();
let firstPass = true;
const rows: {T:number;total:number;spon:number;unlocked:number;lost:number}[] = [];

for (const T of TEMPS) {
  let total = 0, spon = 0, unlocked = 0, lost = 0;
  for (let s = 1; s <= 120; s++) {
    const rng = makeRng(s);
    const { tiles } = drawReactiveBoard(rng, UNIFORM_WEIGHTS);
    for (const m of rearrangementMoves(tiles)) {
      const key = `${s}:${m.cells.join(',')}`;
      total++;
      const g = gibbsAt(m.reaction, T);
      const ok = g < 0;
      if (ok) spon++;
      if (T === 298) base.set(key, ok);
      else {
        const was = base.get(key);
        if (was === false && ok) unlocked++;
        if (was === true && !ok) lost++;
      }
    }
  }
  rows.push({T,total,spon,unlocked,lost});
  console.log(`  ${String(T).padStart(5)} | ${String(total).padStart(14)} | ${String(spon).padStart(11)} | ${(spon/total*100).toFixed(1).padStart(4)} | +${unlocked} / -${lost}`);
}

// The real question: how many reactions FLIP at all across the range?
let flippers = 0, never = 0, always = 0;
const seen = new Set<string>();
for (let s = 1; s <= 120; s++) {
  const rng = makeRng(s);
  const { tiles } = drawReactiveBoard(rng, UNIFORM_WEIGHTS);
  for (const m of rearrangementMoves(tiles)) {
    const key = `${s}:${m.cells.join(',')}`;
    if (seen.has(key)) continue; seen.add(key);
    const vals = TEMPS.map(T => gibbsAt(m.reaction, T) < 0);
    if (vals.every(v=>v)) always++;
    else if (vals.every(v=>!v)) never++;
    else flippers++;
  }
}
const tot = flippers+never+always;
console.log(`\nAcross 200K..2500K, of ${tot} distinct rearrangements:`);
console.log(`  always spontaneous : ${always} (${(always/tot*100).toFixed(1)}%)`);
console.log(`  never spontaneous  : ${never} (${(never/tot*100).toFixed(1)}%)`);
console.log(`  TEMPERATURE FLIPS  : ${flippers} (${(flippers/tot*100).toFixed(1)}%)  <-- the mechanic lives or dies here`);
