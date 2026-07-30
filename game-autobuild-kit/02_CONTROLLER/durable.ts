/**
 * Durable orchestration (P7) — checkpoint / rollback / replay.
 *
 * A workflow runs a sequence of typed steps. Each completed step persists a checkpoint
 * (state + Merkle state-root + the entropy it consumed). On failure the engine resumes
 * from the last checkpoint WITHOUT re-running completed steps, then classifies the fault
 * by replaying recorded entropy: reproduced state => transient (resume); divergence =>
 * deterministic drift => safety halt.
 *
 * Grounded: rollback-recovery via checkpointing + logging of nondeterministic events
 * (Elnozahy, Alvisi & Wang 2002, https://doi.org/10.1145/568522.568525).
 *
 * Persistence is behind the CheckpointStore interface. FileCheckpointStore (JSON, no
 * deps) is the default; SQLite / Supabase Postgres / Mastra TS (@mastra/core) are
 * swappable adapters implementing the same interface — wired once their live APIs are
 * verified (see UNKNOWNS.md).
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MerkleTree } from "./merkle.ts";
import { RecordingEntropySource, ReplayingEntropySource, type EntropySource } from "./prng.ts";

export type WorkState = Record<string, number>;

export interface Step {
  id: string;
  /** Mutates state; may draw from rng; may throw to signal a fault. */
  run(state: WorkState, rng: EntropySource): void;
}

export interface Checkpoint {
  workflowId: string;
  index: number;
  stepId: string;
  state: WorkState;
  stateRoot: string;
  entropyLog: number[];
}

export interface CheckpointStore {
  save(cp: Checkpoint): void;
  latest(workflowId: string): Checkpoint | null;
  all(workflowId: string): Checkpoint[];
}

export function stateLeaves(state: WorkState): string[] {
  const keys = Object.keys(state).sort();
  return keys.length ? keys.map((k) => `${k}:${state[k]}`) : ["<empty>"];
}
export function stateRoot(state: WorkState): string {
  return new MerkleTree(stateLeaves(state)).root;
}

export class MemoryCheckpointStore implements CheckpointStore {
  private cps: Checkpoint[] = [];
  save(cp: Checkpoint): void {
    this.cps.push(structuredClone(cp));
  }
  latest(workflowId: string): Checkpoint | null {
    const f = this.cps.filter((c) => c.workflowId === workflowId);
    return f.length ? structuredClone(f[f.length - 1]!) : null;
  }
  all(workflowId: string): Checkpoint[] {
    return this.cps.filter((c) => c.workflowId === workflowId).map((c) => structuredClone(c));
  }
}

/** JSON-file durability: survives process/instance restarts (no external dependency). */
export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly path: string) {}
  private read(): Checkpoint[] {
    if (!existsSync(this.path)) return [];
    return JSON.parse(readFileSync(this.path, "utf8")) as Checkpoint[];
  }
  private write(cps: Checkpoint[]): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(cps));
  }
  save(cp: Checkpoint): void {
    const cps = this.read();
    cps.push(cp);
    this.write(cps);
  }
  latest(workflowId: string): Checkpoint | null {
    const f = this.read().filter((c) => c.workflowId === workflowId);
    return f.length ? f[f.length - 1]! : null;
  }
  all(workflowId: string): Checkpoint[] {
    return this.read().filter((c) => c.workflowId === workflowId);
  }
}

export type RunStatus = "completed" | "failed";

export interface RunResult {
  status: RunStatus;
  executedSteps: string[]; // steps actually run THIS invocation (not resumed ones)
  failedAt: string | null;
  finalState: WorkState;
  finalRoot: string;
}

function stepSeed(base: number, index: number): number {
  return (base ^ Math.imul(index, 2654435761)) >>> 0;
}

export class DurableWorkflow {
  constructor(
    readonly id: string,
    private readonly steps: Step[],
    private readonly store: CheckpointStore,
  ) {}

  /** Run (or resume). `failSet` injects a fault before the named steps. */
  run(seed: number, failSet: Set<string> = new Set()): RunResult {
    const latest = this.store.latest(this.id);
    let startIdx = latest ? latest.index + 1 : 0;
    let state: WorkState = latest ? { ...latest.state } : {};
    const executed: string[] = [];

    for (let i = startIdx; i < this.steps.length; i++) {
      const step = this.steps[i]!;
      if (failSet.has(step.id)) {
        return { status: "failed", executedSteps: executed, failedAt: step.id, finalState: state, finalRoot: stateRoot(state) };
      }
      const rng = new RecordingEntropySource(stepSeed(seed, i));
      step.run(state, rng);
      executed.push(step.id);
      this.store.save({
        workflowId: this.id,
        index: i,
        stepId: step.id,
        state: { ...state },
        stateRoot: stateRoot(state),
        entropyLog: rng.log(),
      });
    }
    return { status: "completed", executedSteps: executed, failedAt: null, finalState: state, finalRoot: stateRoot(state) };
  }
}

/**
 * Drift evaluation: replay a checkpointed step from its predecessor's state using the
 * RECORDED entropy, and compare the resulting root to the stored root. Match => transient
 * (safe to resume); mismatch => deterministic drift => caller triggers a safety halt.
 */
export function replayStep(step: Step, priorState: WorkState, entropyLog: number[]): string {
  const state = { ...priorState };
  step.run(state, new ReplayingEntropySource(entropyLog));
  return stateRoot(state);
}
