// engine/host/loop.ts — frame pacing.
//
// The single responsibility here is deciding HOW MANY fixed ticks to run for a
// given amount of elapsed wall-clock time. It never changes how long a tick
// lasts: the simulation step is a constant from sim.json, because a
// variable-length step makes results depend on frame timing, and no two machines
// share frame timing. Determinism and variable-step integration cannot coexist.
//
// This is the only module in the engine allowed to see wall-clock time.

import type { SimConfig } from '../sim/config.js';

/** Milliseconds of elapsed time that will ever be honoured in a single frame. */
const MAX_FRAME_MS = 250;

export interface StepResult {
  /** Ticks the caller should run. Never exceeds config.maxCatchUpTicks. */
  readonly ticks: number;
  /** Fraction of a tick left over, Q16.16 in [0, 1). For render interpolation. */
  readonly alphaFixed: number;
  /** Ticks discarded to stop a spiral of death. Non-zero means the host is behind. */
  readonly droppedTicks: number;
}

/**
 * Fixed-timestep accumulator.
 *
 * THE FAILURE THIS PREVENTS: if a frame takes longer than a tick, the naive fix
 * is to run however many ticks the elapsed time implies. But running extra ticks
 * costs time, which makes the next frame longer, which demands more ticks — a
 * positive feedback loop that locks the process solid. This is the "spiral of
 * death", and it is why elapsed time is clamped twice: once against wall-clock
 * outliers (MAX_FRAME_MS) and once against tick count (maxCatchUpTicks). Time
 * beyond those bounds is discarded. The simulation then runs slow relative to
 * the wall clock, which is visible and survivable; the alternative is a hang.
 */
export class FixedTimestep {
  private readonly stepMs: number;
  private readonly maxCatchUpTicks: number;
  private accumulatorMs: number;
  private lastTimeMs: number | null;

  constructor(config: SimConfig) {
    this.stepMs = 1000 / config.tickHz;
    this.maxCatchUpTicks = config.maxCatchUpTicks;
    this.accumulatorMs = 0;
    this.lastTimeMs = null;
  }

  /**
   * Feeds the current timestamp and returns the work for this frame.
   *
   * The first call establishes a baseline and returns zero ticks. Treating the
   * initial timestamp as an elapsed interval would hand the accumulator the
   * entire uptime of the process and immediately trigger the catch-up clamp.
   */
  advance(nowMs: number): StepResult {
    if (!Number.isFinite(nowMs)) {
      throw new Error(`FixedTimestep.advance: non-finite timestamp ${nowMs}`);
    }

    if (this.lastTimeMs === null) {
      this.lastTimeMs = nowMs;
      return { ticks: 0, alphaFixed: 0, droppedTicks: 0 };
    }

    let elapsedMs = nowMs - this.lastTimeMs;
    this.lastTimeMs = nowMs;

    // A backwards or absurd delta means the clock source moved under us — a
    // suspended tab, a laptop lid, an NTP correction. Treat it as one frame
    // rather than propagating a nonsense interval into the accumulator.
    if (elapsedMs < 0) elapsedMs = this.stepMs;
    if (elapsedMs > MAX_FRAME_MS) elapsedMs = MAX_FRAME_MS;

    this.accumulatorMs += elapsedMs;

    let ticks = Math.floor(this.accumulatorMs / this.stepMs);
    this.accumulatorMs -= ticks * this.stepMs;

    let droppedTicks = 0;
    if (ticks > this.maxCatchUpTicks) {
      droppedTicks = ticks - this.maxCatchUpTicks;
      ticks = this.maxCatchUpTicks;
      // Discard the backlog outright. Carrying it in the accumulator would only
      // defer the same overload to the next frame.
      this.accumulatorMs = 0;
    }

    // Interpolation factor for the renderer, as Q16.16 in [0, 1).
    const alphaFixed = Math.min(65535, Math.floor((this.accumulatorMs / this.stepMs) * 65536));

    return { ticks, alphaFixed, droppedTicks };
  }

  /** Clears accumulated time. Call after a deliberate pause so it is not caught up. */
  reset(): void {
    this.accumulatorMs = 0;
    this.lastTimeMs = null;
  }
}
