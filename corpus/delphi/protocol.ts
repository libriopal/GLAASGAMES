// corpus/delphi/protocol.ts — W5
// Round 1: anonymous. Round 2: raters see the distribution. Round 3: re-answer.
// The CONVERGED DISTRIBUTION (round 3) is the seed — not a single answer.
// Tier 1 ratifies the protocol, not the answers.

import type { ConvergedSeed, DelphiDistribution, DelphiRound, RaterJudgment } from './types.ts';

export const DELPHI_RATER_MIN = 3;
export const DELPHI_RATER_MAX = 5;
export const PILOT_CORPUS_SIZE = 30;
export const EXTENDED_CORPUS_SIZE = 50;

function tallyDistribution(
  judgments: RaterJudgment[],
  contestedStateId: string,
  round: DelphiRound,
  candidateMoveCount: number,
): DelphiDistribution {
  const roundJudgments = judgments.filter((j) => j.contestedStateId === contestedStateId && j.round === round);
  const counts = new Array(candidateMoveCount).fill(0);
  for (const j of roundJudgments) {
    if (j.chosenMoveIndex < 0 || j.chosenMoveIndex >= candidateMoveCount) {
      throw new Error(`rater ${j.raterId} chose an out-of-range move index for ${contestedStateId}`);
    }
    counts[j.chosenMoveIndex] += 1;
  }
  return { contestedStateId, round, counts, raterCount: roundJudgments.length };
}

/** Round 1: anonymous first pass. */
export function computeRound1Distribution(
  judgments: RaterJudgment[],
  contestedStateId: string,
  candidateMoveCount: number,
): DelphiDistribution {
  return tallyDistribution(judgments, contestedStateId, 1, candidateMoveCount);
}

/** Round 2: what is shown back to raters before they re-answer. */
export function formatDistributionForDisplay(dist: DelphiDistribution): string {
  const total = dist.counts.reduce((a, b) => a + b, 0);
  return dist.counts
    .map((c, i) => `move[${i}]: ${c}/${total} (${total > 0 ? Math.round((100 * c) / total) : 0}%)`)
    .join(', ');
}

/** Round 3: re-answer after seeing the round-1 distribution. */
export function computeRound3Distribution(
  judgments: RaterJudgment[],
  contestedStateId: string,
  candidateMoveCount: number,
): DelphiDistribution {
  return tallyDistribution(judgments, contestedStateId, 3, candidateMoveCount);
}

/** The converged distribution (post round-3) IS the seed — a distribution, not a single answer. */
export function computeConvergedSeed(round3: DelphiDistribution): ConvergedSeed {
  const total = round3.counts.reduce((a, b) => a + b, 0);
  const distribution = total === 0 ? round3.counts.map(() => 0) : round3.counts.map((c) => c / total);
  return { contestedStateId: round3.contestedStateId, distribution, raterCount: round3.raterCount };
}

export function raterCountInRange(count: number): boolean {
  return count >= DELPHI_RATER_MIN && count <= DELPHI_RATER_MAX;
}
