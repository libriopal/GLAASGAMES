// engine/verify/verify-trig.ts
// Bounds the CORDIC approximation error and pins its structural invariants.
//
// CORDIC is an approximation, so unlike verify-fixed this pass cannot assert bit
// equality against an oracle. It asserts two weaker but sufficient properties:
// the error against double-precision libm stays inside a stated ulp budget, and
// the identities that the simulation actually relies on (Pythagorean sum,
// symmetry, known exact points) hold. Determinism itself is structural — the
// implementation touches no float — and is proven by replay in verify-parity.

import { FIXED_ONE } from '../math/fixed.js';
import { HALF_PI_FIXED, PI_FIXED, TWO_PI_FIXED, cosSinFixed, degreesToFixed } from '../math/trig.js';

/**
 * Error budget in Q16.16 units. CORDIC with 17 stages carries a residual angle
 * of at most one table entry (1 unit) plus accumulated shift truncation across
 * the stages; 24 units is ~0.00037 of unit magnitude, comfortably inside what a
 * fixed-point simulation resolves and well under a rendered pixel.
 */
const ERROR_BUDGET = 24;

interface Failure {
  readonly detail: string;
}

const failures: Failure[] = [];

function fail(detail: string): void {
  failures.push({ detail });
}

let worstCos = 0;
let worstSin = 0;
let worstAngle = 0;

// --- Error sweep across two full turns, one tenth of a degree at a time ---
for (let deciDegree = -3600; deciDegree <= 3600; deciDegree += 1) {
  // Build the angle in fixed point without going through the trig module's own
  // helper, so a bug there cannot mask itself.
  const radians = (deciDegree / 10) * (Math.PI / 180);
  const angle = Math.round(radians * FIXED_ONE);
  if (angle > 0x7fffffff || angle < -0x7fffffff) continue;

  const { cos, sin } = cosSinFixed(angle);
  const expectedCos = Math.round(Math.cos(radians) * FIXED_ONE);
  const expectedSin = Math.round(Math.sin(radians) * FIXED_ONE);

  const cosError = Math.abs(cos - expectedCos);
  const sinError = Math.abs(sin - expectedSin);

  if (cosError > worstCos) {
    worstCos = cosError;
    worstAngle = deciDegree;
  }
  if (sinError > worstSin) worstSin = sinError;

  if (cosError > ERROR_BUDGET || sinError > ERROR_BUDGET) {
    fail(
      `angle ${deciDegree / 10} deg: cos err ${cosError}, sin err ${sinError} (budget ${ERROR_BUDGET})`,
    );
  }
}

// --- Exact points the simulation depends on ---
const zero = cosSinFixed(0);
if (Math.abs(zero.cos - FIXED_ONE) > ERROR_BUDGET) fail(`cos(0) = ${zero.cos}, expected ${FIXED_ONE}`);
if (Math.abs(zero.sin) > ERROR_BUDGET) fail(`sin(0) = ${zero.sin}, expected 0`);

const quarter = cosSinFixed(HALF_PI_FIXED);
if (Math.abs(quarter.cos) > ERROR_BUDGET) fail(`cos(pi/2) = ${quarter.cos}, expected 0`);
if (Math.abs(quarter.sin - FIXED_ONE) > ERROR_BUDGET) fail(`sin(pi/2) = ${quarter.sin}, expected ${FIXED_ONE}`);

const half = cosSinFixed(PI_FIXED);
if (Math.abs(half.cos + FIXED_ONE) > ERROR_BUDGET) fail(`cos(pi) = ${half.cos}, expected ${-FIXED_ONE}`);
if (Math.abs(half.sin) > ERROR_BUDGET) fail(`sin(pi) = ${half.sin}, expected 0`);

// --- Pythagorean identity: cos^2 + sin^2 must stay on the unit circle ---
// Computed in doubles here only to measure drift; the values under test are integers.
let worstNorm = 0;
for (let step = 0; step < 720; step += 1) {
  const angle = Math.round((step / 720) * 2 * Math.PI * FIXED_ONE);
  const { cos, sin } = cosSinFixed(angle);
  const normSquared = (cos / FIXED_ONE) ** 2 + (sin / FIXED_ONE) ** 2;
  const drift = Math.abs(normSquared - 1);
  if (drift > worstNorm) worstNorm = drift;
  if (drift > 0.002) {
    fail(`cos^2+sin^2 = ${normSquared.toFixed(6)} at step ${step}, drift ${drift.toFixed(6)}`);
  }
}

// --- Symmetry: cos is even, sin is odd ---
for (let step = 1; step < 360; step += 1) {
  const angle = Math.round((step / 360) * Math.PI * FIXED_ONE);
  const positive = cosSinFixed(angle);
  const negative = cosSinFixed(-angle);
  if (Math.abs(positive.cos - negative.cos) > ERROR_BUDGET * 2) {
    fail(`cos not even at step ${step}: ${positive.cos} vs ${negative.cos}`);
  }
  if (Math.abs(positive.sin + negative.sin) > ERROR_BUDGET * 2) {
    fail(`sin not odd at step ${step}: ${positive.sin} vs ${negative.sin}`);
  }
}

// --- Determinism: identical input yields identical output, always ---
for (let step = 0; step < 1000; step += 1) {
  const angle = (step * 7919) % TWO_PI_FIXED;
  const first = cosSinFixed(angle);
  const second = cosSinFixed(angle);
  if (first.cos !== second.cos || first.sin !== second.sin) {
    fail(`non-deterministic at angle ${angle}`);
  }
}

// --- degreesToFixed agrees with the direct construction ---
for (const degrees of [0, 30, 45, 60, 90, 180, -90, -45, 270, 360]) {
  const viaHelper = degreesToFixed(degrees);
  const direct = Math.round(degrees * (Math.PI / 180) * FIXED_ONE);
  if (Math.abs(viaHelper - direct) > 64) {
    fail(`degreesToFixed(${degrees}) = ${viaHelper}, expected ~${direct}`);
  }
}

if (failures.length > 0) {
  console.error(`verify-trig: FAIL — ${failures.length} violations`);
  for (const failure of failures.slice(0, 20)) {
    console.error(`  ${failure.detail}`);
  }
  process.exit(1);
}

console.log(
  `verify-trig: PASS — 7201 angles swept, worst cos err ${worstCos} at ${worstAngle / 10} deg, ` +
    `worst sin err ${worstSin} (budget ${ERROR_BUDGET}), worst unit-circle drift ${worstNorm.toFixed(6)}`,
);
