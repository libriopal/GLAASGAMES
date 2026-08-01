/**
 * W3 gate: telemetry is captured only at margin-flagged contested states, and
 * retention-style fields are structurally rejected as fitness inputs.
 *
 * Run: npm run verify:telemetry   ·   Exit 0 = gate held.
 */

import type { SessionRecord, TurnRecord } from '../types.ts';
import { aggregateTelemetry, captureAtMarginFlaggedStates } from './capture.ts';
import { scanForForbiddenTelemetryFields } from './types.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

function turn(overrides: Partial<TurnRecord>): TurnRecord {
  return {
    turnIndex: 0,
    actingPlayerId: 'p1',
    boardStateHashBefore: 'h0',
    boardStateHashAfter: 'h1',
    candidateMoves: ['a', 'b'],
    chosenMove: 'a',
    latencyMs: 1000,
    reconsiderationCount: 0,
    valueAtRiskBefore: 0,
    valueLostThisTurn: 0,
    ...overrides,
  };
}

const session: SessionRecord = {
  sessionId: 's1',
  genomeId: 'g1',
  branch: 'D',
  isBotSession: false,
  modelIdentity: 'engine-v6-real',
  commitSha: 'deadbeef',
  playerIds: ['p1'],
  completed: true,
  turns: [
    turn({ turnIndex: 1, topTwoEvGap: 0.02, candidateMoves: ['a', 'b', 'c'], latencyMs: 4200, reconsiderationCount: 2 }),
    turn({ turnIndex: 2, topTwoEvGap: 0.9, candidateMoves: ['a', 'b'], latencyMs: 300 }), // NOT contested
    turn({ turnIndex: 3, topTwoEvGap: 0.1, candidateMoves: ['a', 'b'], latencyMs: 1500 }),
    turn({ turnIndex: 4, candidateMoves: ['a'], latencyMs: 200 }), // never scored — not contested
  ],
};

// 1. Only margin-flagged turns are captured.
const captured = captureAtMarginFlaggedStates(session);
ok(captured.length === 2, 'only the 2 margin-flagged (small EV-gap) turns are captured, not all 4');

// 2. Latency/friction come straight from the flagged turns, not fabricated.
ok(captured[0]?.turnLatencyMs === 4200 && captured[0]?.selectionFrictionCount === 2, 'signals reflect the source turn');

// 3. Choice entropy scales with genuinely-open candidate count.
ok((captured[0]?.choiceEntropy ?? 0) > (captured[1]?.choiceEntropy ?? 0), 'more candidate moves ⇒ higher choice entropy');

// 4. Aggregate sample count matches captured count, not total turn count.
const agg = aggregateTelemetry(captured);
ok(agg.sampleCount === 2, 'aggregate sample count reflects only margin-flagged samples');

// 5. Forbidden fields are caught structurally, anywhere in a nested object.
const forbiddenPayload = { telemetry: agg, meta: { returnRate: 0.4, streakLength: 7 } };
const scan = scanForForbiddenTelemetryFields(forbiddenPayload);
ok(!scan.clean, 'forbidden retention fields are detected');
ok(scan.found.includes('returnRate') && scan.found.includes('streakLength'), '  ...both offending fields named');

// 6. Clean payload passes.
ok(scanForForbiddenTelemetryFields(agg).clean, 'a clean TelemetryAggregate has no forbidden fields');

console.log('');
if (failures === 0) {
  console.log('W3 GATE HELD: telemetry is decision-centric and margin-scoped; retention fields structurally excluded.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
