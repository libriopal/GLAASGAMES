// engine/verify/verify-game.ts
// The game rules, and the one property that makes this a 4D game rather than a
// 3D game with an extra number attached.

import { fromFixed, toFixed } from '../math/fixed.js';
import { loadSimConfig } from '../sim/config.js';
import { Game, NO_INPUT, nearestTarget } from '../sim/game.js';
import { tick } from '../sim/kernel.js';
import {
  ENTITY_STRIDE,
  FLAG_ALIVE,
  FLAG_COLLECTED,
  KIND_DRIFTER,
  KIND_PLAYER,
  KIND_TARGET,
  OFFSET_FLAGS,
  OFFSET_POS_X,
  OFFSET_VEL_X,
  WorldState,
} from '../sim/state.js';

const config = loadSimConfig();
const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

const centre = {
  x: (config.boundsMin.x + config.boundsMax.x) >> 1,
  y: (config.boundsMin.y + config.boundsMax.y) >> 1,
  z: (config.boundsMin.z + config.boundsMax.z) >> 1,
  w: (config.boundsMin.w + config.boundsMax.w) >> 1,
};

function spawnTarget(world: WorldState, at: { x: number; y: number; z: number; w: number }): number {
  return world.spawn({
    posX: at.x, posY: at.y, posZ: at.z, posW: at.w,
    velX: 0, velY: 0, velZ: 0, velW: 0,
    kind: KIND_TARGET,
  });
}

// ---------------------------------------------------------------------------
// 1. THE DEFINING PROPERTY: w separation defeats collection.
//    A target at the player's exact x, y and z must NOT be collectable when it
//    sits far enough away along w. If this fails the fourth dimension is
//    decorative and the game is a 3D game wearing a costume.
// ---------------------------------------------------------------------------
{
  const world = new WorldState(16);
  const wOffset = config.collectRadius * 2; // comfortably outside the radius

  const separated = spawnTarget(world, { ...centre, w: centre.w + wOffset });
  const coincident = spawnTarget(world, centre);

  const game = new Game(config);
  game.begin(world);
  game.advance(world, NO_INPUT);

  ok(game.state.collected === 1,
    `w separation: expected exactly the coincident target collected, got ${game.state.collected}`);

  // Now run the simulation so the shader-side rule marks flags, and confirm it
  // agrees with the host about which target survived.
  tick(world, config, game.state.player);

  const separatedAlive =
    (world.buffer[separated * ENTITY_STRIDE + OFFSET_FLAGS]! & FLAG_ALIVE) !== 0;
  const coincidentCollected =
    (world.buffer[coincident * ENTITY_STRIDE + OFFSET_FLAGS]! & FLAG_COLLECTED) !== 0;

  ok(separatedAlive,
    'w separation: the target offset along w was collected — 4D distance is not being applied');
  ok(coincidentCollected,
    'w separation: the coincident target was not marked collected by the kernel');

  console.log(
    `  w-separation: a target ${fromFixed(wOffset).toFixed(1)} away along w survives while a ` +
      'coincident one is taken — the fourth dimension is load-bearing');
}

// ---------------------------------------------------------------------------
// 2. Moving along w closes a gap nothing else can close.
// ---------------------------------------------------------------------------
{
  const world = new WorldState(16);
  spawnTarget(world, { ...centre, w: centre.w + config.collectRadius * 2 });

  const game = new Game(config);
  game.begin(world);

  // Push in x, y, z as hard as possible. It cannot help.
  for (let i = 0; i < 120; i += 1) {
    game.advance(world, { x: 65536, y: 65536, z: 65536, w: 0 });
  }
  ok(game.state.collected === 0,
    'w travel: 3D movement collected a target separated along w');

  // Return to centre, then travel along w alone.
  const backHome = new WorldState(16);
  spawnTarget(backHome, { ...centre, w: centre.w + config.collectRadius * 2 });
  const game2 = new Game(config);
  game2.begin(backHome);
  let ticksToReach = 0;
  for (let i = 0; i < 600 && game2.state.phase === 'playing'; i += 1) {
    game2.advance(backHome, { x: 0, y: 0, z: 0, w: 65536 });
    ticksToReach += 1;
  }
  ok(game2.state.phase === 'won',
    'w travel: moving along w alone failed to reach a target separated only along w');
  console.log(`  w-travel: reached in ${ticksToReach} ticks by moving through w and nothing else`);
}

// ---------------------------------------------------------------------------
// 3. Determinism: identical inputs produce an identical game, tick for tick.
//
//    Two earlier versions of this test passed while proving nothing. The first
//    had an operator-precedence bug that emitted no input at all. The second
//    cycled each axis through -1, 0, +1 on a period of 3 — over 900 ticks, a
//    multiple of 3, the player returned to exactly where it started. A test
//    whose subject never moves is not a determinism test, so the assertions
//    below now require observable motion and a non-zero score.
// ---------------------------------------------------------------------------
{
  const build = (): { world: WorldState; game: Game } => {
    const world = new WorldState(256);
    let s = 0x9e37_79b9 | 0;
    const rng = (): number => { s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0; return s; };
    // Clustered near the start rather than scattered across the whole world:
    // this test is about reproducibility, not about search difficulty, and a
    // run that collects nothing exercises none of the collection path.
    const near = (mid: number, spread: number): number =>
      mid + (rng() % spread);
    for (let i = 0; i < config.targetCount; i += 1) {
      spawnTarget(world, {
        x: near(centre.x, toFixed(14)),
        y: near(centre.y, toFixed(14)),
        z: near(centre.z, toFixed(14)),
        w: near(centre.w, toFixed(5)),
      });
    }
    const game = new Game(config);
    game.begin(world);
    return { world, game };
  };

  // A seeded walk. Deterministic by construction, and unlike a fixed cycle it
  // does not return to the origin on a schedule.
  const makeInput = (seed: number) => {
    let s = seed | 0;
    return (): { x: number; y: number; z: number; w: number } => {
      const step = (): number => {
        s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
        return ((Math.abs(s) % 3) - 1) * 65536;
      };
      return { x: step(), y: step(), z: step(), w: step() };
    };
  };

  const a = build();
  const b = build();
  const inputA = makeInput(0x5eed_1234 | 0);
  const inputB = makeInput(0x5eed_1234 | 0);

  let maxExcursion = 0;
  for (let i = 0; i < 900; i += 1) {
    a.game.advance(a.world, inputA());
    tick(a.world, config, a.game.state.player);
    b.game.advance(b.world, inputB());
    tick(b.world, config, b.game.state.player);

    const p = a.game.state.player;
    const d = Math.hypot(
      fromFixed(p.x - centre.x), fromFixed(p.y - centre.y),
      fromFixed(p.z - centre.z), fromFixed(p.w - centre.w));
    if (d > maxExcursion) maxExcursion = d;
  }

  const pa = a.game.state.player;
  const pb = b.game.state.player;
  ok(pa.x === pb.x && pa.y === pb.y && pa.z === pb.z && pa.w === pb.w,
    'determinism: identical input scripts produced different player positions');
  ok(a.game.state.collected === b.game.state.collected,
    `determinism: scores diverged (${a.game.state.collected} vs ${b.game.state.collected})`);
  // Guards against the two ways this test has already managed to pass vacuously.
  ok(maxExcursion > 1,
    `determinism: player never travelled further than ${maxExcursion.toFixed(3)} — input is inert`);
  ok(a.game.state.collected > 0,
    'determinism: nothing was collected in 900 ticks — the collection path is untested');

  console.log(
    `  determinism: 900 ticks of a seeded walk, max excursion ${maxExcursion.toFixed(2)}, ` +
      `both runs ${a.game.state.collected}/${a.game.state.total} collected at identical positions`);
}

// ---------------------------------------------------------------------------
// 4. The player is never moved by physics, and the world is bounded.
// ---------------------------------------------------------------------------
{
  const world = new WorldState(32);
  const playerSlot = world.spawn({
    posX: centre.x, posY: centre.y, posZ: centre.z, posW: centre.w,
    velX: toFixed(50), velY: toFixed(50), velZ: toFixed(50), velW: toFixed(50),
    kind: KIND_PLAYER,
  });
  const drifterSlot = world.spawn({
    posX: centre.x, posY: centre.y, posZ: centre.z, posW: centre.w,
    velX: 0, velY: 0, velZ: 0, velW: 0,
    kind: KIND_DRIFTER,
  });

  const before = world.buffer[playerSlot * ENTITY_STRIDE + OFFSET_POS_X]!;
  for (let i = 0; i < 300; i += 1) tick(world, config);
  const after = world.buffer[playerSlot * ENTITY_STRIDE + OFFSET_POS_X]!;

  ok(before === after,
    'player kind: the tick moved a KIND_PLAYER entity despite a large velocity');
  ok(world.buffer[drifterSlot * ENTITY_STRIDE + OFFSET_VEL_X + 1] !== 0,
    'drifter kind: gravity did not act on a KIND_DRIFTER entity');
  console.log('  kinds: player is inert under physics, drifter is not');
}

// ---------------------------------------------------------------------------
// 5. The player cannot leave the world, on any axis including w.
// ---------------------------------------------------------------------------
{
  const world = new WorldState(8);
  // Deliberately in the far corner. A target at the player's start is collected
  // on the first tick, the game is immediately won, and every later advance
  // returns early — which previously made this test measure one tick of travel
  // and still pass.
  spawnTarget(world, {
    x: config.boundsMin.x, y: config.boundsMin.y,
    z: config.boundsMin.z, w: config.boundsMin.w,
  });
  const game = new Game(config);
  game.begin(world);
  ok(game.state.phase === 'playing', 'bounds: game was already won before the test began');
  for (let i = 0; i < 2000; i += 1) {
    game.advance(world, { x: 65536, y: 65536, z: 65536, w: 65536 });
  }
  const p = game.state.player;
  ok(p.x <= config.boundsMax.x && p.y <= config.boundsMax.y &&
     p.z <= config.boundsMax.z && p.w <= config.boundsMax.w,
    'bounds: the player escaped the world by holding a direction');
  console.log(`  bounds: player clamped at w=${fromFixed(p.w).toFixed(2)} (max ${fromFixed(config.boundsMax.w)})`);
}

// ---------------------------------------------------------------------------
// 6. The nearest-target readout separates visible distance from w distance.
// ---------------------------------------------------------------------------
{
  const world = new WorldState(8);
  spawnTarget(world, { ...centre, w: centre.w + config.collectRadius * 3 });
  const near = nearestTarget(world, centre);
  ok(near !== null, 'readout: no target found when one exists');
  if (near !== null) {
    ok(Math.abs(near.spatial) < 0.001,
      `readout: reported ${near.spatial.toFixed(3)} spatial distance for a target offset only along w`);
    ok(Math.abs(near.alongW) > 1,
      `readout: reported ${near.alongW.toFixed(3)} along w for a clearly separated target`);
    console.log(
      `  readout: target reads 0.00 away in space but ${near.alongW.toFixed(2)} along w — ` +
        'the disorientation is explained rather than hidden');
  }
}

// ---------------------------------------------------------------------------
// 7. REGRESSION: the most distant target must not collect itself.
//
//    The collection rule sums four squared per-axis deltas. For a target at the
//    opposite corner of the world each square approaches 2^31, the sum overflows
//    i32, `| 0` wraps it negative, and a negative total compares as "inside the
//    radius" — so the FARTHEST target in the world was collected instantly.
//    Found by the bounds test above stopping after 92 of 2000 ticks.
// ---------------------------------------------------------------------------
{
  const corners: { x: number; y: number; z: number; w: number }[] = [
    { x: config.boundsMin.x, y: config.boundsMin.y, z: config.boundsMin.z, w: config.boundsMin.w },
    { x: config.boundsMax.x, y: config.boundsMax.y, z: config.boundsMax.z, w: config.boundsMax.w },
    { x: config.boundsMin.x, y: config.boundsMax.y, z: config.boundsMin.z, w: config.boundsMax.w },
    { x: config.boundsMax.x, y: config.boundsMin.y, z: config.boundsMax.z, w: config.boundsMin.w },
  ];

  let wronglyCollected = 0;
  for (const corner of corners) {
    const world = new WorldState(8);
    const slot = spawnTarget(world, corner);
    const game = new Game(config);
    game.begin(world);
    game.advance(world, NO_INPUT);
    tick(world, config, game.state.player);

    if (game.state.collected !== 0) wronglyCollected += 1;
    const stillAlive = (world.buffer[slot * ENTITY_STRIDE + OFFSET_FLAGS]! & FLAG_ALIVE) !== 0;
    ok(stillAlive,
      `overflow: the kernel collected a target at a far corner (${fromFixed(corner.x)}, ` +
        `${fromFixed(corner.y)}, ${fromFixed(corner.z)}, ${fromFixed(corner.w)})`);
  }
  ok(wronglyCollected === 0,
    `overflow: ${wronglyCollected} of ${corners.length} far-corner targets collected themselves`);
  console.log(`  overflow: all ${corners.length} far-corner targets survive — squared deltas no longer wrap`);
}

if (failures.length > 0) {
  console.error(`verify-game: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-game: PASS — w is load-bearing, rules are deterministic, kinds and bounds hold');
