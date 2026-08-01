/**
 * W9 gate: breeding is BLOCKED until W7's KoT calibration genuinely passes;
 * every offspring must clear the novelty gate to be admitted; ranking
 * reflects branch weighting, judgment richness, and diversity together.
 *
 * Run: npm run verify:breeder   ·   Exit 0 = gate held.
 */

import type { Genome } from '../../families/genome/types.ts';
import type { BreedingCandidate } from './index.ts';
import { BRANCH_WEIGHTS, runBreedingRound, W7NotPassedError } from './index.ts';
import { runKotCalibration } from '../gates/kot-calibration.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

function baseGenome(overrides: Partial<Genome>): Genome {
  return {
    id: 'g-x',
    lineage: [],
    structural: {
      topology: 'contested-centre',
      interactionVerb: 'keep-reroll',
      targeting: 'asymmetric-by-position',
      winCondition: 'plural',
      dilemmaShape: 'stay-or-yield',
      inSessionMutation: 'power-cards',
    },
    economy: { hasDraftEconomy: false, hasStaking: false },
    branch: 'A',
    expression: {
      palette: [], motifKeywords: [], characterArchetype: '', namingGrammar: '',
      soundscape: { tonalCentre: 0, bandVoicing: {} as never, emotionalContour: 'rising' }, narrativeFrame: '',
    },
    scalars: { boardWidth: 5, boardHeight: 5, chainLengthMin: 3, hazardDensity: 0.2, targetScore: 20 },
    family: 'strike-or-hold',
    ...overrides,
  };
}

const parent = baseGenome({ id: 'g-parent' });

function novelCandidate(id: string, branch: Genome['branch'], topology: Genome['structural']['topology'], richness: number): BreedingCandidate {
  const offspring = baseGenome({ id, lineage: [parent.id], branch, structural: { ...parent.structural, topology } });
  return {
    offspring,
    parents: [parent],
    offspringStates: [{ sessionId: 's', turnIndex: 1, boardStateHash: `novel-${id}`, topTwoEvGap: 0.1, candidateMoves: ['a'] }],
    parentStates: [{ sessionId: 's', turnIndex: 1, boardStateHash: 'old', topTwoEvGap: 0.1, candidateMoves: ['a'] }],
    judgmentRichness: richness,
  };
}

function scalarOnlyCandidate(id: string): BreedingCandidate {
  const offspring = baseGenome({ id, lineage: [parent.id], scalars: { ...parent.scalars, targetScore: 99 } });
  return {
    offspring,
    parents: [parent],
    offspringStates: [{ sessionId: 's', turnIndex: 1, boardStateHash: 'shared', topTwoEvGap: 0.1, candidateMoves: ['a'] }],
    parentStates: [{ sessionId: 's', turnIndex: 1, boardStateHash: 'shared', topTwoEvGap: 0.1, candidateMoves: ['a'] }],
    judgmentRichness: 1,
  };
}

// 1. W7 not passed: breeding is refused outright, regardless of candidates.
let blockedCorrectly = false;
try {
  runBreedingRound([novelCandidate('c1', 'A', 'open-grid', 1)], false);
} catch (e) {
  blockedCorrectly = e instanceof W7NotPassedError;
}
ok(blockedCorrectly, 'W9 refuses to run at all when kotGatePassed is false (W7 BLOCKS W9 ABSOLUTELY)');

// 2. Real integration: W7's actual calibration result gates W9, not a fabricated boolean.
const { gateResult } = runKotCalibration();
ok(gateResult.passed, 'precondition: W7 KoT calibration genuinely passes in this build');

// 3. Scalar-only offspring is rejected by the novelty gate even when W7 has passed.
const mixedCandidates = [scalarOnlyCandidate('scalar-child'), novelCandidate('novel-child', 'A', 'open-grid', 1)];
const mixedResult = runBreedingRound(mixedCandidates, gateResult.passed);
const scalarOutcome = mixedResult.outcomes.find((o) => o.offspring.id === 'scalar-child');
ok(scalarOutcome !== undefined && !scalarOutcome.admitted, 'scalar-only offspring is rejected even after W7 passes');
ok(mixedResult.roster.some((g) => g.id === 'novel-child'), 'genuinely novel offspring is admitted to the roster');
ok(!mixedResult.roster.some((g) => g.id === 'scalar-child'), 'scalar-only offspring never reaches the roster');

// 4. Branch weighting: an E-branch candidate with equal richness/diversity ranks below an A-branch one.
const candidateA = novelCandidate('branch-a', 'A', 'lanes', 1);
const candidateE = novelCandidate('branch-e', 'E', 'shared-single-board', 1);
const weightedRound = runBreedingRound([candidateE, candidateA], gateResult.passed);
const rankA = weightedRound.roster.findIndex((g) => g.id === 'branch-a');
const rankE = weightedRound.roster.findIndex((g) => g.id === 'branch-e');
ok(rankA < rankE, `Branch A (weight ${BRANCH_WEIGHTS.A}) ranks ahead of Branch E (weight ${BRANCH_WEIGHTS.E}) at equal richness`);

// 5. Branch coverage tally reflects the admitted roster.
ok(weightedRound.branchCoverage.A === 1 && weightedRound.branchCoverage.E === 1, 'branchCoverage tallies admitted offspring per branch');

console.log('');
if (failures === 0) {
  console.log('W9 GATE HELD: breeding is correctly blocked pre-W7, novelty-gated, and axis-weighted.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
