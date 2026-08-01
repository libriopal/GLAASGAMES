// foundry/telemetry/capture.ts — W3
// Captures decision-centric signals at margin-flagged states only.

import type { SessionRecord } from '../types.ts';
import type { TelemetryAggregate, TelemetrySignals } from './types.ts';

export const DEFAULT_MARGIN_THRESHOLD = 0.15;

function choiceEntropy(candidateCount: number): number {
  // Uniform-choice entropy proxy in bits: more genuinely open candidates ⇒ higher entropy.
  return candidateCount <= 1 ? 0 : Math.log2(candidateCount);
}

/** Only turns already flagged contested (small top-two EV gap, §4.3) are measured. */
export function captureAtMarginFlaggedStates(
  session: SessionRecord,
  marginThreshold: number = DEFAULT_MARGIN_THRESHOLD,
): TelemetrySignals[] {
  return session.turns
    .filter((t) => t.topTwoEvGap !== undefined && t.topTwoEvGap <= marginThreshold)
    .map((t) => ({
      turnLatencyMs: t.latencyMs,
      selectionFrictionCount: t.reconsiderationCount,
      choiceEntropy: choiceEntropy(t.candidateMoves.length),
      completionRate: session.completed ? 1 : 0,
    }));
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function aggregateTelemetry(signals: TelemetrySignals[]): TelemetryAggregate {
  return {
    sampleCount: signals.length,
    meanTurnLatencyMs: mean(signals.map((s) => s.turnLatencyMs)),
    meanSelectionFrictionCount: mean(signals.map((s) => s.selectionFrictionCount)),
    meanChoiceEntropy: mean(signals.map((s) => s.choiceEntropy)),
    completionRate: mean(signals.map((s) => s.completionRate)),
  };
}
