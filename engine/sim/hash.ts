// engine/sim/hash.ts — deterministic state fingerprint.
//
// This is the instrument every parity and determinism claim in the engine rests
// on. Two executors agree if and only if their state hashes agree, so the hash
// must be exactly reproducible and must cover every bit that matters.
//
// FNV-1a over the raw i32 buffer, byte by byte. Chosen over a cryptographic
// digest because it is a dozen integer operations, ports to WGSL in ten lines,
// and needs no collision resistance: nothing adversarial is being defended
// against, the job is only to notice divergence between two runs that should be
// identical.

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Hashes an i32 buffer to a u32 fingerprint.
 *
 * Each word is consumed as four little-endian bytes rather than as a single
 * 32-bit value. Byte-at-a-time is FNV's specified form; feeding whole words
 * would be a different function whose avalanche behaviour is unstudied, and it
 * would also hide byte-order disagreement between a CPU buffer and a GPU
 * readback — precisely the class of bug this is here to catch.
 */
export function hashState(buffer: Int32Array): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < buffer.length; index += 1) {
    const word = buffer[index]!;
    for (let shift = 0; shift < 32; shift += 8) {
      const byte = (word >>> shift) & 0xff;
      hash = (hash ^ byte) >>> 0;
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
  }
  return hash >>> 0;
}

/** Formats a hash as fixed-width hex, so logs and registers line up. */
export function formatHash(hash: number): string {
  return `0x${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Rolling hash across a run of ticks.
 *
 * A single end-of-run hash proves the endpoints match but says nothing about
 * where two runs diverged. Chaining every tick's hash means the first mismatched
 * tick index is recoverable, which turns "the GPU disagrees" into "the GPU
 * disagrees at tick 4,217" — the difference between a debuggable failure and an
 * intractable one.
 */
export class TickHashChain {
  private chained: number;
  private readonly perTick: number[];

  constructor() {
    this.chained = FNV_OFFSET_BASIS;
    this.perTick = [];
  }

  push(buffer: Int32Array): number {
    const tickHash = hashState(buffer);
    this.perTick.push(tickHash);
    for (let shift = 0; shift < 32; shift += 8) {
      const byte = (tickHash >>> shift) & 0xff;
      this.chained = (this.chained ^ byte) >>> 0;
      this.chained = Math.imul(this.chained, FNV_PRIME) >>> 0;
    }
    return tickHash;
  }

  get digest(): number {
    return this.chained >>> 0;
  }

  get ticks(): readonly number[] {
    return this.perTick;
  }

  /** Index of the first differing tick, or -1 when the chains agree. */
  firstDivergence(other: TickHashChain): number {
    const limit = Math.min(this.perTick.length, other.perTick.length);
    for (let index = 0; index < limit; index += 1) {
      if (this.perTick[index] !== other.perTick[index]) return index;
    }
    return this.perTick.length === other.perTick.length ? -1 : limit;
  }
}
