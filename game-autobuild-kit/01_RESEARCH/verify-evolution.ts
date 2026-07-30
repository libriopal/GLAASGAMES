/**
 * Verification proof for the P5 evolutionary engine (deterministic, NO API keys).
 *
 * Demonstrates:
 *   1. the search recovers the reference policy: promoted, sound, C(σ) ≥ 0.98;
 *   2. the run is fully deterministic (same seed -> identical result);
 *   3. the verification gate holds (a promoted candidate is always sound);
 *   4. the MWUA fitness/entropy tradeoff: larger λ preserves more diversity
 *      (monoculture guard);
 *   5. the LLM channel is key-gated — RealLlmRewrite refuses to run without a key,
 *      so no provider is ever called by accident.
 *
 * Run: npm run verify:evolution   ·   Exit 0 = all invariants held.
 */

import { evolve, DEFAULT_CONFIG, mwuaWeights, shannon } from "./evolution.ts";
import { genomeToSource, TARGET } from "./rulePool.ts";
import { RealLlmRewrite, LlmKeyMissingError } from "./llmOperator.ts";
import { Mulberry32 } from "../02_CONTROLLER/prng.ts";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

// 1. Convergence, promotion, soundness.
const run = evolve({ ...DEFAULT_CONFIG, seed: 0xa11ce });
ok(run.promoted, `search PROMOTED a candidate (C(σ)=${run.bestFitness.toFixed(2)} ≥ ${DEFAULT_CONFIG.promoteThreshold})`);
ok(run.bestIsSound, "promoted candidate passes the P4 verifier (sound)");
ok(run.bestFitness >= 0.98, "best fitness reaches the promotion threshold");
ok(run.generations < DEFAULT_CONFIG.maxGenerations, `converged in ${run.generations} generations (< ${DEFAULT_CONFIG.maxGenerations})`);
ok(run.bestSource === genomeToSource([...TARGET]), "recovered the reference policy exactly");

// 2. Determinism.
const run2 = evolve({ ...DEFAULT_CONFIG, seed: 0xa11ce });
ok(
  run2.bestFitness === run.bestFitness &&
    run2.generations === run.generations &&
    run2.bestSource === run.bestSource,
  "same seed -> identical result (deterministic search)",
);

// 3. Gate invariant: promotion implies soundness.
ok(!run.promoted || run.bestIsSound, "invariant: promoted => sound");

// 4. MWUA fitness/entropy tradeoff, on the selection distribution itself (softmax
//    temperature): for a fixed fitness vector, larger λ yields a higher-entropy
//    distribution — the monoculture guard.
const fits = [1.0, 0.67, 0.67, 0.33, 0.33, 0.0];
const hGreedy = shannon(mwuaWeights(fits, 0.05));
const hDiverse = shannon(mwuaWeights(fits, 1.0));
ok(
  hDiverse > hGreedy,
  `MWUA tradeoff: larger λ preserves diversity — H(λ=1.0)=${hDiverse.toFixed(3)} > H(λ=0.05)=${hGreedy.toFixed(3)} bits`,
);

// 5. LLM channel is key-gated.
let gated = false;
try {
  new RealLlmRewrite({ provider: "cohere", apiKeyEnv: "COHERE_API_KEY" }).rewrite([0, 0, 0], new Mulberry32(1));
} catch (e) {
  gated = e instanceof LlmKeyMissingError;
}
ok(gated, "RealLlmRewrite refuses to run without a key (no accidental provider calls)");

console.log("");
console.log(`Best evolved program (fitness ${run.bestFitness.toFixed(2)}, gen ${run.generations}):`);
for (const line of run.bestSource.split("\n")) console.log("  " + line);

console.log("");
if (failures === 0) {
  console.log("ALL EVOLUTION INVARIANTS HELD.");
  process.exit(0);
} else {
  console.log(`${failures} INVARIANT(S) FAILED.`);
  process.exit(1);
}
