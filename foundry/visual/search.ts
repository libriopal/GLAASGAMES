// foundry/visual/search.ts — runs the search and prints its table.
//
// The declared result in `evolve.ts` is whatever this prints, and
// `verify-belief` B5 fails if the two ever part company. It exists as a script
// so the ranking can be re-read by a person rather than only asserted by an
// oracle: a search whose losers nobody ever looks at is a search nobody can
// argue with.

import {
  DECLARED_BEST_ID,
  DECLARED_GENERATIONS,
  DECLARED_POPULATION,
  DECLARED_SEED,
  DECLARED_TRIALS,
  DECLARED_TURNS,
  type CoEvolved,
  coEvolve,
  trials,
} from './evolve.js';

const ts = trials(DECLARED_TRIALS, DECLARED_TURNS);
const started = Date.now();
const ranked = coEvolve(ts, {
  seed: DECLARED_SEED,
  population: DECLARED_POPULATION,
  generations: DECLARED_GENERATIONS,
});

const row = (s: CoEvolved, i: number): string =>
  `${String(i + 1).padStart(3)}  ${s.fitness.toFixed(4)}  ` +
  `d=${s.scores.discrimination.toFixed(3)} s=${s.scores.stability.toFixed(3)} ` +
  `r=${s.scores.responsiveness.toFixed(3)} l=${s.scores.legibility.toFixed(3)}  ` +
  `reach=${s.params.reach.toFixed(3)} base=${s.params.base.toFixed(3)} ` +
  `gain=${s.params.gain.toFixed(3)} floor=${s.params.floor.toFixed(3)}  ${s.id}`;

console.log(`${ts.length} trials of ${DECLARED_TURNS} observations; ${ranked.length} candidates ` +
  `co-evolved in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log('  #  fitness  scores                                   parameters                                        encoding');
for (let i = 0; i < 12; i += 1) console.log(row(ranked[i]!, i));
console.log('  ...');
for (let i = ranked.length - 3; i < ranked.length; i += 1) console.log(row(ranked[i]!, i));

const dead = ranked.filter((s) => s.fitness === 0).length;
console.log(`\n${dead}/${ranked.length} score zero — a geometric mean treats an illegible, inert or ` +
  `direction-blind display as failed rather than as a compromise.`);
console.log(`declared best: ${DECLARED_BEST_ID}; search says ${ranked[0]!.id} ` +
  `at ${ranked[0]!.fitness.toFixed(4)}`);
console.log(`\nDECLARED_BEST_PARAMS (paste into evolve.ts):\n${JSON.stringify(ranked[0]!.params, null, 2)}`);
