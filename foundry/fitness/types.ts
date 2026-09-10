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
  // WIDENED FROM THE LITERAL `false` BY R2, and the widening is the point.
  // Typing this as `false` did not prevent a stand-in from being recorded — it
  // only forced every caller that wanted to TEST the refusal to write
  // `true as unknown as false`, an ill-typed cast that made the call site
  // itself a plausible source of an incidental throw. The runtime guard in
  // computeFitness is what enforces LAW 3; the type was never doing it.
  isStandIn: boolean;
  timestamp: string;
}

export interface FitnessResult {
  fitness: number;
  breakdown: FitnessBreakdown;
  provenance: GateProvenance;
}

/**
 * Thrown when fitness is asked to score a run whose provenance is a stand-in.
 *
 * A distinct class, not a message convention: the oracle asserts on the class
 * and on `field`, so an incidental TypeError can no longer impersonate a
 * refusal. REJECTED ALTERNATIVE — do not re-derive: matching on `err.message`
 * text. That measures the wording of an error string, which any refactor
 * silently changes, and it passes on an unrelated TypeError whose message
 * happens to contain "stand-in".
 */
export class StandInProvenanceError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(`fitness refused: provenance.${field} indicates a stand-in model`);
    this.name = 'StandInProvenanceError';
    this.field = field;
  }
}

/** Thrown when provenance is structurally unusable (missing commitSha, etc.). */
export class InvalidProvenanceError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(`fitness refused: provenance.${field} is missing or empty`);
    this.name = 'InvalidProvenanceError';
    this.field = field;
  }
}
