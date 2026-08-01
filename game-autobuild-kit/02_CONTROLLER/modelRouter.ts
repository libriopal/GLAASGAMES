/**
 * Model router (Module 05 — cost governance). Maps a task tier to a provider and the
 * env var that must hold its key. It performs NO network calls and holds NO keys in
 * source; it only resolves configuration. A live call is made only by
 * 01_RESEARCH/llmOperator.ts::RealLlmRewrite, which refuses to run without the key.
 *
 * Keys belong in the Research Domain environment only — never the Execution Domain,
 * which must stay deterministic and provider-free.
 */

import type { LlmProviderConfig } from "../01_RESEARCH/llmOperator.ts";

export type TaskTier = "format" | "repair" | "mutate" | "strategy";

/** Default routing: cheap/fast tiers to small models, hard tiers to stronger ones. */
export const DEFAULT_ROUTING: Record<TaskTier, LlmProviderConfig> = {
  format: { provider: "groq", apiKeyEnv: "GROQ_API_KEY" },
  repair: { provider: "gemini", apiKeyEnv: "GEMINI_API_KEY" },
  mutate: { provider: "cohere", apiKeyEnv: "COHERE_API_KEY" },
  strategy: { provider: "anthropic", apiKeyEnv: "ANTHROPIC_API_KEY" },
};

export function routeFor(tier: TaskTier): LlmProviderConfig {
  return DEFAULT_ROUTING[tier];
}

/** True if the key for a tier is present in the environment. */
export function keyAvailable(tier: TaskTier): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return Boolean(env[DEFAULT_ROUTING[tier].apiKeyEnv]);
}
