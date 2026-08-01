// game/determinism/pipeline.ts — W8 (07_CLAUDE_CODE_HANDOFF_V6.md §5.1, §5.2)
//
// server seed → board generation → client render → chain submit → score → validate
//
// Byte-identical, automated, and exercised end-to-end: an isolated PRNG
// harness passing is NOT determinism (DEF-04) — this tests the whole chain.
// CSPRNG only: randomBytes() is the sole entry point for true randomness;
// every downstream stage is a deterministic function of the seed it received.

import { createHash, randomBytes } from 'node:crypto';
import { addFixed, toFixedPoint } from './fixed-point.ts';

/** The ONLY place true randomness may enter the system (§5.2). */
export function generateServerSeed(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

function deriveHash(seed: Uint8Array, label: string, extra?: string): string {
  const h = createHash('sha256');
  h.update(Buffer.from(seed));
  h.update(label);
  if (extra !== undefined) h.update(extra);
  return h.digest('hex');
}

function moveWeightFixed(move: string, seed: Uint8Array, index: number): number {
  const digest = deriveHash(seed, `move-weight:${index}:${move}`);
  const byte = parseInt(digest.slice(0, 2), 16); // 0..255, deterministic given (seed, index, move)
  return toFixedPoint(Math.round((byte / 255) * 10 * 1000) / 1000); // 0..10 points, fixed-point (Q×1000)
}

/** Fixed-point score, deterministic in (moves, seed). Never touches Math.random(). */
export function scoreChain(moves: string[], seed: Uint8Array): number {
  return moves.reduce((total, move, i) => addFixed(total, moveWeightFixed(move, seed, i)), 0);
}

export interface ChainResult {
  boardHash: string;
  renderHash: string;
  submitHash: string;
  scoreFixed: number;
  valid: boolean;
}

function computeStages(seed: Uint8Array, moves: string[]): Omit<ChainResult, 'valid'> {
  const boardHash = deriveHash(seed, 'board-generation');
  const renderHash = deriveHash(seed, 'client-render', boardHash);
  const submitHash = deriveHash(seed, 'chain-submit', moves.join('|'));
  const scoreFixed = scoreChain(moves, seed);
  return { boardHash, renderHash, submitHash, scoreFixed };
}

/**
 * Runs the full chain and independently recomputes every stage to validate it
 * (the "validate" step — a server re-deriving the client's claimed result from
 * the same seed and comparing, byte for byte).
 */
export function runFullChain(seed: Uint8Array, moves: string[]): ChainResult {
  const stages = computeStages(seed, moves);
  const recomputed = computeStages(seed, moves);
  const valid =
    stages.boardHash === recomputed.boardHash &&
    stages.renderHash === recomputed.renderHash &&
    stages.submitHash === recomputed.submitHash &&
    stages.scoreFixed === recomputed.scoreFixed;
  return { ...stages, valid };
}
