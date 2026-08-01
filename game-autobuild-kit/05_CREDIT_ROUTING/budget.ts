/**
 * Credit routing & cost governance (Module 05).
 *
 * Enforces a hard token/spend cap so an agentic loop cannot run away — the qualitative
 * risk the durable-orchestration layer exists to bound (grounded: rollback-recovery
 * literature, SRC-2026-07-012; the specific "42%" figure was struck as unsourced, D3-B).
 * This is pure accounting: it holds no keys and makes no calls. It routes a task to a
 * provider tier (via modelRouter) and refuses spend once the cap is hit.
 */

import { routeFor, keyAvailable, type TaskTier } from "../02_CONTROLLER/modelRouter.ts";

export class BudgetExceededError extends Error {}

/** A token count fed to the ledger was not a finite, non-negative integer. */
export class InvalidBudgetInputError extends Error {}

export interface SpendRecord {
  tier: TaskTier;
  tokens: number;
  provider: string;
}

function assertValidTokenCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidBudgetInputError(`${label} must be a non-negative integer (got ${value})`);
  }
}

export class BudgetLedger {
  private spent = 0;
  private readonly log: SpendRecord[] = [];
  constructor(private readonly capTokens: number) {
    assertValidTokenCount(capTokens, "capTokens");
  }

  get remaining(): number {
    return Math.max(0, this.capTokens - this.spent);
  }
  get totalSpent(): number {
    return this.spent;
  }
  history(): SpendRecord[] {
    return [...this.log];
  }

  /**
   * Reserve budget for a call BEFORE making it. Throws if the estimate itself
   * is invalid (negative/NaN/non-integer would otherwise silently poison or
   * decrement `spent`, defeating the runaway-loop guard) or if it would
   * exceed the cap. Either way, `spent` is left unchanged.
   */
  authorize(tier: TaskTier, estTokens: number): { provider: string; keyReady: boolean } {
    assertValidTokenCount(estTokens, "estTokens");
    if (this.spent + estTokens > this.capTokens) {
      throw new BudgetExceededError(
        `Budget cap ${this.capTokens} would be exceeded (${this.spent}+${estTokens}); throttling.`,
      );
    }
    this.spent += estTokens;
    const route = routeFor(tier);
    this.log.push({ tier, tokens: estTokens, provider: route.provider });
    return { provider: route.provider, keyReady: keyAvailable(tier) };
  }
}
