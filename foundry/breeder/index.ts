// foundry/breeder/index.ts — W9 (07_CLAUDE_CODE_HANDOFF_V6.md §8)
//
// W7 BLOCKS W9 ABSOLUTELY. No breeding run may execute until the King of
// Tokyo calibration artifact passes every gate.
//
// Composition (Tier 1, R6Q8): uneven, weighted toward Branch A (legally
// primary) and Branch D (solo skill mastery); lighter on Branch E.
// Selection axes (R5Q2, all three): 5-branch coverage × maximum judgment
// richness × maximum interaction diversity. No evidence quota per baseline
// (R6Q6) — harvest what each yields, do not force an even split.
//
// Every offspring passes the §2.2 novelty gate or it is not admitted.

import type { Branch, ContestedState, Genome, StructuralLoci } from '../../families/genome/types.ts';
import { evaluateNovelty } from '../../families/genome/novelty.ts';
import type { NoveltyResult } from '../../families/genome/novelty.ts';

export class W7NotPassedError extends Error {
  constructor() {
    super('W7 BLOCKS W9 ABSOLUTELY: the KoT calibration artifact has not passed every gate. Run npm run verify:kot first.');
    this.name = 'W7NotPassedError';
  }
}

/**
 * Tier 1 R6Q8: uneven weighting — heavier on A (legally primary) and D (solo
 * skill mastery), lighter on E. Documented ratio; adjust only via a new Tier 1
 * decision, not silently.
 */
export const BRANCH_WEIGHTS: Record<Branch, number> = {
  A: 3,
  B: 2,
  C: 2,
  D: 3,
  E: 1,
};

export interface BreedingCandidate {
  offspring: Genome;
  parents: Genome[];
  offspringStates: ContestedState[];
  parentStates: ContestedState[];
  /** Richness of the Delphi judgment corpus over this offspring's contested states (W5 entropy). */
  judgmentRichness: number;
}

export interface BreedingOutcome {
  offspring: Genome;
  admitted: boolean;
  novelty: NoveltyResult;
}

export interface BreedingRoundResult {
  outcomes: BreedingOutcome[];
  roster: Genome[]; // admitted offspring, ranked by the three selection axes
  branchCoverage: Record<Branch, number>;
}

function diversityBonus(rosterSoFar: Genome[], candidate: Genome): number {
  const seen = new Set<string>(rosterSoFar.flatMap((g) => Object.values(g.structural) as string[]));
  const values = Object.values(candidate.structural) as (keyof StructuralLoci)[] as unknown as string[];
  return values.filter((v) => !seen.has(v)).length;
}

function compositeScore(candidate: BreedingCandidate, rosterSoFar: Genome[]): number {
  const branchScore = BRANCH_WEIGHTS[candidate.offspring.branch];
  const richnessScore = Math.max(candidate.judgmentRichness, 0.01); // avoid zeroing out the product entirely
  const diversityScore = 1 + diversityBonus(rosterSoFar, candidate.offspring);
  return branchScore * richnessScore * diversityScore;
}

/**
 * Greedy multi-objective ranking over admitted candidates: at each step, pick
 * whichever remaining candidate scores highest against the roster built SO
 * FAR — so diversity bonus keeps rewarding coverage the roster doesn't have yet.
 */
function rankRoster(admitted: BreedingCandidate[]): Genome[] {
  const roster: Genome[] = [];
  const remaining = [...admitted];
  while (remaining.length > 0) {
    remaining.sort((a, b) => compositeScore(b, roster) - compositeScore(a, roster));
    const next = remaining.shift()!;
    roster.push(next.offspring);
  }
  return roster;
}

/**
 * `kotGatePassed` must come from `runKotCalibration().gateResult.passed` (W7).
 * Passing `true` from anywhere else defeats the point of the gate — callers
 * are trusted to actually run the calibration, not fabricate the boolean.
 */
export function runBreedingRound(candidates: BreedingCandidate[], kotGatePassed: boolean): BreedingRoundResult {
  if (!kotGatePassed) throw new W7NotPassedError();

  const outcomes: BreedingOutcome[] = candidates.map((c) => {
    const novelty = evaluateNovelty(c.offspring, c.parents, c.offspringStates, c.parentStates);
    return { offspring: c.offspring, admitted: novelty.passed, novelty };
  });

  const admittedCandidates = candidates.filter((c, i) => outcomes[i]!.admitted);
  const roster = rankRoster(admittedCandidates);

  const branchCoverage: Record<Branch, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const g of roster) branchCoverage[g.branch] += 1;

  return { outcomes, roster, branchCoverage };
}
