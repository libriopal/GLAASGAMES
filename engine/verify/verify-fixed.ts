// engine/verify/verify-fixed.ts
// Pins the limb-based Q16.16 primitives to an exact BigInt oracle.
//
// mulFixed reassembles a 64-bit product from 16-bit limbs using u32 modular
// arithmetic because WGSL has no i64. That reassembly is the single highest-risk
// piece of arithmetic in the engine: if it is wrong in a corner, every CPU/GPU
// parity check still passes (both executors run the same wrong algorithm) while
// the simulation quietly diverges from intent. So it is checked here against
// BigInt, which is exact by construction, rather than against the GPU.

import {
  FIXED_MAX,
  FIXED_MIN,
  FIXED_ONE,
  divFixed,
  mulFixed,
  sqrtFixed,
  toFixed,
  fromFixed,
} from '../math/fixed.js';

const SCALE = BigInt(FIXED_ONE);

/** Exact oracle: (a*b) >> 16, truncating toward zero. */
function mulOracle(a: number, b: number): bigint {
  const product = BigInt(a) * BigInt(b);
  const negative = product < 0n;
  const magnitude = (negative ? -product : product) / SCALE;
  return negative ? -magnitude : magnitude;
}

/** Exact oracle: (a << 16) / b, truncating toward zero. */
function divOracle(a: number, b: number): bigint {
  const numerator = BigInt(a) * SCALE;
  const denominator = BigInt(b);
  const negative = numerator < 0n !== denominator < 0n;
  const magnitude =
    (numerator < 0n ? -numerator : numerator) /
    (denominator < 0n ? -denominator : denominator);
  return negative ? -magnitude : magnitude;
}

/** Exact oracle: floor(sqrt(value << 16)). */
function sqrtOracle(value: number): bigint {
  const radicand = BigInt(value) * SCALE;
  if (radicand < 2n) return radicand;
  // Newton's method on integers, converges to floor(sqrt(radicand)).
  let guess = radicand;
  let next = (guess + 1n) / 2n;
  while (next < guess) {
    guess = next;
    next = (guess + radicand / guess) / 2n;
  }
  return guess;
}

/**
 * Deterministic operand generator. Math.random() is statically banned across
 * this tree (game/determinism/static-checks.ts), and a verification pass that
 * cannot be replayed from a seed is not evidence. xorshift32 is exact in i32.
 */
function makeRng(seed: number): () => number {
  let state = seed | 0;
  if (state === 0) state = 0x1a2b3c4d;
  return () => {
    state ^= state << 13;
    state |= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    return state;
  };
}

interface Failure {
  readonly op: string;
  readonly inputs: readonly number[];
  readonly expected: string;
  readonly actual: string;
}

const failures: Failure[] = [];

function checkMul(a: number, b: number): void {
  const expected = mulOracle(a, b);
  // Only assert where the true result is representable; outside that domain the
  // implementation makes no promise and the caller is contractually at fault.
  if (expected > BigInt(FIXED_MAX) || expected < BigInt(FIXED_MIN)) return;
  const actual = BigInt(mulFixed(a, b));
  if (actual !== expected) {
    failures.push({
      op: 'mulFixed',
      inputs: [a, b],
      expected: expected.toString(),
      actual: actual.toString(),
    });
  }
}

function checkDiv(a: number, b: number): void {
  if (b === 0) return;
  const expected = divOracle(a, b);
  if (expected > BigInt(FIXED_MAX) || expected < BigInt(FIXED_MIN)) return;
  const actual = BigInt(divFixed(a, b));
  if (actual !== expected) {
    failures.push({
      op: 'divFixed',
      inputs: [a, b],
      expected: expected.toString(),
      actual: actual.toString(),
    });
  }
}

function checkSqrt(value: number): void {
  if (value < 0) return;
  const expected = sqrtOracle(value);
  if (expected > BigInt(FIXED_MAX)) return;
  const actual = BigInt(sqrtFixed(value));
  if (actual !== expected) {
    failures.push({
      op: 'sqrtFixed',
      inputs: [value],
      expected: expected.toString(),
      actual: actual.toString(),
    });
  }
}

// --- Boundary operands: every sign, every limb edge, every power-of-two seam ---
const BOUNDARY: readonly number[] = [
  0,
  1,
  -1,
  2,
  -2,
  0xffff,
  -0xffff,
  0x10000,
  -0x10000,
  0x10001,
  -0x10001,
  0xfffff,
  -0xfffff,
  0x7fffffff,
  -0x7fffffff,
  0x40000000,
  -0x40000000,
  FIXED_ONE,
  -FIXED_ONE,
  FIXED_ONE - 1,
  FIXED_ONE + 1,
  3 * FIXED_ONE,
  -3 * FIXED_ONE,
];

for (const a of BOUNDARY) {
  for (const b of BOUNDARY) {
    checkMul(a, b);
    checkDiv(a, b);
  }
  checkSqrt(Math.abs(a));
}

// --- Randomised sweep over the full safe domain ---
const rng = makeRng(0x5eed_4d17 | 0);
const SWEEP = 400_000;
for (let i = 0; i < SWEEP; i += 1) {
  const a = rng();
  const b = rng();
  checkMul(a, b);
  checkDiv(a, b);
  checkSqrt(Math.abs(a) >>> 1);
}

// --- Algebraic invariants that must hold regardless of the oracle ---
function checkInvariant(name: string, condition: boolean, detail: string): void {
  if (!condition) {
    failures.push({ op: name, inputs: [], expected: 'invariant holds', actual: detail });
  }
}

// Multiplying by 1.0 is the identity.
const identityRng = makeRng(0x0d15ea5e | 0);
for (let i = 0; i < 50_000; i += 1) {
  const a = identityRng() >> 8; // keep the product inside the safe domain
  const viaMul = mulFixed(a, FIXED_ONE);
  checkInvariant('mulFixed:identity', viaMul === a, `mulFixed(${a}, 1.0) = ${viaMul}`);
}

// Multiplication commutes.
const commuteRng = makeRng(0x0c0ffee1 | 0);
for (let i = 0; i < 50_000; i += 1) {
  const a = commuteRng() >> 8;
  const b = commuteRng() >> 8;
  checkInvariant('mulFixed:commutative', mulFixed(a, b) === mulFixed(b, a), `a=${a} b=${b}`);
}

// sqrt(x)^2 lands within one ulp below x (truncating sqrt never overshoots).
const sqrtRng = makeRng(0xb0a710ad | 0);
for (let i = 0; i < 50_000; i += 1) {
  const x = (sqrtRng() >>> 1) >>> 2;
  const root = sqrtFixed(x);
  const squared = mulFixed(root, root);
  checkInvariant('sqrtFixed:no-overshoot', squared <= x, `sqrt(${x})^2 = ${squared} > ${x}`);
}

// Round-tripping a representable decimal is stable.
for (const sample of [0, 0.5, 1, -1, 12.25, -12.25, 1000.125, -1000.125]) {
  const round = fromFixed(toFixed(sample));
  checkInvariant('toFixed:roundtrip', round === sample, `${sample} -> ${round}`);
}

if (failures.length > 0) {
  console.error(`verify-fixed: FAIL — ${failures.length} discrepancies`);
  for (const failure of failures.slice(0, 20)) {
    console.error(
      `  ${failure.op}(${failure.inputs.join(', ')}) expected ${failure.expected}, got ${failure.actual}`,
    );
  }
  process.exit(1);
}

console.log(
  `verify-fixed: PASS — ${BOUNDARY.length ** 2} boundary pairs, ${SWEEP} randomised triples, ` +
    '150000 invariant samples, all exact against BigInt oracle',
);
