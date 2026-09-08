// engine/sim/world-gen.ts — composes a world from a seed.
//
// This was host code in web/main.ts. It moved here because a replay that cannot
// be reconstructed outside the browser is not a replay: to check that a recorded
// run reproduces, the checker must build the identical world from the identical
// seed, and it cannot do that if the generator only exists in a page.
//
// Every value is derived from the seed by integer arithmetic. Math.random is
// banned tree-wide, and more practically a reproducible world is the whole
// point — the same seed must give the same digest in a browser, in Node and in
// CI, on any device.

import type { SimConfig } from './config-parse.js';
import { KIND_DRIFTER, KIND_PLAYER, KIND_TARGET, type WorldState } from './state.js';

const FIXED_ONE = 65536;

/**
 * Seeded xorshift32.
 *
 * Returns a signed i32, which is why callers take Math.abs before a modulo —
 * a negative remainder would place entities outside the bounds rather than
 * inside them.
 */
export function makeRng(seed: number): () => number {
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

/**
 * Composes the world: the player first, then targets, then ambient drifters.
 *
 * The player takes slot 0 deliberately — the host rewrites that record every
 * tick, and a fixed slot makes it a constant-offset write rather than a lookup.
 * Drifters come last so that exhausting capacity costs scenery rather than
 * anything the game depends on.
 *
 * The order of the rng() calls IS the world. Reordering these spawns, or adding
 * a draw between them, changes every subsequent entity and therefore every
 * recorded run. Treat this function as a wire format, not as ordinary code.
 */
export function populate(
  world: WorldState,
  config: SimConfig,
  seed: number,
  drifters: number,
): number {
  const rng = makeRng(seed);
  const span = (lo: number, hi: number): number => lo + (Math.abs(rng()) % (hi - lo));

  const playerSlot = world.spawn({
    posX: (config.boundsMin.x + config.boundsMax.x) >> 1,
    posY: (config.boundsMin.y + config.boundsMax.y) >> 1,
    posZ: (config.boundsMin.z + config.boundsMax.z) >> 1,
    posW: (config.boundsMin.w + config.boundsMax.w) >> 1,
    velX: 0, velY: 0, velZ: 0, velW: 0,
    kind: KIND_PLAYER,
  });

  for (let i = 0; i < config.targetCount; i += 1) {
    world.spawn({
      posX: span(config.boundsMin.x, config.boundsMax.x),
      posY: span(config.boundsMin.y, config.boundsMax.y),
      posZ: span(config.boundsMin.z, config.boundsMax.z),
      // Targets use the full w extent. A target you can see but cannot reach
      // until you travel through w is the entire point of the game.
      posW: span(config.boundsMin.w, config.boundsMax.w),
      velX: 0, velY: 0, velZ: 0, velW: 0,
      kind: KIND_TARGET,
    });
  }

  for (let i = 0; i < drifters; i += 1) {
    world.spawn({
      posX: span(config.boundsMin.x, config.boundsMax.x),
      posY: span(config.boundsMin.y, config.boundsMax.y),
      posZ: span(config.boundsMin.z, config.boundsMax.z),
      posW: span(config.boundsMin.w, config.boundsMax.w),
      velX: rng() % (24 * FIXED_ONE),
      velY: rng() % (24 * FIXED_ONE),
      velZ: rng() % (24 * FIXED_ONE),
      velW: rng() % (7 * FIXED_ONE),
      kind: KIND_DRIFTER,
    });
  }
  return playerSlot;
}
