// engine/sim/game.ts — the rules.
//
// A finite state machine over READY -> PLAYING -> WON, plus the player's motion
// and the score. Everything here is Q16.16 integer arithmetic driven by a fixed
// timestep, so a replay of the same inputs from the same seed produces the same
// outcome on any device — the same property the simulation has, extended to the
// game on top of it.
//
// WHY THE HOST SCORES RATHER THAN THE GPU: targets never move, so their
// positions are knowable to both executors without either reading the other's
// state. The host therefore applies the identical collection rule the shader
// applies, from the identical data, and arrives at the identical answer without
// a readback. Score is instant, the GPU still marks the targets it culls, and
// the two agree by construction rather than by synchronisation.

import { mulFixed } from '../math/fixed.js';
import type { SimConfig } from './config-parse.js';
import {
  ENTITY_STRIDE,
  FLAG_ALIVE,
  KIND_TARGET,
  OFFSET_FLAGS,
  OFFSET_KIND,
  OFFSET_POS_X,
  type WorldState,
} from './state.js';

export type Phase = 'ready' | 'playing' | 'won';

/**
 * Input for one tick. Each axis is Q16.16 in [-1, 1]; anything outside is
 * clamped. Keeping input in fixed point means a recorded input stream replays
 * exactly, which a float joystick reading would not.
 */
export interface Input {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export const NO_INPUT: Input = { x: 0, y: 0, z: 0, w: 0 };

const FIXED_ONE = 65536;

function clampUnit(value: number): number {
  return value < -FIXED_ONE ? -FIXED_ONE : value > FIXED_ONE ? FIXED_ONE : value;
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

export class Game {
  readonly config: SimConfig;

  private phase: Phase = 'ready';
  private posX = 0;
  private posY = 0;
  private posZ = 0;
  private posW = 0;
  private collected = 0;
  private ticksElapsed = 0;
  private totalTargets = 0;

  constructor(config: SimConfig) {
    this.config = config;
  }

  get state(): {
    readonly phase: Phase;
    readonly collected: number;
    readonly total: number;
    readonly ticks: number;
    readonly player: { x: number; y: number; z: number; w: number };
  } {
    return {
      phase: this.phase,
      collected: this.collected,
      total: this.totalTargets,
      ticks: this.ticksElapsed,
      player: { x: this.posX, y: this.posY, z: this.posZ, w: this.posW },
    };
  }

  /** Seconds elapsed, derived from the tick count so it is replay-exact. */
  get seconds(): number {
    return this.ticksElapsed / this.config.tickHz;
  }

  /**
   * Places the player at the centre of the world and counts the targets present.
   * Called once the world is populated; does not itself spawn anything, so the
   * caller stays in charge of world composition.
   */
  begin(world: WorldState): void {
    this.posX = (this.config.boundsMin.x + this.config.boundsMax.x) >> 1;
    this.posY = (this.config.boundsMin.y + this.config.boundsMax.y) >> 1;
    this.posZ = (this.config.boundsMin.z + this.config.boundsMax.z) >> 1;
    this.posW = (this.config.boundsMin.w + this.config.boundsMax.w) >> 1;

    this.collected = 0;
    this.ticksElapsed = 0;
    this.totalTargets = this.countLiveTargets(world);
    this.phase = this.totalTargets > 0 ? 'playing' : 'won';
  }

  /**
   * Advances the game by one tick. Call BEFORE the simulation tick, so the
   * position the host scores against is the same one it uploads to the uniform
   * for the shader to score against. Reversing the order would leave the two a
   * tick apart and they would disagree about the frame a target was taken.
   */
  advance(world: WorldState, input: Input): void {
    if (this.phase !== 'playing') return;

    const { dtFixed, playerSpeed, playerWSpeed, boundsMin, boundsMax } = this.config;

    // Velocity is input * speed; there is no acceleration or momentum on the
    // player. Direct control is the right feel for a game whose difficulty is
    // spatial reasoning in four dimensions, not vehicle handling.
    const stepXYZ = mulFixed(playerSpeed, dtFixed);
    const stepW = mulFixed(playerWSpeed, dtFixed);

    this.posX = clamp(
      (this.posX + mulFixed(clampUnit(input.x), stepXYZ)) | 0, boundsMin.x, boundsMax.x);
    this.posY = clamp(
      (this.posY + mulFixed(clampUnit(input.y), stepXYZ)) | 0, boundsMin.y, boundsMax.y);
    this.posZ = clamp(
      (this.posZ + mulFixed(clampUnit(input.z), stepXYZ)) | 0, boundsMin.z, boundsMax.z);
    this.posW = clamp(
      (this.posW + mulFixed(clampUnit(input.w), stepW)) | 0, boundsMin.w, boundsMax.w);

    this.collected = this.totalTargets - this.countLiveTargets(world, true);
    this.ticksElapsed += 1;

    if (this.collected >= this.totalTargets) {
      this.phase = 'won';
    }
  }

  /**
   * Counts live targets, optionally applying the collection rule as it goes.
   *
   * The rule is character-for-character the one in kernel.ts step 0 and
   * sim.wgsl: a four-dimensional distance test against collectRadius, summed in
   * x, y, z, w order because fixed-point addition is not associative. A target
   * level with the player in x, y and z but offset in w is NOT collected, and
   * that single fact is the game.
   */
  private countLiveTargets(world: WorldState, applyRule = false): number {
    const buffer = world.buffer;
    const radiusSquared = mulFixed(this.config.collectRadius, this.config.collectRadius);
    let live = 0;

    for (let slot = 0; slot < world.capacity; slot += 1) {
      const base = slot * ENTITY_STRIDE;
      if ((buffer[base + OFFSET_FLAGS]! & FLAG_ALIVE) === 0) continue;
      if (buffer[base + OFFSET_KIND] !== KIND_TARGET) continue;

      if (applyRule) {
        const dx = (buffer[base + OFFSET_POS_X]! - this.posX) | 0;
        const dy = (buffer[base + OFFSET_POS_X + 1]! - this.posY) | 0;
        const dz = (buffer[base + OFFSET_POS_X + 2]! - this.posZ) | 0;
        const dw = (buffer[base + OFFSET_POS_X + 3]! - this.posW) | 0;

        // Per-axis reject before squaring — mirrors kernel.ts and sim.wgsl.
        // Four squared deltas from a distant target overflow i32 and wrap the
        // sum negative, which reads as "inside the radius".
        const radius = this.config.collectRadius;
        if (dx > radius || dx < -radius || dy > radius || dy < -radius ||
            dz > radius || dz < -radius || dw > radius || dw < -radius) {
          live += 1;
          continue;
        }

        let distanceSquared = 0;
        distanceSquared = (distanceSquared + mulFixed(dx, dx)) | 0;
        distanceSquared = (distanceSquared + mulFixed(dy, dy)) | 0;
        distanceSquared = (distanceSquared + mulFixed(dz, dz)) | 0;
        distanceSquared = (distanceSquared + mulFixed(dw, dw)) | 0;

        if (distanceSquared <= radiusSquared) continue; // taken this tick
      }
      live += 1;
    }
    return live;
  }
}

/**
 * Distance from the player to the nearest live target, split into the part the
 * eye can see and the part it cannot.
 *
 * This exists because 4D is genuinely disorienting: a target rendered right on
 * top of the player may be arbitrarily far away along w, and without a readout
 * saying so the game reads as broken rather than as hard. Returns null when no
 * targets remain.
 */
export function nearestTarget(
  world: WorldState,
  player: { x: number; y: number; z: number; w: number },
): { readonly spatial: number; readonly alongW: number } | null {
  const buffer = world.buffer;
  let bestSpatial = 0;
  let bestW = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let found = false;

  for (let slot = 0; slot < world.capacity; slot += 1) {
    const base = slot * ENTITY_STRIDE;
    if ((buffer[base + OFFSET_FLAGS]! & FLAG_ALIVE) === 0) continue;
    if (buffer[base + OFFSET_KIND] !== KIND_TARGET) continue;

    const dx = (buffer[base + OFFSET_POS_X]! - player.x) / FIXED_ONE;
    const dy = (buffer[base + OFFSET_POS_X + 1]! - player.y) / FIXED_ONE;
    const dz = (buffer[base + OFFSET_POS_X + 2]! - player.z) / FIXED_ONE;
    const dw = (buffer[base + OFFSET_POS_X + 3]! - player.w) / FIXED_ONE;

    // Float maths is fine here: this is a display readout, not simulation.
    const spatial = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const score = spatial + Math.abs(dw);
    if (score < bestScore) {
      bestScore = score;
      bestSpatial = spatial;
      bestW = dw;
      found = true;
    }
  }
  return found ? { spatial: bestSpatial, alongW: bestW } : null;
}
