/**
 * LogicStamp — deterministic AST normalization -> JSON context contract (P2).
 *
 * GLASSBOX determinism Layer 1: the same logic compiles to a bit-identical
 * structural contract across environments. Normalization erases incidental drift:
 *   - comments / whitespace / blank lines removed (parser);
 *   - no source positions or file paths retained;
 *   - commutative operands (AND/OR) canonically ordered, so authoring order
 *     cannot change the contract;
 *   - keys emitted in a fixed order -> stable JSON serialization -> stable hash.
 *
 * Grounded in reproducible-build principles (Lamb & Zacchiroli 2022,
 * https://doi.org/10.1109/ms.2021.3073045).
 */

import { createHash } from "node:crypto";
import { parseProgram, type Ante, type Rule, type Program } from "./dslParser.ts";

export interface Contract {
  schema: "glassbox/dsl-contract/v1";
  rules: unknown[];
}

export interface CompileResult {
  program: Program;
  contract: Contract;
  json: string;
  /** `sha256:<hex>` — identical inputs (modulo environment noise) yield identical hash. */
  hash: string;
}

function canonAnte(a: Ante): unknown {
  switch (a.t) {
    case "pred":
      return { t: "pred", name: a.name, args: a.args };
    case "not":
      return { t: "not", arg: canonAnte(a.arg) };
    case "and":
    case "or": {
      // Canonically order commutative operands so (a AND b) === (b AND a).
      const ops = [canonAnte(a.left), canonAnte(a.right)]
        .map((o) => JSON.stringify(o))
        .sort()
        .map((s) => JSON.parse(s) as unknown);
      return { t: a.t, ops };
    }
  }
}

function canonRule(r: Rule): unknown {
  if (r.t === "mandatory") {
    return { t: "mandatory", action: { name: r.action.name, args: r.action.args } };
  }
  return {
    t: "conditional",
    cond: canonAnte(r.cond),
    action: { name: r.action.name, args: r.action.args },
  };
}

/** Compile DSL source into a normalized, hashed contract. Throws on banned/invalid input. */
export function compile(source: string): CompileResult {
  const program = parseProgram(source);
  // Rule order is semantic (first-match) and preserved; structure within each rule is canonicalized.
  const contract: Contract = {
    schema: "glassbox/dsl-contract/v1",
    rules: program.rules.map(canonRule),
  };
  const json = JSON.stringify(contract);
  const hash = "sha256:" + createHash("sha256").update(json).digest("hex");
  return { program, contract, json, hash };
}
