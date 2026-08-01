/**
 * Mutation operators — the plan's two channels.
 *   Channel 1 (structural subtree crossover) lives in the engine.
 *   Channel 2 (LLM-driven rewrite, mutate(g)=g⊕Δg) is defined here as an injectable
 *   interface so the engine never hard-depends on a network provider.
 *
 * The verified demo uses MockLlmRewrite — fully deterministic, NO API calls, NO keys.
 * RealLlmRewrite is the production path: it is KEY-GATED and throws if no provider key
 * is configured, so it can never spend budget by accident. Providers (Cohere / Groq /
 * Gemini Flash / Anthropic) are routed by 02_CONTROLLER/modelRouter.ts.
 *
 * Grounded: FunSearch LLM-as-mutation-operator (Romera-Paredes et al. 2023,
 * https://doi.org/10.1038/s41586-023-06924-6).
 */

import type { Mulberry32 } from "../02_CONTROLLER/prng.ts";
import { RULE_POOL, type Genome } from "./rulePool.ts";

export interface MutationOperator {
  readonly channel: string;
  /** Return a mutated copy of the genome. Must not mutate the input. */
  rewrite(g: Genome, rng: Mulberry32): Genome;
}

/**
 * Deterministic stand-in for the LLM rewrite. Blind to the target (no cheating):
 * it applies a structural nudge chosen from seeded entropy, exactly as a real
 * operator would slot in. Δg here is a bounded allele shift.
 */
export class MockLlmRewrite implements MutationOperator {
  readonly channel = "mock-llm";
  rewrite(g: Genome, rng: Mulberry32): Genome {
    const child = [...g];
    const pos = rng.nextU32() % child.length;
    const delta = 1 + (rng.nextU32() % (RULE_POOL.length - 1)); // non-zero shift
    child[pos] = (child[pos]! + delta) % RULE_POOL.length;
    return child;
  }
}

export class LlmKeyMissingError extends Error {}

export interface LlmProviderConfig {
  provider: "anthropic" | "cohere" | "groq" | "gemini";
  /** Name of the env var expected to hold the key. */
  apiKeyEnv: string;
}

/**
 * Production LLM rewrite. NOT used in the verified demo. It refuses to run without a
 * configured key, so it can never make a live call by accident. The actual request
 * construction is intentionally left as the step-2 integration point.
 */
export class RealLlmRewrite implements MutationOperator {
  readonly channel = "llm";
  constructor(private readonly cfg: LlmProviderConfig) {}
  rewrite(_g: Genome, _rng: Mulberry32): Genome {
    const key = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
      this.cfg.apiKeyEnv
    ];
    if (!key) {
      throw new LlmKeyMissingError(
        `RealLlmRewrite(${this.cfg.provider}) requires ${this.cfg.apiKeyEnv}; refusing to call a provider without a key. ` +
          `Configure the key in the Research Domain env and confirm before any live, budget-spending run.`,
      );
    }
    // Step-2 integration point: build a compile-feedback prompt, call the provider via
    // modelRouter, parse the returned DSL, and return g ⊕ Δg. Deliberately not wired
    // until keys are provisioned and a live run is explicitly authorized.
    throw new LlmKeyMissingError("RealLlmRewrite is not wired for live calls in this build.");
  }
}
