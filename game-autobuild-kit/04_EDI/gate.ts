/**
 * EDI boundary gate (Module 04) — the single checkpoint every artifact must pass to
 * cross from the Research Domain into the Execution Domain.
 *
 * The isolation invariant (plan §6, IV-001): only a statically-verified, normalized
 * contract crosses — never raw code, and never a reference to the LLM interaction that
 * produced it. This gate composes the pieces already built:
 *   parse (P2) -> verify (P4) -> normalize + hash (P2)
 * and refuses anything that fails any stage. A promoted artifact must reproduce
 * bit-identically from its contract alone.
 */

import { parseProgram, BannedConstructError, ParseError } from "../02_CONTROLLER/dslParser.ts";
import { verify } from "../02_CONTROLLER/verifier.ts";
import { compile } from "../02_CONTROLLER/logicStamp.ts";

export interface GateAccept {
  ok: true;
  contractJson: string;
  hash: string;
}
export interface GateReject {
  ok: false;
  stage: "parse" | "verify" | "banned" | "reconcile";
  reason: string;
}
export type GateResult = GateAccept | GateReject;

/** Inspect a candidate DSL program and decide whether it may cross the boundary. */
export function crossBoundary(source: string): GateResult {
  // Stage 1 — parse (grammar restriction + banned-construct scan).
  let program;
  try {
    program = parseProgram(source);
  } catch (e) {
    if (e instanceof BannedConstructError) return { ok: false, stage: "banned", reason: e.message };
    if (e instanceof ParseError) return { ok: false, stage: "parse", reason: e.message };
    return { ok: false, stage: "parse", reason: String(e) };
  }
  // Stage 2 — formal verification (safety + liveness, reachability reduction).
  const v = verify(program);
  if (!v.sound) {
    return { ok: false, stage: "verify", reason: v.violations.map((x) => `${x.code}:${x.detail}`).join("; ") };
  }
  // Stage 3 — normalize to the deterministic contract that actually crosses.
  //
  // ── R5, AND THE FINDING WAS NOT THE ONE THE HANDOFF PACKAGE DESCRIBED ──────
  //
  // The package (REVISIONS.md R5) read this file and concluded that stage 2
  // verifies a `program` while stage 3 hashes the raw `source` through a
  // SECOND, INDEPENDENT derivation, with nothing asserting the two agree. It
  // proposed adding `compileFromProgram()` so the gate would hold two rival
  // computations and compare them.
  //
  // That is not what the code does. `compile()` in 02_CONTROLLER/logicStamp.ts
  // opens with `const program = parseProgram(source)` — it calls the SAME parser
  // stage 1 called, on the SAME string. There are not two derivations; there is
  // one pure function invoked twice. Adding a rival derivation would have
  // manufactured the divergence it claimed to be guarding against.
  //
  // The residual defect is real but much smaller, and it is the one
  // MENTAL_STATE_TRANSFER §5 predicted for this case: NOTHING IN THE CODE SAID
  // SO. The invariant "the thing verified is the thing hashed" held by accident
  // of both call sites sharing a `source` binding, and any refactor that gave
  // stage 3 a different string — a trimmed source, a re-serialised one, a
  // caller-supplied variant — would break it silently and the hash would go on
  // looking authoritative.
  //
  // So: a one-line assertion, not a second pipeline. `compile()` already returns
  // the program it parsed, so the comparison costs nothing and the invariant
  // stops being implicit.
  const { program: compiledProgram, json, hash } = compile(source);
  if (!sameProgram(program, compiledProgram)) {
    return {
      ok: false,
      stage: "reconcile",
      reason:
        "the program that was verified is not the program that was hashed — " +
        "stage 2 and stage 3 derived different contracts from the same input",
    };
  }
  return { ok: true, contractJson: json, hash };
}


/**
 * Structural equality of two parsed programs.
 *
 * `JSON.stringify` is sufficient here and would not be on a typical AST: this
 * grammar's `Program` carries no source positions — no `loc`, `start`, `end` or
 * `raw` — so there is nothing position-dependent to strip before comparing. (The
 * R5 patch warned to exclude those fields "or the reconciliation will fail on
 * every input"; this AST has none, so the caution does not apply. Recorded in
 * FINDINGS.md rather than silently ignored.)
 */
function sameProgram(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
