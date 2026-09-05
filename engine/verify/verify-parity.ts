// engine/verify/verify-parity.ts
// Proves the GPU kernel and the CPU reference executor agree bit for bit.
//
// This pass has two halves, because they fail at different times and for
// different reasons.
//
// HALF 1 — STATIC CONTRACT. The memory layout and step order shared by
// state.ts, config.ts and sim.wgsl is asserted by parsing the shader source. No
// GPU is required. This catches the most likely real-world regression by a wide
// margin: someone adds a field to the entity record, updates the TypeScript, and
// forgets the shader. Without this check that lands as corrupted physics on user
// hardware and passes every test in CI.
//
// HALF 2 — EXECUTION PARITY. The same seeded world is advanced N ticks on both
// executors and the per-tick hash chains are compared, so a divergence reports
// the exact tick it began. This half needs a working WebGPU adapter and is
// skipped where none exists — with a non-zero exit only if parity was demanded
// via --require-gpu, so CI on GPU runners can insist while a laptop or a
// container need not.

import { readSimShaderSource, acquireGpu } from '../gpu/device.js';
import { loadSimConfig } from '../sim/config.js';
import { TickHashChain, formatHash } from '../sim/hash.js';
import { tick } from '../sim/kernel.js';
import {
  ENTITY_STRIDE,
  FLAG_ALIVE,
  OFFSET_AGE,
  OFFSET_FLAGS,
  OFFSET_KIND,
  OFFSET_POS_X,
  OFFSET_VEL_X,
  WorldState,
} from '../sim/state.js';
import { toFixed } from '../math/fixed.js';

const requireGpu = process.argv.includes('--require-gpu');
const config = loadSimConfig();
const failures: string[] = [];

function fail(detail: string): void {
  failures.push(detail);
}

// ---------------------------------------------------------------------------
// Half 1 — static contract between the TypeScript layout and the WGSL source.
// ---------------------------------------------------------------------------

const shaderSource = readSimShaderSource();

/**
 * The shader with comments stripped, matching the approach in
 * game/determinism/static-checks.ts. Every assertion below scans this rather
 * than the raw source: a constant named in prose is documentation, not a
 * declaration, and a check that cannot tell the difference fires on its own
 * explanatory header.
 */
const shader = shaderSource
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

/** Reads `const NAME: u32 = 12u;` or `const NAME: i32 = 1;` out of the shader. */
function shaderConst(name: string): number | null {
  const pattern = new RegExp(`const\\s+${name}\\s*:\\s*[iu]32\\s*=\\s*(\\d+)u?\\s*;`);
  const match = shader.match(pattern);
  return match === null ? null : Number.parseInt(match[1]!, 10);
}

const CONTRACT: readonly (readonly [string, number])[] = [
  ['ENTITY_STRIDE', ENTITY_STRIDE],
  ['OFFSET_POS_X', OFFSET_POS_X],
  ['OFFSET_VEL_X', OFFSET_VEL_X],
  ['OFFSET_KIND', OFFSET_KIND],
  ['OFFSET_FLAGS', OFFSET_FLAGS],
  ['OFFSET_AGE', OFFSET_AGE],
  ['FLAG_ALIVE', FLAG_ALIVE],
];

for (const [name, expected] of CONTRACT) {
  const actual = shaderConst(name);
  if (actual === null) {
    fail(`contract: sim.wgsl declares no constant ${name}`);
  } else if (actual !== expected) {
    fail(`contract: ${name} is ${expected} in state.ts but ${actual} in sim.wgsl`);
  }
}

// The uniform struct field order is the other half of the contract, and
// packConfigForGpu writes positionally against it.
const EXPECTED_PARAM_FIELDS: readonly string[] = [
  'boundsMin',
  'boundsMax',
  'gravity',
  'dtFixed',
  'linearDamping',
  'restitution',
  'maxSpeed',
  'capacity',
  'tickIndex',
];

const structMatch = shader.match(/struct\s+SimParams\s*\{([\s\S]*?)\}/);
if (structMatch === null) {
  fail('contract: sim.wgsl declares no SimParams struct');
} else {
  const declaredOrder = [...structMatch[1]!.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
  for (let index = 0; index < EXPECTED_PARAM_FIELDS.length; index += 1) {
    if (declaredOrder[index] !== EXPECTED_PARAM_FIELDS[index]!) {
      fail(
        `contract: SimParams field ${index} is "${declaredOrder[index] ?? '(missing)'}", ` +
          `packConfigForGpu writes "${EXPECTED_PARAM_FIELDS[index]}" there`,
      );
    }
  }
}

// The workgroup size is a compile-time literal in WGSL and cannot read the
// config, so the two must be checked against each other explicitly.
const workgroupMatch = shader.match(/@workgroup_size\((\d+)\)/);
if (workgroupMatch === null) {
  fail('contract: sim.wgsl declares no @workgroup_size');
} else if (Number.parseInt(workgroupMatch[1]!, 10) !== config.workgroupSize) {
  fail(
    `contract: @workgroup_size(${workgroupMatch[1]!}) in sim.wgsl but ` +
      `gpu.workgroupSize is ${config.workgroupSize} in sim.json`,
  );
}

// The prohibition that makes cross-vendor determinism possible in the first
// place: a floating-point type anywhere in the simulation kernel would
// reintroduce the FMA contraction and rounding differences the fixed-point
// design exists to avoid.
//
// `shader` already has comments stripped — the header explains why f32 is
// banned, and naming the thing you are banning is not using it.
const floatUse = shader.match(/\b(f32|f16)\b/g);
if (floatUse !== null) {
  fail(
    `contract: sim.wgsl uses ${floatUse.length} floating-point type(s) in code — ` +
      'the simulation kernel must be integer-only for cross-vendor reproducibility',
  );
}

if (failures.length === 0) {
  console.log(
    `  contract: ${CONTRACT.length} layout constants, ${EXPECTED_PARAM_FIELDS.length} uniform fields, ` +
      `workgroup size ${config.workgroupSize}, zero float types — CPU and GPU agree`,
  );
}

// ---------------------------------------------------------------------------
// Half 2 — execution parity against a real device.
// ---------------------------------------------------------------------------

/** Seeded xorshift32; Math.random is banned tree-wide. */
function makeRng(seed: number): () => number {
  let state = seed | 0;
  if (state === 0) state = 0x1a2b3c4d;
  return () => {
    state ^= state << 13;
    state |= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    return state;
  };
}

function populate(world: WorldState, seed: number, count: number): void {
  const rng = makeRng(seed);
  const spanX = config.boundsMax.x - config.boundsMin.x;
  const spanY = config.boundsMax.y - config.boundsMin.y;
  const spanZ = config.boundsMax.z - config.boundsMin.z;
  const spanW = config.boundsMax.w - config.boundsMin.w;
  for (let index = 0; index < count; index += 1) {
    world.spawn({
      posX: config.boundsMin.x + (Math.abs(rng()) % spanX),
      posY: config.boundsMin.y + (Math.abs(rng()) % spanY),
      posZ: config.boundsMin.z + (Math.abs(rng()) % spanZ),
      posW: config.boundsMin.w + (Math.abs(rng()) % spanW),
      velX: (rng() % toFixed(30)) | 0,
      velY: (rng() % toFixed(30)) | 0,
      velZ: (rng() % toFixed(30)) | 0,
      velW: (rng() % toFixed(8)) | 0,
      kind: Math.abs(rng()) % 4,
    });
  }
}

const TICKS = 600;
const POPULATION = 1024;

const acquisition = await acquireGpu(config);

if (!acquisition.available) {
  console.log(`  execution: SKIPPED — ${acquisition.reason}`);
  if (requireGpu) {
    fail('execution: --require-gpu was passed but no WebGPU adapter could be acquired');
  } else {
    console.log(
      '  execution: pass --require-gpu on a GPU-equipped runner to make this failure fatal',
    );
  }
} else {
  const executor = acquisition.executor;
  try {
    const cpuWorld = new WorldState(config.capacity);
    const gpuWorld = new WorldState(config.capacity);
    populate(cpuWorld, 0xfeed_4d17 | 0, POPULATION);
    populate(gpuWorld, 0xfeed_4d17 | 0, POPULATION);

    executor.upload(gpuWorld);

    const cpuChain = new TickHashChain();
    const gpuChain = new TickHashChain();

    for (let index = 0; index < TICKS; index += 1) {
      tick(cpuWorld, config);
      cpuChain.push(cpuWorld.buffer);

      executor.dispatch(1);
      // Hashing every tick means a divergence names the tick it started on.
      // This is deliberately the slow path: it stalls the pipeline once per
      // tick and is a verification tool, never a runtime pattern.
      gpuChain.push(await executor.snapshot());
    }

    const divergence = cpuChain.firstDivergence(gpuChain);
    if (divergence !== -1) {
      fail(
        `execution: CPU and GPU diverged at tick ${divergence} — ` +
          `CPU ${formatHash(cpuChain.ticks[divergence]!)}, GPU ${formatHash(gpuChain.ticks[divergence]!)}`,
      );
    } else {
      console.log(
        `  execution: ${TICKS} ticks x ${POPULATION} entities bit-identical, ` +
          `chained digest ${formatHash(cpuChain.digest)}`,
      );
    }
  } finally {
    executor.destroy();
  }
}

if (failures.length > 0) {
  console.error(`verify-parity: FAIL — ${failures.length} violations`);
  for (const detail of failures.slice(0, 20)) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-parity: PASS');
