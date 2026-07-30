/**
 * Deterministic entropy for the Execution Domain.
 *
 * GLASSBOX determinism Layer 2/3: identical seed -> identical output/ordering.
 * Grounded in the record/replay discipline of deterministic execution
 * (Cui et al. 2011, https://doi.org/10.1145/2043556.2043588).
 *
 * The "single-item optimization" (pick() draws no entropy when n<=1) decouples
 * the entropy sequence from transient queue sizes, so replay is stable even when
 * the number of eligible tasks fluctuates.
 */

/** Mulberry32 — a small, fully deterministic 32-bit PRNG. */
export class Mulberry32 {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  /** Next unsigned 32-bit integer. */
  nextU32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
}

export interface EntropySource {
  readonly mode: "recording" | "replaying";
  /** Pick an index in [0, n). n<=1 consumes no entropy (single-item optimization). */
  pick(n: number): number;
  /** The entropy values consumed so far, in order. */
  log(): number[];
}

/** Records every entropy value drawn from a seeded PRNG (verification runs). */
export class RecordingEntropySource implements EntropySource {
  readonly mode = "recording" as const;
  private readonly rng: Mulberry32;
  private readonly recorded: number[] = [];
  constructor(seed: number) {
    this.rng = new Mulberry32(seed);
  }
  pick(n: number): number {
    if (n <= 1) return 0; // single-item optimization: no PRNG draw
    const r = this.rng.nextU32();
    this.recorded.push(r);
    return r % n;
  }
  log(): number[] {
    return [...this.recorded];
  }
}

/**
 * Replays a recorded entropy sequence. Any divergence from the recorded path —
 * an extra draw beyond the log — raises immediately, isolating a
 * non-deterministic code path (GLASSBOX §Cooperative Multitasking).
 */
export class ReplayDivergenceError extends Error {}

export class ReplayingEntropySource implements EntropySource {
  readonly mode = "replaying" as const;
  private readonly recorded: number[];
  private cursor = 0;
  constructor(recorded: number[]) {
    this.recorded = [...recorded];
  }
  pick(n: number): number {
    if (n <= 1) return 0; // must mirror recording exactly
    if (this.cursor >= this.recorded.length) {
      throw new ReplayDivergenceError(
        `ReplayDivergence: entropy exhausted at draw #${this.cursor} (expected more decisions than were recorded)`,
      );
    }
    const r = this.recorded[this.cursor++]!;
    return r % n;
  }
  log(): number[] {
    return this.recorded.slice(0, this.cursor);
  }
}
