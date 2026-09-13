// WHAT SEED SHARE WOULD A PERFECTLY FAIR GAME SCORE, AT THIS SCORE GRANULARITY?
//
// The post-run audit rejected the 35% bar as a category error: "In a
// high-granularity system (Farkle), a 35% threshold represents a smooth
// gradient. In a low-granularity system (0-8 integers), a single event is a
// massive step function in the mean... You are trying to measure a liquid with a
// ruler."
//
// That is a claim about the METRIC, and the way to settle it is a null model
// rather than an opinion. Seed share is bySeedVariance / totalVariance. If the
// seed carried NO information at all, that ratio would not be zero — it would be
// whatever discreteness and finite sampling force it to be, and THAT is the real
// floor the 35% bar should have been compared against.
//
// The control is a permutation: shuffle which seed each result is attributed to.
// That destroys the true seed effect while keeping every marginal distribution
// exactly as observed — same scores, same agents, same granularity. Whatever
// seed share survives the shuffle is manufactured by the measurement itself.
//
// Pre-registration forbids moving a threshold after seeing results. It does not
// forbid establishing that the threshold was measuring something other than what
// it claimed, which is a different finding and has to be shown rather than
// asserted.
import {
  GREEDY,
  ORDER_1,
  planAgent,
  randomAgent,
} from '../../foundry/montecarlo/synth-harness.js';
import { type SynthConfig, DEFAULT_SYNTH, playSynth } from '../../game/chem/synth.js';

const SEEDS = Number(process.env.SEEDS ?? 120);

function shareOf(grid: number[][]): number {
  const all = grid.flat();
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const total = all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length;
  const n = grid[0]!.length;
  const seedMeans: number[] = [];
  for (let i = 0; i < n; i += 1) {
    seedMeans.push(grid.reduce((a, row) => a + row[i]!, 0) / grid.length);
  }
  const bySeed = seedMeans.reduce((a, b) => a + (b - mean) ** 2, 0) / seedMeans.length;
  return total > 0 ? (bySeed / total) * 100 : 0;
}

/** A deterministic shuffle, so the null is reproducible. */
function shuffled<T>(xs: readonly T[], salt: number): T[] {
  const out = [...xs];
  let h = (0x9e3779b9 ^ salt) | 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    const j = ((h ^ (h >>> 16)) >>> 0) % (i + 1);
    const t = out[i]!;
    out[i] = out[j]!;
    out[j] = t;
  }
  return out;
}

function measure(label: string, config: SynthConfig): void {
  const agents = [randomAgent(1), GREEDY, ORDER_1, planAgent(3, 8, 20)];
  const grid: number[][] = agents.map(() => []);
  for (let s = 1; s <= SEEDS; s += 1) {
    for (let a = 0; a < agents.length; a += 1) {
      grid[a]!.push(
        playSynth(s * 7919, config, (t, b, q, bank, turn) =>
          agents[a]!.choose(t, b, q, bank, turn, config),
        ).score,
      );
    }
  }

  const observed = shareOf(grid);

  // THE NULL. Each agent's results are shuffled INDEPENDENTLY, so a seed's
  // column is assembled from four unrelated games. Every marginal distribution
  // is untouched; only the pairing by seed is destroyed.
  const nulls: number[] = [];
  for (let rep = 0; rep < 40; rep += 1) {
    nulls.push(shareOf(grid.map((row, a) => shuffled(row, rep * 31 + a))));
  }
  nulls.sort((a, b) => a - b);
  const nullMean = nulls.reduce((a, b) => a + b, 0) / nulls.length;
  const null95 = nulls[Math.floor(nulls.length * 0.95)]!;

  // The excess is the part of seed share that the seed actually explains, which
  // is what the gate was always supposed to be about.
  const excess = observed - nullMean;
  console.log(
    `${label.padEnd(28)} observed ${observed.toFixed(1).padStart(5)}%  ` +
      `null floor ${nullMean.toFixed(1).padStart(5)}% (95th ${null95.toFixed(1)}%)  ` +
      `EXCESS ${excess.toFixed(1).padStart(5)} pts`,
  );
}

console.log(`seed-share null model, ${SEEDS} seeds, 4 agents, 40 permutations\n`);
measure('stage-1 default', { ...DEFAULT_SYNTH, preview: 5, swap: 'NONE', turns: 12 });
measure('best stage-1 cell (XP.M.N)', {
  ...DEFAULT_SYNTH,
  topology: 'HEX37',
  preview: 5,
  swap: 'NONE',
  poolMode: 'BULK',
  options: 1,
  turns: 30,
});
measure('3 options, square', {
  ...DEFAULT_SYNTH,
  topology: 'SQUARE36',
  preview: 5,
  swap: 'NONE',
  options: 3,
  turns: 12,
});
console.log(
  '\nThe gate compared OBSERVED against 35%. If the null floor is itself near or',
  '\nabove 35%, that comparison was never about the deal — it was about the fact',
  '\nthat this game scores small integers.',
);
