/**
 * Verification proof for the thin modules: EDI boundary gate (04) + budget ledger (05).
 *
 * Run: npm run verify:boundary   ·   Exit 0 = all invariants held.
 */

import { crossBoundary } from "./gate.ts";
import { BudgetLedger, BudgetExceededError, InvalidBudgetInputError } from "../05_CREDIT_ROUTING/budget.ts";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

// EDI gate — only a sound, grammar-valid program crosses; the result is a hashed contract.
const good = crossBoundary("DO draw()\nIF hasRacko(HAND) THEN show(GE,HAND)");
ok(good.ok && good.hash.startsWith("sha256:"), "sound program crosses the boundary as a hashed contract");

const banned = crossBoundary("DO eval(1)");
ok(!banned.ok && banned.ok === false && banned.stage === "banned", "eval is stopped at the boundary (banned)");

const unsound = crossBoundary("DO show(GT, MARS)");
ok(!unsound.ok && unsound.stage === "verify", "verifier-unsound program is stopped at the boundary");

const malformed = crossBoundary("IF isSmaller(SELECTED,3,HAND) draw()");
ok(!malformed.ok && malformed.stage === "parse", "malformed program is stopped at the boundary (parse)");

// Same logic under environment noise crosses to the SAME contract hash (zero drift end-to-end).
const h1 = crossBoundary("IF (hasRacko(HAND) AND givesRacko(SELECTED)) THEN draw()");
const h2 = crossBoundary("// noise\n  IF (givesRacko(SELECTED) AND hasRacko(HAND)) THEN draw()  ");
ok(h1.ok && h2.ok && h1.hash === h2.hash, "environment noise yields the same boundary contract hash");

// Budget ledger — spend accrues, and the cap throttles before overspend.
const ledger = new BudgetLedger(1000);
const a = ledger.authorize("mutate", 400);
ledger.authorize("strategy", 400);
ok(ledger.totalSpent === 800 && ledger.remaining === 200, "budget accrues spend and tracks remaining");
ok(typeof a.provider === "string" && typeof a.keyReady === "boolean", "authorize routes to a provider and reports key readiness");

let capped = false;
try {
  ledger.authorize("mutate", 400); // 800+400 > 1000
} catch (e) {
  capped = e instanceof BudgetExceededError;
}
ok(capped, "budget cap throttles a call that would overspend (runaway-loop guard)");

// Invalid estimates must not poison or decrement accounting — reject before touching `spent`.
const spentBeforeInvalid = ledger.totalSpent;

let negativeRejected = false;
try {
  ledger.authorize("mutate", -1);
} catch (e) {
  negativeRejected = e instanceof InvalidBudgetInputError;
}
ok(negativeRejected, 'authorize("mutate", -1) throws InvalidBudgetInputError');
ok(ledger.totalSpent === spentBeforeInvalid, "  ...and totalSpent is unchanged (negative estimate did not decrement spend)");

let nanRejected = false;
try {
  ledger.authorize("mutate", NaN);
} catch (e) {
  nanRejected = e instanceof InvalidBudgetInputError;
}
ok(nanRejected, 'authorize("mutate", NaN) throws InvalidBudgetInputError');
ok(ledger.totalSpent === spentBeforeInvalid, "  ...and totalSpent is unchanged (NaN did not poison accounting)");
ok(Number.isFinite(ledger.remaining), "  ...remaining is still a finite number (cap check is not disabled)");

let fractionalRejected = false;
try {
  ledger.authorize("mutate", 1.5);
} catch (e) {
  fractionalRejected = e instanceof InvalidBudgetInputError;
}
ok(fractionalRejected, 'authorize("mutate", 1.5) throws InvalidBudgetInputError (non-integer estimate)');

let infinityRejected = false;
try {
  ledger.authorize("mutate", Infinity);
} catch (e) {
  infinityRejected = e instanceof InvalidBudgetInputError;
}
ok(infinityRejected, 'authorize("mutate", Infinity) throws InvalidBudgetInputError');

let capRejected = false;
try {
  new BudgetLedger(-100);
} catch (e) {
  capRejected = e instanceof InvalidBudgetInputError;
}
ok(capRejected, "constructing a BudgetLedger with a negative capTokens throws InvalidBudgetInputError");

console.log("");
if (failures === 0) {
  console.log("ALL BOUNDARY/BUDGET INVARIANTS HELD.");
  process.exit(0);
} else {
  console.log(`${failures} INVARIANT(S) FAILED.`);
  process.exit(1);
}
