/**
 * W8 gate: the FULL chain (seed -> board -> render -> submit -> score ->
 * validate) is byte-identical for a fixed seed, fixed-point scoring rejects
 * floats, and no source file under the new trees calls Math.random().
 *
 * Run: npm run verify:determinism   ·   Exit 0 = gate held.
 */

import { join } from 'node:path';
import { addFixed, assertFixedPoint, toFixedPoint } from './fixed-point.ts';
import { generateServerSeed, runFullChain, scoreChain } from './pipeline.ts';
import { scanForMathRandom } from './static-checks.ts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const seed = new Uint8Array([1, 1, 2, 3, 5, 8, 13, 21]);
const moves = ['keep-all', 'reroll-one', 'yield-centre'];

// 1. Full-chain determinism: not just a PRNG harness — every stage byte-identical.
const run1 = runFullChain(seed, moves);
const run2 = runFullChain(seed, moves);
ok(JSON.stringify(run1) === JSON.stringify(run2), 'full chain (board->render->submit->score->validate) is byte-identical for the same seed+moves');
ok(run1.valid, 'the chain independently validates its own recomputation');

// 2. Different seed -> different result (not a constant pipeline).
const run3 = runFullChain(new Uint8Array([9, 9, 9, 9]), moves);
ok(run1.boardHash !== run3.boardHash, 'a different seed produces a different board hash');

// 3. Different move order -> different submit hash and (generally) score.
const run4 = runFullChain(seed, [...moves].reverse());
ok(run1.submitHash !== run4.submitHash, 'a different move order produces a different submit hash');

// 4. Fixed-point scoring: scores are always integers (Q×1000), never bare floats.
ok(Number.isInteger(run1.scoreFixed), 'scoreFixed is an integer (fixed-point), not a float');
ok(Number.isInteger(scoreChain(moves, seed)), 'scoreChain output is always an integer');

// 5. assertFixedPoint rejects a bare float.
let threw = false;
try {
  assertFixedPoint(1.5);
} catch {
  threw = true;
}
ok(threw, 'verify-fixed-point-scoring: assertFixedPoint rejects a non-integer value');
ok(addFixed(toFixedPoint(1.2), toFixedPoint(0.3)) === 1500, 'fixed-point addition of 1.200 + 0.300 = 1.500 (as 1500 milli-units)');

// 6. CSPRNG entry point produces non-deterministic, correctly-sized seeds.
const s1 = generateServerSeed();
const s2 = generateServerSeed();
ok(s1.length === 32 && s2.length === 32, 'generateServerSeed() produces 32-byte seeds');
ok(Buffer.from(s1).toString('hex') !== Buffer.from(s2).toString('hex'), 'two CSPRNG-generated seeds are not equal (sanity, not a determinism claim)');

// 7. verify-no-math-random: static scan of the new source trees.
const repoRoot = join(import.meta.dirname, '..', '..');
// engine/ is included because it is where determinism is most load-bearing: the
// simulation kernel must reproduce bit-for-bit across CPU and GPU executors, and
// a single Math.random() there would break parity in a way that reproduces only
// intermittently and on one machine.
const scan = scanForMathRandom([join(repoRoot, 'families'), join(repoRoot, 'foundry'), join(repoRoot, 'corpus'), join(repoRoot, 'game'), join(repoRoot, 'engine')]);
ok(scan.clean, scan.clean ? 'no Math.random() found under families/foundry/corpus/game/engine' : `Math.random() found in: ${scan.offendingFiles.join(', ')}`);

console.log('');
if (failures === 0) {
  console.log('W8 GATE HELD: full-chain determinism, fixed-point scoring, and verify-no-math-random all hold.');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED.`);
  process.exit(1);
}
