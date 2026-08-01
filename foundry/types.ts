// foundry/types.ts — shared session/turn record used across W3 (telemetry),
// W4 (harvest), W6 (fitness), W7 (gates), W8 (determinism/Branch A audit).
// Not part of the handoff's explicit code blocks, but required for those
// blocks to compose: SessionRecord is referenced by name in §4.3 and §4.5
// without being defined there.

import type { Branch } from '../families/genome/types.ts';

export interface Move {
  playerId: string;
  turnIndex: number;
  chosenMove: string;
  candidateMoves: string[];
}

export interface TurnRecord {
  turnIndex: number;
  actingPlayerId: string;
  boardStateHashBefore: string;
  boardStateHashAfter: string;
  candidateMoves: string[];
  chosenMove: string;
  latencyMs: number; // deliberation time — turnLatencyMs source
  reconsiderationCount: number; // selection friction — selection changed before commit
  /** Value at risk (accumulated-but-unsecured) immediately before this turn resolved. */
  valueAtRiskBefore: number;
  /** Value lost this turn to a setback (bust/damage/etc). 0 when no setback occurred. */
  valueLostThisTurn: number;
  /** Top-two EV gap across the bot committee for this turn, if scored (§4.3). */
  topTwoEvGap?: number;
}

export interface SessionRecord {
  sessionId: string;
  genomeId: string;
  branch: Branch;
  isBotSession: boolean;
  modelIdentity: string; // real engine identity, never a stand-in label (LAW 3)
  commitSha: string;
  playerIds: string[];
  turns: TurnRecord[];
  completed: boolean;
}
