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
  stage: "parse" | "verify" | "banned";
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
  const { json, hash } = compile(source);
  return { ok: true, contractJson: json, hash };
}
