// engine/sim/config.ts — loads engine/config/sim.json into fixed-point form.
//
// Floats exist in exactly one place in this engine: this file, for the duration
// of this conversion. Everything downstream receives Q16.16 integers. Keeping
// the boundary explicit and narrow is what makes "no floats in the simulation"
// an auditable claim rather than an aspiration.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
}

interface RawVec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface RawConfig {
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
}

function toFixedVec4(raw: RawVec4, label: string): FixedVec4Config {
  for (const axis of ['x', 'y', 'z', 'w'] as const) {
    if (typeof raw[axis] !== 'number' || !Number.isFinite(raw[axis])) {
      throw new Error(`sim.json: ${label}.${axis} must be a finite number`);
    }
  }
  return {
    x: toFixed(raw.x),
    y: toFixed(raw.y),
    z: toFixed(raw.z),
    w: toFixed(raw.w),
  };
}

/**
 * Reads and validates the config.
 *
 * Validation is aggressive because every value here becomes an integer that the
 * GPU kernel trusts without re-checking — a shader has no exceptions and no
 * stack trace, so a malformed constant surfaces as silently wrong physics rather
 * than an error. The checks fail here, on the CPU, where the message is useful.
 */
export function loadSimConfig(path?: string): SimConfig {
  const here = dirname(fileURLToPath(import.meta.url));
  const configPath = path ?? join(here, '..', 'config', 'sim.json');

  let raw: RawConfig;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8')) as RawConfig;
  } catch (cause) {
    throw new Error(`sim.json: could not read or parse ${configPath}: ${String(cause)}`);
  }

  const { world, tick, physics, rendering, gpu } = raw;

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
  // both executors, and therefore not a source of divergence.
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
  };
}

/**
 * Packs the config into the uniform buffer layout the WGSL kernel expects.
 *
 * Field order here is load-bearing: it must match the SimParams struct in
 * sim.wgsl exactly. std140/std430 rules align vec4<i32> to 16 bytes, so the four
 * vec4 fields lead and the scalars follow, padded to a multiple of four i32.
 */
export function packConfigForGpu(config: SimConfig): Int32Array {
  const packed = new Int32Array(24);
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

  return packed;
}
