/**
 * Compilation verification for the static compilation engine (P2).
 *
 * Proves the GLASSBOX Layer-1 guarantee operationally:
 *   1. the same logic under environment noise (whitespace, blank lines, comments
 *      containing absolute paths, flipped commutative operands) yields a
 *      BIT-IDENTICAL contract + hash (zero drift);
 *   2. banned dynamic constructs (eval / import() / template literals) are rejected;
 *   3. logic outside the grammar whitelist is rejected;
 *   4. malformed input is rejected.
 *
 * Run: npm run verify:compilation
 * Exit 0 = all invariants held.
 */

import { compile } from "./logicStamp.ts";
import { BannedConstructError, ParseError } from "./dslParser.ts";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};
const rejects = (fn: () => void, ErrType: Function, msg: string) => {
  let got = false;
  try {
    fn();
  } catch (e) {
    got = e instanceof ErrType;
  }
  ok(got, msg);
};

// Same logic, two authorings. Program B adds: leading/trailing whitespace, a blank
// line, a comment carrying an absolute path, and flips the operands of the AND.
const progA = [
  "DO draw()",
  "IF (isSmaller(SELECTED,3,HAND) AND hasRacko(HAND)) THEN show(GE,HAND)",
  "IF NOT givesRacko(SELECTED) THEN draw()",
].join("\n");

const progB = [
  "   DO draw()   ",
  "",
  "// authored on /Users/alice/project/rules.dsl at 12:04",
  "IF (hasRacko(HAND) AND isSmaller(SELECTED,3,HAND)) THEN show(GE,HAND)",
  "IF NOT givesRacko(SELECTED) THEN draw()",
].join("\n");

const a = compile(progA);
const b = compile(progB);

ok(a.hash === b.hash, `zero-drift: environment noise + operand order -> identical hash (${a.hash.slice(0, 23)}…)`);
ok(a.json === b.json, "normalized JSON contracts are byte-identical");

// Determinism across repeated compilation.
ok(compile(progA).hash === a.hash, "recompilation is stable (same source -> same hash)");

// Banned dynamic constructs.
rejects(() => compile("DO eval(1)"), BannedConstructError, "eval is rejected (bypasses static AST parsing)");
rejects(() => compile("DO draw()\nIF import(x) THEN draw()"), BannedConstructError, "dynamic import() is rejected");
rejects(() => compile("DO draw(`x`)"), BannedConstructError, "template-literal codegen is rejected");

// Grammar whitelist + malformed.
rejects(() => compile("IF wormhole(HAND) THEN draw()"), ParseError, "non-whitelisted predicate is rejected");
rejects(() => compile("IF isSmaller(SELECTED,3,HAND) draw()"), ParseError, "missing THEN is rejected (malformed)");

console.log("");
console.log("Canonical contract (progA):");
console.log("  " + a.json);
console.log("  " + a.hash);

console.log("");
if (failures === 0) {
  console.log("ALL COMPILATION INVARIANTS HELD.");
  process.exit(0);
} else {
  console.log(`${failures} INVARIANT(S) FAILED.`);
  process.exit(1);
}
