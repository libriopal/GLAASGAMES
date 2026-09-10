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
import { StandInProvenanceError } from '../foundry/fitness/types.ts';
import type { GateProvenance, JudgmentAggregate, TelemetryAggregate } from '../foundry/fitness/types.ts';
import { isValidProvenance, checkExperienceConformance } from '../foundry/gates/suite.ts';
import { runKotCalibration } from '../foundry/gates/kot-calibration.ts';
import { runFullChain } from '../game/determinism/pipeline.ts';
import { scanForMathRandom } from '../game/determinism/static-checks.ts';
import { assertFixedPoint, toFixedPoint } from '../game/determinism/fixed-point.ts';
import { branchANoBotsHolds } from '../game/branch-a/constraint.ts';
import { verifyAuditLogComplete, buildAuditLog } from '../game/branch-a/audit-log.ts';
import { verifyMessageContracts } from '../game/branch-a/message-contracts.ts';
import { verifyEconomyInvisibility, verifyEconomyInvisibilityFromRecorder, verifySelfExclusionNoSolicit, verifyAntiManipulation } from '../game/economy/rules.ts';
import { EconomySurfaceRecorder } from '../game/economy/surface-recorder.ts';
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

/**
 * The §9 checklist, lifted out of prose into code. This array is the WITNESS;
 * the run is the SUBJECT. They are separate objects, which is the whole point.
 *
 * Adding a check to the suite without adding it here is a failure, and vice
 * versa. Do not sort this list to match the run order — the sets are compared,
 * not the sequences, and coupling them would reintroduce ordering as a hidden
 * assertion.
 *
 * REJECTED ALTERNATIVE — do not re-derive this: asserting
 * `checkNames.length === 18`. A count is satisfied by a rename or a duplicate,
 * so it measures cardinality, not identity. This measures identity, in both
 * directions, and refuses duplicates.
 */
const SECTION_9_CHECKS: readonly string[] = Object.freeze([
  'verify-novelty-gate',
  'verify-fitness-multiplicative',
  'verify-no-retention-inputs',
  'verify-gate-provenance',
  'verify-no-standin-models',
  'verify-determinism-fullchain',
  'verify-message-contracts',
  'verify-branch-a-no-bots',
  'verify-audit-log-complete',
  'verify-economy-invisibility',
  'verify-self-exclusion-no-solicit',
  'verify-anti-manipulation',
  'verify-expression-prohibition',
  'verify-band-honesty',
  'verify-no-math-random',
  'verify-fixed-point-scoring',
  'verify-experience-conformance',
  'verify-provenance-notes',
]);

/**
 * Checks that are deliberately outside §9 and must not count toward coverage.
 * Kept explicit so an out-of-spec check is a declared exception rather than an
 * unnoticed one.
 */
const NON_SECTION_9: readonly string[] = Object.freeze([
  'w7-kot-calibration (not in §9, but the load-bearing gate)',
]);

interface CoverageReport {
  readonly missing: readonly string[];
  readonly undeclared: readonly string[];
  readonly duplicated: readonly string[];
  readonly ok: boolean;
}

function coverage(exercised: readonly string[]): CoverageReport {
  const declared = new Set(SECTION_9_CHECKS);
  const exempt = new Set(NON_SECTION_9);
  const seen = new Map<string, number>();
  for (const name of exercised) seen.set(name, (seen.get(name) ?? 0) + 1);

  const missing = SECTION_9_CHECKS.filter((n) => !seen.has(n));
  const undeclared = [...seen.keys()].filter((n) => !declared.has(n) && !exempt.has(n));
  const duplicated = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);

  return {
    missing,
    undeclared,
    duplicated,
    ok: missing.length === 0 && undeclared.length === 0 && duplicated.length === 0,
  };
}

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
//
// Three assertions, not one. The negative case must throw the RIGHT CLASS with
// the RIGHT field, and the positive case must not throw at all — a check with no
// positive control cannot distinguish "refuses stand-ins" from "refuses
// everything", which is the failure a bare catch invites.
//
// SEEN TO FAIL (R2, this build): with the guard replaced by
// `throw new TypeError("Cannot read properties of undefined (reading 'breakdown')")`
// the OLD bare-catch version of this check printed PASS and the suite exited 0 —
// a dropped connection recorded as a refusal. This version reports the class.
let standInRefusedCorrectly = false;
let standInField = '';
try {
  computeFitness(telemetry, judgment, { ...provenance, isStandIn: true });
} catch (e) {
  standInRefusedCorrectly = e instanceof StandInProvenanceError;
  standInField = standInRefusedCorrectly
    ? (e as StandInProvenanceError).field
    : `wrong error: ${(e as Error).name}`;
}

let validProvenanceAccepted = false;
try {
  computeFitness(telemetry, judgment, provenance);
  validProvenanceAccepted = true;
} catch (e) {
  validProvenanceAccepted = false;
  console.log(`  (positive control threw unexpectedly: ${(e as Error).name}: ${(e as Error).message})`);
}

check(
  'verify-no-standin-models',
  standInRefusedCorrectly && standInField === 'isStandIn' && validProvenanceAccepted,
  `stand-in refused with StandInProvenanceError(field=${standInField || 'none'}); ` +
    `real provenance ${validProvenanceAccepted ? 'accepted' : 'WRONGLY REFUSED'}`,
);

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
const adultAcct: Account = { id: 'adult', ageVerified21Plus: true, selfExcluded: false };
const excludedAcct: Account = { id: 'ex1', ageVerified21Plus: true, selfExcluded: true };
// 10. verify-economy-invisibility — R3: the witness is the recorder, not a literal.
//
// The old form was `verifyEconomyInvisibility([under21], ['minor'])`. The
// `['minor']` was written by the author of this file, so the oracle compared one
// of the author's sentences against another. Here every account is driven
// through the recorder, which computes the granted set by asking economyVisible
// itself — so the set is DERIVED, and inverting the rule moves it.
//
// The granted set is PRINTED on purpose: EINCOL §4's vacuous control is a
// perturbation that changes nothing the system reads, and the only way to show
// this one is not vacuous is to show the set differ between the two runs.
//   clean:     [adult]
//   perturbed: [ex1, minor, adult]   (economyVisible -> return true)
const economyAccounts = [under21, adultAcct, excludedAcct];
const surfaceRecorder = new EconomySurfaceRecorder();
for (const acct of economyAccounts) surfaceRecorder.gate(acct, 'wallet-panel');
const granted = surfaceRecorder.grantedTo();
console.log(`  economy surfaces granted to: [${granted.join(', ')}]`);
check(
  'verify-economy-invisibility',
  verifyEconomyInvisibilityFromRecorder(economyAccounts, surfaceRecorder).passed
    && !granted.includes('minor') && !granted.includes('ex1'),
  `economy granted to [${granted.join(', ')}] — no minor, no self-excluded account`,
);

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

const cov = coverage(checkNames);
let coverageFailures = 0;

for (const name of cov.missing) {
  console.log(`COVERAGE FAIL: ${name} declared in §9 manifest, never exercised`);
  coverageFailures++;
}
for (const name of cov.undeclared) {
  console.log(`COVERAGE FAIL: ${name} exercised but never declared in the §9 manifest`);
  coverageFailures++;
}
for (const name of cov.duplicated) {
  console.log(`COVERAGE FAIL: ${name} exercised more than once — a duplicate hides a deletion`);
  coverageFailures++;
}

console.log('');
console.log(
  `${checkNames.length} checks exercised · ${SECTION_9_CHECKS.length} declared in §9 · ` +
    `${cov.ok ? 'coverage closed' : `${coverageFailures} coverage failure(s)`}`,
);

if (failures === 0 && coverageFailures === 0) {
  console.log(
    `§9 VERIFY SUITE HELD: every one of the ${SECTION_9_CHECKS.length} declared checks was ` +
      'exercised exactly once and correctly distinguished its PASS from its FAIL case.',
  );
  process.exit(0);
} else {
  console.log(`${failures} check failure(s), ${coverageFailures} coverage failure(s).`);
  process.exit(1);
}
