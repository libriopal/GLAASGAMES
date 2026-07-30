/**
 * Verification proof for the P7 durable orchestration engine (deterministic, no keys).
 *
 * Demonstrates:
 *   1. a full run completes and checkpoints every step;
 *   2. after a fault, the engine RESUMES from the last checkpoint without re-running
 *      completed steps, and reaches the same final state as a clean run;
 *   3. durability survives a fresh store instance (persistence across "restart");
 *   4. each checkpoint's Merkle state-root matches its state (fingerprint integrity);
 *   5. drift evaluation: replaying recorded entropy reproduces the state (transient),
 *      while a corrupted replay is detected as deterministic drift (=> safety halt).
 *
 * Run: npm run verify:durable   ·   Exit 0 = all invariants held.
 */

import { rmSync } from "node:fs";
import {
  DurableWorkflow,
  MemoryCheckpointStore,
  FileCheckpointStore,
  replayStep,
  stateRoot,
  type Step,
  type WorkState,
} from "./durable.ts";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

function makeSteps(): Step[] {
  return [0, 1, 2, 3, 4].map((i) => ({
    id: `s${i}`,
    run: (st: WorkState, rng) => {
      st[`k${i}`] = (st[`k${i}`] ?? 0) + rng.pick(100);
    },
  }));
}
const SEED = 0xc0ffee;

// 1. Clean full run.
const memA = new MemoryCheckpointStore();
const full = new DurableWorkflow("wf", makeSteps(), memA).run(SEED);
ok(full.status === "completed" && full.executedSteps.length === 5, "clean run completes all 5 steps");
ok(memA.all("wf").length === 5, "every step is checkpointed");
const cleanRoot = full.finalRoot;

// 2. Fault + resume without re-running completed steps.
const memB = new MemoryCheckpointStore();
const wfB = new DurableWorkflow("wf", makeSteps(), memB);
const run1 = wfB.run(SEED, new Set(["s3"]));
ok(run1.status === "failed" && run1.failedAt === "s3", "run fails at the injected fault (s3)");
ok(JSON.stringify(run1.executedSteps) === JSON.stringify(["s0", "s1", "s2"]), "only s0..s2 ran before the fault");
const run2 = wfB.run(SEED); // resume
ok(run2.status === "completed", "re-run resumes and completes");
ok(JSON.stringify(run2.executedSteps) === JSON.stringify(["s3", "s4"]), "resume runs ONLY s3..s4 (no re-execution)");
ok(run2.finalRoot === cleanRoot, "resumed final state equals the clean-run state (recovery correctness)");

// 3. Durability across a fresh store instance.
const path = ".checkpoints/durable-test.json";
try {
  rmSync(path, { force: true });
} catch {
  /* ignore */
}
new DurableWorkflow("wf", makeSteps(), new FileCheckpointStore(path)).run(SEED);
const reopened = new FileCheckpointStore(path).latest("wf"); // new instance, same file
ok(reopened !== null && reopened.index === 4, "checkpoints persist across a fresh store instance");
ok(reopened!.stateRoot === cleanRoot, "persisted final root matches");

// 4. Fingerprint integrity.
ok(
  memA.all("wf").every((cp) => cp.stateRoot === stateRoot(cp.state)),
  "every checkpoint's Merkle root matches its state",
);

// 5. Drift evaluation via replay.
const cps = memA.all("wf");
const steps = makeSteps();
let allReproduced = true;
for (let i = 0; i < cps.length; i++) {
  const prior = i > 0 ? cps[i - 1]!.state : {};
  if (replayStep(steps[i]!, prior, cps[i]!.entropyLog) !== cps[i]!.stateRoot) allReproduced = false;
}
ok(allReproduced, "replaying recorded entropy reproduces every checkpoint (transient-classifiable)");

const driftedStep: Step = { id: "s2", run: (st, rng) => { st["k2"] = (st["k2"] ?? 0) + rng.pick(100) + 1; } };
const driftRoot = replayStep(driftedStep, cps[1]!.state, cps[2]!.entropyLog);
ok(driftRoot !== cps[2]!.stateRoot, "a corrupted replay is detected as deterministic drift (=> safety halt)");

console.log("");
console.log(`Final state root: ${cleanRoot.slice(0, 24)}…  checkpoints: ${cps.length}`);

console.log("");
if (failures === 0) {
  console.log("ALL DURABILITY INVARIANTS HELD.");
  process.exit(0);
} else {
  console.log(`${failures} INVARIANT(S) FAILED.`);
  process.exit(1);
}
