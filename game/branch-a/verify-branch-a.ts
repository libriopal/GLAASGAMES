/**
 * W8 gate: branch_a_no_bots is enforced (H1), every message type has a
 * sender+handler pair, and the audit log is complete, tamper-evident, and
 * independently re-verifiable by the player (not "trust us").
 *
 * Run: npm run verify:branch-a   ·   Exit 0 = gate held.
 */

import type { SessionRecord, TurnRecord } from '../../foundry/types.ts';
import { assertBranchANoBots, branchANoBotsHolds, HaltConditionError } from './constraint.ts';
import { MESSAGE_REGISTRY, verifyMessageContracts } from './message-contracts.ts';
import { buildAuditLog, verifyAuditLogComplete, verifySeedCommitReveal, verifySignedTimestamps } from './audit-log.ts';

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
    valueAtRiskBefore: 5,
    valueLostThisTurn: 0,
    ...overrides,
  };
}

const humanSession: SessionRecord = {
  sessionId: 'branch-a-1',
  genomeId: 'g1',
  branch: 'A',
  isBotSession: false,
  modelIdentity: 'engine-v6-real',
  commitSha: 'deadbeef',
  playerIds: ['p1', 'p2'],
  completed: true,
  turns: [
    turn({ turnIndex: 1, actingPlayerId: 'p1', boardStateHashBefore: 'h0', boardStateHashAfter: 'h1' }),
    turn({ turnIndex: 2, actingPlayerId: 'p2', boardStateHashBefore: 'h1', boardStateHashAfter: 'h2', valueLostThisTurn: 2 }),
    turn({ turnIndex: 3, actingPlayerId: 'p1', boardStateHashBefore: 'h2', boardStateHashAfter: 'h3' }),
  ],
};

const bottedBranchA: SessionRecord = { ...humanSession, sessionId: 'branch-a-bad', isBotSession: true };
const botLabSession: SessionRecord = { ...humanSession, sessionId: 'lab-1', branch: 'D', isBotSession: true };

// 1. Branch A + no bots: holds.
ok(branchANoBotsHolds(humanSession), 'human-vs-human Branch A session satisfies branch_a_no_bots');

// 2. Branch A + bot: violates, and throws H1.
ok(!branchANoBotsHolds(bottedBranchA), 'a bot in Branch A violates branch_a_no_bots');
let haltId: string | undefined;
try {
  assertBranchANoBots(bottedBranchA);
} catch (e) {
  if (e instanceof HaltConditionError) haltId = e.haltId;
}
ok(haltId === 'H1', 'assertBranchANoBots raises HaltConditionError H1 for a bot in Branch A');

// 3. Bot-vs-bot lab sessions on Branch D are unaffected (§5.4: bot-vs-bot in the lab only, not Branch A).
ok(branchANoBotsHolds(botLabSession), 'bot-vs-bot lab session on Branch D does not trip the constraint');

// 4. Message contracts: the canonical registry is fully paired, including SUBMIT_CHAIN_FACES (DEF-06).
const contractResult = verifyMessageContracts();
ok(contractResult.passed, 'every registered message type has both a sender and a handler');
ok(MESSAGE_REGISTRY.some((m) => m.type === 'SUBMIT_CHAIN_FACES'), 'SUBMIT_CHAIN_FACES is present in the registry (DEF-06)');

// 5. A registry with a missing handler fails.
const brokenRegistry = [...MESSAGE_REGISTRY, { type: 'GHOST_MESSAGE', direction: 'client-to-server' as const, hasSender: true, hasHandler: false }];
ok(!verifyMessageContracts(brokenRegistry).passed, 'a message type with a sender but no handler fails verify-message-contracts');

// 6. Audit log — complete and independently re-verifiable.
const seed = new Uint8Array([1, 2, 3, 4]);
const hmacKey = 'test-session-hmac-key';
const timestamps = humanSession.turns.map((_, i) => `2026-08-01T00:0${i}:00Z`);
const log = buildAuditLog(humanSession, seed, hmacKey, timestamps);

ok(verifyAuditLogComplete(log), 'a fully-built audit log passes verify-audit-log-complete');
ok(verifySeedCommitReveal(log), 'the revealed seed re-hashes to the committed seed hash — player-verifiable');
ok(verifySignedTimestamps(log, hmacKey), 'every signed timestamp re-verifies against the session key');
ok(log.counterfactualOrdering.every((r) => r.counterfactualAdvantage === 0), 'counterfactual ordering shows zero advantage from turn order, for every adjacent pair');

// 7. An incomplete audit log fails verify-audit-log-complete.
const incompleteLog = { ...log, signedTimestamps: [] };
ok(!verifyAuditLogComplete(incompleteLog), 'an audit log missing a required field fails verify-audit-log-complete');

// 8. Tamper detection: a flipped seed reveal breaks the commit/reveal check.
const tamperedLog = { ...log, seedReveal: '00'.repeat(4) };
ok(!verifySeedCommitReveal(tamperedLog), 'a tampered seed reveal is detected by re-hashing');

console.log('');
if (failures === 0) {
  console.log('W8 GATE HELD: branch_a_no_bots, message contracts, and the audit log all hold.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
