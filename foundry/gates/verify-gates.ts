/**
 * W7 gate: setback measures behave sanely, provenance validity is checked
 * structurally, and the Experience Conformance Criterion (§6.4 a-d) rejects
 * a genome/session missing any one of its four requirements.
 *
 * Run: npm run verify:gates   ·   Exit 0 = gate held.
 */

import type { SessionRecord, TurnRecord } from '../types.ts';
import type { Genome } from '../../families/genome/types.ts';
import type { BandRender } from '../../families/expression/pipeline.ts';
import { checkExperienceConformance, isValidProvenance, setbackFrequency, setbackPressure } from './suite.ts';
import type { GateProvenance } from '../fitness/types.ts';
import type { ExperienceConformanceInput, RoleVisibility } from './suite.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

function turn(overrides: Partial<TurnRecord>): TurnRecord {
  return {
    turnIndex: 0,
    actingPlayerId: 'p1',
    boardStateHashBefore: 'h',
    boardStateHashAfter: 'h2',
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
    turn({ turnIndex: 1, valueAtRiskBefore: 10, valueLostThisTurn: 10 }), // setback realized
    turn({ turnIndex: 2, valueAtRiskBefore: 10, valueLostThisTurn: 0 }), // held
    turn({ turnIndex: 3, valueAtRiskBefore: 10, valueLostThisTurn: 5 }), // partial
    turn({ turnIndex: 4, valueAtRiskBefore: 0, valueLostThisTurn: 0 }), // no risk in play — excluded
  ],
};

// 1. setbackFrequency only counts turns where risk existed, and only those where it was realized
// (turn 1 lost 10, turn 2 lost 0, turn 3 lost 5 — 2 of the 3 at-risk turns had ANY loss).
ok(setbackFrequency(session) === 2 / 3, 'setbackFrequency = risk-realized turns / turns-with-risk, excluding no-risk turns');

// 2. setbackPressure is the mean fractional loss across at-risk turns.
const expectedPressure = (10 / 10 + 0 / 10 + 5 / 10) / 3;
ok(Math.abs(setbackPressure(session) - expectedPressure) < 1e-9, 'setbackPressure is mean(lost/atRisk) over at-risk turns');

// 3. All-hold session (frequency 0) and always-bust session (frequency 1) are both "not a real dilemma".
const neverLose: SessionRecord = { ...session, turns: session.turns.map((t) => ({ ...t, valueAtRiskBefore: 10, valueLostThisTurn: 0 })) };
const alwaysLose: SessionRecord = { ...session, turns: session.turns.map((t) => ({ ...t, valueAtRiskBefore: 10, valueLostThisTurn: 10 })) };
ok(setbackFrequency(neverLose) === 0 && setbackFrequency(alwaysLose) === 1, 'degenerate always-hold / always-bust sessions are distinguishable at the extremes');

// 4. Provenance validity — LAW 3.
const validProvenance: GateProvenance = { modelIdentity: 'engine-v6-real', commitSha: 'deadbeef', isStandIn: false, timestamp: '2026-08-01T00:00:00Z' };
ok(isValidProvenance(validProvenance), 'well-formed provenance is valid');
ok(!isValidProvenance({ ...validProvenance, modelIdentity: '' }), 'empty modelIdentity invalidates provenance');
ok(!isValidProvenance({ ...validProvenance, timestamp: 'not-a-date' }), 'unparseable timestamp invalidates provenance');

// 5. Experience Conformance — each of (a)-(d) independently gates the result.
const kotStructural: Genome['structural'] = {
  topology: 'contested-centre',
  interactionVerb: 'keep-reroll',
  targeting: 'asymmetric-by-position',
  winCondition: 'plural',
  dilemmaShape: 'stay-or-yield',
  inSessionMutation: 'power-cards',
};
const kotGenome: Genome = {
  id: 'g-kot',
  lineage: [],
  structural: kotStructural,
  economy: { hasDraftEconomy: false, hasStaking: false },
  branch: 'D',
  expression: {
    palette: [], motifKeywords: [], characterArchetype: '', namingGrammar: '',
    soundscape: { tonalCentre: 0, bandVoicing: {} as never, emotionalContour: 'suspended' }, narrativeFrame: '',
  },
  scalars: { boardWidth: 5, boardHeight: 5, chainLengthMin: 3, hazardDensity: 0.2, targetScore: 20 },
  family: 'strike-or-hold',
};

const roleVis: RoleVisibility[] = [
  { role: 'standard', uvVisible: false, irVisible: true },
  { role: 'voidwalker', uvVisible: true, irVisible: true },
];

const honestBands: BandRender[] = [
  { band: 'matter', mutatesState: true, presentedAsForecast: false, presentedAsFact: true, labelledSynthetic: false, readOnly: false, tierGate: null },
  { band: 'ir', mutatesState: false, presentedAsForecast: true, presentedAsFact: false, labelledSynthetic: false, readOnly: false, tierGate: null },
  { band: 'uv', mutatesState: false, presentedAsForecast: false, presentedAsFact: false, labelledSynthetic: true, readOnly: false, tierGate: null },
  { band: 'cyan', mutatesState: false, presentedAsForecast: false, presentedAsFact: false, labelledSynthetic: false, readOnly: true, tierGate: null },
  { band: 'voidshard', mutatesState: false, presentedAsForecast: false, presentedAsFact: false, labelledSynthetic: false, readOnly: false, tierGate: 5 },
];

const fullConformance: ExperienceConformanceInput = {
  genome: kotGenome,
  branchGovernsMatchmaking: true,
  roleVisibilities: roleVis,
  bandRenders: honestBands,
};
ok(checkExperienceConformance(fullConformance).passed, 'KoT-shaped genome with real role gating and honest bands passes (a)-(d)');

ok(!checkExperienceConformance({ ...fullConformance, branchGovernsMatchmaking: false }).passed, '(a) fails when branch does not govern matchmaking');
ok(!checkExperienceConformance({ ...fullConformance, roleVisibilities: [roleVis[0]!] }).passed, '(b) fails with only one role (nothing gated)');
ok(!checkExperienceConformance({ ...fullConformance, roleVisibilities: [roleVis[0]!, roleVis[0]!] }).passed, '(b) fails when roles exist but visibility is identical');
const dishonestBands = honestBands.map((b) => (b.band === 'ir' ? { ...b, presentedAsFact: true } : b));
ok(!checkExperienceConformance({ ...fullConformance, bandRenders: dishonestBands }).passed, '(c) fails when a band is dishonest');
const selfOnlyGenome: Genome = { ...kotGenome, structural: { ...kotStructural, targeting: 'self-only' } };
ok(!checkExperienceConformance({ ...fullConformance, genome: selfOnlyGenome }).passed, '(d) fails when targeting is self-only (no opponent/contested centre)');

console.log('');
if (failures === 0) {
  console.log('W7 GATE SUITE HELD: setback measures, provenance validity, and Experience Conformance all behave correctly.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
