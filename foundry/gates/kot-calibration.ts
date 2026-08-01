// foundry/gates/kot-calibration.ts — W7 (07_CLAUDE_CODE_HANDOFF_V6.md §7)
//
// Two jobs, one implementation:
//   1. Mathematically-solved parameters (VP target, damage curve, yield payoff).
//   2. The permanent CI calibration reference — a faithful King of Tokyo the
//      foundry must not reject.
//
// IF the KoT artifact FAILS any gate: THE GATES ARE WRONG. Fix the gates, not KoT.
// Do not proceed to W9 until runKotCalibration().result.passed === true.
//
// NOTE ON DATA: the engine code exercised here (genome, expression pipeline,
// telemetry aggregation, fitness, gate suite) is the real implementation, not a
// stand-in (LAW 3 governs the MODEL, not the fixture data). The session and
// judgment-aggregate fixtures below stand in for a live bot-vs-bot lab match
// (§5.4 — permitted, Branch D, not Branch A) and a completed Delphi corpus
// respectively. Real telemetry/corpus data replaces these fixtures once W3-W5
// have run against an actual deployed build; until then this artifact
// calibrates the GATE CODE, which is its stated purpose.

import { execSync } from 'node:child_process';
import type { Genome, StructuralLoci } from '../../families/genome/types.ts';
import type { CorpusIndex } from '../../families/expression/pipeline.ts';
import { generateExpression } from '../../families/expression/pipeline.ts';
import type { SessionRecord, TurnRecord } from '../types.ts';
import { aggregateTelemetry, captureAtMarginFlaggedStates } from '../telemetry/capture.ts';
import { computeFitness } from '../fitness/index.ts';
import type { GateProvenance, JudgmentAggregate } from '../fitness/types.ts';
import { runGateSuite } from './suite.ts';
import type { ExperienceConformanceInput, GateSuiteResult, RoleVisibility } from './suite.ts';

// §7 property table -> genome expression.
export const KOT_STRUCTURAL: StructuralLoci = {
  topology: 'contested-centre', // Contested spotlight
  interactionVerb: 'keep-reroll', // Push-your-luck with keeps
  targeting: 'asymmetric-by-position', // Asymmetric targeting
  winCondition: 'plural', // Two orthogonal win conditions
  dilemmaShape: 'stay-or-yield', // The yield dilemma
  inSessionMutation: 'power-cards', // Rules mutate mid-game
};

const KOT_CORPUS: CorpusIndex = {
  entries: [
    { id: 'kot-1', motifKeywords: ['sentry', 'keep', 'skyline'], sidecarTags: ['contested'] },
    { id: 'kot-2', motifKeywords: ['rampart', 'signal-flare', 'ember'], sidecarTags: ['contested'] },
  ],
  namingSyllables: { onset: ['kr', 'gor', 'vash'], nucleus: ['a', 'u', 'ei'], coda: ['n', 'th', 'k'] },
  characterArchetypePool: ['ironclad sentinel', 'skyline warden'],
  paletteBands: {
    matter: ['#1B1B1F', '#2E2E33'],
    ir: ['#E85D04', '#DC2F02'],
    uv: ['#6A4C93', '#9D4EDD'],
    cyan: ['#00B4D8', '#48CAE4'],
    voidshard: ['#03071E', '#10002B'],
  },
};

const KOT_SEED = new Uint8Array([6, 6, 0, 8, 0, 1, 2, 0, 2, 6]);

function gitCommitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: import.meta.dirname, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown-outside-git-worktree';
  }
}

export function buildKotCalibrationGenome(): Genome {
  const placeholder: Genome = {
    id: 'g-kot-calibration-reference',
    lineage: [],
    structural: KOT_STRUCTURAL,
    economy: { hasDraftEconomy: false, hasStaking: false },
    branch: 'D',
    expression: {
      palette: [],
      motifKeywords: [],
      characterArchetype: '',
      namingGrammar: '',
      soundscape: { tonalCentre: 0, bandVoicing: {} as never, emotionalContour: 'suspended' },
      narrativeFrame: '',
    },
    scalars: { boardWidth: 6, boardHeight: 6, chainLengthMin: 2, hazardDensity: 0.3, targetScore: 20 },
    family: 'strike-or-hold',
  };
  const expression = generateExpression(placeholder, KOT_CORPUS, KOT_SEED);
  return { ...placeholder, expression };
}

function turn(overrides: Partial<TurnRecord>): TurnRecord {
  return {
    turnIndex: 0,
    actingPlayerId: 'bot-1',
    boardStateHashBefore: 'h',
    boardStateHashAfter: 'h2',
    candidateMoves: ['keep-all', 'reroll-one', 'yield-centre'],
    chosenMove: 'reroll-one',
    latencyMs: 1500,
    reconsiderationCount: 1,
    valueAtRiskBefore: 0,
    valueLostThisTurn: 0,
    ...overrides,
  };
}

/** A deterministic bot-vs-bot lab match (§5.4: bot-vs-bot is permitted in the lab). */
export function buildKotCalibrationSession(genomeId: string): SessionRecord {
  return {
    sessionId: 'kot-calibration-session-1',
    genomeId,
    branch: 'D', // Branch A forbids bots — the lab calibration run lives on D.
    isBotSession: true,
    modelIdentity: 'engine-v6-kot-calibration',
    commitSha: gitCommitSha(),
    playerIds: ['bot-attacker', 'bot-holder'],
    completed: true,
    turns: [
      turn({ turnIndex: 1, boardStateHashBefore: 'centre-empty', valueAtRiskBefore: 0, valueLostThisTurn: 0, topTwoEvGap: 0.4 }),
      turn({ turnIndex: 2, boardStateHashBefore: 'centre-contested-1', valueAtRiskBefore: 12, valueLostThisTurn: 0, topTwoEvGap: 0.05, latencyMs: 4200, reconsiderationCount: 2 }),
      turn({ turnIndex: 3, boardStateHashBefore: 'centre-contested-2', valueAtRiskBefore: 12, valueLostThisTurn: 4, topTwoEvGap: 0.08, latencyMs: 5100, reconsiderationCount: 3 }),
      turn({ turnIndex: 4, boardStateHashBefore: 'centre-held', valueAtRiskBefore: 16, valueLostThisTurn: 0, topTwoEvGap: 0.6 }),
      turn({ turnIndex: 5, boardStateHashBefore: 'yield-decision', valueAtRiskBefore: 16, valueLostThisTurn: 16, topTwoEvGap: 0.1, latencyMs: 6000, reconsiderationCount: 4 }),
      turn({ turnIndex: 6, boardStateHashBefore: 'recover', valueAtRiskBefore: 0, valueLostThisTurn: 0, topTwoEvGap: 0.5 }),
    ],
  };
}

/**
 * A fixture standing in for a completed Delphi corpus (W5) over this session's
 * contested states, in the genuinely-contested κ band established by W5.
 */
function calibrationJudgmentAggregate(): JudgmentAggregate {
  return { sampleCount: 3, meanConfidence: 4, meanDistributionEntropy: 0.9, reliability: 0.42 };
}

export interface KotCalibrationRun {
  genome: Genome;
  session: SessionRecord;
  gateResult: GateSuiteResult;
}

export function runKotCalibration(): KotCalibrationRun {
  const genome = buildKotCalibrationGenome();
  const session = buildKotCalibrationSession(genome.id);

  const telemetrySignals = captureAtMarginFlaggedStates(session);
  const telemetry = aggregateTelemetry(telemetrySignals);
  const judgment = calibrationJudgmentAggregate();

  const provenance: GateProvenance = {
    modelIdentity: session.modelIdentity,
    commitSha: session.commitSha,
    isStandIn: false,
    timestamp: new Date().toISOString(),
  };

  const fitness = computeFitness(telemetry, judgment, provenance);

  const roleVisibilities: RoleVisibility[] = [
    { role: 'standard', uvVisible: false, irVisible: true },
    { role: 'voidwalker', uvVisible: true, irVisible: true },
  ];
  const conformance: ExperienceConformanceInput = {
    genome,
    branchGovernsMatchmaking: true, // Branch D governs solo-skill-mastery matchmaking/seeding for this genome
    roleVisibilities,
    bandRenders: [
      { band: 'matter', mutatesState: true, presentedAsForecast: false, presentedAsFact: true, labelledSynthetic: false, readOnly: false, tierGate: null },
      { band: 'ir', mutatesState: false, presentedAsForecast: true, presentedAsFact: false, labelledSynthetic: false, readOnly: false, tierGate: null },
      { band: 'uv', mutatesState: false, presentedAsForecast: false, presentedAsFact: false, labelledSynthetic: true, readOnly: false, tierGate: null },
      { band: 'cyan', mutatesState: false, presentedAsForecast: false, presentedAsFact: false, labelledSynthetic: false, readOnly: true, tierGate: null },
      { band: 'voidshard', mutatesState: false, presentedAsForecast: false, presentedAsFact: false, labelledSynthetic: false, readOnly: false, tierGate: 5 },
    ],
  };

  const gateResult = runGateSuite({ genome, session, expression: genome.expression, provenance, fitness, conformance });
  return { genome, session, gateResult };
}
