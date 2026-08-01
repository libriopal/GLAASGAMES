// foundry/telemetry/types.ts — W3 (07_CLAUDE_CODE_HANDOFF_V6.md §4.2)
// Decision-centric telemetry only. Measured at margin-flagged contested
// states, not every turn.

export interface TelemetrySignals {
  turnLatencyMs: number; // deliberation — 10.1523/eneuro.0270-24.2024
  selectionFrictionCount: number; // reconsideration
  choiceEntropy: number; // is the decision genuinely open?
  completionRate: number; // minimal viability check ONLY
}

export interface TelemetryAggregate {
  sampleCount: number;
  meanTurnLatencyMs: number;
  meanSelectionFrictionCount: number;
  meanChoiceEntropy: number;
  completionRate: number;
}

/**
 * Forbidden as fitness inputs (verify-checked, §4.2 + §9 verify-no-retention-inputs).
 * Retention is NOT a fitness term and is NOT collected as a fitness input (LAW 2).
 */
export const FORBIDDEN_TELEMETRY_FIELDS = [
  'sessionLengthMs',
  'returnRate',
  'streakLength',
  'dailyActiveFlag',
] as const;

export type ForbiddenTelemetryField = (typeof FORBIDDEN_TELEMETRY_FIELDS)[number];

export interface ForbiddenFieldScanResult {
  clean: boolean;
  found: ForbiddenTelemetryField[];
}

/** Structural guard: recursively scans any object for forbidden retention-signal keys. */
export function scanForForbiddenTelemetryFields(value: unknown): ForbiddenFieldScanResult {
  const found = new Set<ForbiddenTelemetryField>();

  const visit = (v: unknown) => {
    if (v === null || typeof v !== 'object') return;
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      if ((FORBIDDEN_TELEMETRY_FIELDS as readonly string[]).includes(key)) {
        found.add(key as ForbiddenTelemetryField);
      }
      visit(val);
    }
  };
  visit(value);

  return { clean: found.size === 0, found: [...found] };
}
