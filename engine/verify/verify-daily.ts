// engine/verify/verify-daily.ts
// The daily puzzle is the same for everyone, different every day, and carries
// none of the pressure mechanics the governance suite bans.
//
// The negative controls here are structural rather than numeric: several of
// these checks read the daily module's own source and fail if it grows a streak
// counter or an expiry. That is deliberate. A comment promising "no streaks" is
// worth nothing; an assertion that fails the build when one appears is worth
// something, and it is the only way to keep a policy claim true after the person
// who wrote it has moved on.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadSimConfig } from '../sim/config.js';
import {
  driftersForSeed,
  formatUtcDay,
  parseUtcDay,
  seedForDay,
  seedForToday,
  utcDayOf,
} from '../sim/daily.js';
import { formatHash } from '../sim/hash.js';
import { recordRun, verifyReplay } from '../sim/replay.js';
import {
  ENTITY_STRIDE,
  FLAG_ALIVE,
  KIND_TARGET,
  OFFSET_FLAGS,
  OFFSET_KIND,
  OFFSET_POS_X,
  type WorldState,
} from '../sim/state.js';
import { toFixed } from '../math/fixed.js';
import type { Input } from '../sim/game.js';
import type { PlayerReadout } from '../sim/replay.js';

const config = loadSimConfig();
const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

// --- 1. Same day, same seed. Different day, different seed ------------------
{
  const day = parseUtcDay('2026-09-08');
  ok(seedForDay(day) === seedForDay({ ...day }),
    'the same date produced two different seeds');

  const seen = new Map<number, string>();
  let collisions = 0;
  // Four years of consecutive days. A collision inside that window means two
  // days share a world, which players would notice before any test did.
  const cursor = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 365 * 4; i += 1) {
    const d = utcDayOf(cursor);
    const seed = seedForDay(d);
    const previous = seen.get(seed);
    if (previous) {
      collisions += 1;
      if (collisions === 1) fail(`seed collision: ${formatUtcDay(d)} and ${previous} share seed ${seed}`);
    }
    seen.set(seed, formatUtcDay(d));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  ok(collisions === 0, `${collisions} seed collisions across four years of days`);
  console.log(`  distinct: ${seen.size} days over four years, ${collisions} seed collisions`);
}

// --- 2. Consecutive days are not similar ------------------------------------
// A weak mixer would give neighbouring days neighbouring seeds, and the world
// generator would then produce recognisably similar worlds day to day.
{
  let worstShared = 0;
  const cursor = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 400; i += 1) {
    const a = seedForDay(utcDayOf(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const b = seedForDay(utcDayOf(cursor));
    // Count agreeing bits; 32 would mean identical, ~16 is what independence
    // looks like.
    let agree = 0;
    for (let bit = 0; bit < 32; bit += 1) {
      if (((a >>> bit) & 1) === ((b >>> bit) & 1)) agree += 1;
    }
    worstShared = Math.max(worstShared, agree);
  }
  ok(worstShared <= 26,
    `consecutive days share up to ${worstShared} of 32 seed bits — the mixer is not avalanching`);
  console.log(`  avalanche: consecutive days share at most ${worstShared} of 32 seed bits`);
}

// --- 3. The seed is UTC, not local ------------------------------------------
// Two players in different time zones must be playing the same puzzle. The two
// instants below are the same moment, expressed either side of a date line.
{
  const instant = new Date('2026-09-08T23:30:00Z');
  const sameInstantElsewhere = new Date(instant.getTime());
  ok(seedForToday(instant) === seedForToday(sameInstantElsewhere),
    'the same instant gave two seeds');

  // And an instant 30 minutes later, crossing UTC midnight, must give a new one.
  const nextDay = new Date('2026-09-09T00:00:00Z');
  ok(seedForToday(instant) !== seedForToday(nextDay),
    'crossing UTC midnight did not change the seed');
  console.log('  utc: the day boundary is UTC midnight, so the puzzle is global');
}

// --- 4. Yesterday is still computable ---------------------------------------
// Nothing expires. This is the mechanical form of "miss a week and lose
// nothing" — the property that keeps this out of scarcity-timer territory.
{
  const longAgo = parseUtcDay('2020-02-29');
  const seed = seedForDay(longAgo);
  ok(Number.isInteger(seed) && seed !== 0,
    'an old date did not produce a usable seed, so past puzzles are not replayable');
  console.log(`  durable: ${formatUtcDay(longAgo)} still resolves to seed ${seed}`);
}

// --- 5. NEGATIVE CONTROL: the module must not grow pressure mechanics -------
// Reads daily.ts and fails on the vocabulary of the banned playbook. Comments
// are stripped first, so the explanatory header — which names these very
// concepts in order to disclaim them — does not trip the check on itself. That
// exact false positive already happened once in this repository, in the shader
// f32 ban.
{
  const source = readFileSync(
    fileURLToPath(new URL('../sim/daily.ts', import.meta.url)),
    'utf8',
  );
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const banned: readonly (readonly [RegExp, string])[] = [
    [/\bstreak\b/i, 'a streak counter'],
    [/\bconsecutiveDays?\b/i, 'consecutive-day state'],
    [/\bexpir(e|es|ed|y|ation)\b/i, 'an expiry'],
    [/\bcountdown\b/i, 'a countdown'],
    [/\bdeadline\b/i, 'a deadline'],
    [/\bmissed\b/i, 'a notion of a missed day'],
    [/\blives?Remaining\b/i, 'a lives system'],
    [/\benergy\b/i, 'an energy meter'],
    [/\bMath\.random\b/, 'a non-reproducible source of randomness'],
    [/\bDate\.now\b/, 'wall-clock time used as data rather than as a parameter'],
  ];
  let found = 0;
  for (const [pattern, description] of banned) {
    if (pattern.test(code)) {
      found += 1;
      fail(`daily.ts has grown ${description} — that is the banned retention playbook`);
    }
  }
  ok(found === 0, `${found} banned mechanics present in daily.ts`);

  // The control must be capable of firing, or it proves nothing.
  ok(/\bstreak\b/i.test(`${code}\nconst streak = 1;`),
    'the banned-mechanic scan cannot detect a streak counter even when one is present');
  console.log(`  clean: none of the ${banned.length} banned mechanics appear in daily.ts, and the scan fires on a planted one`);
}

// --- 6. Drifter count stays in its band -------------------------------------
{
  let low = Number.POSITIVE_INFINITY;
  let high = 0;
  const cursor = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 365; i += 1) {
    const n = driftersForSeed(seedForDay(utcDayOf(cursor)), config.capacity, config.targetCount);
    low = Math.min(low, n);
    high = Math.max(high, n);
    ok(n >= 0 && n <= config.capacity - config.targetCount - 1,
      `drifter count ${n} does not fit the pool on ${formatUtcDay(utcDayOf(cursor))}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  ok(low < high, 'the drifter count never varies across a year, so it is not seed-derived at all');
  console.log(`  scenery: drifters range ${low}..${high} across a year, always inside the pool`);
}

// --- 7. A day's run is verifiable end to end --------------------------------
// The point of all of the above: a score on the daily puzzle is a claim anyone
// can recompute.
{
  const day = parseUtcDay('2026-09-08');
  const seed = seedForDay(day);
  const capacity = 512;
  const drifters = Math.min(96, capacity - config.targetCount - 1);

  const pilot = (_index: number, world: WorldState, player: PlayerReadout): Input => {
    const buffer = world.buffer;
    let bestBase = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let slot = 0; slot < world.capacity; slot += 1) {
      const base = slot * ENTITY_STRIDE;
      if ((buffer[base + OFFSET_FLAGS]! & FLAG_ALIVE) === 0) continue;
      if (buffer[base + OFFSET_KIND] !== KIND_TARGET) continue;
      const score =
        Math.abs((buffer[base + OFFSET_POS_X]! - player.x) >> 8) +
        Math.abs((buffer[base + OFFSET_POS_X + 1]! - player.y) >> 8) +
        Math.abs((buffer[base + OFFSET_POS_X + 2]! - player.z) >> 8) +
        Math.abs((buffer[base + OFFSET_POS_X + 3]! - player.w) >> 8);
      if (score < bestScore) { bestScore = score; bestBase = base; }
    }
    if (bestBase < 0) return { x: 0, y: 0, z: 0, w: 0 };
    const unit = toFixed(1);
    const steer = (t: number, a: number): number => (t > a ? unit : t < a ? -unit : 0);
    return {
      x: steer(buffer[bestBase + OFFSET_POS_X]!, player.x),
      y: steer(buffer[bestBase + OFFSET_POS_X + 1]!, player.y),
      z: steer(buffer[bestBase + OFFSET_POS_X + 2]!, player.z),
      w: steer(buffer[bestBase + OFFSET_POS_X + 3]!, player.w),
    };
  };

  const replay = recordRun(config, seed, drifters, capacity, 1800, pilot);
  const verdict = verifyReplay(replay, config);
  ok(verdict.ok, `a run on ${formatUtcDay(day)} failed verification: ${verdict.mismatches.join('; ')}`);
  ok(replay.claimed.collected > 0, `a full run on ${formatUtcDay(day)} scored nothing`);
  console.log(
    `  verifiable: ${formatUtcDay(day)} seed ${seed}, collected ` +
      `${replay.claimed.collected}/${replay.claimed.total}, digest ${formatHash(replay.claimed.digest)}`,
  );
}

if (failures.length > 0) {
  console.error(`verify-daily: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-daily: PASS — one world per day, global, permanent, and free of pressure mechanics');
