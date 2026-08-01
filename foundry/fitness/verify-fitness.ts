/**
 * W6 gate: fitness is strictly multiplicative (zero on one axis ⇒ zero fitness,
 * never "half"), retention-style inputs are structurally rejected, and
 * stand-in provenance is refused.
 *
 * Run: npm run verify:fitness   ·   Exit 0 = gate held.
 */

import { computeFitness, concordance, scoreJudgment, scoreTelemetry } from './index.ts';
import type { GateProvenance, JudgmentAggregate, TelemetryAggregate } from './types.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const provenance: GateProvenance = {
  modelIdentity: 'engine-v6-real',
  commitSha: 'deadbeef',
  isStandIn: false,
  timestamp: '2026-08-01T00:00:00Z',
};

const richTelemetry: TelemetryAggregate = {
  sampleCount: 20,
  meanTurnLatencyMs: 3000,
  meanSelectionFrictionCount: 1.5,
  meanChoiceEntropy: 1.2,
  completionRate: 0.9,
};

const richJudgment: JudgmentAggregate = {
  sampleCount: 20,
  meanConfidence: 4,
  meanDistributionEntropy: 1.0,
  reliability: 0.4,
};

const emptyJudgment: JudgmentAggregate = {
  sampleCount: 0,
  meanConfidence: 1,
  meanDistributionEntropy: 0,
  reliability: 0,
};

// 1. An engaging game with no judgment scores ZERO, not "half."
const noJudgmentResult = computeFitness(richTelemetry, emptyJudgment, provenance);
ok(noJudgmentResult.fitness === 0, 'zero judgment score ⇒ fitness is exactly 0, not an average');

// 2. Multiplicative identity: fitness === fTel * fJudg * conc exactly.
const richResult = computeFitness(richTelemetry, richJudgment, provenance);
const expected = richResult.breakdown.fTel * richResult.breakdown.fJudg * richResult.breakdown.conc;
ok(Math.abs(richResult.fitness - expected) < 1e-12, 'fitness equals fTel × fJudg × conc exactly (multiplicative, verify-fitness-multiplicative)');

// 3. Below-viability completion rate gates telemetry score to 0 (minimal viability check).
const unviableTelemetry: TelemetryAggregate = { ...richTelemetry, completionRate: 0.1 };
ok(scoreTelemetry(unviableTelemetry) === 0, 'completionRate below viability floor gates telemetry score to 0');

// 4. Negative κ (worse than chance) floors the judgment score contribution, never goes negative.
const unreliableJudgment: JudgmentAggregate = { ...richJudgment, reliability: -0.33 };
ok(scoreJudgment(unreliableJudgment) >= 0, 'negative reliability (κ<0) does not push judgment score negative');

// 5. Concordance penalizes a big gap between telemetry-implied and judgment-implied difficulty.
const lowJudgment: JudgmentAggregate = { sampleCount: 20, meanConfidence: 1, meanDistributionEntropy: 0, reliability: 0 };
ok(
  concordance(richTelemetry, lowJudgment) < concordance(richTelemetry, richJudgment),
  'a telemetry/judgment mismatch scores lower concordance than agreement',
);

// 6. Forbidden retention fields are rejected structurally, even if smuggled into the aggregate.
let threw = false;
try {
  computeFitness({ ...richTelemetry, returnRate: 0.9 } as unknown as TelemetryAggregate, richJudgment, provenance);
} catch {
  threw = true;
}
ok(threw, 'a smuggled retention field (returnRate) on the telemetry input is rejected (verify-no-retention-inputs)');

// 7. Stand-in provenance is refused at the type/runtime boundary (LAW 3 / verify-no-standin-models).
let standInThrew = false;
try {
  computeFitness(richTelemetry, richJudgment, { ...provenance, isStandIn: true as unknown as false });
} catch {
  standInThrew = true;
}
ok(standInThrew, 'stand-in provenance is refused, never silently accepted');

console.log('');
if (failures === 0) {
  console.log('W6 GATE HELD: fitness is multiplicative; retention inputs and stand-in provenance are rejected.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
