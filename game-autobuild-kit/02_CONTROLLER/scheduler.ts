/**
 * Cooperative multitasking scheduler for the Execution Domain.
 *
 * Replaces the host event loop: tasks yield control only at explicit boundaries
 * (checkpoint / failpoint / blockpoint), and the scheduler advances exactly one
 * task per step, chosen via a seed-driven EntropySource. This eliminates native
 * parallelism and thread preemption, giving deterministic ordering
 * (GLASSBOX determinism Layer 3).
 */

import type { EntropySource } from "./prng.ts";

export type StepKind = "checkpoint" | "failpoint" | "blockpoint";

export interface YieldSignal {
  kind: StepKind;
  log: string;
  /** For blockpoint: the resource key the task is waiting on. */
  blockKey?: string;
}

/** A task is a generator that yields a signal at each cooperative boundary. */
export type TaskBody = Generator<YieldSignal, void, void>;

export interface TaskSpec {
  id: string;
  body: () => TaskBody;
}

export class AbortSimulation extends Error {}

export interface SchedulerResult {
  /** Ordered execution trace: one entry per scheduling step. */
  trace: string[];
  /** Total number of pick() calls (selection points). */
  pickCalls: number;
}

export class CooperativeScheduler {
  private readonly entropy: EntropySource;
  constructor(entropy: EntropySource) {
    this.entropy = entropy;
  }

  /**
   * Run all tasks to completion. Deterministic: given the same EntropySource
   * sequence and the same specs, the trace is identical every run.
   */
  run(specs: TaskSpec[]): SchedulerResult {
    const trace: string[] = [];
    let pickCalls = 0;

    type Live = { id: string; gen: TaskBody };
    // Canonical initial order: sorted by id, so pick indices map deterministically.
    let live: Live[] = specs
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((s) => ({ id: s.id, gen: s.body() }));

    const blocked: Map<string, Live> = new Map();

    while (live.length > 0) {
      live.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      pickCalls++;
      const idx = this.entropy.pick(live.length);
      const chosen = live[idx]!;

      const { value, done } = chosen.gen.next();

      if (done) {
        trace.push(`${chosen.id}|done`);
        live = live.filter((l) => l !== chosen);
        continue;
      }

      const sig = value!;
      trace.push(`${chosen.id}|${sig.kind}|${sig.log}`);

      if (sig.kind === "blockpoint" && sig.blockKey) {
        // Excluded from the active queue until unblocked. For this deterministic
        // demo, a blocked task is released on the next round (FIFO, no interleave).
        blocked.set(chosen.id, chosen);
        live = live.filter((l) => l !== chosen);
        // Immediate release policy keeps the demo self-contained & deterministic.
        for (const [, t] of blocked) live.push(t);
        blocked.clear();
      }
      // checkpoint / failpoint: task remains live and is re-eligible next round.
    }

    return { trace, pickCalls };
  }
}
