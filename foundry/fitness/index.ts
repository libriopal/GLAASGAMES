// foundry/fitness/index.ts — W6 (07_CLAUDE_CODE_HANDOFF_V6.md §4.1)
//
// fitness = f(telemetry) × f(judgment) × concordance(telemetry, judgment)
//
// MULTIPLICATIVE. A game cannot score well on one signal alone. An engaging
// game with no judgment in it scores ZERO, not "half." RETENTION IS NOT A
// TERM (LAW 2) — enforced structurally below, not just by convention.

import { scanForForbiddenTelemetryFields } from '../telemetry/types.ts';
import type { FitnessResult, GateProvenance, JudgmentAggregate, TelemetryAggregate } from './types.ts';

const MIN_VIABLE_COMPLETION_RATE = 0.5;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Saturating normalization to [0,1): value===midpoint ⇒ 0.5, diminishing returns beyond it. */
function saturate(value: number, midpoint: number): number {
  if (midpoint <= 0) throw new Error('saturate() midpoint must be positive');
  return value / (value + midpoint);
}

/**
 * completionRate below the minimal-viability floor gates the score to 0 outright
 * (§4.2: "minimal viability check ONLY" — it is a gate, not a graded input).
 */
export function scoreTelemetry(t: TelemetryAggregate): number {
  if (t.completionRate < MIN_VIABLE_COMPLETION_RATE) return 0;
  const latencyScore = saturate(t.meanTurnLatencyMs, 2000);
  const frictionScore = saturate(t.meanSelectionFrictionCount, 1);
  const entropyScore = saturate(t.meanChoiceEntropy, 1);
  return clamp01((latencyScore + frictionScore + entropyScore) / 3);
}

export function scoreJudgment(j: JudgmentAggregate): number {
  const confidenceScore = clamp01((j.meanConfidence - 1) / 4); // 1..5 -> 0..1
  const richnessScore = saturate(j.meanDistributionEntropy, 1);
  const reliabilityScore = clamp01(j.reliability); // negative κ (worse than chance) floors to 0
  return clamp01((confidenceScore + richnessScore + reliabilityScore) / 3);
}

/**
 * Human ruling (R1Q1): telemetry+judgment consistent > either alone > inconsistent.
 * Implemented as agreement between the two sub-scores — a big gap between "the
 * data says this was hard" and "the humans say this was hard" is penalized.
 */
export function concordance(telemetry: TelemetryAggregate, judgment: JudgmentAggregate): number {
  return clamp01(1 - Math.abs(scoreTelemetry(telemetry) - scoreJudgment(judgment)));
}

/**
 * `provenance` is a required argument, not an ambient `currentProvenance()` call —
 * a hidden global is exactly the kind of thing that could silently default to a
 * stand-in and violate LAW 3. The caller must supply real provenance every time.
 */
export function computeFitness(
  telemetry: TelemetryAggregate,
  judgment: JudgmentAggregate,
  provenance: GateProvenance,
): FitnessResult {
  const forbidden = [
    scanForForbiddenTelemetryFields(telemetry),
    scanForForbiddenTelemetryFields(judgment),
  ].find((s) => !s.clean);
  if (forbidden) {
    throw new Error(`verify-no-retention-inputs: forbidden field(s) in fitness input: ${forbidden.found.join(', ')}`);
  }
  if (provenance.isStandIn !== false) {
    throw new Error('verify-no-standin-models: fitness cannot be computed against a stand-in model');
  }

  const fTel = scoreTelemetry(telemetry);
  const fJudg = scoreJudgment(judgment);
  const conc = concordance(telemetry, judgment);

  return {
    fitness: fTel * fJudg * conc, // MULTIPLICATIVE — never additive
    breakdown: { fTel, fJudg, conc },
    provenance,
  };
}
