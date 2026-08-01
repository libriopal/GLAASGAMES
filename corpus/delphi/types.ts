// corpus/delphi/types.ts — W5 (07_CLAUDE_CODE_HANDOFF_V6.md §4.4)

/**
 * Structured stake capture. Generic probing added little value while specific
 * questions add more (10.1145/1978942.1979116). The counterfactual probe is
 * what makes the corpus unmimicable by a lookup table.
 */
export interface StakeRecord {
  whatIRisked: string;
  whatIWanted: string;
  whatIReadOnTheBoard: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  whatWouldHaveChangedMyMind: string; // counterfactual probe
}

export type DelphiRound = 1 | 2 | 3;

/** One rater's judgment on one contested state, in one round. */
export interface RaterJudgment {
  contestedStateId: string;
  raterId: string;
  round: DelphiRound;
  chosenMoveIndex: number; // index into the contested state's candidateMoves
  stake: StakeRecord;
}

export interface DelphiDistribution {
  contestedStateId: string;
  round: DelphiRound;
  /** Vote count per candidate-move index. */
  counts: number[];
  raterCount: number;
}

export interface ConvergedSeed {
  contestedStateId: string;
  /** Normalized probability per candidate-move index — the seed IS this distribution, not a single answer. */
  distribution: number[];
  raterCount: number;
}
