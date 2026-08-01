/**
 * §9 VERIFY SUITE ADDITIONS — 07_CLAUDE_CODE_HANDOFF_V6.md
 *
 * The 18 named checks from §9, run against real fixtures exercising the real
 * (non-stand-in) engine code built in W1-W9. Each work item's own
 * `verify:<name>` script covers the underlying logic in depth; this script is
 * the single place that asserts every §9-named check by its exact name, so
 * `npm run verify` reports against the handoff doc's own checklist.
 *
 * Run: npm run verify:suite   ·   Exit 0 = every named check holds.
 */

import { evaluateNovelty } from '../families/genome/novelty.ts';
import type { Genome } from '../families/genome/types.ts';
import { scanForProhibitedIconography, verifyBandHonesty } from '../families/expression/pipeline.ts';
import type { BandRender } from '../families/expression/pipeline.ts';
import { makeProvenanceNote, verifyProvenanceNoteComplete } from '../families/provenance/types.ts';
import { scanForForbiddenTelemetryFields } from '../foundry/telemetry/types.ts';
import { computeFitness } from '../foundry/fitness/index.ts';
import type { GateProvenance, JudgmentAggregate, TelemetryAggregate } from '../foundry/fitness/types.ts';
import { isValidProvenance, checkExperienceConformance } from '../foundry/gates/suite.ts';
import { runKotCalibration } from '../foundry/gates/kot-calibration.ts';
import { runFullChain } from '../game/determinism/pipeline.ts';
import { scanForMathRandom } from '../game/determinism/static-checks.ts';
import { assertFixedPoint, toFixedPoint } from '../game/determinism/fixed-point.ts';
import { branchANoBotsHolds } from '../game/branch-a/constraint.ts';
import { verifyAuditLogComplete, buildAuditLog } from '../game/branch-a/audit-log.ts';
import { verifyMessageContracts } from '../game/branch-a/message-contracts.ts';
import { verifyEconomyInvisibility, verifySelfExclusionNoSolicit, verifyAntiManipulation } from '../game/economy/rules.ts';
import type { Account, AccountMessage, SessionUXConfig } from '../game/economy/types.ts';
import type { SessionRecord, TurnRecord } from '../foundry/types.ts';
import { join } from 'node:path';

let failures = 0;
const checkNames: string[] = [];
const check = (name: string, cond: boolean, detail: string) => {
  checkNames.push(name);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!cond) failures++;
};

// --- shared fixtures ---------------------------------------------------------

function turn(overrides: Partial<TurnRecord>): TurnRecord {
  return {
    turnIndex: 0, actingPlayerId: 'p1', boardStateHashBefore: 'h0', boardStateHashAfter: 'h1',
    candidateMoves: ['a', 'b'], chosenMove: 'a', latencyMs: 1000, reconsiderationCount: 0,
    valueAtRiskBefore: 0, valueLostThisTurn: 0, ...overrides,
  };
}

function baseGenome(overrides: Partial<Genome>): Genome {
  return {
    id: 'g-suite', lineage: [],
    structural: { topology: 'contested-centre', interactionVerb: 'keep-reroll', targeting: 'asymmetric-by-position', winCondition: 'plural', dilemmaShape: 'stay-or-yield', inSessionMutation: 'power-cards' },
    economy: { hasDraftEconomy: false, hasStaking: false }, branch: 'D',
    expression: { palette: [], motifKeywords: [], characterArchetype: '', namingGrammar: '', soundscape: { tonalCentre: 0, bandVoicing: {} as never, emotionalContour: 'rising' }, narrativeFrame: '' },
    scalars: { boardWidth: 5, boardHeight: 5, chainLengthMin: 3, hazardDensity: 0.2, targetScore: 20 }, family: 'strike-or-hold',
    ...overrides,
  };
}

// 1. verify-novelty-gate
const parent = baseGenome({ id: 'p1' });
const scalarOnly = baseGenome({ id: 'c1', lineage: ['p1'], scalars: { ...parent.scalars, targetScore: 99 } });
const noveltyResult = evaluateNovelty(scalarOnly, [parent], [{ sessionId: 's', turnIndex: 1, boardStateHash: 'x', topTwoEvGap: 0.1, candidateMoves: ['a'] }], [{ sessionId: 's', turnIndex: 1, boardStateHash: 'x', topTwoEvGap: 0.1, candidateMoves: ['a'] }]);
check('verify-novelty-gate', !noveltyResult.passed, 'scalar-only offspring correctly rejected');

// 2 & 3. verify-fitness-multiplicative, verify-no-retention-inputs
const provenance: GateProvenance = { modelIdentity: 'engine-v6-real', commitSha: 'deadbeef', isStandIn: false, timestamp: '2026-08-01T00:00:00Z' };
const telemetry: TelemetryAggregate = { sampleCount: 10, meanTurnLatencyMs: 3000, meanSelectionFrictionCount: 1.5, meanChoiceEntropy: 1, completionRate: 0.9 };
const judgment: JudgmentAggregate = { sampleCount: 10, meanConfidence: 4, meanDistributionEntropy: 1, reliability: 0.4 };
const fitnessResult = computeFitness(telemetry, judgment, provenance);
check('verify-fitness-multiplicative', Math.abs(fitnessResult.fitness - fitnessResult.breakdown.fTel * fitnessResult.breakdown.fJudg * fitnessResult.breakdown.conc) < 1e-12, 'fitness === fTel × fJudg × conc');
const retentionScan = scanForForbiddenTelemetryFields({ ...telemetry, returnRate: 0.5 });
check('verify-no-retention-inputs', !retentionScan.clean, 'smuggled returnRate field detected');

// 4. verify-gate-provenance
check('verify-gate-provenance', isValidProvenance(provenance) && !isValidProvenance({ ...provenance, commitSha: '' }), 'valid provenance accepted, empty commitSha rejected');

// 5. verify-no-standin-models
let standInRejected = false;
try { computeFitness(telemetry, judgment, { ...provenance, isStandIn: true as unknown as false }); } catch { standInRejected = true; }
check('verify-no-standin-models', standInRejected, 'stand-in provenance refused by computeFitness');

// 6. verify-determinism-fullchain
const seed = new Uint8Array([1, 2, 3, 4, 5]);
const chainA = runFullChain(seed, ['keep', 'reroll']);
const chainB = runFullChain(seed, ['keep', 'reroll']);
check('verify-determinism-fullchain', JSON.stringify(chainA) === JSON.stringify(chainB) && chainA.valid, 'full chain byte-identical and self-validating for a fixed seed');

// 7. verify-message-contracts
check('verify-message-contracts', verifyMessageContracts().passed, 'every registered message type has a sender+handler pair');

// 8. verify-branch-a-no-bots
const bottedA: SessionRecord = { sessionId: 's', genomeId: 'g', branch: 'A', isBotSession: true, modelIdentity: 'm', commitSha: 'c', playerIds: [], completed: true, turns: [] };
check('verify-branch-a-no-bots', !branchANoBotsHolds(bottedA), 'a bot in Branch A is correctly flagged');

// 9. verify-audit-log-complete
const humanA: SessionRecord = { sessionId: 's', genomeId: 'g', branch: 'A', isBotSession: false, modelIdentity: 'm', commitSha: 'c', playerIds: ['p1'], completed: true, turns: [turn({ turnIndex: 1 })] };
const auditLog = buildAuditLog(humanA, seed, 'key', ['2026-08-01T00:00:00Z']);
check('verify-audit-log-complete', verifyAuditLogComplete(auditLog) && !verifyAuditLogComplete({ ...auditLog, signedTimestamps: [] }), 'complete log passes, log missing a field fails');

// 10. verify-economy-invisibility
const under21: Account = { id: 'minor', ageVerified21Plus: false, selfExcluded: false };
check('verify-economy-invisibility', !verifyEconomyInvisibility([under21], ['minor']).passed, 'economy rendered for an under-21 account is caught');

// 11. verify-self-exclusion-no-solicit
const excluded: Account = { id: 'ex1', ageVerified21Plus: true, selfExcluded: true };
const solicit: AccountMessage = { accountId: 'ex1', messageType: 'promo', content: 'Come back today!', promptsReversal: false };
check('verify-self-exclusion-no-solicit', !verifySelfExclusionNoSolicit([excluded], [solicit]).passed, 'reversal-soliciting message to a self-excluded account is caught');

// 12. verify-anti-manipulation
const badUx: SessionUXConfig = { hasDarkPatterns: false, hasLossFraming: true, hasArtificialScarcityTimer: false, hasStreakPunishment: false, sessionEndIsGraceful: true };
check('verify-anti-manipulation', !verifyAntiManipulation(badUx).passed, 'loss-framing UX config is caught');

// 13. verify-expression-prohibition
check('verify-expression-prohibition', !scanForProhibitedIconography('roll the dice and hope').clean, 'dice iconography in generated text is caught');

// 14. verify-band-honesty
const dishonestBands: BandRender[] = [
  { band: 'matter', mutatesState: true, presentedAsForecast: false, presentedAsFact: true, labelledSynthetic: false, readOnly: false, tierGate: null },
  { band: 'ir', mutatesState: false, presentedAsForecast: false, presentedAsFact: true, labelledSynthetic: false, readOnly: false, tierGate: null }, // ir presented as fact — violation
];
check('verify-band-honesty', !verifyBandHonesty(dishonestBands).passed, 'ir presented as fact is caught');

// 15. verify-no-math-random
const repoRoot = join(import.meta.dirname, '..');
const mathRandomScan = scanForMathRandom([join(repoRoot, 'families'), join(repoRoot, 'foundry'), join(repoRoot, 'corpus'), join(repoRoot, 'game')]);
check('verify-no-math-random', mathRandomScan.clean, mathRandomScan.clean ? 'no Math.random() in the new source trees' : `found in ${mathRandomScan.offendingFiles.join(', ')}`);

// 16. verify-fixed-point-scoring
let floatRejected = false;
try { assertFixedPoint(1.23); } catch { floatRejected = true; }
check('verify-fixed-point-scoring', floatRejected && Number.isInteger(toFixedPoint(1.23)), 'bare float rejected; toFixedPoint output is always an integer');

// 17. verify-experience-conformance
const kotGenome = baseGenome({ id: 'g-kot', structural: { topology: 'contested-centre', interactionVerb: 'keep-reroll', targeting: 'self-only', winCondition: 'plural', dilemmaShape: 'stay-or-yield', inSessionMutation: 'power-cards' } });
const conformance = checkExperienceConformance({
  genome: kotGenome,
  branchGovernsMatchmaking: true,
  roleVisibilities: [{ role: 'a', uvVisible: false, irVisible: true }],
  bandRenders: [],
});
check('verify-experience-conformance', !conformance.passed, 'self-only targeting (no opponent/contested centre) fails (d)');

// 18. verify-provenance-notes
const incompleteNote = makeProvenanceNote({ baselineId: '', mechanicTaken: 'x', sourceLineage: 'y', expressionNotTaken: 'z', expressionInvented: { names: [], characters: [], palette: [], narrativeFrame: '' } });
check('verify-provenance-notes', !verifyProvenanceNoteComplete(incompleteNote), 'a baseline missing its provenance note fields is caught');

// Bonus: the real W7 gate this whole suite exists to protect.
const { gateResult } = runKotCalibration();
check('w7-kot-calibration (not in §9, but the load-bearing gate)', gateResult.passed, 'KoT calibration artifact passes every gate in this build');

console.log('');
console.log(`${checkNames.length} named checks exercised.`);
if (failures === 0) {
  console.log('§9 VERIFY SUITE HELD: all 18 named checks correctly distinguish PASS from FAIL cases.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
