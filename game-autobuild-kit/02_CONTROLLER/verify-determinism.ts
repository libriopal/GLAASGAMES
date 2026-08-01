/**
 * Determinism verification for the Execution Domain deterministic core.
 *
 * Proves the GLASSBOX Layer-2/3 guarantee operationally:
 *   1. record -> replay with the SAME entropy log yields an IDENTICAL trace;
 *   2. the single-item optimization saves entropy draws vs. selection points;
 *   3. any divergence (truncated log) is detected and raises immediately.
 *
 * Run: npm run verify:determinism   (or: npx tsx 02_CONTROLLER/verify-determinism.ts)
 * Exit code 0 = all invariants held.
 */

import {
  RecordingEntropySource,
  ReplayingEntropySource,
  ReplayDivergenceError,
} from "./prng.ts";
import { CooperativeScheduler, type TaskSpec, type YieldSignal } from "./scheduler.ts";

function makeTasks(): TaskSpec[] {
  const mk = (id: string, steps: number): TaskSpec => ({
    id,
    body: function* (): Generator<YieldSignal, void, void> {
      for (let i = 0; i < steps; i++) {
        yield { kind: "checkpoint", log: `step${i}` };
      }
    },
  });
  // Uneven step counts guarantee single-eligible-task rounds near the end.
  return [mk("alpha", 3), mk("bravo", 2), mk("charlie", 4), mk("delta", 1)];
}

const SEED = 0x9e3779b9;
let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

// (1) Record.
const rec = new RecordingEntropySource(SEED);
const runA = new CooperativeScheduler(rec).run(makeTasks());
const entropyLog = rec.log();

// (2) Replay with the same log.
const rep = new ReplayingEntropySource(entropyLog);
const runB = new CooperativeScheduler(rep).run(makeTasks());

const identical = JSON.stringify(runA.trace) === JSON.stringify(runB.trace);
ok(identical, "record -> replay produces an identical execution trace (zero divergence)");
ok(runA.pickCalls === runB.pickCalls, `pick-call counts match (${runA.pickCalls})`);
ok(
  entropyLog.length < runA.pickCalls,
  `single-item optimization saved entropy: ${entropyLog.length} draws < ${runA.pickCalls} selection points`,
);

// (3) Divergence detection: truncate the recorded log by one real draw.
let detected = false;
try {
  const bad = new ReplayingEntropySource(entropyLog.slice(0, entropyLog.length - 1));
  new CooperativeScheduler(bad).run(makeTasks());
} catch (e) {
  detected = e instanceof ReplayDivergenceError;
}
ok(detected, "a truncated entropy log is detected and raises ReplayDivergenceError");

// A different seed must (almost surely) yield a different schedule — the schedule
// is pinned by entropy, not incidental.
const other = new RecordingEntropySource(SEED + 1);
const runC = new CooperativeScheduler(other).run(makeTasks());
ok(
  JSON.stringify(runC.trace) !== JSON.stringify(runA.trace),
  "a different seed yields a different schedule (schedule is entropy-pinned)",
);

console.log("");
console.log(`Execution trace (seed ${SEED >>> 0}):`);
for (const t of runA.trace) console.log("  " + t);

console.log("");
if (failures === 0) {
  console.log("ALL DETERMINISM INVARIANTS HELD.");
  process.exit(0);
} else {
  console.log(`${failures} INVARIANT(S) FAILED.`);
  process.exit(1);
}
