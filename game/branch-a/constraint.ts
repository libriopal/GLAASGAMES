// game/branch-a/constraint.ts — W8 (07_CLAUDE_CODE_HANDOFF_V6.md §5.4)
// Standing Tier 1 ruling, 2026-07-27, unchanged. Human-vs-human, NO BOTS.
//
//   CONSTRAINT branch_a_no_bots
//     CHECK (NOT (branch = 'A' AND is_bot_session = true))
//
// A bot in a Branch A match is halt condition H1.

import type { SessionRecord } from '../../foundry/types.ts';

export class HaltConditionError extends Error {
  constructor(public readonly haltId: string, message: string) {
    super(message);
    this.name = 'HaltConditionError';
  }
}

export function branchANoBotsHolds(session: SessionRecord): boolean {
  return !(session.branch === 'A' && session.isBotSession);
}

/** Throws H1 if violated — mirrors the DB CHECK constraint at the application layer. */
export function assertBranchANoBots(session: SessionRecord): void {
  if (!branchANoBotsHolds(session)) {
    throw new HaltConditionError(
      'H1',
      `H1 HALT: bot detected in a Branch A match (session ${session.sessionId}) — branch_a_no_bots violated`,
    );
  }
}
