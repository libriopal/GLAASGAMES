// engine/verify/verify-montecarlo.ts — the harness is trustworthy, and the 69
// candidates were ranked by it rather than by taste.
//
// M0  CALIBRATION: the ladder reproduces what is already known about the
//     shipped game, and the rungs are ORDERED.
// M1  the catalogue is exactly 69 and deterministic
// M2  the fairness gate catches every loaded distribution ABOVE its floor
// M3  the fairness gate PASSES every uniform one            (no false positive)
// M4  exploitability, against the INFERABLE ceiling
// M5  the shipped config is byte-identical after the config extensions
// M6  each of the above is caught when broken            (NEGATIVE CONTROLS)
// M7  the LEARNER ACTUALLY LEARNS                       (the X-MC1 regression)
// M8  all 69 candidates are DISTINCT GAMES                  (the X-MC6 regression)
// M9  the gate's POWER CURVE, including where it is zero
//
// ─────────────────────────────────────────────────────────────────────────────
// M7 AND M8 EXIST BECAUSE THIS SUITE ALREADY PASSED ONCE WHILE BEING WRONG.
//
// The first version reported "45/45 loaded caught, 0/24 fair falsely flagged"
// and a headline that the game was exploitable. Both were artifacts:
//
//   - 69 candidates were 20 distinct games, because `refill` is inert. Nothing
//     asked whether two candidates were the same game.                    -> M8
//   - the "learnable" rung had a usable memory on 1.52% of decisions, so its
//     1.4-point lift was noise and the exploitability finding was measuring the
//     policy's ignorance.                                                 -> M7
//   - the 45 and the 24 were 5 and 1 distinct chi-square values, repeated. The
//     mildest loaded distribution was 3.4x over the critical value, so the
//     gate's sensitivity was never tested at all.                         -> M9
//
// A check that cannot fail on the defect it names is not a check. These three
// are written against the specific defects that shipped.

import {
  BASELINE,
  belowFloorIds,
  catalogue,
  distributions,
  loadedIds,
} from '../../foundry/montecarlo/variants.js';
import {
  declaredBestTrivial,
  detectionRate,
  evaluate,
  searchSiblings,
  faceSampleSize,
  faceUniformityChiSquare,
  sampleFaces,
} from '../../foundry/montecarlo/harness.js';
import { BASE_TERMS, MULTIPLIER_TERMS, siblings } from '../../foundry/montecarlo/siblings.js';
import { CELL_COUNT, EMPTY } from '../../lattice/board.js';
import { DEFAULT_ROUND, playRound } from '../../lattice/round.js';

const failures: string[] = [];
const fail = (d: string): void => void failures.push(d);
const ok = (c: boolean, d: string): void => { if (!c) fail(d); };

/** Rounds per agent per variant. */
const SEEDS = Number(process.env['MC_SEEDS'] ?? 120);

/**
 * Chi-square critical value, 5 degrees of freedom, p = 0.001.
 *
 * PINNED FROM THE TABLE, not tuned until the answer came out right.
 */
const CHI_CRITICAL = 20.515;

// ── M5: the shipped game did not move ──────────────────────────────────────
//
// ── RE-ANCHORED ONCE, DELIBERATELY, AND THE REASON IS RECORDED HERE ──────────
//
// This anchor guards ADDITIVITY: an optional config field — `faceWeights`,
// `deviation`, `chargeMax` — must leave the default game byte-identical. It held
// through all three.
//
// It moved when the refill stopped walking a sequential xorshift stream and
// started reading `faceAtOrdinal(seed, ordinal)` instead. That is not a config
// extension; it is a change of where faces come from, so every board differs and
// the anchor was always going to move with it. The previous values were 32 /
// 3740550746.
//
// The reason for writing that down rather than quietly editing the numbers: an
// anchor whose value is updated whenever it fails guards nothing. This one is
// re-pinned exactly once, against a named change, and the next time it moves
// that will again need a reason in this comment or the change is a defect.
{
  const r = playRound(90210, DEFAULT_ROUND, () => 0);
  ok(r.score === 46 && (r.digest >>> 0) === 1915249688,
    `M5: the shipped config now scores ${r.score} / digest ${r.digest >>> 0}, but the game as ` +
      'released scored 46 / 1915249688 — a config extension was not additive');
  console.log('  M5 additive: shipped config still scores 46, digest 1915249688 — unchanged by ' +
    'faceWeights, deviation and chargeMax');
}

// ── M1: the catalogue ──────────────────────────────────────────────────────
{
  const all = catalogue();
  ok(all.length === 69, `M1: the catalogue holds ${all.length} candidates, expected 69`);
  const ids = new Set(all.map((v) => v.id));
  ok(ids.size === all.length, 'M1: duplicate candidate ids');
  const again = catalogue().map((v) => v.id).join(',');
  ok(again === all.map((v) => v.id).join(','), 'M1: the catalogue is not deterministic');

  const loaded = loadedIds();
  ok(loaded.length === 30,
    `M1: ${loaded.length} candidates carry a loaded distribution, expected 30 — the suite needs ` +
      'candidates that are supposed to fail, or M2 tests nothing');
  console.log(`  M1 catalogue: 69 candidates — ${all.length - loaded.length} fair, ${loaded.length} loaded ` +
    `(${belowFloorIds().length} of them deliberately below the gate's floor)`);
}

// ── M8: all 69 are DISTINCT GAMES ──────────────────────────────────────────
// THE CHECK WHOSE ABSENCE LET A PADDED CATALOGUE SHIP. Two configs that produce
// the same round digest under the same policy are the same game, and counting
// them twice inflates the catalogue without adding a hypothesis.
{
  const all = catalogue();
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  // THE PROBE POLICY MUST EXERCISE EVERY AXIS IT JUDGES. Banking cell 0 forever
  // never lets charge reach its cap, so under that policy `chargeMax` looks as
  // inert as `refill` and two genuinely different games hash the same. Banking
  // the LEAST charged open cell leaves charge to accumulate, so the cap binds.
  const leastCharged = (o: Int32Array): number => {
    let best = 0;
    let bc = Infinity;
    for (let i = 0; i < CELL_COUNT; i += 1) {
      if ((o[i * 3] ?? EMPTY) === EMPTY) continue;
      const c = o[i * 3 + 2] ?? 0;
      if (c < bc) { bc = c; best = i; }
    }
    return best;
  };
  for (const v of all) {
    let d = 0;
    for (let s = 1; s <= 8; s += 1) d = (d ^ playRound(s, v.config, leastCharged).digest) >>> 0;
    const key = String(d);
    const prior = seen.get(key);
    if (prior !== undefined) collisions.push(`${v.id} == ${prior}`);
    else seen.set(key, v.id);
  }
  ok(collisions.length === 0,
    `M8: ${collisions.length} candidates are the SAME GAME as another: ${collisions.slice(0, 6).join(', ')}. ` +
      'The previous catalogue swept `refill`, which is inert, and 69 candidates were 20 distinct ' +
      'games. A catalogue with duplicates does not test what its count claims.');
  console.log(`  M8 distinctness: all ${all.length} candidates produce distinct round digests — ` +
    '69 candidates, 69 games');

  // The control: refill, the inert axis, must still be shown to be inert.
  let a = 0;
  let b = 0;
  for (let s = 1; s <= 8; s += 1) {
    a = (a ^ playRound(s, { turns: 12, refill: 1 }, leastCharged).digest) >>> 0;
    b = (b ^ playRound(s, { turns: 12, refill: 6 }, leastCharged).digest) >>> 0;
  }
  ok(a === b,
    'M8 CONTROL: refill 1 and refill 6 now differ. That would be good news, but the catalogue ' +
      'documents refill as inert and holds it constant — if this fires, the documentation is stale.');
  console.log('  M8 control: refill 1 and refill 6 still produce identical digests — the axis is ' +
    'inert, which is why it is documented and held constant rather than swept');
}

// ── M0: calibration against the shipped game ───────────────────────────────
{
  const m = evaluate(BASELINE, SEEDS);
  ok(m.clairvoyant > m.regionOracle,
    `M0: the omniscient rung (${m.clairvoyant.toFixed(1)}) does not exceed the region oracle ` +
      `(${m.regionOracle.toFixed(1)}) — knowing every link must beat knowing only the flows`);
  // Against the STRONGEST TRIVIAL policy, not the weakest. Comparing the oracle
  // to charge-chasing flattered it: X-MC8 found a no-memory neighbour heuristic
  // that beats charge-chasing by 7 points, and every ratio taken against the
  // weaker baseline overstated how much of the game inference explains.
  const bestTrivial = Math.max(m.greedy, m.chargeAware, m.neighbourAware, m.expectedPayout);
  ok(m.regionOracle > bestTrivial,
    `M0: the region oracle (${m.regionOracle.toFixed(1)}) does not exceed the best TRIVIAL policy ` +
      `(${bestTrivial.toFixed(1)}) — if knowing the flows buys nothing over a one-liner, the ` +
      'hidden lattice is decoration and the game has no subject');
  ok(m.skillDepth > 0,
    `M0: skill depth on the SHIPPED game measures ${m.skillDepth.toFixed(3)}. verify-learnable ` +
      'already established that inference pays here. An instrument that cannot reproduce a ' +
      'known-positive result must not be used to rank anything.');
  ok(m.faceChiSquare < CHI_CRITICAL,
    `M0: the SHIPPED game fails its own fairness gate (chi-square ${m.faceChiSquare.toFixed(1)})`);
  console.log(`  M0 calibration: blind ${m.blind.toFixed(1)}, greedy ${m.greedy.toFixed(1)}, ` +
    `charge ${m.chargeAware.toFixed(1)}, nbr ${m.neighbourAware.toFixed(1)}, ` +
    `EXP-PAYOUT ${m.expectedPayout.toFixed(1)}, LEARNER ${m.regionFlow.toFixed(1)} ` +
    `(no-belief ${m.regionFlowNoBelief.toFixed(1)}), ` +
    `region-oracle ${m.regionOracle.toFixed(1)}, omniscient ${m.clairvoyant.toFixed(1)}`);
  console.log(`                 the hidden lattice is worth ${(m.regionOracle - bestTrivial).toFixed(1)} points ` +
    'over the best trivial policy — the quantity the retracted headline put at ~1.4');
  console.log(`                 skill depth ${m.skillDepth.toFixed(3)} (of the INFERABLE span), ` +
    `dominance ${m.dominance.toFixed(3)}, headroom ${m.headroom.toFixed(3)}`);
  console.log(`                 absolute depth vs omniscience ${m.absoluteDepth.toFixed(3)} — the gap ` +
    'between these two is the un-inferable 25% of links');
}

// ── M7: the learner actually learns, and the belief is what does it ────────
// THE X-MC1/X-MC7 REGRESSION, and the strictest check in this file.
//
// Two earlier rungs passed a weaker version of this. The first gained 1.4 points
// from a memory usable on 1.52% of decisions. The second gained more, but a
// control showed a rung that NEVER LEARNS and always believes "north" beat it —
// the gain came from the scoring shape, not from inference.
//
// So the test is no longer "does the learner beat a weaker rung". It is: does
// INVERTING THE BELIEF, changing nothing else, cost points? Only a belief
// carrying real information can be worth less upside down.
{
  const m = evaluate(BASELINE, SEEDS);

  ok(m.regionFlow > Math.max(m.greedy, m.chargeAware, m.neighbourAware),
    `M7: the learner (${m.regionFlow.toFixed(1)}) does not beat the best trivial policy ` +
      `(${Math.max(m.greedy, m.chargeAware, m.neighbourAware).toFixed(1)}). It falls back to the ` +
      'neighbour-mean estimate wherever it has no belief, so it is a strict superset of that ' +
      'policy and can only lose to it by acting on beliefs that are worse than nothing.');

  ok(m.inferenceValue > 3,
    `M7: switching the learner's belief OFF costs only ${m.inferenceValue.toFixed(2)} points. A belief ` +
      'that is nearly as good upside down is not carrying information, and whatever the rung is ' +
      'gaining is coming from the shape of the scoring function — which is exactly the artifact ' +
      'that made the first two versions of this ladder wrong.');

  console.log(`  M7 the belief is load-bearing: learner ${m.regionFlow.toFixed(1)}, same rung with ` +
    `its belief OFF ${m.regionFlowNoBelief.toFixed(1)} — inference is worth ` +
    `${m.inferenceValue.toFixed(1)} points (inverting it would read ` +
    `${m.inferenceUpperBound.toFixed(1)}, an upper bound the audit showed is ~2.7x too large)`);

  // NEGATIVE CONTROL: on a lattice with NO region structure, inverting a belief
  // about region structure must cost NOTHING. An effect claimed must be shown to
  // vanish where it cannot exist.
  const noise = evaluate(
    { id: 'ctl', axis: 'control', note: 'deviation 1 — no region structure', config: { turns: 12, refill: 4, deviation: 1 } },
    SEEDS,
  );
  // THE PROPERTY IS "MUST NOT PAY", NOT "MUST BE ZERO", and the difference is a
  // finding rather than a tolerance.
  //
  // The first version of this control asserted |value| < half the structured
  // value. It FAILED at -4.47, and the failure was correct information: on a
  // board whose links ignore their region there is nothing to infer, so the
  // learner's tally is pure noise — and acting on it costs 4.47 points against
  // simply not believing. The instrument was right and the assertion was wrong.
  //
  // The independent audit was asked whether the learner should be changed to
  // remove this, and said no: "Keep and report. S2b is a critical diagnostic of
  // the learner's propensity to overfit noise. Changing the learner to 'fix'
  // this would mask a fundamental architectural weakness."
  //
  // So the assertion is the one that can only be satisfied honestly: on a board
  // with no structure, the belief must not PAY. A learner that gained there
  // would be reading a pattern that is not present — which is precisely the
  // apophenia hazard `lattice-gen.ts` gives as the safety rationale for making
  // the lattice structured in the first place.
  const NOISE_TOLERANCE = 1.0;
  ok(noise.inferenceValue < NOISE_TOLERANCE,
    `M7 NEGATIVE CONTROL FAILED: on a lattice with NO region structure (deviation 1) the belief ` +
      `PAYS ${noise.inferenceValue.toFixed(2)} points. There is nothing there to be right about, so ` +
      'a positive value means the rung is responding to something other than the lattice — or that ' +
      'the deviation-1 board is not as structureless as it is supposed to be.');

  // And the cost, reported rather than hidden. This is a property of the LEARNER,
  // not of the game, and it is deliberately left in.
  ok(noise.inferenceValue <= 0,
    `M7: the apophenia cost is now ${noise.inferenceValue.toFixed(2)}, i.e. non-negative. That is ` +
      'a CHANGE worth noticing rather than an error — it would mean the learner stopped being ' +
      'harmed by acting on noise, and the claim should be re-derived rather than assumed.');
  console.log(`  M7 control: on an unlearnable lattice the belief is worth ` +
    `${noise.inferenceValue.toFixed(1)} points — NEGATIVE, and reported rather than fixed. The ` +
    'learner tallies a modal direction out of pure noise and acts on it, losing points against ' +
    'simply not believing. That is the apophenia failure lattice-gen.ts names as the safety ' +
    'rationale for the whole design, measured here inside the instrument built to look for it.');
}

// ── M2 / M3 / M4: the sweep ────────────────────────────────────────────────
{
  const all = catalogue();
  const loaded = new Set(loadedIds());
  const belowFloor = new Set(belowFloorIds());
  const results = all.map((v) => ({ v, m: evaluate(v, SEEDS) }));

  let caught = 0;
  let shouldCatch = 0;
  let falsePositives = 0;
  const missed: string[] = [];

  for (const { v, m } of results) {
    const flagged = m.faceChiSquare >= CHI_CRITICAL;
    if (belowFloor.has(v.id)) continue; // expected to pass; asserted separately
    if (loaded.has(v.id)) {
      shouldCatch += 1;
      if (flagged) caught += 1;
      else if (missed.length < 4) missed.push(`${v.id} (chi ${m.faceChiSquare.toFixed(1)})`);
    } else if (flagged) {
      falsePositives += 1;
    }
  }

  ok(caught === shouldCatch,
    `M2: ${caught}/${shouldCatch} detectable loaded distributions were caught. Missed: ` +
      `${missed.join(', ')}. A gate that lets a loaded die through is the exploit this suite exists ` +
      'to prevent.');

  ok(falsePositives === 0,
    `M3: ${falsePositives} uniform candidates were flagged unfair — a gate that rejects everything ` +
      'is as useless as one that rejects nothing, and gets switched off faster');

  // THE HONEST COUNT. These are repeats of a handful of distributions, and
  // saying so is the difference between a result and a headline.
  const distinctChi = new Set(results.map((r) => r.m.faceChiSquare.toFixed(6)));
  console.log(`  M2/M3 fairness: ${caught}/${shouldCatch} detectable loaded caught, ` +
    `${falsePositives} fair falsely flagged`);
  console.log(`                  those ${results.length} candidates carry only ${distinctChi.size} DISTINCT ` +
    'chi-square values — the gate is a function of faceWeights and sample size alone, so the ' +
    'per-candidate counts are repeats and are not reported as independent tests');

  // The below-floor candidates must NOT be flagged — that is the measured limit.
  const floorFlagged = results.filter((r) => belowFloor.has(r.v.id) && r.m.faceChiSquare >= CHI_CRITICAL);
  ok(floorFlagged.length === 0,
    `M2 FLOOR: ${floorFlagged.length} below-floor candidates were flagged. If the gate got MORE ` +
      'sensitive that is good news, but the documented floor is now wrong and must be re-measured.');
  const anyFloor = results.find((r) => belowFloor.has(r.v.id));
  if (anyFloor) {
    console.log(`  M2 floor: a 10% single-face bias scores chi ${anyFloor.m.faceChiSquare.toFixed(1)} at ` +
      `n=${anyFloor.m.faceSamples} and is NOT caught. That is the gate's measured sensitivity limit, ` +
      'published rather than assumed.');
  }

  // ── M4a — DEGENERACY. A board where knowing the lattice buys nothing. ────
  //
  // This is a SAFETY gate before it is a balance one. `lattice-gen.ts` argues
  // that showing players a hidden layer is defensible only when the layer is
  // real and inferable; a variant with no inferable span is noise dressed as
  // structure, aimed at exactly the pattern-seeking the file warns about.
  //
  // It also has to exist for the arithmetic. On the first run of this file the
  // deviation-1 noise boards ranked FIRST — skill depth 1.899, 1.352, 1.292 —
  // because their denominator had collapsed, not because they were deep.
  const fair = results.filter((r) => !loaded.has(r.v.id));
  const degenerate = fair.filter((r) => r.m.degenerate);
  const noiseBoards = fair.filter((r) => r.v.config.deviation === 1);
  ok(noiseBoards.length > 0 && noiseBoards.every((r) => r.m.degenerate),
    `M4a POSITIVE CONTROL FAILED: ${noiseBoards.filter((r) => !r.m.degenerate).length} of ` +
      `${noiseBoards.length} deviation-1 candidates were NOT flagged degenerate. A lattice whose ` +
      'links ignore their region entirely carries no inferable structure by construction, so if ' +
      'the detector cannot see that, it cannot see anything.');
  console.log(`  M4a degeneracy: ${degenerate.length} of ${fair.length} fair candidates are boards ` +
    'where the hidden lattice is worth nothing — rejected, not ranked');
  console.log(`                  all ${noiseBoards.length} deviation-1 (pure noise) candidates were ` +
    'caught by that gate, which is the control that makes the other rejections trustworthy');

  // M4 — exploitability, among candidates that are actually games.
  const playable = fair.filter((r) => !r.m.degenerate);
  ok(playable.length > 0, 'M4: every fair candidate is degenerate — the sweep found no game at all');
  const worst = playable.reduce((a, b) => (a.m.dominance > b.m.dominance ? a : b));
  ok(worst.m.dominance < 0.95,
    `M4: on ${worst.v.id} a trivial strategy captures ${(worst.m.dominance * 100).toFixed(1)}% of ` +
      'the INFERABLE value — the interesting decisions are decorative there');

  const survivors = playable
    .filter((r) => r.m.faceChiSquare < CHI_CRITICAL && r.m.stagnation < 0.2)
    .sort((a, b) => b.m.skillDepth - a.m.skillDepth);

  ok(survivors.length > 0, 'M4: no candidate survived the gates, so the sweep produced nothing');

  console.log('');
  console.log(`  M4 RANKED SURVIVORS (${survivors.length} of ${all.length}), by skill depth over the inferable span:`);
  for (const s of survivors.slice(0, 8)) {
    console.log(`    ${s.v.id.padEnd(18)} depth ${s.m.skillDepth.toFixed(3)}  ` +
      `dominance ${s.m.dominance.toFixed(3)}  span ${s.m.inferableSpan.toFixed(1)}  ` +
      `inference ${s.m.inferenceValue.toFixed(1)}  stagn ${(s.m.stagnation * 100).toFixed(0)}%  — ${s.v.note}`);
  }
  const base = evaluate(BASELINE, SEEDS);
  const better = survivors.filter((s) => s.m.skillDepth > base.skillDepth);
  console.log('');
  console.log(`  M4 verdict: ${better.length} of ${survivors.length} survivors beat the SHIPPED config's ` +
    `skill depth of ${base.skillDepth.toFixed(3)}.`);
  if (better.length > 0) {
    console.log(`              best is ${better[0]!.v.id} at ${better[0]!.m.skillDepth.toFixed(3)} — ` +
      `${better[0]!.v.note}`);
  }
}

// ── M9: the gate's power curve ─────────────────────────────────────────────
// A single chi-square is one draw. Power is the fraction of independent samples
// flagged, and publishing it — INCLUDING the levels where it is zero — is what
// stops "the gate works" from being an unmeasured claim.
{
  const n = faceSampleSize({ turns: 12, refill: 4 }, SEEDS);
  console.log('');
  console.log(`  M9 gate power at n=${n} faces (${SEEDS} seeds x 12 turns), 40 trials each:`);
  const ladder: readonly (readonly [string, readonly number[]])[] = [
    ['uniform          ', [0, 4, 4, 4, 4, 4, 4]],
    ['+5%  on face 6   ', [0, 40, 40, 40, 40, 40, 42]],
    ['+10% on face 6   ', [0, 40, 40, 40, 40, 40, 44]],
    ['+25% on face 6   ', [0, 4, 4, 4, 4, 4, 5]],
    ['+50% on face 6   ', [0, 4, 4, 4, 4, 4, 6]],
    ['top-heavy        ', [0, 3, 3, 4, 4, 5, 5]],
  ];
  for (const [name, w] of ladder) {
    const p = detectionRate(w, n, 40, CHI_CRITICAL);
    console.log(`     ${name} detected in ${(p * 100).toFixed(0)}% of trials`);
  }
  const uniformPower = detectionRate([0, 4, 4, 4, 4, 4, 4], n, 40, CHI_CRITICAL);
  ok(uniformPower <= 0.05,
    `M9: a UNIFORM distribution is flagged in ${(uniformPower * 100).toFixed(0)}% of trials — the ` +
      'false-positive rate should sit near the 0.1% the critical value implies');
  const strongPower = detectionRate([0, 3, 3, 4, 4, 5, 5], n, 40, CHI_CRITICAL);
  ok(strongPower >= 0.99,
    `M9: a clearly top-heavy distribution is caught in only ${(strongPower * 100).toFixed(0)}% of ` +
      'trials — the gate is not reliable on the cases it is supposed to be reliable on');
}

// ── M10: THE SIBLING SEARCH ────────────────────────────────────────────────
// The suite looks for a stronger trivial policy so the author does not have to.
// This ladder has been published wrong three times and every time the cause was
// the same: a trivial rung nobody tried.
//
// THE MARGIN IS NOT SLOP, IT IS THE WINNER'S CURSE. The independent audit:
//
//   "The 'Winner's Curse' (look-elsewhere effect) will cause the maximum of N
//    noisy estimates to be biased upward, leading to frequent, non-deterministic
//    build failures when the declared policy is statistically tied with a
//    sibling. You must implement a Bonferroni correction or... an assertion of
//    Score(declared) > max(Score(siblings)) - k * SE."
//
// Taking a maximum over ~21 noisy estimates biases it upward, so a bare `>`
// would go red on ties and get switched off. A sibling must beat the declared
// rung by more than its own 95% interval before the build fails.
{
  const m = evaluate(BASELINE, SEEDS);
  const declaredBest = Math.max(m.greedy, m.chargeAware, m.neighbourAware, m.expectedPayout);

  const found = searchSiblings(DEFAULT_ROUND, SEEDS, declaredBestTrivial);
  const expected = BASE_TERMS.length * MULTIPLIER_TERMS.length;
  ok(siblings().length === expected,
    `M10: the grammar generated ${siblings().length} policies, expected ${expected} — the space ` +
      'is pinned so that widening it is a number somebody has to defend');

  const beaten = found.filter((f) => f.deltaVsDeclared - f.ci95 > 0);
  ok(beaten.length === 0,
    `M10 SIBLING SEARCH: ${beaten.length} machine-generated TRIVIAL policies beat the ladder's ` +
      `declared best trivial rung by more than their own 95% interval. Strongest: ` +
      beaten.slice(0, 3).map((b) => `${b.id} (+${b.deltaVsDeclared.toFixed(2)} +-${b.ci95.toFixed(2)})`).join(', ') +
      '. Every published number that normalises against the trivial baseline is overstated by ' +
      'that margin. This is the third time this ladder has missed a trivial rung.');

  console.log(`  M10 sibling search: ${found.length} generated trivial policies played over ${SEEDS} ` +
    `paired seeds; declared best trivial ${declaredBest.toFixed(1)}`);
  for (const f of found.slice(0, 3)) {
    console.log(`      ${f.id.padEnd(22)} ${f.mean.toFixed(2)}  delta ${f.deltaVsDeclared >= 0 ? '+' : ''}` +
      `${f.deltaVsDeclared.toFixed(2)} +-${f.ci95.toFixed(2)}`);
  }
}

// ── M11: THE LEARNER FLOOR ─────────────────────────────────────────────────
// The audit's answer to "what is the highest-severity thing MISSING":
//
//   "The current solution only ensures that your 'trivial' baseline is
//    internally consistent. It does nothing to ensure the learner is actually
//    performing useful inference... If the learner cannot outperform the best
//    policy in your generative trivial space, the learner has failed."
//
// M7 asserts the learner beats the rungs the AUTHOR wrote. M11 asserts it beats
// every rung the MACHINE can write. Those are different claims and only the
// second one is safe from the failure that has happened three times.
{
  const m = evaluate(BASELINE, SEEDS);
  const strongest = searchSiblings(DEFAULT_ROUND, SEEDS, () => 0)
    .reduce((a, b) => (a.mean > b.mean ? a : b));
  ok(m.regionFlow > strongest.mean,
    `M11 LEARNER FLOOR: the learner scores ${m.regionFlow.toFixed(2)} but the strongest ` +
      `MACHINE-GENERATED trivial policy (${strongest.id}) scores ${strongest.mean.toFixed(2)}. ` +
      'A learner that cannot beat a memoryless one-liner is not performing inference, and every ' +
      'skill number derived from it is measuring something else.');
  console.log(`  M11 learner floor: learner ${m.regionFlow.toFixed(2)} vs strongest generated ` +
    `trivial ${strongest.id} ${strongest.mean.toFixed(2)}`);
}

// ── M6: the controls ───────────────────────────────────────────────────────
{
  const loadedFaces: number[] = [];
  for (let i = 0; i < 3000; i += 1) loadedFaces.push(i % 10 === 0 ? 1 : 6);
  const chiLoaded = faceUniformityChiSquare(loadedFaces);
  ok(chiLoaded >= CHI_CRITICAL,
    `M6 NEGATIVE CONTROL FAILED: a 90%-sixes sample scored chi-square ${chiLoaded.toFixed(1)}, ` +
      `below the ${CHI_CRITICAL} critical value — the fairness statistic cannot detect a loaded die`);

  const fairFaces: number[] = [];
  for (let i = 0; i < 3000; i += 1) fairFaces.push((i % 6) + 1);
  const chiFair = faceUniformityChiSquare(fairFaces);
  ok(chiFair < CHI_CRITICAL,
    `M6 NEGATIVE CONTROL FAILED: a perfectly uniform sample scored ${chiFair.toFixed(1)} and would ` +
      'be rejected — the gate has a false-positive problem');

  // And the sampler must produce what it is asked for.
  const drawn = sampleFaces([0, 0, 0, 0, 0, 0, 24], 500, 1);
  ok(drawn.every((f) => f === 6),
    'M6 NEGATIVE CONTROL FAILED: sampling an all-sixes distribution produced other faces — the ' +
      'fairness gate is not sampling the distribution it was handed');

  console.log('');
  console.log(`  M6 controls: 90%-sixes scores chi-square ${chiLoaded.toFixed(0)} (rejected); ` +
    `uniform scores ${chiFair.toFixed(2)} (accepted); critical ${CHI_CRITICAL} at 5 df, p=0.001`);
}

if (failures.length > 0) {
  console.error(`verify-montecarlo: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`verify-montecarlo: M0-M9 pass over ${SEEDS} seeds x 6 agents x 69 candidates, all of ` +
  'them distinct games, ranked against what a player can actually infer.');
