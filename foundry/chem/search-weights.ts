// foundry/chem/search-weights.ts — runs the face-weight search and prints it.
import { FACE_WEIGHTS } from '../../lattice/round.js';
import {
  DECLARED_BOARDS, DECLARED_GENERATIONS, DECLARED_POPULATION, DECLARED_SEED,
  DECLARED_WEIGHTS, evolve, fitness, measure,
} from './weights.js';

const show = (label: string, w: readonly number[]) => {
  const t = measure(w, DECLARED_BOARDS, DECLARED_SEED);
  console.log(
    `${label.padEnd(18)} [${w.slice(1).join(',')}]  fitness ${fitness(t).toFixed(4)}  ` +
    `sharp ${(100 * t.sharpness).toFixed(0)}%  firstDraw ${(100 * t.firstDraw).toFixed(0)}%  ` +
    `density ${t.density.toFixed(1)}  diversity ${(100 * t.diversity).toFixed(0)}%`);
};

show('shipped (uniform)', FACE_WEIGHTS);
const t0 = Date.now();
const e = evolve(FACE_WEIGHTS, {
  seed: DECLARED_SEED, boards: DECLARED_BOARDS,
  population: DECLARED_POPULATION, generations: DECLARED_GENERATIONS,
});
show('evolved', e.weights);
show('declared', DECLARED_WEIGHTS);
console.log(`\nsearched in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`DECLARED_WEIGHTS: [${e.weights.join(', ')}]`);
