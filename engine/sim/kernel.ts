// engine/sim/kernel.ts — the CPU reference executor.
//
// This is the semantic definition of a tick. engine/gpu/shaders/sim.wgsl is a
// port of this file and must produce bit-identical output; where the two
// disagree, this one is right by definition and the shader is the bug.
//
// OPERATION ORDER IS PART OF THE CONTRACT. Fixed-point arithmetic is not
// associative — (a+b)+c and a+(b+c) can differ by a unit after truncation — so
// reordering "equivalent" steps silently breaks parity. Every step below is
// numbered, and the WGSL carries the same numbers.
//
// The loop is written over a flat Int32Array with manual offsets rather than
// over objects, and allocates nothing. At 4096 entities and 60 Hz this runs a
// quarter of a million times a second; a single object literal per entity per
// tick would be a megabyte of garbage a second and a visible GC sawtooth.

import { mulFixed } from '../math/fixed.js';
import type { SimConfig } from './config-parse.js';
import {
  ENTITY_STRIDE,
  FLAG_ALIVE,
  FLAG_COLLECTED,
  KIND_PLAYER,
  KIND_TARGET,
  OFFSET_AGE,
  OFFSET_FLAGS,
  OFFSET_KIND,
  OFFSET_POS_X,
  OFFSET_VEL_X,
  type WorldState,
} from './state.js';

/** The player's position for this tick, in Q16.16. */
export interface PlayerPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/**
 * Defaults to the origin because packConfigForGpu leaves the uniform's playerPos
 * slots zeroed. A CPU default that differed from the GPU's would break parity on
 * any world containing a target.
 */
const ORIGIN: PlayerPosition = { x: 0, y: 0, z: 0, w: 0 };

/**
 * Advances the world by exactly one tick, in place.
 *
 * `dtFixed` comes from the config rather than from wall-clock time: the
 * simulation is fixed-step by construction. Variable-step integration would make
 * the result depend on frame timing, and no two machines share frame timing, so
 * a variable step and a deterministic simulation are mutually exclusive. Frame
 * pacing is handled entirely in engine/host/loop.ts, which decides *how many*
 * ticks to run, never how long one lasts.
 */
export function tick(world: WorldState, config: SimConfig, player: PlayerPosition = ORIGIN): void {
  const buffer = world.buffer;
  const capacity = world.capacity;

  const { dtFixed, linearDamping, restitution, maxSpeed, gravity, boundsMin, boundsMax } = config;

  // Every axis is written out rather than looped over. Three reasons, in order
  // of importance: the four steps below then correspond line-for-line to
  // sim.wgsl, which is what makes a parity failure readable; a per-axis loop
  // would need per-tick arrays of the config components, which is allocation on
  // the hot path; and indexed access under noUncheckedIndexedAccess yields
  // `number | undefined`, which would litter the arithmetic with assertions.
  const gravityX = gravity.x;
  const gravityY = gravity.y;
  const gravityZ = gravity.z;
  const gravityW = gravity.w;
  const minX = boundsMin.x;
  const minY = boundsMin.y;
  const minZ = boundsMin.z;
  const minW = boundsMin.w;
  const maxX = boundsMax.x;
  const maxY = boundsMax.y;
  const maxZ = boundsMax.z;
  const maxW = boundsMax.w;

  const maxSpeedSquared = mulFixed(maxSpeed, maxSpeed);
  const collectRadiusSquared = mulFixed(config.collectRadius, config.collectRadius);

  for (let slot = 0; slot < capacity; slot += 1) {
    const base = slot * ENTITY_STRIDE;

    // Free slots are skipped, not compacted. Compaction would reorder entities
    // and change which slot a given object occupies, and the state hash covers
    // slot order — so a compacting tick would report divergence between two runs
    // that are physically identical.
    if ((buffer[base + OFFSET_FLAGS]! & FLAG_ALIVE) === 0) continue;

    // --- Step 0: kind dispatch --------------------------------------------
    // Physics is not universal. The player is host-owned so the tick must not
    // move it — input would fight gravity and control would feel wrong. Targets
    // are static so that BOTH executors can know where they are without either
    // reading the other's state, which is what lets the host score the game
    // instantly while the GPU marks the same targets from the same rule.
    const kind = buffer[base + OFFSET_KIND]!;

    if (kind === KIND_PLAYER) {
      buffer[base + OFFSET_AGE] = (buffer[base + OFFSET_AGE]! + 1) | 0;
      continue;
    }

    if (kind === KIND_TARGET) {
      // Collection is a FOUR-dimensional test. Matching x, y and z while sitting
      // at a different w is a miss — that is the entire game.
      const dx = (buffer[base + OFFSET_POS_X]! - player.x) | 0;
      const dy = (buffer[base + OFFSET_POS_X + 1]! - player.y) | 0;
      const dz = (buffer[base + OFFSET_POS_X + 2]! - player.z) | 0;
      const dw = (buffer[base + OFFSET_POS_X + 3]! - player.w) | 0;

      // Per-axis reject before squaring. A distant target has a delta whose
      // square nears 2^31; four of them overflow i32, `| 0` wraps the sum
      // negative, and a negative sum is trivially <= radiusSquared — so the
      // FARTHEST targets would collect themselves. Rejecting first bounds every
      // square by radius^2, and is exact: any axis beyond radius is a miss.
      const radius = config.collectRadius;
      if (dx > radius || dx < -radius || dy > radius || dy < -radius ||
          dz > radius || dz < -radius || dw > radius || dw < -radius) {
        buffer[base + OFFSET_AGE] = (buffer[base + OFFSET_AGE]! + 1) | 0;
        continue;
      }

      let distanceSquared = 0;
      distanceSquared = (distanceSquared + mulFixed(dx, dx)) | 0;
      distanceSquared = (distanceSquared + mulFixed(dy, dy)) | 0;
      distanceSquared = (distanceSquared + mulFixed(dz, dz)) | 0;
      distanceSquared = (distanceSquared + mulFixed(dw, dw)) | 0;

      if (distanceSquared <= collectRadiusSquared) {
        // Cleared of ALIVE so the tick and the renderer skip it; COLLECTED marks
        // it as taken rather than never-spawned.
        buffer[base + OFFSET_FLAGS] = FLAG_COLLECTED;
      }
      buffer[base + OFFSET_AGE] = (buffer[base + OFFSET_AGE]! + 1) | 0;
      continue;
    }

    const vx = base + OFFSET_VEL_X;
    const vy = base + OFFSET_VEL_X + 1;
    const vz = base + OFFSET_VEL_X + 2;
    const vw = base + OFFSET_VEL_X + 3;
    const px = base + OFFSET_POS_X;
    const py = base + OFFSET_POS_X + 1;
    const pz = base + OFFSET_POS_X + 2;
    const pw = base + OFFSET_POS_X + 3;

    // Pulled into locals for the duration of the tick. Int32Array element access
    // is a bounds-checked memory operation; the arithmetic below touches each
    // component several times, and doing that through the buffer would repeat
    // the check every time.
    let velX = buffer[vx]!;
    let velY = buffer[vy]!;
    let velZ = buffer[vz]!;
    let velW = buffer[vw]!;
    let posX = buffer[px]!;
    let posY = buffer[py]!;
    let posZ = buffer[pz]!;
    let posW = buffer[pw]!;

    // --- Step 1: gravity into velocity (semi-implicit Euler) ---------------
    // Velocity is updated before position. The explicit ordering matters: the
    // symplectic form conserves energy over long runs where forward Euler
    // injects it, and a bouncing world that gains energy eventually explodes.
    velX = (velX + mulFixed(gravityX, dtFixed)) | 0;
    velY = (velY + mulFixed(gravityY, dtFixed)) | 0;
    velZ = (velZ + mulFixed(gravityZ, dtFixed)) | 0;
    velW = (velW + mulFixed(gravityW, dtFixed)) | 0;

    // --- Step 2: linear damping -------------------------------------------
    velX = mulFixed(velX, linearDamping);
    velY = mulFixed(velY, linearDamping);
    velZ = mulFixed(velZ, linearDamping);
    velW = mulFixed(velW, linearDamping);

    // --- Step 3: speed clamp ----------------------------------------------
    // Compared in squared space to avoid a square root on the common path where
    // no clamping is needed. Accumulation order is x, y, z, w and the WGSL uses
    // the same order: fixed-point addition is not associative, so a different
    // summation order can differ by a unit and break parity.
    let speedSquared = 0;
    speedSquared = (speedSquared + mulFixed(velX, velX)) | 0;
    speedSquared = (speedSquared + mulFixed(velY, velY)) | 0;
    speedSquared = (speedSquared + mulFixed(velZ, velZ)) | 0;
    speedSquared = (speedSquared + mulFixed(velW, velW)) | 0;

    if (speedSquared > maxSpeedSquared && speedSquared > 0) {
      // ratio = maxSpeed / speed as a Q16.16 quotient. Integer sqrt and integer
      // division are used rather than float equivalents so the clamp stays
      // reproducible on both executors.
      const speed = integerSqrtFixed(speedSquared);
      if (speed > 0) {
        const ratio = Math.trunc((maxSpeed * 65536) / speed) | 0;
        velX = mulFixed(velX, ratio);
        velY = mulFixed(velY, ratio);
        velZ = mulFixed(velZ, ratio);
        velW = mulFixed(velW, ratio);
      }
    }

    // --- Step 4: integrate position ---------------------------------------
    posX = (posX + mulFixed(velX, dtFixed)) | 0;
    posY = (posY + mulFixed(velY, dtFixed)) | 0;
    posZ = (posZ + mulFixed(velZ, dtFixed)) | 0;
    posW = (posW + mulFixed(velW, dtFixed)) | 0;

    // --- Step 5: boundary response, all four axes -------------------------
    // The position is clamped to the wall rather than reflected across it.
    // Mirroring the overshoot back into the volume is more physical, but at high
    // velocity it can place an entity outside the opposite wall in a single
    // step, which then bounces it back and forth forever. Clamping is stable at
    // every velocity, which matters more here than sub-tick accuracy.
    if (posX < minX) {
      posX = minX;
      velX = mulFixed(-velX, restitution);
    } else if (posX > maxX) {
      posX = maxX;
      velX = mulFixed(-velX, restitution);
    }

    if (posY < minY) {
      posY = minY;
      velY = mulFixed(-velY, restitution);
    } else if (posY > maxY) {
      posY = maxY;
      velY = mulFixed(-velY, restitution);
    }

    if (posZ < minZ) {
      posZ = minZ;
      velZ = mulFixed(-velZ, restitution);
    } else if (posZ > maxZ) {
      posZ = maxZ;
      velZ = mulFixed(-velZ, restitution);
    }

    if (posW < minW) {
      posW = minW;
      velW = mulFixed(-velW, restitution);
    } else if (posW > maxW) {
      posW = maxW;
      velW = mulFixed(-velW, restitution);
    }

    // --- Write back -------------------------------------------------------
    buffer[px] = posX;
    buffer[py] = posY;
    buffer[pz] = posZ;
    buffer[pw] = posW;
    buffer[vx] = velX;
    buffer[vy] = velY;
    buffer[vz] = velZ;
    buffer[vw] = velW;

    // --- Step 6: age ------------------------------------------------------
    buffer[base + OFFSET_AGE] = (buffer[base + OFFSET_AGE]! + 1) | 0;
  }
}

/**
 * Integer square root of a Q16.16 value, returned in Q16.16.
 *
 * Duplicated from math/fixed.ts rather than imported, in the same restoring form
 * the WGSL uses, because the kernel's copy must track the shader's copy exactly
 * and an unrelated optimisation to the general-purpose helper must not be able
 * to silently change simulation results.
 */
function integerSqrtFixed(value: number): number {
  if (value <= 0) return 0;
  const radicand = value * 65536;
  let remainder = radicand;
  let root = 0;
  let bit = 2 ** 48;
  while (bit > remainder) {
    bit /= 4;
  }
  while (bit >= 1) {
    if (remainder >= root + bit) {
      remainder -= root + bit;
      root = root / 2 + bit;
    } else {
      root = root / 2;
    }
    bit /= 4;
  }
  return root | 0;
}

/** Runs `count` ticks. Returns the world for chaining. */
export function run(world: WorldState, config: SimConfig, count: number): WorldState {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`run: count must be a non-negative integer, got ${count}`);
  }
  for (let index = 0; index < count; index += 1) {
    tick(world, config);
  }
  return world;
}
