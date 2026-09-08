// engine/verify/verify-replay.ts
// A recorded run reproduces exactly — and a tampered one does not.
//
// THE NEGATIVE CONTROLS ARE THE POINT OF THIS FILE. An oracle that has only
// ever been seen to pass is not evidence, because a check that cannot fail
// proves nothing about the thing it claims to check. Every positive assertion
// here is paired with a deliberately broken input that must be REJECTED, and
// the run fails if a broken input slips through. That pairing is what makes
// "replays are verifiable" a measured property rather than a slogan.

import { fromFixed, toFixed } from '../math/fixed.js';
import { loadSimConfig } from '../sim/config.js';
import { formatHash } from '../sim/hash.js';
import type { Input } from '../sim/game.js';
import {
  type InputRun,
  type PlayerReadout,
  type Replay,
  recordRun,
  replayTicks,
  verifyReplay,
} from '../sim/replay.js';
import {
  ENTITY_STRIDE,
  FLAG_ALIVE,
  KIND_TARGET,
  OFFSET_FLAGS,
  OFFSET_KIND,
  OFFSET_POS_X,
  WorldState,
} from '../sim/state.js';

const config = loadSimConfig();
const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

const SEED = 0x5eed4d;
const DRIFTERS = 96;
const CAPACITY = 512;
const TICKS = 1800; // 30 seconds at 60 Hz

/**
 * A scripted pilot that actually plays: it steers toward the nearest live
 * target, in all four axes.
 *
 * The first version of this walked a fixed pattern and collected nothing across
 * 1,800 ticks — it reproduced perfectly and proved nothing, which is exactly how
 * two earlier tests in this repository passed vacuously. A replay test whose run
 * never scores cannot show that scoring replays.
 *
 * Steering is a sign test per axis, not a normalised direction: full deflection
 * toward the target on each axis that is not already aligned. That is what a
 * player holding a d-pad does, and it keeps the policy in integers.
 */
function pilot(_index: number, world: WorldState, player: PlayerReadout): Input {
  const buffer = world.buffer;
  let bestBase = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let slot = 0; slot < world.capacity; slot += 1) {
    const base = slot * ENTITY_STRIDE;
    if ((buffer[base + OFFSET_FLAGS]! & FLAG_ALIVE) === 0) continue;
    if (buffer[base + OFFSET_KIND] !== KIND_TARGET) continue;

    // Manhattan distance in Q16.16, scaled down before summing so four axes at
    // full extent cannot overflow i32 the way the squared form once did.
    const score =
      Math.abs((buffer[base + OFFSET_POS_X]! - player.x) >> 8) +
      Math.abs((buffer[base + OFFSET_POS_X + 1]! - player.y) >> 8) +
      Math.abs((buffer[base + OFFSET_POS_X + 2]! - player.z) >> 8) +
      Math.abs((buffer[base + OFFSET_POS_X + 3]! - player.w) >> 8);
    if (score < bestScore) {
      bestScore = score;
      bestBase = base;
    }
  }
  if (bestBase < 0) return { x: 0, y: 0, z: 0, w: 0 };

  const unit = toFixed(1);
  const steer = (target: number, at: number): number =>
    target > at ? unit : target < at ? -unit : 0;

  return {
    x: steer(buffer[bestBase + OFFSET_POS_X]!, player.x),
    y: steer(buffer[bestBase + OFFSET_POS_X + 1]!, player.y),
    z: steer(buffer[bestBase + OFFSET_POS_X + 2]!, player.z),
    w: steer(buffer[bestBase + OFFSET_POS_X + 3]!, player.w),
  };
}

// --- 1. A recorded run reproduces ------------------------------------------
const original = recordRun(config, SEED, DRIFTERS, CAPACITY, TICKS, pilot);
{
  const verdict = verifyReplay(original, config);
  ok(verdict.ok, `a freshly recorded run failed its own verification: ${verdict.mismatches.join('; ')}`);
  console.log(
    `  reproduces: ${replayTicks(original)} ticks, ${original.runs.length} input runs, ` +
      `digest ${formatHash(original.claimed.digest)}, ` +
      `collected ${original.claimed.collected}/${original.claimed.total}`,
  );
}

// The run has to actually do something. A pilot that never moves and never
// collects would reproduce perfectly and mean nothing.
ok(original.claimed.ticks === TICKS, `run stopped early at ${original.claimed.ticks} of ${TICKS} ticks`);
ok(original.claimed.collected > 0,
  'the scripted pilot collected nothing — a run that never scores cannot show that scoring replays');
ok(original.runs.length > 4,
  `only ${original.runs.length} input runs — the pilot is barely moving, so the input stream is untested`);

// --- 2. Recording twice gives the same recording ----------------------------
{
  const again = recordRun(config, SEED, DRIFTERS, CAPACITY, TICKS, pilot);
  ok(again.claimed.digest === original.claimed.digest,
    `two recordings of the same script disagree: ${formatHash(original.claimed.digest)} vs ` +
      `${formatHash(again.claimed.digest)}`);
  ok(JSON.stringify(again.runs) === JSON.stringify(original.runs),
    'two recordings of the same script produced different input streams');
  console.log('  stable: recording the same script twice gives a byte-identical replay');
}

// --- 3. NEGATIVE CONTROLS: tampering must be caught -------------------------
// Each case takes the good replay, breaks one thing, and requires rejection.
// If any of these verifies, the oracle is decorative and the suite says so.

function mustReject(name: string, mutate: (replay: Replay) => Replay): void {
  const tampered = mutate(original);
  let verdict;
  try {
    verdict = verifyReplay(tampered, config);
  } catch (error) {
    // A thrown error is a rejection; a replay this build cannot execute is not
    // a replay it accepts.
    console.log(`  rejects ${name}: threw ${(error as Error).message.slice(0, 60)}`);
    return;
  }
  if (verdict.ok) {
    fail(`NEGATIVE CONTROL FAILED — a replay with ${name} verified as genuine`);
  } else {
    console.log(`  rejects ${name}: ${verdict.mismatches[0]}`);
  }
}

mustReject('an inflated score', (replay) => ({
  ...replay,
  claimed: { ...replay.claimed, collected: replay.claimed.collected + 1 },
}));

mustReject('a forged digest', (replay) => ({
  ...replay,
  claimed: { ...replay.claimed, digest: (replay.claimed.digest ^ 1) >>> 0 },
}));

mustReject('a different seed', (replay) => ({ ...replay, seed: replay.seed + 1 }));

mustReject('a changed drifter count', (replay) => ({ ...replay, drifters: replay.drifters + 1 }));

/**
 * Replaces exactly one tick's x input, leaving the tick count untouched.
 *
 * `magnitude` is always applied TOWARD THE INTERIOR of [-1, 1]. The first
 * attempt at this added a fixed negative delta, and the pilot's first input
 * happened to already sit on the -1.0 rail, so `clampUnit` folded the tamper
 * straight back to -1.0 and the "tampered" replay was byte-identical to the
 * honest one. The negative control passed while testing nothing — which is the
 * failure mode this whole file exists to prevent, found in the file itself.
 */
function perturbFirstTick(replay: Replay, magnitude: number): Replay {
  const [first, ...rest] = replay.runs;
  if (!first || first[0] < 2) throw new Error('fixture has no run long enough to split');
  const inward = first[1] > 0 ? -magnitude : magnitude;
  const perturbed: InputRun[] = [
    [1, (first[1] + inward) | 0, first[2], first[3], first[4]],
    [first[0] - 1, first[1], first[2], first[3], first[4]],
    ...rest,
  ];
  return { ...replay, runs: perturbed };
}

mustReject('one perturbed input tick', (replay) => perturbFirstTick(replay, toFixed(2)));

mustReject('a truncated input stream', (replay) => ({
  ...replay,
  runs: replay.runs.slice(0, -1),
}));

mustReject('an unknown format version', (replay) => ({ ...replay, format: 999 }));

// --- 4. How small a tamper is detectable? -----------------------------------
// MEASURED, not assumed. The first version of this test asserted that changing
// one input tick by a single Q16.16 unit must move the digest. It does not, and
// the reason is not a weakness in the digest: one unit of input is 1/65536 of
// full deflection, and after multiplication by the per-tick step it truncates to
// zero displacement. The tampered run really is the same run.
//
// So the honest question is not "is one unit caught" but "what is the smallest
// change that is observable at all", and that number belongs in the output where
// it can be watched for regression. Anything at or above it must be rejected;
// anything below it is genuinely indistinguishable and no checker can do better.
{
  let floor = 0;
  for (let delta = 1; delta <= toFixed(2); delta *= 2) {
    if (verifyReplay(perturbFirstTick(original, delta), config).ok === false) {
      floor = delta;
      break;
    }
  }
  ok(floor > 0,
    'no single-tick input change up to full deflection was detectable — the digest ' +
      'does not bind the input stream at all');
  ok(floor <= toFixed(0.25),
    `the smallest detectable single-tick tamper is ${fromFixed(floor).toFixed(4)} of full ` +
      'deflection, which is large enough that meaningful input edits could pass unnoticed');
  console.log(
    `  resolution: smallest detectable single-tick input tamper is ${floor} Q16.16 units ` +
      `(${fromFixed(floor).toFixed(5)} of full deflection); below that the run is genuinely identical`,
  );
}

// A perturbed run is still a valid run, just a different one. This distinguishes
// "tampering is caught" from "anything unusual is rejected" — a checker that
// failed everything would pass every negative control above and be useless.
{
  // Steer the opposite way for the first second. A single tick is not enough:
  // the pilot is a closed-loop bang-bang controller with a fixed step, so one
  // tick of wrong direction is corrected on the next tick and the trajectory
  // rejoins the original exactly.
  const perturbedPilot = (index: number, world: WorldState, player: PlayerReadout): Input => {
    const base = pilot(index, world, player);
    return index < 60 ? { ...base, x: (-base.x) | 0 } : base;
  };
  const honest = recordRun(config, SEED, DRIFTERS, CAPACITY, TICKS, perturbedPilot);
  const verdict = verifyReplay(honest, config);
  ok(verdict.ok, `an honestly recorded perturbed run was rejected: ${verdict.mismatches.join('; ')}`);
  ok(honest.claimed.digest !== original.claimed.digest,
    'the perturbed run produced the original digest, so the fixture is not actually different');
  console.log(
    `  discriminating: an honest but different run verifies, with digest ` +
      `${formatHash(honest.claimed.digest)} != ${formatHash(original.claimed.digest)}`,
  );
}

// --- 5. Serialisation survives a round trip ---------------------------------
// A replay that cannot be written down and read back is not shareable, and an
// unshareable replay cannot be verified by anyone but its author.
{
  const json = JSON.stringify(original);
  const restored = JSON.parse(json) as Replay;
  const verdict = verifyReplay(restored, config);
  ok(verdict.ok, `a JSON round trip broke the replay: ${verdict.mismatches.join('; ')}`);
  console.log(`  portable: ${json.length} bytes of JSON for ${TICKS} ticks, verifies after a round trip`);
}

if (failures.length > 0) {
  console.error(`verify-replay: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-replay: PASS — runs reproduce, tampering is rejected, replays are portable');
