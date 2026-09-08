// engine/sim/replay.ts — a run, recorded so anyone can check it.
//
// The claim this file exists to support: a score in this game is verifiable.
// Not trusted, not attested by a server — recomputed. Given a seed and the
// player's inputs, anybody can rebuild the identical world, feed it the
// identical inputs, and arrive at the identical result, because every value in
// the simulation is an integer and the world generator is deterministic.
//
// That is what replaces the retention machinery this repository's governance
// suite bans. A leaderboard whose entries are reproducible does not need loss
// framing or a scarcity timer to be worth caring about; it needs only to be
// true.
//
// WHAT IS RECORDED: the seed, the drifter count, and one Input per tick. Not the
// positions. Recording positions would let a forged replay assert an outcome;
// recording only inputs means the outcome is derived rather than claimed.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. It proves a score is ACHIEVABLE UNDER
// THE RULES — no fabricated number, no tampered client, no trusted server
// asserting a result nobody can check. It does NOT prove a human achieved it.
// The same determinism that makes a run recomputable makes it solvable offline:
// anyone can search input sequences against a known seed and submit the best one
// found. An independent auditor named exactly this as the strongest remaining
// attack, and it is correct — the property is inherent to the design, not a gap
// in it.
//
// So a leaderboard built on this must say "verified", never "human". Those are
// different claims and only the first one is supported here. Establishing the
// second needs something outside the replay — input timing distributions, or an
// attested client — and neither is built, so neither is claimed.
//
// THE INPUT STREAM IS RUN-LENGTH ENCODED because a human holding a direction
// emits the same Input for dozens of consecutive ticks. A 60-second run at
// 60 Hz is 3,600 ticks and typically well under a hundred runs.

import type { SimConfig } from './config-parse.js';
import { Game, type Input, NO_INPUT } from './game.js';
import { formatHash, TickHashChain } from './hash.js';
import { tick } from './kernel.js';
import { WorldState, writePlayerPosition } from './state.js';
import { populate } from './world-gen.js';

/** Bumped when any recorded field changes meaning. Old replays then fail loudly
 *  rather than silently replaying under new rules. */
export const REPLAY_FORMAT = 1;

/** The player's Q16.16 position, as a recording policy sees it. */
export interface PlayerReadout {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** One run of identical inputs: `[count, x, y, z, w]`, all i32. */
export type InputRun = readonly [number, number, number, number, number];

export interface ReplayOutcome {
  readonly collected: number;
  readonly total: number;
  readonly ticks: number;
  readonly phase: string;
  /** Chained per-tick hash of the whole world buffer across the run. */
  readonly digest: number;
}

export interface Replay {
  readonly format: number;
  readonly seed: number;
  readonly drifters: number;
  readonly capacity: number;
  readonly runs: readonly InputRun[];
  /** The outcome claimed by whoever recorded this. Never trusted; recomputed. */
  readonly claimed: ReplayOutcome;
}

/**
 * Accumulates a run as it is played.
 *
 * Call `push` once per tick with the input that tick was advanced with — the
 * same value, at the same time, or the recording describes a different run than
 * the one played.
 */
export class ReplayRecorder {
  private readonly runs: InputRun[] = [];
  private ticks = 0;

  constructor(
    readonly seed: number,
    readonly drifters: number,
    readonly capacity: number,
  ) {}

  get tickCount(): number {
    return this.ticks;
  }

  push(input: Input): void {
    this.ticks += 1;
    const last = this.runs[this.runs.length - 1];
    if (last && last[1] === input.x && last[2] === input.y &&
        last[3] === input.z && last[4] === input.w) {
      this.runs[this.runs.length - 1] = [last[0] + 1, last[1], last[2], last[3], last[4]];
      return;
    }
    this.runs.push([1, input.x | 0, input.y | 0, input.z | 0, input.w | 0]);
  }

  finish(claimed: ReplayOutcome): Replay {
    return {
      format: REPLAY_FORMAT,
      seed: this.seed,
      drifters: this.drifters,
      capacity: this.capacity,
      runs: this.runs.map((run) => [...run] as unknown as InputRun),
      claimed,
    };
  }
}

/** Expands the run-length encoding back into one Input per tick. */
export function* expandInputs(runs: readonly InputRun[]): Generator<Input> {
  for (const [count, x, y, z, w] of runs) {
    for (let i = 0; i < count; i += 1) {
      yield { x, y, z, w };
    }
  }
}

/** Total ticks a replay describes. */
export function replayTicks(replay: Replay): number {
  let total = 0;
  for (const run of replay.runs) total += run[0];
  return total;
}

/**
 * Re-runs a replay from its seed and returns what actually happened.
 *
 * This is the whole verification: nothing from `claimed` is read. The world is
 * rebuilt, the inputs are replayed in order, and the outcome is whatever the
 * rules produce. The tick order — game first, then simulation — matches the
 * live host exactly, because reversing it puts the player's scoring position a
 * tick out of step with the world it is scored against.
 */
export function executeReplay(replay: Replay, config: SimConfig): ReplayOutcome {
  if (replay.format !== REPLAY_FORMAT) {
    throw new Error(
      `replay format ${replay.format} but this build understands ${REPLAY_FORMAT}`,
    );
  }

  const world = new WorldState(replay.capacity);
  const playerSlot = populate(world, config, replay.seed, replay.drifters);

  const game = new Game(config);
  game.begin(world);

  const chain = new TickHashChain();
  for (const input of expandInputs(replay.runs)) {
    game.advance(world, input);
    const player = game.state.player;
    writePlayerPosition(world, playerSlot, player);
    tick(world, config, { x: player.x, y: player.y, z: player.z, w: player.w });
    chain.push(world.buffer);
  }

  const state = game.state;
  return {
    collected: state.collected,
    total: state.total,
    ticks: state.ticks,
    phase: state.phase,
    digest: chain.digest,
  };
}

export interface ReplayVerdict {
  readonly ok: boolean;
  readonly actual: ReplayOutcome;
  readonly claimed: ReplayOutcome;
  readonly mismatches: readonly string[];
}

/**
 * Checks a replay against the outcome it claims.
 *
 * Every field is compared, not just the digest. A replay could in principle
 * carry a digest that reproduces while claiming a score that does not follow
 * from it, and a verifier that only checked the hash would wave it through.
 */
export function verifyReplay(replay: Replay, config: SimConfig): ReplayVerdict {
  const actual = executeReplay(replay, config);
  const claimed = replay.claimed;
  const mismatches: string[] = [];

  if (actual.digest !== claimed.digest) {
    mismatches.push(
      `digest ${formatHash(claimed.digest)} claimed, ${formatHash(actual.digest)} computed`,
    );
  }
  if (actual.collected !== claimed.collected) {
    mismatches.push(`collected ${claimed.collected} claimed, ${actual.collected} computed`);
  }
  if (actual.total !== claimed.total) {
    mismatches.push(`total ${claimed.total} claimed, ${actual.total} computed`);
  }
  if (actual.ticks !== claimed.ticks) {
    mismatches.push(`ticks ${claimed.ticks} claimed, ${actual.ticks} computed`);
  }
  if (actual.phase !== claimed.phase) {
    mismatches.push(`phase ${claimed.phase} claimed, ${actual.phase} computed`);
  }

  return { ok: mismatches.length === 0, actual, claimed, mismatches };
}

/**
 * Plays a scripted run and records it — the recording path exercised by the
 * verifier and by the daily-seed tooling, so a bug in recording cannot hide
 * behind a separately written test fixture.
 */
export function recordRun(
  config: SimConfig,
  seed: number,
  drifters: number,
  capacity: number,
  ticks: number,
  inputAt: (tickIndex: number, world: WorldState, player: PlayerReadout) => Input,
): Replay {
  const world = new WorldState(capacity);
  const playerSlot = populate(world, config, seed, drifters);

  const game = new Game(config);
  game.begin(world);

  const recorder = new ReplayRecorder(seed, drifters, capacity);
  const chain = new TickHashChain();

  for (let index = 0; index < ticks; index += 1) {
    const input = game.state.phase === 'playing'
      ? inputAt(index, world, game.state.player)
      : NO_INPUT;
    game.advance(world, input);
    recorder.push(input);
    const player = game.state.player;
    writePlayerPosition(world, playerSlot, player);
    tick(world, config, { x: player.x, y: player.y, z: player.z, w: player.w });
    chain.push(world.buffer);
  }

  const state = game.state;
  return recorder.finish({
    collected: state.collected,
    total: state.total,
    ticks: state.ticks,
    phase: state.phase,
    digest: chain.digest,
  });
}
