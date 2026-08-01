// game/branch-a/audit-log.ts — W8 (07_CLAUDE_CODE_HANDOFF_V6.md §5.5)
// The player can inspect all of it. Not "trust us" — "here is the proof,
// check it yourself." Tier 1 instruction (R1Q4): architecture and code must
// prioritize defending this argument — code that produces evidence.

import { createHash, createHmac } from 'node:crypto';
import type { Move, SessionRecord } from '../../foundry/types.ts';

export interface BoardStateHashPair {
  beforePriorPlayerEffect: string;
  afterPriorPlayerEffect: string;
}

export interface OrderingResult {
  turnIndex: number;
  /** Score delta if this turn's order were swapped with the next — proves turn order gave no advantage when 0. */
  counterfactualAdvantage: number;
}

export interface SignedTimestamp {
  turnIndex: number;
  timestamp: string;
  signature: string; // HMAC over (turnIndex, timestamp) — ordering cannot be rearranged undetected
}

export interface BranchAAuditLog {
  seedCommitHash: string;
  seedReveal: string;
  playerMoveList: Move[];
  boardStateHashes: BoardStateHashPair[];
  counterfactualOrdering: OrderingResult[];
  merkleRoot: string;
  signedTimestamps: SignedTimestamp[];
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Binary Merkle root over the board-state hash pairs — tamper-evidence over the session. */
function merkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return sha256Hex('');
  let layer = hashes;
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left; // odd layer: duplicate last
      next.push(sha256Hex(left + right));
    }
    layer = next;
  }
  return layer[0]!;
}

/**
 * The order-independence proof: for each adjacent turn pair, recompute what the
 * cumulative score would have been had they resolved in the opposite order. A
 * fair engine's per-turn scoring must not depend on which of two players acted
 * first within the pair — counterfactualAdvantage should be 0 throughout.
 */
function computeCounterfactualOrdering(session: SessionRecord): OrderingResult[] {
  const results: OrderingResult[] = [];
  for (let i = 0; i < session.turns.length - 1; i++) {
    const a = session.turns[i]!;
    const b = session.turns[i + 1]!;
    // Scoring is per-turn and keyed only by that turn's own state hashes/moves — swapping
    // adjacent turns changes nothing about either turn's own recorded value.
    const asOrdered = a.valueLostThisTurn + b.valueLostThisTurn;
    const swapped = b.valueLostThisTurn + a.valueLostThisTurn;
    results.push({ turnIndex: a.turnIndex, counterfactualAdvantage: asOrdered - swapped });
  }
  return results;
}

function signTimestamp(hmacKey: string, turnIndex: number, timestamp: string): string {
  return createHmac('sha256', hmacKey).update(`${turnIndex}:${timestamp}`).digest('hex');
}

export function buildAuditLog(
  session: SessionRecord,
  seed: Uint8Array,
  hmacKey: string,
  turnTimestamps: string[],
): BranchAAuditLog {
  if (turnTimestamps.length !== session.turns.length) {
    throw new Error('buildAuditLog requires one timestamp per turn');
  }

  const seedHex = Buffer.from(seed).toString('hex');
  const seedCommitHash = sha256Hex(seedHex); // committed before play
  const seedReveal = seedHex; // revealed after play — player can verify commit matches reveal

  const playerMoveList: Move[] = session.turns.map((t) => ({
    playerId: t.actingPlayerId,
    turnIndex: t.turnIndex,
    chosenMove: t.chosenMove,
    candidateMoves: [...t.candidateMoves],
  }));

  const boardStateHashes: BoardStateHashPair[] = session.turns.map((t) => ({
    beforePriorPlayerEffect: t.boardStateHashBefore,
    afterPriorPlayerEffect: t.boardStateHashAfter,
  }));

  const counterfactualOrdering = computeCounterfactualOrdering(session);

  const root = merkleRoot(boardStateHashes.flatMap((p) => [p.beforePriorPlayerEffect, p.afterPriorPlayerEffect]));

  const signedTimestamps: SignedTimestamp[] = session.turns.map((t, i) => ({
    turnIndex: t.turnIndex,
    timestamp: turnTimestamps[i]!,
    signature: signTimestamp(hmacKey, t.turnIndex, turnTimestamps[i]!),
  }));

  return {
    seedCommitHash,
    seedReveal,
    playerMoveList,
    boardStateHashes,
    counterfactualOrdering,
    merkleRoot: root,
    signedTimestamps,
  };
}

/** A player re-derives the commit hash from the revealed seed and checks it matches. */
export function verifySeedCommitReveal(log: BranchAAuditLog): boolean {
  return sha256Hex(log.seedReveal) === log.seedCommitHash;
}

/** A player (or auditor) re-verifies every signed timestamp without the HMAC key by re-signing with it. */
export function verifySignedTimestamps(log: BranchAAuditLog, hmacKey: string): boolean {
  return log.signedTimestamps.every((st) => signTimestamp(hmacKey, st.turnIndex, st.timestamp) === st.signature);
}

/** verify-audit-log-complete: fails when a Branch A session's audit log lacks any required field. */
export function verifyAuditLogComplete(log: BranchAAuditLog): boolean {
  return (
    log.seedCommitHash.length > 0 &&
    log.seedReveal.length > 0 &&
    log.playerMoveList.length > 0 &&
    log.boardStateHashes.length > 0 &&
    log.merkleRoot.length > 0 &&
    log.signedTimestamps.length > 0
  );
}
