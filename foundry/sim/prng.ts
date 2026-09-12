// foundry/sim/prng.ts — seeded randomness that can prove what it drew.
//
// ─────────────────────────────────────────────────────────────────────────────
// PORTED (behaviour-preserving) FROM
//   DISCOMPLEMENTED_ADMIN  compiler/deterministic-prng.ts
// which itself records its lineage as "adopted from Glassbox_Labs patterns".
//
// WHAT CHANGED, EXHAUSTIVELY: `crypto` is imported from `node:crypto`; the
// Merkle helpers are shared with `merkle.ts` instead of being duplicated inside
// this file; the `scanForMathRandom` source-linting helper is not ported,
// because this repository already forbids `Math.random` through its own oracles
// and a second scanner measuring vocabulary rather than behaviour is the
// "vocabulary proxy" failure EINCOL names. Mulberry32, the seeding path, the
// entropy-log shape and the draw semantics are unchanged.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS REPLACES THE AD-HOC xorshift IN THE HARNESS.
//
// The Farkle harness seeded its agents with a two-line xorshift written inline.
// That is fine for shuffling and useless for the thing the execution plan
// actually requires: an entropy log that lets a divergent run be replayed
// exactly, and a fingerprint that lets two machines agree they ran the same
// simulation.
//
// The deterministic execution plan is explicit about the mechanism — a
// RecordingEntropySource captures every scheduling decision and random value,
// a ReplayingEntropySource replays the recorded sequence, "any divergence from
// the recorded execution path triggers an immediate runtime exception". That is
// what `getEntropyLog` and `replayFrom` below are for.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SINGLE-ITEM OPTIMISATION IS LOAD-BEARING, NOT A MICRO-OPTIMISATION.
//
// The plan states it as a determinism requirement rather than a speed one: if a
// selection has only one eligible candidate, take it WITHOUT consuming a draw.
// Otherwise the entropy sequence depends on transient pool sizes, and two runs
// that made identical decisions diverge because one of them had a one-element
// list at some point. `pick` and `weighted` below both implement it.

import { createHash, randomBytes } from 'node:crypto';
import { merkleProof, merkleRoot, verifyMerkleProof } from './merkle.js';

/** A 32-byte hex string. The whole state of a run, in one value. */
export type Seed = string;

export interface EntropyEntry {
  readonly index: number;
  /** The raw [0,1) value drawn. */
  readonly value: number;
  /** A semantic label, so a replay diff says WHAT diverged, not just where. */
  readonly tag?: string;
}

export interface DeterministicRng {
  next(tag?: string): number;
  nextInt(max: number, tag?: string): number;
  pick<T>(arr: readonly T[], tag?: string): T;
  weighted<T>(items: readonly T[], weights: readonly number[], tag?: string): T;
  /** Box-Muller. Consumes TWO draws, always, so the log stays alignable. */
  gaussian(mean: number, stddev: number, tag?: string): number;
  getEntropyLog(): readonly EntropyEntry[];
  getSeed(): Seed;
  merkleRoot(): string;
  proofFor(index: number): string[];
  drawCount(): number;
}

export function generateSeed(): Seed {
  return randomBytes(32).toString('hex');
}

/** A seed from a number, for tests and for per-agent streams off one run seed. */
export function seedFrom(n: number, label = ''): Seed {
  return createHash('sha256').update(`${label}:${n}`).digest('hex');
}

function seedToState(seed: Seed): number {
  return createHash('sha256').update(seed).digest().readUInt32LE(0);
}

/** Mulberry32. Ported unchanged — its constants are a published result. */
function mulberry32(state: number): () => number {
  let s = state;
  return function (): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function leafOf(e: EntropyEntry): string {
  return createHash('sha256').update(`${e.index}:${e.value}:${e.tag ?? ''}`).digest('hex');
}

export function createRng(seed: Seed = generateSeed()): DeterministicRng {
  const raw = mulberry32(seedToState(seed));
  const log: EntropyEntry[] = [];

  const draw = (tag?: string): number => {
    const value = raw();
    log.push({ index: log.length, value, tag });
    return value;
  };

  return {
    next: draw,
    nextInt: (max, tag) => (max <= 1 ? 0 : Math.floor(draw(tag) * max)),

    // Single-item: no draw consumed. See the header — this is a determinism
    // requirement, because otherwise the entropy sequence depends on how large
    // a transient list happened to be.
    pick: <T,>(arr: readonly T[], tag?: string): T => {
      if (arr.length === 0) throw new RangeError('pick from an empty array');
      if (arr.length === 1) return arr[0]!;
      return arr[Math.floor(draw(tag) * arr.length)]!;
    },

    weighted: <T,>(items: readonly T[], weights: readonly number[], tag?: string): T => {
      if (items.length === 0) throw new RangeError('weighted pick from an empty array');
      if (items.length === 1) return items[0]!;
      let total = 0;
      for (const w of weights) total += Math.max(0, w);
      if (total <= 0) return items[0]!;
      let r = draw(tag) * total;
      for (let i = 0; i < items.length; i += 1) {
        r -= Math.max(0, weights[i] ?? 0);
        if (r <= 0) return items[i]!;
      }
      return items[items.length - 1]!;
    },

    // ALWAYS two draws. The original returned one value from a pair and the
    // second was discarded conditionally in some implementations; consuming a
    // fixed count keeps two logs comparable entry-for-entry, which is the whole
    // point of having a log.
    gaussian: (mean, stddev, tag) => {
      const u = Math.max(Number.EPSILON, draw(tag));
      const v = draw(tag);
      return mean + stddev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },

    getEntropyLog: () => log,
    getSeed: () => seed,
    merkleRoot: () => merkleRoot(log.map(leafOf)),
    proofFor: (index) => merkleProof(log.map(leafOf), index),
    drawCount: () => log.length,
  };
}

export interface ReplayDivergence {
  readonly index: number;
  readonly expected: number;
  readonly actual: number;
  readonly tag?: string;
}

/**
 * Replays a recorded log and reports the FIRST divergence, or null.
 *
 * This is the drift evaluation the execution plan describes: replay up to the
 * failure; if it succeeds the fault was transient, and if it diverges the drift
 * is confirmed and the run is not reproducible. Returning the index and tag
 * makes that actionable — "diverged at draw 8,412, tag chain-pick" localises the
 * defect where a bare boolean would not.
 */
export function replayFrom(
  seed: Seed,
  recorded: readonly EntropyEntry[],
): ReplayDivergence | null {
  const raw = mulberry32(seedToState(seed));
  for (let i = 0; i < recorded.length; i += 1) {
    const actual = raw();
    const expected = recorded[i]!.value;
    if (actual !== expected) {
      return { index: i, expected, actual, tag: recorded[i]!.tag };
    }
  }
  return null;
}

export { verifyMerkleProof };
