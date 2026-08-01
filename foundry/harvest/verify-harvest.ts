/**
 * W4 gate: contested states are harvested by committee-mean top-two EV margin;
 * human friction confirms borderline cases but never overrides a decisive
 * committee margin.
 *
 * Run: npm run verify:harvest   ·   Exit 0 = gate held.
 */

import type { SessionRecord, TurnRecord } from '../types.ts';
import type { BotAgent } from './margin.ts';
import { harvestContestedStates } from './margin.ts';
import type { TelemetrySignals } from '../telemetry/types.ts';

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
  isBotSession: true,
  modelIdentity: 'engine-v6-real',
  commitSha: 'deadbeef',
  playerIds: ['bot1'],
  completed: true,
  turns: [
    turn({ turnIndex: 1, boardStateHashBefore: 'contested-1', candidateMoves: ['a', 'b'] }),
    turn({ turnIndex: 2, boardStateHashBefore: 'lopsided-1', candidateMoves: ['a', 'b'] }),
    turn({ turnIndex: 3, boardStateHashBefore: 'borderline-1', candidateMoves: ['a', 'b'] }),
  ],
};

// Committee: 3 agreeing bots. Turn 1 = tight margin (contested). Turn 2 = lopsided (not contested).
// Turn 3 = just outside the primary threshold (borderline).
function makeBot(id: string): BotAgent {
  return {
    id,
    evaluate: (t) => {
      if (t.boardStateHashBefore === 'contested-1') return [1.0, 0.98];
      if (t.boardStateHashBefore === 'lopsided-1') return [1.0, 0.1];
      if (t.boardStateHashBefore === 'borderline-1') return [1.0, 0.78];
      return [1.0, 1.0];
    },
  };
}
const ensemble: BotAgent[] = [makeBot('bot-a'), makeBot('bot-b'), makeBot('bot-c')];

function friction(count: number): TelemetrySignals {
  return { turnLatencyMs: 2000, selectionFrictionCount: count, choiceEntropy: 1, completionRate: 1 };
}

// 1. No friction: only the decisively-tight turn is harvested.
const noFriction = [friction(0), friction(0), friction(0)];
const resultNoFriction = harvestContestedStates(session, ensemble, noFriction, 0.2);
ok(resultNoFriction.length === 1 && resultNoFriction[0]?.boardStateHash === 'contested-1', 'only the tight-margin turn is contested with zero friction');

// 2. Friction cannot rescue a decisively lopsided turn.
const heavyFrictionEverywhere = [friction(5), friction(5), friction(5)];
const resultHeavyFriction = harvestContestedStates(session, ensemble, heavyFrictionEverywhere, 0.2);
ok(
  !resultHeavyFriction.some((s) => s.boardStateHash === 'lopsided-1'),
  'friction alone cannot admit a decisively one-sided turn',
);

// 3. Friction DOES pull in a borderline turn just outside the primary threshold.
// borderline-1's margin (~0.22) sits between threshold (0.2) and threshold*1.5 (0.3).
const borderlineFriction = [friction(0), friction(0), friction(2)];
const resultBorderline = harvestContestedStates(session, ensemble, borderlineFriction, 0.2);
ok(
  resultBorderline.some((s) => s.boardStateHash === 'borderline-1'),
  'human friction confirms a borderline (near-threshold) turn as contested',
);

// 4. Every harvested state carries its candidate moves for downstream novelty comparison.
ok(
  resultNoFriction[0]?.candidateMoves.length === 2,
  'harvested contested states retain candidate moves',
);

console.log('');
if (failures === 0) {
  console.log('W4 GATE HELD: margin-based harvest correctly identifies contested states; friction is secondary only.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
