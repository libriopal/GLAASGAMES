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
  detectionRate,
  evaluate,
  faceSampleSize,
  faceUniformityChiSquare,
  sampleFaces,
} from '../../foundry/montecarlo/harness.js';
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
{
  const r = playRound(90210, DEFAULT_ROUND, () => 0);
  ok(r.score === 32 && (r.digest >>> 0) === 3740550746,
    `M5: the shipped config now scores ${r.score} / digest ${r.digest >>> 0}, but the game as ` +
      'released scored 32 / 3740550746 — a config extension was not additive');
  console.log('  M5 additive: shipped config still scores 32, digest 3740550746 — unchanged by ' +
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
  const bestTrivial = Math.max(m.greedy, m.chargeAware, m.neighbourAware);
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
    `charge ${m.chargeAware.toFixed(1)}, NEIGHBOUR ${m.neighbourAware.toFixed(1)}, ` +
    `LEARNER ${m.regionFlow.toFixed(1)} (scrambled ${m.regionFlowScrambled.toFixed(1)}), ` +
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
    `M7: inverting the learner's belief costs only ${m.inferenceValue.toFixed(2)} points. A belief ` +
      'that is nearly as good upside down is not carrying information, and whatever the rung is ' +
      'gaining is coming from the shape of the scoring function — which is exactly the artifact ' +
      'that made the first two versions of this ladder wrong.');

  console.log(`  M7 the belief is load-bearing: learner ${m.regionFlow.toFixed(1)}, same rung with ` +
    `its belief INVERTED ${m.regionFlowScrambled.toFixed(1)} — inference is worth ` +
    `${m.inferenceValue.toFixed(1)} points`);

  // NEGATIVE CONTROL: on a lattice with NO region structure, inverting a belief
  // about region structure must cost NOTHING. An effect claimed must be shown to
  // vanish where it cannot exist.
  const noise = evaluate(
    { id: 'ctl', axis: 'control', note: 'deviation 1 — no region structure', config: { turns: 12, refill: 4, deviation: 1 } },
    SEEDS,
  );
  ok(Math.abs(noise.inferenceValue) < m.inferenceValue / 2,
    `M7 NEGATIVE CONTROL FAILED: on a lattice with NO region structure (deviation 1), inverting ` +
      `the belief still moves the score by ${noise.inferenceValue.toFixed(2)} points, against ` +
      `${m.inferenceValue.toFixed(2)} on the structured board. There is no region flow to be right ` +
      'or wrong about there, so this must be ~0. If it is not, the rung is responding to something ' +
      'other than the lattice.');
  console.log(`  M7 control: on an unlearnable lattice the same inversion costs ` +
    `${noise.inferenceValue.toFixed(1)} points — the effect vanishes where it cannot exist`);
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
