// foundry/fitness/types.ts — W6 (07_CLAUDE_CODE_HANDOFF_V6.md §4.1, §4.6)

import type { TelemetryAggregate } from '../telemetry/types.ts';

export type { TelemetryAggregate };

/** Derived from the Delphi corpus (W5): confidence, richness, and reliability of human judgment. */
export interface JudgmentAggregate {
  sampleCount: number;
  meanConfidence: number; // mean StakeRecord.confidence, 1..5
  meanDistributionEntropy: number; // mean richness (bits) of converged seed distributions
  reliability: number; // Fleiss' κ across the corpus; may be negative (worse than chance)
}

export interface FitnessBreakdown {
  fTel: number;
  fJudg: number;
  conc: number;
}

/** LAW 3: any gate result without valid provenance is VOID — not reported, not stored, not used. */
export interface GateProvenance {
  modelIdentity: string; // MUST be the real engine
  commitSha: string;
  isStandIn: false; // type-level: a stand-in can never be recorded
  timestamp: string;
}

export interface FitnessResult {
  fitness: number;
  breakdown: FitnessBreakdown;
  provenance: GateProvenance;
}
