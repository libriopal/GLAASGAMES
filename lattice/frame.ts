// lattice/frame.ts — proving two devices are showing the same board.
//
// A shared-board game is only shared if both screens agree. The determinism
// literature on lockstep is unanimous about how to know: compute a per-tick
// state checksum on every client and compare each frame. This engine already
// satisfies every precondition that work lists — fixed-point integer maths, a
// fixed tick rate, a seeded deterministic RNG, no platform trigonometry (CORDIC
// instead of libm) — so a checksum here is meaningful rather than aspirational.
//
// THE ONE THING THAT LITERATURE ADDS AND THIS ENGINE DID NOT HAVE is the
// PER-SUBSYSTEM BREAKDOWN. A single whole-state hash tells you the clients
// disagree; it does not tell you which system drifted first, and on a divergence
// that is the only question worth answering. So a frame stamp carries a
// component hash per subsystem alongside the combined one, and `compareFrames`
// reports the FIRST subsystem that differs rather than just "desync".
//
// Rendering is deliberately outside the stamp. Two devices may legitimately draw
// at different resolutions and frame rates; what must agree is the SIMULATION
// they are drawing. Hashing pixels would turn a legitimate difference into a
// false desync, which is the fastest way to make a desync alarm ignored.

import { CELL_STRIDE, CELL_COUNT, OFFSET_CHARGE, OFFSET_FACE, OFFSET_LINK, OFFSET_STATE, type Board } from './board.js';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(values: Iterable<number>, seed = FNV_OFFSET): number {
  let hash = seed >>> 0;
  for (const value of values) {
    const word = value | 0;
    for (let shift = 0; shift < 32; shift += 8) {
      hash = (hash ^ ((word >>> shift) & 0xff)) >>> 0;
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
  }
  return hash >>> 0;
}

/** The subsystems a frame is decomposed into, in a fixed order. */
export const SUBSYSTEMS = ['faces', 'states', 'charges', 'links'] as const;
export type Subsystem = (typeof SUBSYSTEMS)[number];

export interface FrameStamp {
  readonly tick: number;
  /** One hash per subsystem, in SUBSYSTEMS order. */
  readonly components: Readonly<Record<Subsystem, number>>;
  /** Hash over the component hashes — the single number peers compare first. */
  readonly combined: number;
}

const COLUMN: Readonly<Record<Subsystem, number>> = {
  faces: OFFSET_FACE,
  states: OFFSET_STATE,
  charges: OFFSET_CHARGE,
  links: OFFSET_LINK,
};

/**
 * Stamps one frame of simulation state.
 *
 * Note that `links` is included even though it is hidden from the player. Two
 * clients that disagree about the hidden lattice are not playing the same game,
 * and finding that out at reveal time — after a whole round — would be far too
 * late. The stamp is over the SIMULATION, and the hidden half is still the
 * simulation.
 */
export function stampFrame(board: Board, tick: number): FrameStamp {
  const components = {} as Record<Subsystem, number>;
  for (const subsystem of SUBSYSTEMS) {
    const offset = COLUMN[subsystem];
    const column: number[] = [];
    for (let i = 0; i < CELL_COUNT; i += 1) {
      column.push(board.cells[i * CELL_STRIDE + offset]!);
    }
    components[subsystem] = fnv1a(column, (FNV_OFFSET ^ offset) >>> 0);
  }
  return {
    tick,
    components,
    combined: fnv1a(SUBSYSTEMS.map((s) => components[s]), (FNV_OFFSET ^ tick) >>> 0),
  };
}

export interface FrameComparison {
  readonly agree: boolean;
  readonly tick: number;
  /** The first subsystem in SUBSYSTEMS order that differs, or null. */
  readonly firstDivergence: Subsystem | null;
  /** Every subsystem that differs, for a fuller report. */
  readonly diverged: readonly Subsystem[];
}

/**
 * Compares two peers' stamps for the same tick.
 *
 * Returns which subsystem drifted, not merely that something did. That is the
 * whole reason for the decomposition: "the charges disagree at tick 240" points
 * at one function, where "desync at tick 240" points at the entire program.
 */
export function compareFrames(mine: FrameStamp, theirs: FrameStamp): FrameComparison {
  if (mine.tick !== theirs.tick) {
    throw new Error(
      `compareFrames: refusing to compare tick ${mine.tick} against tick ${theirs.tick} — ` +
        'a stamp is only meaningful against the same tick',
    );
  }
  const diverged = SUBSYSTEMS.filter((s) => mine.components[s] !== theirs.components[s]);
  return {
    agree: mine.combined === theirs.combined && diverged.length === 0,
    tick: mine.tick,
    firstDivergence: diverged[0] ?? null,
    diverged,
  };
}

/**
 * A rolling chain of stamps, so a peer can be asked "which tick did we last
 * agree on" rather than only "do we agree now".
 */
export class FrameChain {
  private readonly stamps: FrameStamp[] = [];

  push(stamp: FrameStamp): void {
    this.stamps.push(stamp);
  }

  get length(): number {
    return this.stamps.length;
  }

  at(tick: number): FrameStamp | undefined {
    return this.stamps[tick];
  }

  /** The last tick on which both chains agreed, or -1 if they never did. */
  lastAgreedTick(other: FrameChain): number {
    const limit = Math.min(this.stamps.length, other.stamps.length);
    let last = -1;
    for (let i = 0; i < limit; i += 1) {
      const a = this.stamps[i]!;
      const b = other.stamps[i]!;
      if (a.combined !== b.combined) break;
      last = a.tick;
    }
    return last;
  }

  /** Where the two chains first parted, with the subsystem named. */
  firstDivergence(other: FrameChain): FrameComparison | null {
    const limit = Math.min(this.stamps.length, other.stamps.length);
    for (let i = 0; i < limit; i += 1) {
      const comparison = compareFrames(this.stamps[i]!, other.stamps[i]!);
      if (!comparison.agree) return comparison;
    }
    return null;
  }
}
