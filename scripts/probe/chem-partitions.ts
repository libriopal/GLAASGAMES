// WHAT THE ENGINE THROWS AWAY.
//
// `bestRearrangement` enumerates every conservation-legal partition of a region
// and returns EXACTLY ONE of them: the highest-energy set. Everything else is
// discarded before the player ever sees it. So a move is "pick a region" and the
// products are decided for you.
//
// That is the structural explanation for every negative measurement on this
// game: greedy reaches 94-96% of the beam-search ceiling, headroom is 5.7% on
// energy and 7.7% on a build objective, and tightening the board to 8 cells
// changed neither. If the only decision is which region to touch, and the region
// with the biggest number is almost always right, there is nothing to be good at.
//
// This probe measures the size of the discarded set. If regions typically admit
// several partitions with genuinely different products, then exposing that choice
// is not a new mechanic bolted on -- it is the mechanic the engine already
// computes and then deletes.
import { MOLECULES, type Molecule } from '../../game/chem/library.js';
import { productSets, inventoryOf } from '../../game/chem/reaction.js';
import { drawReactiveBoard, UNIFORM_WEIGHTS, MAX_SELECT } from '../../game/chem/board-react.js';
import { makeRng } from '../../engine/sim/world-gen.js';

const BY = new Map(MOLECULES.map((m) => [m.formula, m] as const));

interface Row {
  readonly size: number;
  readonly partitions: number;
  readonly distinctProducts: number;
  readonly energySpread: number;
  readonly secondWithinTen: boolean;
}

const rows: Row[] = [];
const N = 200;

for (let s = 1; s <= N; s += 1) {
  const rng = makeRng(s * 104729);
  const { tiles } = drawReactiveBoard(rng, UNIFORM_WEIGHTS);
  // Sample regions by size rather than enumerating the board's adjacency, so the
  // count is about the CHEMISTRY of a selection and not about grid topology.
  for (let size = 2; size <= MAX_SELECT; size += 1) {
    for (let k = 0; k < 6; k += 1) {
      const picks: Molecule[] = [];
      for (let i = 0; i < size; i += 1) {
        picks.push(BY.get(tiles[Math.abs(rng()) % tiles.length]!)!);
      }
      const starting = picks.map((m) => m.formula).sort().join(' + ');
      const sets = productSets(inventoryOf(picks));
      const alts = sets.filter((p) => [...p.products].sort().join(' + ') !== starting);
      if (alts.length === 0) continue;
      const energies = alts.map((p) => p.energy).sort((a, b) => b - a);
      const distinct = new Set(alts.map((p) => [...p.products].sort().join('+'))).size;
      const top = energies[0]!;
      const second = energies[1];
      rows.push({
        size,
        partitions: alts.length,
        distinctProducts: distinct,
        energySpread: top - energies[energies.length - 1]!,
        // A choice is only a choice if the runner-up is competitive. Ten percent
        // of the top is the band inside which giving up energy to steer the
        // products is a trade rather than a blunder.
        secondWithinTen: second !== undefined && second >= top - Math.abs(top) * 0.1,
      });
    }
  }
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

console.log('reactants | regions | alt partitions | distinct products | energy spread kJ | runner-up within 10%');
for (let size = 2; size <= MAX_SELECT; size += 1) {
  const g = rows.filter((r) => r.size === size);
  console.log(
    `${String(size).padStart(9)} | ${String(g.length).padStart(7)} | ` +
      `${mean(g.map((r) => r.partitions)).toFixed(1).padStart(14)} | ` +
      `${mean(g.map((r) => r.distinctProducts)).toFixed(1).padStart(17)} | ` +
      `${mean(g.map((r) => r.energySpread)).toFixed(0).padStart(16)} | ` +
      `${((g.filter((r) => r.secondWithinTen).length / Math.max(1, g.length)) * 100).toFixed(1)}%`,
  );
}

const all = rows;
console.log('');
console.log(`regions with >1 alternative partition : ${((all.filter((r) => r.partitions > 1).length / all.length) * 100).toFixed(1)}%`);
console.log(`regions with >3 alternative partitions: ${((all.filter((r) => r.partitions > 3).length / all.length) * 100).toFixed(1)}%`);
console.log(`max alternatives seen on one region   : ${Math.max(...all.map((r) => r.partitions))}`);
