/**
 * Verification proof for the P4 safety/liveness gate (CETI-style reachability reduction).
 *
 * Demonstrates:
 *   - a well-formed program is certified SOUND;
 *   - a reachable error location (bad location/restriction/ref, out-of-range card,
 *     empty numeric bracket) makes it UNSOUND;
 *   - an antecedent deeper than the max tree depth is UNSOUND;
 *   - a degenerate program with no reachable action fails LIVENESS;
 *   - an error hidden behind an UNSATISFIABLE guard is correctly certified SOUND
 *     (the error location is unreachable) — the point of the reachability reduction.
 *
 * Run: npm run verify:safety   ·   Exit 0 = all invariants held.
 */

import { parseProgram } from "./dslParser.ts";
import { verify } from "./verifier.ts";

const check = (src: string) => verify(parseProgram(src));

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

// 1. Well-formed.
const safe = check(
  [
    "DO draw()",
    "IF (isSmaller(SELECTED,3,HAND) AND hasRacko(HAND)) THEN show(GE,HAND)",
    "IF NOT givesRacko(SELECTED) THEN draw()",
  ].join("\n"),
);
ok(safe.sound, "well-formed program is certified SOUND");
ok(safe.reachable.winCheck, "win-condition check (hasRacko/givesRacko) is reachable");

// 2. Reachable error: bad location in a mandatory action.
ok(!check("DO show(GT, MARS)").sound, "bad location (MARS) in reachable action -> UNSOUND");

// 3. Out-of-range card value in a guard (always evaluated).
ok(!check("DO draw()\nIF isSmaller(SELECTED, 99, HAND) THEN draw()").sound, "out-of-range card (99>60) -> UNSOUND");

// 4. Empty numeric bracket (lower > upper).
ok(
  !check("DO draw()\nIF isCardBetweenNumbers(SELECTED, 40, 5, 2, HAND) THEN draw()").sound,
  "empty numeric bracket (40>5) -> UNSOUND",
);

// 5. Antecedent deeper than MAX_TREE_DEPTH (10).
const deep = "IF " + "NOT ".repeat(11) + "hasRacko(HAND) THEN draw()";
const deepRes = check(deep);
ok(!deepRes.sound && deepRes.maxDepth > 10, `over-deep antecedent (depth ${deepRes.maxDepth}) -> UNSOUND`);

// 6. Degenerate: no reachable action (contradictory guard, no mandatory rule).
ok(
  !check("IF (hasRacko(HAND) AND NOT hasRacko(HAND)) THEN draw()").sound,
  "degenerate program (no reachable action) fails LIVENESS -> UNSOUND",
);

// 7. Error behind an UNSATISFIABLE guard is unreachable -> program is SOUND.
const masked = check("DO draw()\nIF (hasRacko(HAND) AND NOT hasRacko(HAND)) THEN show(GT, MARS)");
ok(masked.sound, "error behind an unsatisfiable guard is unreachable -> SOUND (reachability reduction)");
ok(!masked.reachable.errorLocation, "  ...and the error location is reported UNreachable");

console.log("");
if (failures === 0) {
  console.log("ALL SAFETY/LIVENESS INVARIANTS HELD.");
  process.exit(0);
} else {
  console.log(`${failures} INVARIANT(S) FAILED.`);
  process.exit(1);
}
