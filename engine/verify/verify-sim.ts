// engine/verify/verify-sim.ts
// Physical and structural invariants of the CPU reference executor.
//
// These are the properties the GPU port is later held to. If the reference is
// wrong, parity with it proves nothing, so this pass runs first and must be
// clean before verify-parity means anything.

import { fromFixed, toFixed } from '../math/fixed.js';
import { loadSimConfig } from '../sim/config.js';
import { TickHashChain, formatHash, hashState } from '../sim/hash.js';
import { run, tick } from '../sim/kernel.js';
import {
  ENTITY_STRIDE,
  OFFSET_AGE,
  OFFSET_POS_X,
  OFFSET_VEL_X,
  WorldState,
} from '../sim/state.js';

const config = loadSimConfig();

const failures: string[] = [];
function fail(detail: string): void {
  failures.push(detail);
}

/** Seeded xorshift32 — Math.random is banned tree-wide and unreplayable. */
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

/** Fills a world with a reproducible population. */
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
      velX: (rng() % toFixed(20)) | 0,
      velY: (rng() % toFixed(20)) | 0,
      velZ: (rng() % toFixed(20)) | 0,
      velW: (rng() % toFixed(6)) | 0,
      kind: Math.abs(rng()) % 4,
    });
  }
}

// ---------------------------------------------------------------------------
// 1. Determinism: identical seed, identical trajectory, every tick.
// ---------------------------------------------------------------------------
{
  const TICKS = 2000;
  const first = new WorldState(512);
  const second = new WorldState(512);
  populate(first, 0xa5a5_1234 | 0, 400);
  populate(second, 0xa5a5_1234 | 0, 400);

  const chainA = new TickHashChain();
  const chainB = new TickHashChain();

  for (let index = 0; index < TICKS; index += 1) {
    tick(first, config);
    tick(second, config);
    chainA.push(first.buffer);
    chainB.push(second.buffer);
  }

  const divergence = chainA.firstDivergence(chainB);
  if (divergence !== -1) {
    fail(`determinism: two identically seeded runs diverged at tick ${divergence}`);
  }
  if (chainA.digest !== chainB.digest) {
    fail(`determinism: chained digests differ (${formatHash(chainA.digest)} vs ${formatHash(chainB.digest)})`);
  }
  console.log(
    `  determinism: ${TICKS} ticks x 400 entities, chained digest ${formatHash(chainA.digest)}`,
  );
}

// ---------------------------------------------------------------------------
// 2. Containment: no entity ever escapes the world bounds, on any axis.
// ---------------------------------------------------------------------------
{
  const world = new WorldState(512);
  // Seeded hard: velocities far above the clamp, aimed at the walls, so the
  // boundary response is exercised rather than merely present.
  const rng = makeRng(0x0bad_face | 0);
  for (let index = 0; index < 500; index += 1) {
    world.spawn({
      posX: config.boundsMax.x - 1,
      posY: config.boundsMax.y - 1,
      posZ: config.boundsMin.z + 1,
      posW: config.boundsMax.w - 1,
      velX: Math.abs(rng() % toFixed(500)),
      velY: Math.abs(rng() % toFixed(500)),
      velZ: -Math.abs(rng() % toFixed(500)),
      velW: Math.abs(rng() % toFixed(500)),
      kind: 0,
    });
  }

  const minAxis = [config.boundsMin.x, config.boundsMin.y, config.boundsMin.z, config.boundsMin.w];
  const maxAxis = [config.boundsMax.x, config.boundsMax.y, config.boundsMax.z, config.boundsMax.w];
  const axisNames = ['x', 'y', 'z', 'w'];
  let escapes = 0;

  for (let step = 0; step < 3000; step += 1) {
    tick(world, config);
    for (let slot = 0; slot < world.capacity; slot += 1) {
      if (!world.isAlive(slot)) continue;
      const base = slot * ENTITY_STRIDE;
      for (let axis = 0; axis < 4; axis += 1) {
        const position = world.buffer[base + OFFSET_POS_X + axis]!;
        if (position < minAxis[axis]! || position > maxAxis[axis]!) {
          escapes += 1;
          if (escapes <= 3) {
            fail(
              `containment: slot ${slot} left the world on ${axisNames[axis]} at tick ${step} ` +
                `(${fromFixed(position).toFixed(3)} outside [${fromFixed(minAxis[axis]!)}, ${fromFixed(maxAxis[axis]!)}])`,
            );
          }
        }
      }
    }
  }
  console.log(`  containment: 3000 ticks x 500 wall-seeking entities, ${escapes} escapes`);
}

// ---------------------------------------------------------------------------
// 3. Stability: with restitution < 1 and damping < 1 the system cannot pump
//    energy. Peak speed must stay bounded across a long run.
// ---------------------------------------------------------------------------
{
  const world = new WorldState(256);
  populate(world, 0x57ab1e | 0, 200);

  let peakSpeedSquared = 0;
  const TICKS = 10_000;
  for (let step = 0; step < TICKS; step += 1) {
    tick(world, config);
    for (let slot = 0; slot < world.capacity; slot += 1) {
      if (!world.isAlive(slot)) continue;
      const base = slot * ENTITY_STRIDE;
      let speedSquared = 0;
      for (let axis = 0; axis < 4; axis += 1) {
        const component = fromFixed(world.buffer[base + OFFSET_VEL_X + axis]!);
        speedSquared += component * component;
      }
      if (speedSquared > peakSpeedSquared) peakSpeedSquared = speedSquared;
    }
  }

  const peakSpeed = Math.sqrt(peakSpeedSquared);
  const ceiling = fromFixed(config.maxSpeed);
  // One tick of gravity may be added after the clamp and before the next clamp,
  // so the observed peak is allowed a small margin over the configured ceiling.
  const allowed = ceiling * 1.05 + 1;
  if (peakSpeed > allowed) {
    fail(`stability: peak speed ${peakSpeed.toFixed(3)} exceeds clamp ${ceiling} (+5% margin)`);
  }
  console.log(
    `  stability: ${TICKS} ticks, peak speed ${peakSpeed.toFixed(3)} against clamp ${ceiling}`,
  );
}

// ---------------------------------------------------------------------------
// 4. Slot pool: spawn/despawn must round-trip and must not leak slots.
// ---------------------------------------------------------------------------
{
  const world = new WorldState(64);
  const slots: number[] = [];
  for (let index = 0; index < 64; index += 1) {
    const slot = world.spawn({
      posX: 0, posY: 0, posZ: 0, posW: 0,
      velX: 0, velY: 0, velZ: 0, velW: 0,
      kind: 1,
    });
    if (slot < 0) fail(`pool: spawn ${index} failed while capacity remained`);
    slots.push(slot);
  }
  if (world.count !== 64) fail(`pool: expected 64 live, got ${world.count}`);

  // Exhausted pool degrades to -1 rather than throwing.
  const overflow = world.spawn({
    posX: 0, posY: 0, posZ: 0, posW: 0,
    velX: 0, velY: 0, velZ: 0, velW: 0,
    kind: 1,
  });
  if (overflow !== -1) fail(`pool: expected -1 past capacity, got ${overflow}`);

  // A despawned world must hash identically to a fresh one — proving despawn
  // clears the record rather than merely clearing the alive bit.
  for (const slot of slots) world.despawn(slot);
  if (world.count !== 0) fail(`pool: expected 0 live after full despawn, got ${world.count}`);

  const pristine = new WorldState(64);
  if (hashState(world.buffer) !== hashState(pristine.buffer)) {
    fail('pool: fully despawned world does not hash equal to a fresh world — stale record data');
  }

  // Double despawn is a no-op, not a corruption or a duplicated free-list entry.
  world.despawn(slots[0]!);
  if (world.count !== 0) fail(`pool: double despawn changed live count to ${world.count}`);
  console.log('  pool: 64 spawn/despawn round-trips, overflow and double-free handled');
}

// ---------------------------------------------------------------------------
// 5. Age advances exactly once per tick, for live entities only.
// ---------------------------------------------------------------------------
{
  const world = new WorldState(16);
  const slot = world.spawn({
    posX: 0, posY: 0, posZ: 0, posW: 0,
    velX: 0, velY: 0, velZ: 0, velW: 0,
    kind: 0,
  });
  run(world, config, 250);
  const age = world.buffer[slot * ENTITY_STRIDE + OFFSET_AGE];
  if (age !== 250) fail(`age: expected 250 after 250 ticks, got ${age}`);

  // A free slot must remain entirely zero — the tick loop must not touch it.
  const freeBase = 15 * ENTITY_STRIDE;
  for (let offset = 0; offset < ENTITY_STRIDE; offset += 1) {
    if (world.buffer[freeBase + offset] !== 0) {
      fail(`age: tick wrote to free slot 15 at offset ${offset}`);
      break;
    }
  }
  console.log('  age: advances once per tick, free slots untouched');
}

if (failures.length > 0) {
  console.error(`verify-sim: FAIL — ${failures.length} violations`);
  for (const detail of failures.slice(0, 20)) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-sim: PASS — determinism, containment, stability, pool and age invariants hold');
