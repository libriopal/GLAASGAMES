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

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  CheckpointCorruptError,
  CheckpointIncompatibleError,
  DurableWorkflow,
  MemoryCheckpointStore,
  FileCheckpointStore,
  replayStep,
  stateRoot,
  type Checkpoint,
  type CheckpointStore,
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

// 6. Resume must not trust a persisted checkpoint as-is: tampered checkpoints halt, not resume.
function throws(fn: () => void, ctor: new (...args: never[]) => Error): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ctor;
  }
}

function memWithTamperedLatest(good: Checkpoint[], tampered: Checkpoint): CheckpointStore {
  const store = new MemoryCheckpointStore();
  for (const cp of good) store.save(cp);
  store.save(tampered); // becomes "latest" for its workflowId
  return store;
}

const cleanCps: Checkpoint[] = (() => {
  const s = new MemoryCheckpointStore();
  new DurableWorkflow("wf-tamper", makeSteps(), s).run(SEED);
  return s.all("wf-tamper");
})();
const lastGood = cleanCps[cleanCps.length - 1]!;

// 6a. state mutated but stateRoot left stale => integrity check catches it (CheckpointCorruptError).
const mutatedState = { ...lastGood.state, k4: (lastGood.state["k4"] ?? 0) + 999 };
const tamperedRoot: Checkpoint = { ...lastGood, state: mutatedState /* stateRoot intentionally NOT recomputed */ };
const storeA = memWithTamperedLatest(cleanCps.slice(0, -1), tamperedRoot);
ok(
  throws(() => new DurableWorkflow("wf-tamper", makeSteps(), storeA).run(SEED), CheckpointCorruptError),
  "state mutated with a stale stateRoot is rejected as CheckpointCorruptError, not silently resumed",
);

// 6b. malformed index (negative / non-integer) => CheckpointCorruptError.
const badIndexCp: Checkpoint = { ...lastGood, index: -1 };
const storeB = memWithTamperedLatest(cleanCps.slice(0, -1), badIndexCp);
ok(
  throws(() => new DurableWorkflow("wf-tamper", makeSteps(), storeB).run(SEED), CheckpointCorruptError),
  "a negative checkpoint index is rejected as CheckpointCorruptError",
);

// 6c. index out of bounds for the current step list => CheckpointIncompatibleError.
const outOfRangeCp: Checkpoint = { ...lastGood, index: makeSteps().length + 10 };
const storeC = memWithTamperedLatest(cleanCps.slice(0, -1), outOfRangeCp);
ok(
  throws(() => new DurableWorkflow("wf-tamper", makeSteps(), storeC).run(SEED), CheckpointIncompatibleError),
  "an out-of-range checkpoint index is rejected as CheckpointIncompatibleError",
);

// 6d. stepId doesn't match the step at that index in the CURRENT workflow => CheckpointIncompatibleError.
const wrongStepIdCp: Checkpoint = { ...lastGood, stepId: "not-a-real-step" };
const storeD = memWithTamperedLatest(cleanCps.slice(0, -1), wrongStepIdCp);
ok(
  throws(() => new DurableWorkflow("wf-tamper", makeSteps(), storeD).run(SEED), CheckpointIncompatibleError),
  "a stepId mismatch against the current step list is rejected as CheckpointIncompatibleError",
);

// 6e. corrupted JSON on disk => CheckpointCorruptError, not a crash from JSON.parse.
const corruptPath = ".checkpoints/durable-corrupt-test.json";
try {
  rmSync(corruptPath, { force: true });
} catch {
  /* ignore */
}
mkdirSync(".checkpoints", { recursive: true });
writeFileSync(corruptPath, "{not valid json");
ok(
  throws(() => new FileCheckpointStore(corruptPath).latest("wf-tamper"), CheckpointCorruptError),
  "malformed JSON in a checkpoint file is rejected as CheckpointCorruptError",
);

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
