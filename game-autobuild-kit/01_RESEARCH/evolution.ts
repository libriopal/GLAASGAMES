/**
 * Evolutionary program-synthesis engine (P5, Research Domain).
 *
 * Search over DSL programs directed by the EvoSynth paradigm:
 *   - independent island populations with periodic migration;
 *   - selection by the Multiplicative Weight Updates Algorithm under weak selection.
 *     The distribution maximizing U(σ)=Σpᵢgᵢ+λH(P) is exactly the Gibbs/softmax
 *     p_i ∝ exp(g_i/λ); we sample from it (temperature λ), so larger λ preserves more
 *     entropy/diversity — the monoculture guard. Grounded: Chastain et al. 2014
 *     (10.1073/pnas.1406556111);
 *   - two mutation channels: (1) structural subtree/one-point crossover, and
 *     (2) an injected LLM-style rewrite operator (mock in the demo);
 *   - every candidate is gated by the P4 verifier: unsound genomes score 0 and can
 *     never be promoted.
 *
 * Fully deterministic: one seeded PRNG drives the whole run.
 */

import { Mulberry32 } from "../02_CONTROLLER/prng.ts";
import { parseProgram } from "../02_CONTROLLER/dslParser.ts";
import { verify } from "../02_CONTROLLER/verifier.ts";
import { MockLlmRewrite, type MutationOperator } from "./llmOperator.ts";
import { RULE_POOL, GENOME_LEN, agreement, genomeToSource, type Genome } from "./rulePool.ts";

export interface EvoConfig {
  islandCount: number;
  populationSize: number;
  maxGenerations: number;
  plateauWindow: number;
  migrationInterval: number;
  tournamentSize: number;
  crossoverProb: number; // 0.40
  reproductionProb: number; // 0.40
  mutationProb: number; // 0.10 (LLM channel)
  ercMutationProb: number; // 0.10
  mwuaLambda: number; // 0.15
  promoteThreshold: number; // 0.98
  seed: number;
  earlyStop: boolean;
}

export interface EvoResult {
  bestGenome: Genome;
  bestSource: string;
  bestFitness: number;
  generations: number;
  promoted: boolean;
  bestIsSound: boolean;
  finalEntropyNorm: number; // Shannon entropy of the final pooled population, normalized to [0,1]
  history: number[]; // best fitness per generation
}

export const DEFAULT_CONFIG: EvoConfig = {
  islandCount: 4,
  populationSize: 30,
  maxGenerations: 200,
  plateauWindow: 40,
  migrationInterval: 25,
  tournamentSize: 3,
  crossoverProb: 0.4,
  reproductionProb: 0.4,
  mutationProb: 0.1,
  ercMutationProb: 0.1,
  mwuaLambda: 0.15,
  promoteThreshold: 0.98,
  seed: 0x1234abcd,
  earlyStop: true,
};

function fitnessOf(g: Genome): number {
  const res = verify(parseProgram(genomeToSource(g)));
  if (!res.sound) return 0; // verification gate: unsound => unpromotable
  return agreement(g);
}

function randInt(rng: Mulberry32, n: number): number {
  return rng.nextU32() % n;
}
function randFloat(rng: Mulberry32): number {
  return rng.nextU32() / 0x100000000;
}
function randomGenome(rng: Mulberry32): Genome {
  return Array.from({ length: GENOME_LEN }, () => randInt(rng, RULE_POOL.length));
}

/**
 * Softmax over fitness with temperature λ — the MWUA distribution. This p is the exact
 * maximizer of U(σ)=Σpᵢgᵢ+λH(P); larger λ raises H(p) (more diversity). Exported so the
 * fitness/entropy tradeoff can be asserted directly on the distribution.
 */
export function mwuaWeights(fits: number[], lambda: number): number[] {
  const max = Math.max(...fits);
  const exps = fits.map((f) => Math.exp((f - max) / lambda));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Shannon entropy (bits) of a probability vector. */
export function shannon(p: number[]): number {
  let h = 0;
  for (const q of p) if (q > 0) h -= q * Math.log2(q);
  return h;
}

/** Sample an index from a probability vector using seeded entropy. */
function sample(rng: Mulberry32, weights: number[]): number {
  let u = randFloat(rng);
  for (let i = 0; i < weights.length; i++) {
    u -= weights[i]!;
    if (u <= 0) return i;
  }
  return weights.length - 1;
}

/** Tournament selection whose entrants are drawn from the MWUA distribution. */
function selectParent(rng: Mulberry32, pop: Genome[], fits: number[], weights: number[], k: number): Genome {
  let bestIdx = sample(rng, weights);
  for (let i = 1; i < k; i++) {
    const c = sample(rng, weights);
    if (fits[c]! > fits[bestIdx]!) bestIdx = c;
  }
  return pop[bestIdx]!;
}

function crossover(rng: Mulberry32, a: Genome, b: Genome): Genome {
  const point = 1 + randInt(rng, GENOME_LEN - 1); // 1..len-1
  return [...a.slice(0, point), ...b.slice(point)];
}
function ercMutate(rng: Mulberry32, g: Genome): Genome {
  const child = [...g];
  const pos = randInt(rng, GENOME_LEN);
  const step = randFloat(rng) < 0.5 ? -1 : 1; // ±1 ephemeral-constant nudge
  child[pos] = (child[pos]! + step + RULE_POOL.length) % RULE_POOL.length;
  return child;
}

function entropyNorm(pop: Genome[]): number {
  const counts = new Map<string, number>();
  for (const g of pop) {
    const k = g.join(",");
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const n = pop.length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  const max = Math.log2(n);
  return max > 0 ? h / max : 0;
}

export function evolve(config: EvoConfig, op: MutationOperator = new MockLlmRewrite()): EvoResult {
  const rng = new Mulberry32(config.seed);
  const islands: Genome[][] = Array.from({ length: config.islandCount }, () =>
    Array.from({ length: config.populationSize }, () => randomGenome(rng)),
  );

  let bestGenome: Genome = islands[0]![0]!;
  let bestFitness = -1;
  const history: number[] = [];
  let plateau = 0;
  let generations = 0;
  // Tracked explicitly (not read back from `history`) so generation 1 has a real
  // baseline to compare against instead of `history[history.length - 2]` === undefined.
  let prevBest = bestFitness;

  for (let gen = 1; gen <= config.maxGenerations; gen++) {
    generations = gen;
    let genBest = bestFitness;

    for (let isl = 0; isl < islands.length; isl++) {
      const pop = islands[isl]!;
      const fits = pop.map(fitnessOf);
      for (let i = 0; i < pop.length; i++) {
        if (fits[i]! > bestFitness) {
          bestFitness = fits[i]!;
          bestGenome = pop[i]!;
        }
        if (fits[i]! > genBest) genBest = fits[i]!;
      }

      const weights = mwuaWeights(fits, config.mwuaLambda);
      const next: Genome[] = [];
      while (next.length < config.populationSize) {
        const roll = randFloat(rng);
        if (roll < config.reproductionProb) {
          next.push([...selectParent(rng, pop, fits, weights, config.tournamentSize)]);
        } else if (roll < config.reproductionProb + config.crossoverProb) {
          const a = selectParent(rng, pop, fits, weights, config.tournamentSize);
          const b = selectParent(rng, pop, fits, weights, config.tournamentSize);
          next.push(crossover(rng, a, b));
        } else if (roll < config.reproductionProb + config.crossoverProb + config.mutationProb) {
          next.push(op.rewrite(selectParent(rng, pop, fits, weights, config.tournamentSize), rng));
        } else {
          next.push(ercMutate(rng, selectParent(rng, pop, fits, weights, config.tournamentSize)));
        }
      }
      islands[isl] = next;
    }

    history.push(bestFitness);
    plateau = genBest > prevBest ? 0 : plateau + 1;
    prevBest = genBest;

    if (config.earlyStop && bestFitness >= config.promoteThreshold) break;
    if (config.earlyStop && plateau >= config.plateauWindow) break;

    if (gen % config.migrationInterval === 0 && islands.length > 1) {
      // Ring migration: copy each island's first genome to the next island.
      const carriers = islands.map((p) => [...p[0]!]);
      for (let i = 0; i < islands.length; i++) {
        islands[i]![config.populationSize - 1] = carriers[(i + islands.length - 1) % islands.length]!;
      }
    }
  }

  const pooled = islands.flat();
  const bestIsSound = verify(parseProgram(genomeToSource(bestGenome))).sound;

  return {
    bestGenome,
    bestSource: genomeToSource(bestGenome),
    bestFitness,
    generations,
    promoted: bestFitness >= config.promoteThreshold && bestIsSound,
    bestIsSound,
    finalEntropyNorm: entropyNorm(pooled),
    history,
  };
}
