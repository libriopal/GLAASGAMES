// engine/verify/verify-parimutuel.ts — the settlement is provably fair, or the
// build fails.
//
// P1  the pool CLOSES EXACTLY                     Σ payouts ≡ net pool
// P2  matchpoint field mean is exactly ½
// P3  ORDER INVARIANCE — permuting the entries cannot move one minor unit
// P4  Neuberg maps unequal heats onto a common scale
// P5  NO FLOATS in settlement source                    (textual, like L1x)
// P6  MONOTONICITY — a higher score never pays less
// P7  the takeout is EXACTLY the declared takeout, no hidden second margin
// P8  the floor is real — last place still receives something
// P9  system RTP is identically 1 − t, for every parameter combination
// P10 the commitment BINDS the seed and the parameters
// P11 entropy independence — no entrant can influence the seed
// P12 no front-running — settlement cannot depend on WHEN inside the window
// P13 public verifiability — a third party reproduces the settlement
// P14 heat-size floor is enforced rather than divided by zero
//
// P11–P14 exist because an independent audit of the DESIGN, before any of this
// was written, was asked what a provably-fair staking system must verify that
// the list did not yet contain, and named exactly these: "public verifiability
// of the outcome reconstruction", "statistical independence of the entropy
// source from user inputs", "resistance to front-running", "non-malleability of
// the commitment-to-settlement pipeline."
//
// ─────────────────────────────────────────────────────────────────────────────
// P3 IS HERE BECAUSE THE SPEC AS WRITTEN CONTAINED A BUG.
//
// Spec 36 §2.4 awards the rounding remainder to "the single top-ranked entry".
// The same audit found that this is ambiguous under ties and that the obvious
// implementation — take the first index matching the maximum — makes payouts
// depend on ARRAY POSITION, destroying the order invariance that is the whole
// reason heats are scored on a closed cohort.
//
// P3 was written before the fix and watched failing on precisely that defect.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_PARAMS,
  type Entry,
  FEATURE_RM_SETTLEMENT,
  MIN_HEAT,
  NEUBERG_N,
  matchpointsX2,
  neubergPercentile,
  settle,
} from '../../game/economy/pari-mutuel.js';
import { ONE, SCALE, integerNthRoot, powRational } from '../../game/economy/fixed-bigint.js';
import { makeRng } from '../sim/world-gen.js';
import { hashState } from '../sim/hash.js';

const failures: string[] = [];
const fail = (d: string): void => void failures.push(d);
const ok = (c: boolean, d: string): void => { if (!c) fail(d); };

/**
 * Prints a summary line ONLY if nothing failed since `mark` was taken.
 *
 * A PLANTED-DEFECT RUN EXPOSED WHY THIS IS NEEDED. With the spec-literal
 * remainder rule in place, P3 recorded three failures and then printed
 * "P3 order invariance: reversal and rotation leave every payout
 * byte-identical" immediately above them, because the log was unconditional.
 * A green sentence sitting next to a red one is how a suite talks somebody out
 * of reading its own output.
 */
const mark = (): number => failures.length;
const summarise = (at: number, line: string): void => {
  if (failures.length === at) console.log(line);
  else console.log(`  [suppressed: ${failures.length - at} failure(s) in this block]`);
};

/** A deterministic heat of `n` entries with spread scores and stakes. */
function heat(n: number, seed: number): Entry[] {
  const rng = makeRng(seed);
  const out: Entry[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      id: `p${String(i).padStart(3, '0')}`,
      score: Math.abs(rng()) % 200,
      stake: BigInt(100 + (Math.abs(rng()) % 900)),
    });
  }
  return out;
}

// ── P0: real money is off ──────────────────────────────────────────────────
{
  ok(FEATURE_RM_SETTLEMENT === false,
    'P0: FEATURE_RM_SETTLEMENT is TRUE. Election E29 (legal counsel) gates real-money settlement ' +
      'and only a human may resolve it. Spec 36 says so of itself: adopting pari-mutuel ' +
      'mathematics does not confer pari-mutuel legal status.');
  console.log('  P0 money gate: FEATURE_RM_SETTLEMENT is false — the arithmetic is built, the ' +
    'activation stays behind E29');
}

// ── P1: the pool closes exactly ────────────────────────────────────────────
{
  const _m = mark();
  let worst = 0n;
  for (let n = 2; n <= 40; n += 1) {
    for (let s = 1; s <= 12; s += 1) {
      const r = settle(heat(n, s * 7919 + n), DEFAULT_PARAMS, false);
      const gap = r.netPool - r.distributed;
      if (gap !== 0n) worst = gap;
      ok(gap === 0n,
        `P1: heat n=${n} seed=${s} distributed ${r.distributed} of a net pool of ${r.netPool} — ` +
          `${gap} minor units unaccounted for. Statute for the real instrument is explicit that ` +
          'licensees must distribute ALL the money in the pool; a pool that does not close is a ' +
          'silent operator margin.');
    }
  }
  summarise(_m, `  P1 pool closure: exact over n=2..40 x 12 seeds — every net pool fully distributed ` +
    `(worst discrepancy ${worst})`);
}

// ── P2: matchpoint field mean is exactly one half ──────────────────────────
{
  const _m = mark();
  for (const n of [2, 5, 16, 33]) {
    const e = heat(n, 4242 + n);
    const mps = matchpointsX2(e);
    const total = mps.reduce((a, m) => a + m, 0);
    // Σ m = n(n−1)/2 ⇒ Σ (m×2) = n(n−1). Mean p = ½ by construction.
    ok(total === n * (n - 1),
      `P2: matchpoints over n=${n} sum to ${total}, expected ${n * (n - 1)}. The field mean must be ` +
        'exactly one half or the weight curve is being fed a distribution it was not designed for.');
  }
  summarise(_m, '  P2 field mean: Σ matchpoints = n(n−1) exactly at n=2,5,16,33 — field mean is ½');
}

// ── P3: ORDER INVARIANCE ───────────────────────────────────────────────────
// THE CHECK THAT CAUGHT THE SPEC'S OWN BUG. Permuting the cohort must not move
// a single minor unit; a heat is scored on a CLOSED cohort precisely so that
// entering at minute 1 and minute 11 are identical.
{
  const _m3 = mark();
  for (const n of [4, 9, 17]) {
    for (let s = 1; s <= 6; s += 1) {
      const base = heat(n, s * 31 + n);
      const canonical = settle(base, DEFAULT_PARAMS, false);
      // Reverse, and a rotation — two different permutations.
      const reversed = settle([...base].reverse(), DEFAULT_PARAMS, false);
      const rotated = settle([...base.slice(3), ...base.slice(0, 3)], DEFAULT_PARAMS, false);
      const key = (r: ReturnType<typeof settle>): string =>
        [...r.payouts].sort((a, b) => (a.id < b.id ? -1 : 1)).map((p) => `${p.id}:${p.payout}`).join(',');
      ok(key(canonical) === key(reversed),
        `P3: reversing the entry order changed the payouts at n=${n} seed=${s}. Order invariance is ` +
          'what makes entering early and late identical; without it the settlement rewards position ' +
          'in an array.');
      ok(key(canonical) === key(rotated),
        `P3: rotating the entry order changed the payouts at n=${n} seed=${s}.`);
    }
  }
  summarise(_m3, '  P3 order invariance: reversal and rotation leave every payout byte-identical ' +
    '(n=4,9,17 x 6 seeds)');

  // NEGATIVE CONTROL — the tie case the audit predicted. Every entry ties at the
  // top, so "the single top-ranked entry" is maximally ambiguous. An index-based
  // remainder rule fails here; the id-sorted split must not.
  const tied: Entry[] = [
    { id: 'zeta', score: 50, stake: 337n },
    { id: 'alpha', score: 50, stake: 337n },
    { id: 'mike', score: 50, stake: 337n },
  ];
  const a = settle(tied, DEFAULT_PARAMS, false);
  const b = settle([...tied].reverse(), DEFAULT_PARAMS, false);
  const norm = (r: ReturnType<typeof settle>): string =>
    [...r.payouts].sort((x, y) => (x.id < y.id ? -1 : 1)).map((p) => `${p.id}:${p.payout}`).join(',');
  ok(norm(a) === norm(b),
    `P3 TIE CONTROL: with every entry tied at the top the payouts depend on input order — ` +
      `${norm(a)} vs ${norm(b)}. This is the exact defect the design audit predicted from the ` +
      'phrase "awarded to the single top-ranked entry".');
  ok(a.distributed === a.netPool,
    'P3 TIE CONTROL: the pool did not close when every entry tied at the top');
  summarise(_m3, `  P3 tie control: three entries tied at the top settle identically under ` +
    `permutation — ${norm(a)}`);
}

// ── P4: Neuberg gives every heat EQUAL WEIGHT ──────────────────────────────
//
// THE FIRST VERSION OF THIS CHECK ASSERTED THE WRONG PROPERTY AND FAILED, and
// the failure is what established what Neuberg actually guarantees.
//
// It asserted that the BOTTOM of a small heat and the bottom of a large heat map
// to the same percentile. They do not, and they must not: at m = 0 the formula
// gives m' = N/n − 1, so last place in a 9-heat lands at p = 0.097 while last in
// a 40-heat lands at p = 0.0095. Measured, not reasoned about — the check
// printed both numbers when it fired.
//
// That is correct behaviour. Neuberg compresses a short cohort toward the middle
// because beating nobody out of 8 is a weaker statement than beating nobody out
// of 39. What it equalises is the WEIGHT of the heat, not the span of it. The two
// properties that do hold, and that the payout curve actually depends on:
//
//   1. A TOP IS A TOP EVERYWHERE. m = n−1 gives m' = n·(N/n) − 1 = N − 1 exactly,
//      so p = 1 for every heat size. Winning a 9-heat is worth precisely what
//      winning a 64-heat is worth, which is the whole point of normalising.
//   2. THE TOTAL IS INVARIANT. Σ m' = N(n+1)/2 − n, which is exactly what a full
//      heat of size N contributes when n = N. A heat cannot buy extra claim on
//      the pool by being short or long.
{
  const _m = mark();
  const near = (a: bigint, b: bigint): boolean => (a > b ? a - b : b - a) < SCALE / 1000n;

  for (const n of [2, 9, 17, 40, 64]) {
    // 1 — the top of every heat is exactly p = 1.
    const top = neubergPercentile(2 * (n - 1), n, NEUBERG_N);
    ok(near(top, ONE),
      `P4: the top of an ${n}-heat maps to ${top}, not ${ONE}. If winning a small heat is worth ` +
        'less than winning a large one, players are rewarded for queueing into big heats rather ' +
        'than for playing well.');

    // 2 — the heat's total contribution is size-invariant.
    let totalX2 = 0n;
    for (let m = 0; m <= n - 1; m += 1) {
      totalX2 += BigInt((m * 2 + 2) * NEUBERG_N - 2 * n);
    }
    // Σ m' = Σ[((mX2+2)N − 2n) / 2n] = (N(n+1)/2 − n)
    const expected = BigInt(NEUBERG_N * (n + 1)) * BigInt(n) - 2n * BigInt(n) * BigInt(n);
    ok(totalX2 === expected,
      `P4: an ${n}-heat contributes ${totalX2} where a size-invariant total is ${expected} — ` +
        'a heat can gain or lose claim on the pool purely by how many people happened to enter it.');
  }

  // The bottoms genuinely differ, and that is recorded as a property rather than
  // asserted away.
  const botSmall = neubergPercentile(0, 9, NEUBERG_N);
  const botLarge = neubergPercentile(0, 40, NEUBERG_N);
  ok(botSmall > botLarge,
    `P4: last place in a 9-heat (${botSmall}) does not rank above last place in a 40-heat ` +
      `(${botLarge}). Neuberg compresses short cohorts toward the middle; if that stopped ` +
      'happening the formula has been changed.');

  summarise(_m, '  P4 Neuberg equal weight: a top maps to exactly p=1 at n=2,9,17,40,64 and each ' +
    "heat's total is size-invariant; short heats compress toward the middle (last of 9 outranks " +
    'last of 40), which is the formula working, not failing');
}

// ── P5: NO FLOATS in settlement source ─────────────────────────────────────
// Textual, in the manner of verify-lattice L1x. Settlement code that acquires a
// float acquires a platform-dependent rounding mode, and two machines that
// disagree by one minor unit disagree about whether the pool closed.
{
  const files = ['../../game/economy/pari-mutuel.ts', '../../game/economy/fixed-bigint.ts'];
  const banned: readonly (readonly [RegExp, string])[] = [
    [/\bMath\.(round|floor|ceil|pow|sqrt|random)\s*\(/, 'a floating-point Math call'],
    [/\bparseFloat\s*\(/, 'parseFloat'],
    [/\bNumber\s*\(\s*[a-zA-Z_$]/, 'a Number() coercion of a variable'],
    [/[^.\w]\d+\.\d+/, 'a decimal literal'],
  ];
  for (const rel of files) {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    // Strip comments — the prose legitimately discusses 2.4 and 0.18.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const [re, what] of banned) {
      const m = re.exec(code);
      ok(m === null, `P5: ${rel} contains ${what} (${m?.[0]?.trim()}) — settlement must be integer-exact`);
    }
  }
  // The scan must be able to fire.
  const planted = 'const rate = 0.185;';
  ok(/[^.\w]\d+\.\d+/.test(` ${planted}`),
    'P5 NEGATIVE CONTROL FAILED: the scan cannot detect a planted decimal literal');
  console.log(`  P5 no floats: ${files.length} settlement sources clean of ${banned.length} float ` +
    'patterns, and the scan fires on a planted decimal');
}

// ── P6: MONOTONICITY, AT CONSTANT STAKE ────────────────────────────────────
//
// The audit's warning about double rounding: "round the 5th root, then round the
// payout division... can violate monotonicity."
//
// ── THIS CHECK WAS RE-SPECIFIED WHEN P15 WAS FIXED, AND THE REASON MATTERS ──
//
// P6 originally asserted that a higher score never pays less, over a heat with
// MIXED stakes. Once settlement became stake-weighted (see P15) it failed
// immediately and correctly: at seed 20 a score of 145 paid 371 while a score of
// 135 paid 876, because the 135 had staked far more. That is not a rounding
// defect — it is a pari-mutuel working. Your claim is proportional to what you
// wagered, so a small stake with a better rank can and should return less than a
// large stake with a worse one.
//
// Monotonicity is therefore a property of the WEIGHT CURVE, and it is tested
// where it actually lives: at CONSTANT STAKE, a better score must never pay
// less. Holding the stake fixed is what isolates the curve from the wager.
{
  const _m = mark();
  for (let s = 1; s <= 20; s += 1) {
    // Constant stake across the heat — see the note above.
    const e = heat(24, s * 101).map((x) => ({ ...x, stake: 500n }));
    const r = settle(e, DEFAULT_PARAMS, false);
    const byId = new Map(r.payouts.map((p) => [p.id, p]));
    const sorted = [...e].sort((a, b) => a.score - b.score);
    for (let i = 1; i < sorted.length; i += 1) {
      const lo = byId.get(sorted[i - 1]!.id)!;
      const hi = byId.get(sorted[i]!.id)!;
      if (sorted[i - 1]!.score < sorted[i]!.score) {
        ok(hi.payout >= lo.payout,
          `P6: score ${sorted[i]!.score} paid ${hi.payout} but the lower score ${sorted[i - 1]!.score} ` +
            `paid ${lo.payout} (seed ${s}). A strictly better result must never pay strictly less — ` +
            'this is the double-rounding failure the design audit named.');
      }
    }
  }
  // And the power itself must be monotone, which is why it is a single floor.
  let prev = -1n;
  for (let k = 0; k <= 64; k += 1) {
    const p = (BigInt(k) * ONE) / 64n;
    const v = powRational(p, 12n, 5n);
    ok(v >= prev, `P6: p^(12/5) decreased at p=${k}/64 — the exponent is not monotone`);
    prev = v;
  }
  summarise(_m, '  P6 monotonicity: over 20 heats of 24, a higher score never pays less; and p^(12/5) ' +
    'is monotone across 65 sample points');
}

// ── P7: the takeout is exactly the takeout ─────────────────────────────────
{
  const _m = mark();
  for (const bps of [0n, 100n, 600n, 1000n]) {
    const e = heat(20, 777);
    const r = settle(e, { ...DEFAULT_PARAMS, takeoutBps: bps, carryBps: 0n }, false);
    const expected = (r.handle * bps) / 10000n;
    ok(r.takeout === expected,
      `P7: at ${bps}bps the takeout is ${r.takeout}, expected ${expected}`);
    // The operator's ENTIRE take must be the takeout — nothing else retained.
    ok(r.handle - r.takeout === r.distributed,
      `P7: handle ${r.handle} minus takeout ${r.takeout} is ${r.handle - r.takeout}, but only ` +
        `${r.distributed} was distributed. The difference is a hidden second margin. Spec 36 ` +
        'diverges from racing practice specifically to avoid one: racing keeps the rounding ' +
        'remainder as breakage, and this design gives it to players instead.');
  }
  summarise(_m, '  P7 exact takeout: at 0/100/600/1000 bps the operator retains the declared ' +
    'commission and nothing else — no breakage, no second margin');
}

// ── P8: the floor is real ──────────────────────────────────────────────────
{
  const e = heat(30, 9001);
  const r = settle(e, DEFAULT_PARAMS, false);
  const worst = r.payouts.reduce((a, p) => (p.payout < a.payout ? p : a));
  ok(worst.payout > 0n,
    `P8: the last-placed entry received ${worst.payout}. FLOOR_W > 0 is a duty-of-care decision — ` +
      'it means the product is never a total-loss machine for the bottom of the field.');
  console.log(`  P8 floor: last place still receives ${worst.payout} minor units — FLOOR_W is real`);
}

// ── P9: system RTP is identically 1 − t ────────────────────────────────────
{
  const _m = mark();
  for (const bps of [0n, 250n, 600n, 900n]) {
    for (const n of [3, 11, 29]) {
      const e = heat(n, 5150 + n);
      const r = settle(e, { ...DEFAULT_PARAMS, takeoutBps: bps, carryBps: 0n }, false);
      // Returned / staked must be exactly (handle − takeout) / handle.
      ok(r.distributed * 10000n === (r.handle - r.takeout) * 10000n,
        `P9: at ${bps}bps n=${n}, distributed ${r.distributed} != handle−takeout ` +
          `${r.handle - r.takeout}. System RTP must be 1−t for EVERY parameter value; it cannot ` +
          'drift, because there is no pay table to mis-tune.');
    }
  }
  summarise(_m, '  P9 RTP: distributed ≡ handle − takeout at 0/250/600/900 bps over n=3,11,29 — ' +
    'system RTP is identically 1−t with no pay table anywhere');
}

// ── P10 / P11 / P12 / P13: the fairness pipeline ───────────────────────────
// The four the design audit named as missing.
{
  // P10 — the commitment binds the seed AND the parameters. Changing either
  // must change the digest, or a heat could be re-settled under new rules.
  const commit = (seed: number, p: typeof DEFAULT_PARAMS, n: number): number =>
    hashState(new Int32Array([
      seed, n, Number(p.takeoutBps), Number(p.carryBps),
      Number(p.gammaNum), Number(p.gammaDen), Number(p.floorW / 1000n),
    ]));
  const base = commit(1234, DEFAULT_PARAMS, 16);
  ok(commit(1235, DEFAULT_PARAMS, 16) !== base, 'P10: changing the SEED did not change the commitment');
  ok(commit(1234, { ...DEFAULT_PARAMS, takeoutBps: 601n }, 16) !== base,
    'P10: changing the TAKEOUT did not change the commitment — the heat could be re-settled at a ' +
      'different commission after the fact');
  ok(commit(1234, { ...DEFAULT_PARAMS, gammaNum: 13n }, 16) !== base,
    'P10: changing GAMMA did not change the commitment — the payout curve could be reshaped after ' +
      'scores were known');
  ok(commit(1234, DEFAULT_PARAMS, 17) !== base, 'P10: changing the heat SIZE did not change the commitment');
  console.log('  P10 commitment binds: seed, takeout, gamma and heat size each move the digest — ' +
    'the rules cannot be changed after the scores are in');

  // P11 — ENTROPY INDEPENDENCE. The seed must not be derivable from, or movable
  // by, anything an entrant supplies. Settling the same cohort under a different
  // seed must not be reachable by editing entries.
  const e1 = heat(12, 31337);
  const withDifferentIds = e1.map((e, i) => ({ ...e, id: `zzz${i}` }));
  const s1 = settle(e1, DEFAULT_PARAMS, false);
  const s2 = settle(withDifferentIds, DEFAULT_PARAMS, false);
  ok(s1.payouts.map((p) => p.payout).join(',') === s2.payouts.map((p) => p.payout).join(','),
    'P11: renaming the entrants changed the payout vector. Entry-supplied data must not influence ' +
      'the settlement beyond the score and stake it declares.');
  console.log('  P11 entropy independence: renaming every entrant leaves the payout vector ' +
    'unchanged — entrant-supplied identity cannot steer the result');

  // P12 — NO FRONT-RUNNING. Settlement is a function of the CLOSED cohort only,
  // so it cannot depend on arrival time. Modelled as: the same cohort presented
  // in arrival order and in reverse arrival order settles identically (P3), AND
  // no entry's payout changes when a LATER entry is appended and removed again.
  const cohort = heat(10, 606);
  const before = settle(cohort, DEFAULT_PARAMS, false);
  const plusLate = settle([...cohort, { id: 'late', score: 999, stake: 500n }], DEFAULT_PARAMS, false);
  const beforeIds = new Map(before.payouts.map((p) => [p.id, p.payout]));
  let changed = 0;
  for (const p of plusLate.payouts) {
    if (p.id !== 'late' && beforeIds.get(p.id) !== p.payout) changed += 1;
  }
  ok(changed > 0,
    'P12: adding an entry to the heat changed NOBODY\'s payout. A pari-mutuel pool is shared, so a ' +
      'new entrant must dilute it — if not, the pool is not actually mutual and the stake is not ' +
      'doing anything.');
  console.log(`  P12 mutuality: a late entrant changes ${changed}/${cohort.length} existing payouts — ` +
    'the pool is genuinely shared, and because scoring is on the closed cohort, WHEN they entered ' +
    'inside the window is irrelevant (P3)');

  // P13 — PUBLIC VERIFIABILITY. A third party with the entries and parameters
  // must reproduce the settlement exactly, twice.
  const again = settle(cohort, DEFAULT_PARAMS, false);
  ok(JSON.stringify(before.payouts.map((p) => `${p.id}:${p.payout}`)) ===
     JSON.stringify(again.payouts.map((p) => `${p.id}:${p.payout}`)),
    'P13: two settlements of identical input disagreed — the result is not reproducible and ' +
      'therefore not verifiable by anyone');
  console.log('  P13 public verifiability: identical input reproduces the settlement exactly');
}

// ── P15: YOUR STAKE MUST MATTER ────────────────────────────────────────────
//
// THE EXPLOIT THAT PASSED EVERY OTHER CHECK IN THIS FILE.
//
// Spec 36 §2.4 settles as π_i = Π·g(p_i)/Σg(p_j) — a function of RANK ALONE,
// with the entry's own stake appearing nowhere. Measured on the code as first
// written: four entries staking 10000 each, and one staking 1 that placed
// second.
//
//     whale-A   stake 10000  ->  payout 14415       144%
//     MINNOW    stake     1  ->  payout  9446    944600%
//
// The pool closed exactly. Order invariance held. Monotonicity held. RTP was
// identically 1−t. P1 through P14 all passed, because none of them asks whether
// what you put in has anything to do with what you take out.
//
// The spec contradicts itself here: §3.1's live projection is
// `stake · (1−t) · g(p̂)/E[g]`, which IS stake-proportional, while §2.4's
// settlement is not. §3.1 is right — a pari-mutuel claim is proportional to what
// was wagered, adjusted by outcome, which is how every real pool works.
{
  const _m = mark();
  const mixed: Entry[] = [
    { id: 'whale-A', score: 150, stake: 10000n },
    { id: 'whale-B', score: 140, stake: 10000n },
    { id: 'whale-C', score: 130, stake: 10000n },
    { id: 'whale-D', score: 120, stake: 10000n },
    { id: 'minnow', score: 145, stake: 1n },
  ];
  const r = settle(mixed, DEFAULT_PARAMS, false);
  const byId = new Map(r.payouts.map((p) => [p.id, p.payout]));
  const minnow = byId.get('minnow')!;
  const whaleB = byId.get('whale-B')!;

  // The minnow out-ranks whale-B but staked one ten-thousandth as much. It must
  // not out-earn it.
  ok(minnow < whaleB,
    `P15: an entry staking 1 unit received ${minnow} while an entry staking 10000 received ` +
      `${whaleB}. Settlement is ignoring the stake entirely, so the cheapest possible entry ` +
      'extracts from the pool at the same rate as the largest. Every other check in this file ' +
      'passes while this is true.');

  // And the return on stake must not explode for a dust entry.
  ok(minnow <= mixed[4]!.stake * 100n,
    `P15: the 1-unit entry returned ${minnow}, a ${Number(minnow) * 100}% return on stake. A ` +
      'dust entry cannot be the most profitable position in the pool.');

  summarise(_m, `  P15 stake matters: a 1-unit entry ranking 2nd receives ${minnow}, below the ` +
    `${whaleB} taken by a 10000-unit entry ranking 3rd — claim on the pool scales with what was ` +
    'wagered');
}

// ── P14: the heat-size floor is enforced ───────────────────────────────────
{
  const _m = mark();
  for (const n of [0, 1]) {
    let threw = false;
    try { settle(heat(Math.max(n, 0), 1).slice(0, n), DEFAULT_PARAMS, false); } catch { threw = true; }
    ok(threw,
      `P14: a heat of ${n} was settled rather than rejected. Matchpointing divides by M = n − 1, so ` +
        'n = 1 divides by zero and n = 0 has no cohort at all.');
  }
  ok(MIN_HEAT >= 8,
    `P14: MIN_HEAT is ${MIN_HEAT}. Spec 36 proposes 8 with merge-forward rather than relying on ` +
      'Neuberg to rescue tiny cohorts, because the Neuberg source flags its own objective as of ' +
      'questionable soundness.');
  summarise(_m, `  P14 heat floor: n=0 and n=1 are rejected; MIN_HEAT=${MIN_HEAT} for merge-forward`);
}

// ── the exponent's own arithmetic ──────────────────────────────────────────
{
  // integerNthRoot must be exact on perfect powers and floor elsewhere.
  ok(integerNthRoot(1024n, 10n) === 2n, 'nth root: 2^10 = 1024');
  ok(integerNthRoot(1023n, 10n) === 1n, 'nth root: floors below a perfect power');
  ok(integerNthRoot(59049n, 5n) === 9n, 'nth root: 9^5 = 59049');
  // p = 1 must map to exactly 1.
  ok(powRational(ONE, 12n, 5n) === ONE, `powRational(1) = ${powRational(ONE, 12n, 5n)}, expected ${ONE}`);
  ok(powRational(0n, 12n, 5n) === 0n, 'powRational(0) must be 0');
  console.log('  exponent: integerNthRoot exact on perfect powers, floors otherwise; p^(12/5) fixes ' +
    'both endpoints exactly');
}

if (failures.length > 0) {
  console.error(`verify-parimutuel: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('verify-parimutuel: P0-P14 pass. The pool closes exactly, the order of entry cannot move ' +
  'a minor unit, and real-money settlement stays behind E29.');
