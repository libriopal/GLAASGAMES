// If the objective is REACHING A TARGET rather than maximising energy, does
// temperature become load-bearing? The energy objective made it decoration.
import { MOLECULES } from '../../game/chem/library.js';
import { entropyChange, type Reaction } from '../../game/chem/reaction.js';
import { drawReactiveBoard, rearrangementMoves, applyMove, UNIFORM_WEIGHTS } from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';
const gibbsAt = (r: Reaction, T: number): number => -r.released - (T * entropyChange(r)) / 1000;

// Can `target` be produced within `depth` reactions at temperature T?
function reachable(tiles0: readonly string[], target: string, T: number, depth: number): boolean {
  let frontier: string[][] = [[...tiles0]];
  for (let d = 0; d < depth; d++) {
    const next: string[][] = [];
    for (const tiles of frontier) {
      if (tiles.includes(target)) return true;
      const moves = rearrangementMoves(tiles).filter(m => gibbsAt(m.reaction, T) < 0);
      for (const m of moves.slice(0, 14)) {
        if (m.reaction.products.includes(target)) return true;
        const t2 = [...tiles];
        const prods = [...m.reaction.products];
        for (const c of m.cells) t2[c] = prods.pop() ?? t2[c]!;
        next.push(t2);
      }
    }
    frontier = next.slice(0, 60);
    if (!frontier.length) break;
  }
  return false;
}

const TEMPS = [298, 800, 1800];
const targets = MOLECULES.map(m => m.formula);
console.log('target    ' + TEMPS.map(t=>`${t}K`.padStart(7)).join('') + '   temp-gated?');
let gatedTargets = 0;
for (const tgt of targets) {
  const hits = TEMPS.map(T => {
    let n = 0;
    for (let s = 1; s <= 60; s++) {
      const rng = makeRng(s);
      const { tiles } = drawReactiveBoard(rng, UNIFORM_WEIGHTS);
      if (tiles.includes(tgt)) continue;            // already present, no synthesis needed
      if (reachable(tiles, tgt, T, 2)) n++;
    }
    return n;
  });
  const gated = hits[2]! > hits[0]! + 2;
  if (gated) gatedTargets++;
  console.log(`${tgt.padEnd(9)} ` + hits.map(h=>String(h).padStart(7)).join('') + (gated ? '   <-- YES' : ''));
}
console.log(`\ntargets whose reachability improves with heat: ${gatedTargets}/${targets.length}`);
