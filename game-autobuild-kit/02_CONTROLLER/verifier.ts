/**
 * Candidate verifier (P4) — safety/liveness gate before a program may cross the
 * Research -> Execution (EDI) boundary.
 *
 * The plan specifies verification by a two-way alternating omega-automaton over the
 * program's control-flow tree, and then operationalizes it as a reachability
 * reduction: "combine program + safety specification into a unified program with a
 * designated error location; if an input path reaches it, isolate a bug." This module
 * implements that **reachability reduction** faithfully; it is not a general
 * omega-automaton engine (that is a larger follow-on).
 *
 * Alternation is reflected in the quantifier structure:
 *   - SAFETY specs are checked universally (for-all reachable locations: no error);
 *   - LIVENESS specs are checked existentially (there-exists a path to an action).
 *
 * Grounded: Vardi 1998 (10.1007/bfb0055090); Kupferman & Vardi 1998
 * (10.1145/276698.276748); CETI reachability reduction, Nguyen et al. 2019
 * (10.48550/arxiv.1903.11765).
 */

import type { Program, Rule, Ante, Action } from "./dslParser.ts";

const MAX_TREE_DEPTH = 10; // D6 Maximum Tree Depth
const CARD_MIN = 0;
const CARD_MAX = 60;
const LOCATIONS = new Set(["DECK", "DISCARD", "HAND", "BOARD"]);
const RESTRICTIONS = new Set(["LT", "LE", "EQ", "GE", "GT"]);
const REFS = new Set(["SELECTED", "TOP", "BUFFER"]);

export interface Violation {
  code: string;
  detail: string;
  reachable: boolean;
}

export interface VerifyResult {
  sound: boolean;
  violations: Violation[];
  reachable: { anyAction: boolean; winCheck: boolean; errorLocation: boolean };
  maxDepth: number;
}

// ---- arg-category / range checks (the "designated error location") -------------

function isNum(s: string): boolean {
  return /^\d+$/.test(s);
}
function numInRange(s: string): boolean {
  const n = Number(s);
  return isNum(s) && n >= CARD_MIN && n <= CARD_MAX;
}

/** Structural/semantic errors inside a predicate (part of a guard; always evaluated). */
function checkPred(name: string, args: string[]): Violation[] {
  const v: Violation[] = [];
  const err = (detail: string) => v.push({ code: "ERR_LOC", detail, reachable: true });
  const wantRef = (a: string) => REFS.has(a) || err(`'${a}' is not a valid action-ref`);
  const wantHand = (a: string) => a === "HAND" || err(`'${a}' is not HAND`);
  const wantLoc = (a: string) => LOCATIONS.has(a) || err(`'${a}' is not a location`);
  const wantRes = (a: string) => RESTRICTIONS.has(a) || err(`'${a}' is not a restriction`);
  const wantNum = (a: string) => numInRange(a) || err(`'${a}' is not a card value in [${CARD_MIN},${CARD_MAX}]`);
  const arity = (n: number) => args.length === n || err(`${name} expects ${n} args, got ${args.length}`);

  switch (name) {
    case "isSmaller":
      arity(3); wantRef(args[0] ?? ""); wantNum(args[1] ?? ""); wantHand(args[2] ?? "");
      break;
    case "isCardBetweenNumbers":
      arity(5); wantRef(args[0] ?? ""); wantNum(args[1] ?? ""); wantNum(args[2] ?? "");
      wantNum(args[3] ?? ""); wantHand(args[4] ?? "");
      if (isNum(args[1] ?? "") && isNum(args[2] ?? "") && Number(args[1]) > Number(args[2])) {
        err(`empty numeric bracket: lower ${args[1]} > upper ${args[2]}`);
      }
      break;
    case "givesRacko":
      arity(1); wantRef(args[0] ?? "");
      break;
    case "hasRacko":
      arity(1); wantHand(args[0] ?? "");
      break;
    case "sum":
    case "play":
      arity(3); wantLoc(args[0] ?? ""); wantRes(args[1] ?? ""); wantLoc(args[2] ?? "");
      break;
    default:
      err(`unknown predicate '${name}'`);
  }
  return v;
}

function checkAction(act: Action, reachable: boolean): Violation[] {
  const v: Violation[] = [];
  const err = (detail: string) => v.push({ code: "ERR_LOC", detail, reachable });
  if (act.name === "draw") {
    if (act.args.length !== 0) err(`draw() expects 0 args, got ${act.args.length}`);
  } else if (act.name === "show") {
    if (act.args.length !== 2) err(`show expects 2 args, got ${act.args.length}`);
    else {
      if (!RESTRICTIONS.has(act.args[0]!)) err(`show arg0 '${act.args[0]}' is not a restriction`);
      if (!LOCATIONS.has(act.args[1]!)) err(`show arg1 '${act.args[1]}' is not a location`);
    }
  } else {
    err(`unknown action '${act.name}'`);
  }
  return v;
}

// ---- depth + guard reachability (incomplete-but-sound SAT approximation) --------

function anteDepth(a: Ante): number {
  switch (a.t) {
    case "pred": return 1;
    case "not": return 1 + anteDepth(a.arg);
    case "and":
    case "or": return 1 + Math.max(anteDepth(a.left), anteDepth(a.right));
  }
}

/** Flatten top-level AND conjuncts (for the contradiction check). */
function conjuncts(a: Ante): Ante[] {
  return a.t === "and" ? [...conjuncts(a.left), ...conjuncts(a.right)] : [a];
}
function sig(a: Ante): string {
  return JSON.stringify(a);
}
/**
 * Guard satisfiability — deliberately INCOMPLETE and sound in the safety direction:
 * returns false only when clearly UNSAT (a conjunct and its negation both appear, or
 * an empty numeric bracket). When unsure it returns true (assume reachable), so the
 * safety check never misses a real error. Documented limitation.
 */
function guardSat(a: Ante): boolean {
  const cs = conjuncts(a);
  const pos = new Set<string>();
  const neg = new Set<string>();
  for (const c of cs) {
    if (c.t === "not") neg.add(sig(c.arg));
    else pos.add(sig(c));
    if (c.t === "pred" && c.name === "isCardBetweenNumbers") {
      const lo = c.args[1], hi = c.args[2];
      if (lo && hi && isNum(lo) && isNum(hi) && Number(lo) > Number(hi)) return false;
    }
  }
  for (const s of pos) if (neg.has(s)) return false;
  return true;
}

function collectPredNames(a: Ante, out: Set<string>): void {
  if (a.t === "pred") out.add(a.name);
  else if (a.t === "not") collectPredNames(a.arg, out);
  else {
    collectPredNames(a.left, out);
    collectPredNames(a.right, out);
  }
}

function checkAnteErrors(a: Ante): Violation[] {
  if (a.t === "pred") return checkPred(a.name, a.args);
  if (a.t === "not") return checkAnteErrors(a.arg);
  return [...checkAnteErrors(a.left), ...checkAnteErrors(a.right)];
}

export function verify(program: Program): VerifyResult {
  const violations: Violation[] = [];
  let anyAction = false;
  let winCheck = false;
  let errorLocation = false;
  let maxDepth = 0;

  for (const rule of program.rules) {
    let guardSatisfiable = true;
    if (rule.t === "conditional") {
      const d = anteDepth(rule.cond);
      maxDepth = Math.max(maxDepth, d);
      if (d > MAX_TREE_DEPTH) {
        violations.push({ code: "DEPTH", detail: `antecedent depth ${d} > ${MAX_TREE_DEPTH}`, reachable: true });
      }
      // Guard predicates are always evaluated -> their errors are always reachable.
      violations.push(...checkAnteErrors(rule.cond));
      const names = new Set<string>();
      collectPredNames(rule.cond, names);
      if (names.has("hasRacko") || names.has("givesRacko")) winCheck = true;
      guardSatisfiable = guardSat(rule.cond);
    }
    // Action fires when the guard is satisfiable (mandatory: unconditionally).
    const actReachable = rule.t === "mandatory" ? true : guardSatisfiable;
    violations.push(...checkAction(rule.action, actReachable));
    if (actReachable) anyAction = true;
  }

  errorLocation = violations.some((v) => v.code === "ERR_LOC" && v.reachable);

  // SAFETY (universal): no reachable error location, no depth violation.
  const safetyOk = !violations.some((v) => v.reachable);
  // LIVENESS (existential): at least one action is reachable (progress / non-degenerate).
  const livenessOk = anyAction;
  if (!livenessOk) {
    violations.push({ code: "LIVENESS", detail: "no action is reachable (degenerate program)", reachable: true });
  }

  return {
    sound: safetyOk && livenessOk,
    violations,
    reachable: { anyAction, winCheck, errorLocation },
    maxDepth,
  };
}
