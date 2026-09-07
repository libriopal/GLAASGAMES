// engine/sim/config-parse.ts — validates sim.json and converts it to fixed point.
//
// Deliberately free of any node: import. The browser reaches this module via
// fetch(), Node reaches it through config.ts, and both get the identical parser —
// so a config that is valid on the phone is valid in CI and vice versa. Putting
// the parser in its own file rather than guarding an import is what makes that
// guarantee structural instead of a convention someone can break later.
//
// Floats exist in exactly one place in this engine: this file, for the duration
// of this conversion. Everything downstream receives Q16.16 integers.

import { toFixed } from '../math/fixed.js';

export interface FixedVec4Config {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface SimConfig {
  readonly capacity: number;
  readonly boundsMin: FixedVec4Config;
  readonly boundsMax: FixedVec4Config;
  readonly tickHz: number;
  readonly dtFixed: number;
  readonly maxCatchUpTicks: number;
  readonly gravity: FixedVec4Config;
  readonly linearDamping: number;
  readonly restitution: number;
  readonly maxSpeed: number;
  readonly renderMode: 'project' | 'slice';
  readonly viewerW: number;
  readonly sliceThickness: number;
  readonly workgroupSize: number;
  readonly targetCount: number;
  readonly collectRadius: number;
  readonly playerSpeed: number;
  readonly playerWSpeed: number;
}

interface RawVec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RawConfig {
  world: { capacity: number; boundsMin: RawVec4; boundsMax: RawVec4 };
  tick: { hz: number; maxCatchUpTicks: number };
  physics: {
    gravity: RawVec4;
    linearDamping: number;
    restitution: number;
    maxSpeed: number;
  };
  rendering: { mode: string; viewerW: number; sliceThickness: number };
  gpu: { workgroupSize: number };
  game: {
    targetCount: number;
    collectRadius: number;
    playerSpeed: number;
    playerWSpeed: number;
  };
}

function toFixedVec4(raw: RawVec4, label: string): FixedVec4Config {
  for (const axis of ['x', 'y', 'z', 'w'] as const) {
    if (typeof raw[axis] !== 'number' || !Number.isFinite(raw[axis])) {
      throw new Error(`sim.json: ${label}.${axis} must be a finite number`);
    }
  }
  return { x: toFixed(raw.x), y: toFixed(raw.y), z: toFixed(raw.z), w: toFixed(raw.w) };
}

/**
 * Validates a parsed sim.json and converts it to fixed point.
 *
 * Validation is aggressive because every value here becomes an integer the GPU
 * kernel trusts without re-checking — a shader has no exceptions and no stack
 * trace, so a malformed constant surfaces as silently wrong physics rather than
 * an error. The checks fail here, on the CPU, where the message is useful.
 */
export function parseSimConfig(raw: RawConfig): SimConfig {
  const { world, tick, physics, rendering, gpu, game } = raw;

  if (!Number.isInteger(world.capacity) || world.capacity <= 0) {
    throw new Error(`sim.json: world.capacity must be a positive integer`);
  }
  if (!Number.isInteger(tick.hz) || tick.hz <= 0 || tick.hz > 1000) {
    throw new Error(`sim.json: tick.hz must be an integer in 1..1000`);
  }
  if (!Number.isInteger(tick.maxCatchUpTicks) || tick.maxCatchUpTicks < 1) {
    throw new Error(`sim.json: tick.maxCatchUpTicks must be a positive integer`);
  }
  if (physics.restitution < 0 || physics.restitution >= 1) {
    // At restitution >= 1 a bounce returns at least as much energy as it
    // absorbed, so an entity resting on a boundary accelerates without limit.
    throw new Error(`sim.json: physics.restitution must be in [0, 1), got ${physics.restitution}`);
  }
  if (physics.linearDamping <= 0 || physics.linearDamping > 1) {
    throw new Error(`sim.json: physics.linearDamping must be in (0, 1]`);
  }
  if (physics.maxSpeed <= 0) {
    throw new Error(`sim.json: physics.maxSpeed must be positive`);
  }
  if (rendering.mode !== 'project' && rendering.mode !== 'slice') {
    throw new Error(`sim.json: rendering.mode must be "project" or "slice", got "${rendering.mode}"`);
  }
  if (!Number.isInteger(gpu.workgroupSize) || gpu.workgroupSize <= 0 || gpu.workgroupSize > 256) {
    throw new Error(`sim.json: gpu.workgroupSize must be an integer in 1..256`);
  }

  if (!Number.isInteger(game.targetCount) || game.targetCount <= 0) {
    throw new Error(`sim.json: game.targetCount must be a positive integer`);
  }
  if (game.collectRadius <= 0) {
    throw new Error(`sim.json: game.collectRadius must be positive`);
  }
  if (game.playerSpeed <= 0 || game.playerWSpeed <= 0) {
    throw new Error(`sim.json: game.playerSpeed and playerWSpeed must be positive`);
  }
  // The player must not be able to cross a collect radius within one tick, or a
  // target can be passed straight through between samples and never collected.
  const reachPerTick = Math.max(game.playerSpeed, game.playerWSpeed) / tick.hz;
  if (reachPerTick >= game.collectRadius) {
    throw new Error(
      `sim.json: player moves ${reachPerTick.toFixed(2)} per tick but collectRadius is ` +
        `${game.collectRadius} — targets could be tunnelled through. Lower the speed or widen the radius.`,
    );
  }

  const boundsMin = toFixedVec4(world.boundsMin, 'world.boundsMin');
  const boundsMax = toFixedVec4(world.boundsMax, 'world.boundsMax');
  for (const axis of ['x', 'y', 'z', 'w'] as const) {
    if (boundsMin[axis] >= boundsMax[axis]) {
      throw new Error(`sim.json: world.boundsMin.${axis} must be below boundsMax.${axis}`);
    }
  }

  // dt is derived from the tick rate rather than configured directly, so the two
  // can never disagree. Q16.16 at 60 Hz gives 1092 units (0.016663), which is
  // 1.6 parts per ten thousand below a true 1/60 — a constant, identical bias on
  // every host, and therefore not a source of divergence.
  const dtFixed = Math.round(65536 / tick.hz);

  return {
    capacity: world.capacity,
    boundsMin,
    boundsMax,
    tickHz: tick.hz,
    dtFixed,
    maxCatchUpTicks: tick.maxCatchUpTicks,
    gravity: toFixedVec4(physics.gravity, 'physics.gravity'),
    linearDamping: toFixed(physics.linearDamping),
    restitution: toFixed(physics.restitution),
    maxSpeed: toFixed(physics.maxSpeed),
    renderMode: rendering.mode,
    viewerW: toFixed(rendering.viewerW),
    sliceThickness: toFixed(rendering.sliceThickness),
    workgroupSize: gpu.workgroupSize,
    targetCount: game.targetCount,
    collectRadius: toFixed(game.collectRadius),
    playerSpeed: toFixed(game.playerSpeed),
    playerWSpeed: toFixed(game.playerWSpeed),
  };
}

/**
 * Byte offset of playerPos within the SimParams uniform.
 *
 * The player moves every tick while everything else in SimParams is constant, so
 * the host writes just these 16 bytes rather than re-packing and re-uploading
 * the whole struct. vec4<i32> requires 16-byte alignment and 80 satisfies it.
 */
export const PLAYER_POS_BYTE_OFFSET = 80;

/**
 * Packs the config into the uniform buffer layout the WGSL kernel expects.
 *
 * Field order here is load-bearing: it must match the SimParams struct in
 * sim.wgsl exactly. std140/std430 rules align vec4<i32> to 16 bytes, so the four
 * vec4 fields lead and the scalars follow, padded to a multiple of four i32.
 */
export function packConfigForGpu(config: SimConfig): Int32Array<ArrayBuffer> {
  const packed = new Int32Array(32);
  let cursor = 0;

  const writeVec4 = (v: FixedVec4Config): void => {
    packed[cursor] = v.x;
    packed[cursor + 1] = v.y;
    packed[cursor + 2] = v.z;
    packed[cursor + 3] = v.w;
    cursor += 4;
  };

  writeVec4(config.boundsMin); // 0..3
  writeVec4(config.boundsMax); // 4..7
  writeVec4(config.gravity); //   8..11

  packed[12] = config.dtFixed;
  packed[13] = config.linearDamping;
  packed[14] = config.restitution;
  packed[15] = config.maxSpeed;

  packed[16] = config.capacity;
  packed[17] = 0; // tick index, written per dispatch
  packed[18] = 0; // padding
  packed[19] = 0; // padding

  // 20..23 — playerPos, rewritten every tick by the host at PLAYER_POS_BYTE_OFFSET.
  packed[24] = mulFixedLocal(config.collectRadius, config.collectRadius);
  packed[25] = config.collectRadius;

  return packed;
}

/**
 * Q16.16 multiply, duplicated here rather than imported from math/fixed.ts.
 *
 * config-parse is the boundary module both hosts load; keeping it free of any
 * dependency it does not strictly need keeps that boundary small. This is the
 * only product it computes, and it is computed once at startup.
 */
function mulFixedLocal(a: number, b: number): number {
  const negative = a < 0 !== b < 0;
  const ua = Math.abs(a) >>> 0;
  const ub = Math.abs(b) >>> 0;
  const a0 = ua & 0xffff, a1 = ua >>> 16;
  const b0 = ub & 0xffff, b1 = ub >>> 16;
  const lo = Math.imul(a0, b0) >>> 0;
  const cross = (Math.imul(a1, b0) + Math.imul(a0, b1)) >>> 0;
  const hi = Math.imul(a1, b1) >>> 0;
  const magnitude = (((hi << 16) >>> 0) + cross + (lo >>> 16)) >>> 0;
  return (negative ? -magnitude : magnitude) | 0;
}
