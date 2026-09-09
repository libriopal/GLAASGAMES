// engine/verify/verify-lattice.ts — Slice 0's oracles.
//
// One check from each family the blueprint names, each paired with a negative
// control, because an oracle that has only ever been seen to pass is decoration:
//
//   P1  the hidden lattice carries real information  (the safety instrument)
//   H1  commit-reveal binds the seed                 (the operator cannot steer)
//   V1  tokens never leave their cell                (4D rotation, 2D board)
//   L1x no per-turn face bias                        (the OWC finding, permanent)
//   L1y the face weights are actually UNIFORM        (found by verify-oracles)
//   S1  payout === principal, prizes not bond-funded (the economy)
//
// Slice 0 exists to prove these five seams hold TOGETHER. Every subsystem is at
// minimum fidelity on purpose: the auditor's answer to "why does a project like
// this never ship" was combinatorial explosion at integration, so the integration
// is what gets built first.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Board, CELL_COUNT, EMPTY, NO_LINK, OFFSET_FACE, OFFSET_LINK } from '../../lattice/board.js';
import { checkReveal, commit, seedFromReveal } from '../../lattice/commit.js';
import { computeRules } from '../../lattice/ruleset.js';
import { generateLattice, generateLattice as genLattice } from '../../lattice/lattice-gen.js';
import { DEFAULT_ROUND, FACE_WEIGHTS, MAX_RESHUFFLE_ATTEMPTS, drawFace, isStagnant, playRound, verifyRound } from '../../lattice/round.js';
import { makeRng } from '../../engine/sim/world-gen.js';
import { buildReveal, directionOf, reconstructLattice, scoreInference } from '../../lattice/reveal.js';
import { linkObservationJoint, mutualInformation } from '../../lattice/information.js';
import { cellCentre, tileTransform, type BoardLayout } from '../../lattice/tile-transform.js';
import { fundingIsClean, payoutEqualsPrincipal, postBond, releaseBond } from '../../lattice/bond.js';
import { FrameChain, SUBSYSTEMS, compareFrames, stampFrame } from '../../lattice/frame.js';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};


/** A deterministic policy that only ever sees the observable board. */
function greedy(observable: Int32Array, turn: number): number {
  let best = 0;
  let bestValue = -1;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const face = observable[i * 3]!;
    const charge = observable[i * 3 + 2]!;
    const value = face === 0 ? -1 : face * (1 + charge);
    // Tie-break by turn so the policy is not biased toward low indices forever.
    if (value > bestValue || (value === bestValue && (i + turn) % 7 === 0)) {
      bestValue = value;
      best = i;
    }
  }
  return best;
}

const SEED = 0x3f1a7c05 | 0;

// ── P1: the hidden lattice carries real information ────────────────────────
{
  const round = playRound(SEED, DEFAULT_ROUND, greedy);
  const joint = linkObservationJoint(round.finalLinks, round.observations, directionOf);
  const mi = mutualInformation(joint);

  // Negative control: the same observation stream against a RANDOMISED link map.
  // If a random lattice scores as well as the real one, the measurement is not
  // measuring structure and P1 proves nothing.
  const shuffled = new Int32Array(round.finalLinks.length);
  let s = 0x9e3779b9 | 0;
  for (let i = 0; i < shuffled.length; i += 1) {
    s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
    shuffled[i] = Math.abs(s) % CELL_COUNT;
  }
  const noiseMi = mutualInformation(
    linkObservationJoint(shuffled, round.observations, directionOf),
  );

  // HONEST LIMITATION OF P1 AS IT STANDS IN SLICE 0. The measured figure is high
  // — near the log2(5) ≈ 2.32 bit ceiling — and it is high partly by
  // construction: charge moves ONLY along links and only one cell discharges per
  // turn, so seeing where charge lands almost names the link outright. That
  // makes this close to a tautology, and a tautology is not evidence.
  //
  // P1 becomes a real measurement once several cells discharge in the same turn
  // and the observation is genuinely ambiguous — the figure will fall, and where
  // it falls to is the number worth publishing. What Slice 0 proves is narrower
  // and still worth having: the instrument works, it separates structure from
  // noise by a wide margin, and it is wired into the build. The threshold is
  // deliberately a floor rather than a band, because tightening it before
  // simultaneous discharge exists would be fitting a bound to a placeholder.
  ok(mi > 0.5, `P1: hidden lattice carries only ${mi.toFixed(3)} bits — below the 0.5 bit floor, so the structure players are asked to infer is close to noise`);
  ok(mi > noiseMi * 2, `P1 NEGATIVE CONTROL FAILED: a randomised lattice scored ${noiseMi.toFixed(3)} bits against the real lattice's ${mi.toFixed(3)} — the measurement does not distinguish structure from noise`);
  console.log(`  P1 honesty: hidden lattice carries ${mi.toFixed(3)} bits about what the player can see (randomised control: ${noiseMi.toFixed(3)} bits)`);
}

// The verifier's OWN rules digest. Every commitment below is checked against
// this rather than against the operator's claim — see lattice/ruleset.ts.
const RULES = computeRules().hash;

// ── H1: commit-reveal binds the seed ───────────────────────────────────────
{
  const serverSeed = 'slice0-server-seed-8f1e';
  const clientSeed = 'player-chosen-4d2a';
  const c = await commit(serverSeed, clientSeed, RULES);

  ok(await checkReveal(c, { serverSeed, clientSeed, rulesHash: RULES }, RULES), 'H1: an honest reveal failed its own commitment');

  // Negative controls: a changed server seed, and a changed client seed.
  ok(!(await checkReveal(c, { serverSeed: `${serverSeed}x`, clientSeed, rulesHash: RULES }, RULES)),
    'H1 NEGATIVE CONTROL FAILED: a different server seed satisfied the commitment');
  ok(!(await checkReveal(c, { serverSeed, clientSeed: 'someone-elses', rulesHash: RULES }, RULES)),
    'H1 NEGATIVE CONTROL FAILED: a different client seed satisfied the commitment');

  const seedA = await seedFromReveal({ serverSeed, clientSeed, rulesHash: RULES });
  const seedB = await seedFromReveal({ serverSeed, clientSeed, rulesHash: RULES });
  ok(seedA === seedB, 'H1: the same reveal produced two different seeds');
  ok(Number.isInteger(seedA), `H1: the folded seed is not an integer: ${seedA}`);
  ok(seedA !== await seedFromReveal({ serverSeed: `${serverSeed}x`, clientSeed, rulesHash: RULES }),
    'H1: two different server seeds folded to the same lattice seed');
  console.log(`  H1 commitment: honest reveal verifies, both tampered reveals rejected, seed folds to i32 ${seedA}`);
}

// ── V1: tokens never leave their cell ──────────────────────────────────────
{
  const layout: BoardLayout = { originX: 24, originY: 96, cellSize: 48 };
  let worst = 0;
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const expected = cellCentre(index, layout);
    for (let phase = 0; phase < 720; phase += 7) {
      const t = tileTransform(index, phase, SEED, layout);
      worst = Math.max(worst, Math.abs(t.centreX - expected.x), Math.abs(t.centreY - expected.y));
      ok(t.rotation.length === 16, `V1: tile ${index} produced a ${t.rotation.length}-element matrix`);
    }
  }
  ok(worst === 0, `V1: a tile drifted ${worst}px from its cell centre — the board is no longer a lattice`);

  // The rotation must actually move, or the "specimen turning in a case" claim
  // is false and the dice are static images.
  const a = tileTransform(5, 0, SEED, layout).rotation.join(',');
  const b = tileTransform(5, 90, SEED, layout).rotation.join(',');
  ok(a !== b, 'V1: the tile orientation is identical at phase 0 and 90 — the die is not turning');

  // Negative control: two different cells must sit at different centres, or the
  // drift check above would pass trivially on a degenerate layout.
  ok(cellCentre(0, layout).x !== cellCentre(1, layout).x,
    'V1 NEGATIVE CONTROL FAILED: adjacent cells share a centre, so the drift check means nothing');
  console.log(`  V1 lattice: 36 cells x 103 phases, maximum drift ${worst}px, orientation changes with phase`);
}

// ── L1x: no per-turn face bias ─────────────────────────────────────────────
// The finding that removed the OWC, made permanent. Reads round.ts and fails if
// any weighting is derived inside the turn loop.
{
  const source = readFileSync(fileURLToPath(new URL('../../lattice/round.ts', import.meta.url)), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  // The anchor is `advanceTurn`, which IS the turn. It used to be the `for`
  // loop inside playRound; when that loop was extracted so an interactive host
  // and the policy driver could share one executor, this guard fired and
  // refused to trust itself rather than silently scanning nothing. That is the
  // guard working — the anchor is re-pointed here, and the check itself is
  // unchanged.
  const loopStart = code.indexOf('export function advanceTurn');
  ok(loopStart > 0, 'L1x: could not locate advanceTurn in round.ts, so the scan cannot be trusted');
  const loopBody = loopStart > 0 ? code.slice(loopStart) : '';

  const banned: readonly (readonly [RegExp, string])[] = [
    [/weights\s*(\[|=[^=])/, 'the face weights are indexed or reassigned inside the turn loop'],
    [/spawnWeightAdjustment/i, 'a spawn-weight adjustment appears inside the turn loop'],
    [/computeWeights/, 'a weight computation is called inside the turn loop'],
    [/targetRTP|currentRTP/i, 'an RTP target appears inside the turn loop'],
    [/playerRank|leaderBanked/i, 'the loop reads who is ahead, which is the input to a comeback bias'],
  ];
  let found = 0;
  for (const [pattern, description] of banned) {
    if (pattern.test(loopBody)) { found += 1; fail(`L1x: ${description} — L1 must stay immutable mid-round`); }
  }
  ok(found === 0, `L1x: ${found} mid-round weighting violations in round.ts`);

  // The scan must be able to fire.
  ok(/spawnWeightAdjustment/i.test(`${loopBody}\nspawnWeightAdjustments.face_1 = 3;`),
    'L1x NEGATIVE CONTROL FAILED: the scan cannot detect a planted per-turn face bias');
  console.log(`  L1x immutability: none of the ${banned.length} mid-round weighting patterns appear, and the scan fires on a planted one`);
}

// ── L1y: the dice are FAIR, not merely un-re-weighted ──────────────────────
//
// FOUND BY verify-oracles, WHICH IS WHY THAT FILE EXISTS. The mutation harness
// loaded the die — FACE_WEIGHTS [0,4,4,4,4,4,4] -> [0,9,4,4,4,4,1], nine times
// the weight on face 1 and a quarter on face 6 — and L1x above passed without
// complaint. It was right to: L1x asks whether the weights are RE-DERIVED
// inside the turn loop, and a loaded constant is not re-derived. It is loaded
// before the loop starts and then faithfully left alone.
//
// So the property actually proven was "the operator cannot change the odds
// mid-round", and the property everyone assumed was proven was "the odds are
// fair". Those are different sentences and only the first was ever checked.
// Under a principal-return bond the second is the one the whole staking
// argument rests on.
//
// Checked two ways, because they fail differently. The static check catches an
// edited constant; the empirical check catches a bias introduced anywhere
// downstream of it — in the RNG fold, in the selection arithmetic, in a lookup
// table — which no amount of reading FACE_WEIGHTS would reveal.
{
  // Static: every rollable face carries identical weight.
  const rollable = FACE_WEIGHTS.slice(1);
  const first = rollable[0]!;
  ok(rollable.length === 6, `L1y: ${rollable.length} rollable faces, expected 6`);
  ok(rollable.every((w) => w === first),
    `L1y: the face weights are not uniform — ${JSON.stringify([...FACE_WEIGHTS])}. A constant that is never ` +
      're-derived mid-round is still a loaded die if it was loaded before the round began.');
  ok(first > 0, 'L1y: the face weight is zero, so no face can ever be rolled');

  // Empirical: the faces that actually reach the board are uniform.
  // Chi-square with 5 degrees of freedom. The critical value at p=0.001 is
  // 20.515; a fair generator exceeds it once in a thousand runs, and the seed
  // is FIXED, so this is a deterministic check rather than a flaky one.
  const chiSquare = (counts: readonly number[], sampled: number): number => {
    const expected = sampled / 6;
    let chi = 0;
    for (let face = 1; face <= 6; face += 1) chi += ((counts[face]! - expected) ** 2) / expected;
    return chi;
  };

  const SAMPLES = 60_000;
  const rng = makeRng(0x5eed_face | 0);
  const counts = new Array<number>(7).fill(0);
  for (let i = 0; i < SAMPLES; i += 1) {
    const face = drawFace(rng, FACE_WEIGHTS);
    counts[face] = (counts[face] ?? 0) + 1;
  }
  const chi = chiSquare(counts, SAMPLES);

  ok(chi < 20.515,
    `L1y: ${SAMPLES} draws give chi-square ${chi.toFixed(2)} against a 20.515 critical value at p=0.001 — ` +
      `the dice are measurably biased. Counts: ${JSON.stringify(counts.slice(1))}`);

  // NEGATIVE CONTROL, and it runs the REAL function rather than arithmetic on a
  // made-up table. A synthetic control would prove the chi-square formula
  // works; this proves the whole path — rng, weights, selection — reports a
  // loaded die as loaded.
  const loadedRng = makeRng(0x5eed_face | 0);
  const loadedCounts = new Array<number>(7).fill(0);
  for (let i = 0; i < SAMPLES; i += 1) {
    const face = drawFace(loadedRng, [0, 9, 4, 4, 4, 4, 1]);
    loadedCounts[face] = (loadedCounts[face] ?? 0) + 1;
  }
  const loadedChi = chiSquare(loadedCounts, SAMPLES);
  ok(loadedChi >= 20.515,
    `L1y NEGATIVE CONTROL FAILED: the exact weights the mutation harness planted ([0,9,4,4,4,4,1]) scored ` +
      `chi-square ${loadedChi.toFixed(2)}, below the threshold — this check cannot detect the bias it exists for`);

  console.log(`  L1y fairness: weights uniform at ${first}; ${SAMPLES.toLocaleString()} draws give chi-square ${chi.toFixed(2)} (< 20.515), and the harness's loaded die scores ${loadedChi.toFixed(0)}`);
}

// ── S1: the economy ────────────────────────────────────────────────────────
{
  const bond = postBond('bond-1', 'account-1', 500, 0);
  for (const outcome of ['won', 'lost', 'abandoned'] as const) {
    const release = releaseBond(bond, outcome);
    ok(payoutEqualsPrincipal(release),
      `S1: releasing a bond after "${outcome}" paid ${release.payout} against a principal of ${release.principal}`);
  }

  // Negative control: a bonus must be rejected by the same predicate.
  ok(!payoutEqualsPrincipal({ bondId: 'x', principal: 500, payout: 510 }),
    'S1 NEGATIVE CONTROL FAILED: a 2% bonus passed the principal-return check');

  ok(fundingIsClean({ accountId: 'a', amount: 100, source: 'treasury', rank: 1 }),
    'S1: a treasury-funded prize was rejected');
  ok(!fundingIsClean({ accountId: 'a', amount: 100, source: 'bondPool', rank: 1 }),
    'S1 NEGATIVE CONTROL FAILED: a bond-funded prize passed the funding check');
  console.log('  S1 economy: principal returned on won/lost/abandoned, bonus rejected, bond-funded prize rejected');
}

// ── D1: stagnation is detected, and answered without knowing the score ─────
{
  // A board built to be stagnant on purpose: every cell links at an EMPTY cell,
  // so no bank can move charge. This is the condition the detector exists for
  // and it must be constructed rather than waited for.
  const stagnant = new Board();
  for (let i = 0; i < CELL_COUNT; i += 1) {
    // Odd cells hold a face and link at the next (empty) even cell.
    const holdsFace = i % 2 === 1;
    stagnant.set(i, OFFSET_FACE, holdsFace ? 4 : EMPTY);
    stagnant.set(i, OFFSET_LINK, holdsFace && i + 1 < CELL_COUNT ? i + 1 : NO_LINK);
  }
  ok(isStagnant(stagnant), 'D1: a board where every link points at an empty cell was not detected as stagnant');

  // NEGATIVE CONTROL: one live link must be enough to clear the diagnosis. If a
  // detector says "stagnant" here it would reshuffle healthy boards forever.
  const live = new Board();
  for (let i = 0; i < CELL_COUNT; i += 1) {
    live.set(i, OFFSET_FACE, 3);
    live.set(i, OFFSET_LINK, NO_LINK);
  }
  live.set(0, OFFSET_LINK, 1);
  ok(!isStagnant(live), 'D1 NEGATIVE CONTROL FAILED: a board with a live link was called stagnant');

  // An all-empty board is stagnant too — nothing to bank is a special case of
  // nothing can flow.
  ok(isStagnant(new Board()), 'D1: an empty board was not detected as stagnant');

  // The detector must be blind to everything but the board. Its whole parameter
  // list is one Board, which is checked structurally rather than by inspection.
  ok(isStagnant.length === 1,
    `D1: the stagnation detector takes ${isStagnant.length} parameters — it can only be allowed to see the board`);

  // And a real round must not be tripping it constantly; a reshuffle on most
  // turns would mean the threshold is wrong, not that boards are unlucky.
  const round = playRound(SEED, DEFAULT_ROUND, greedy);
  ok(round.reshuffles <= DEFAULT_ROUND.turns,
    `D1: ${round.reshuffles} reshuffles in ${DEFAULT_ROUND.turns} turns — the detector is firing on healthy boards`);
  ok(!round.conceded, 'D1: a normal round conceded, so stagnation could not be cleared on an ordinary lattice');
  console.log(`  D1 stagnation: detected on a built-stagnant board and on an empty one, cleared on a live one, ${round.reshuffles} reshuffles in a real round (cap ${MAX_RESHUFFLE_ATTEMPTS}/turn)`);
}

// ── P2: the lattice is revealed, and the reveal is independently checkable ──
{
  const serverSeed = 'reveal-server-c41f';
  const clientSeed = 'reveal-client-90ab';
  const c = await commit(serverSeed, clientSeed, RULES);
  const seed = await seedFromReveal({ serverSeed, clientSeed, rulesHash: RULES });
  const round = playRound(seed, DEFAULT_ROUND, greedy);

  const revealed = await buildReveal(c, { serverSeed, clientSeed, rulesHash: RULES }, seed, RULES);
  ok(revealed.commitmentHolds, 'P2: the reveal did not satisfy the commitment published before the round');

  // The reveal must reconstruct EXACTLY the lattice the round was played on,
  // from the seed alone. Anything less and the reveal is a story about the
  // round rather than a disclosure of it.
  ok(revealed.links.length === round.finalLinks.length, 'P2: reveal and round disagree on board size');
  let mismatched = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (revealed.links[i] !== round.finalLinks[i]) mismatched += 1;
  }
  ok(mismatched === 0, `P2: the revealed lattice differs from the played one in ${mismatched} cells`);

  // NEGATIVE CONTROL: a reveal built from a different seed must NOT match.
  let differs = 0;
  const otherLinks = reconstructLattice((seed ^ 0x5eed) | 0);
  for (let i = 0; i < CELL_COUNT; i += 1) if (otherLinks[i] !== round.finalLinks[i]) differs += 1;
  ok(differs > 0, 'P2 NEGATIVE CONTROL FAILED: a lattice reconstructed from a different seed matched the played one');

  // Inference scoring: a perfect guess, and a blind one.
  const truth = revealed.links;
  const perfect: number[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const link = truth[i]!;
    perfect.push(link === NO_LINK ? 4 : directionOf(i, link));
  }
  const perfectScore = scoreInference(perfect, truth);
  ok(perfectScore.accuracy === 1, `P2: a perfect inference scored ${perfectScore.accuracy.toFixed(3)} rather than 1`);

  const blind = new Array<number>(CELL_COUNT).fill(0);
  const blindScore = scoreInference(blind, truth);
  ok(blindScore.accuracy < perfectScore.accuracy,
    'P2 NEGATIVE CONTROL FAILED: guessing one direction for every cell scored as well as knowing the answer');
  // THE BASELINE MUST NOT UNDERSTATE WHAT NO SKILL ACHIEVES. A fixed guess of
  // one direction for every cell is the cheapest possible no-skill strategy; if
  // the reported baseline sits below what that scores, the player is being told
  // they beat chance when they did not. This control caught exactly that: the
  // first implementation reported a uniform 1/5 while a constant guess scored
  // 0.389 against this lattice's prevailing flow.
  const constantGuessBest = Math.max(
    ...[0, 1, 2, 3, 4].map((d) => scoreInference(new Array<number>(CELL_COUNT).fill(d), truth).accuracy),
  );
  ok(perfectScore.chanceBaseline >= constantGuessBest - 1e-9,
    `P2: the reported baseline ${perfectScore.chanceBaseline.toFixed(3)} is below the best constant guess ` +
      `${constantGuessBest.toFixed(3)} — a player scoring between them would be told they beat chance when they did not`);
  ok(perfectScore.chanceBaseline < 1,
    'P2: the baseline is 1.0, which would tell every player they never beat chance');

  // A player who guessed nothing must not be told they were accurate.
  ok(scoreInference(new Array<number>(CELL_COUNT).fill(-1), truth).accuracy === 0,
    'P2: an empty inference reported non-zero accuracy');

  console.log(
    `  P2 reveal: commitment holds, lattice reconstructs from the seed alone with 0 mismatches ` +
      `(different seed differs in ${differs}/${CELL_COUNT}), perfect inference 1.000 vs blind ` +
      `${blindScore.accuracy.toFixed(3)}, best constant guess ${constantGuessBest.toFixed(3)}, ` +
      `reported no-skill baseline ${perfectScore.chanceBaseline.toFixed(3)}`,
  );
}

// ── F1x: two devices can prove they are showing the same board ─────────────
// A shared-board game is only shared if both screens agree. The lockstep
// literature is unanimous on the method — per-tick state checksums compared
// every frame — and adds one thing this engine did not have: a PER-SUBSYSTEM
// breakdown, so a divergence names the system that drifted rather than only the
// tick it drifted on.
{
  // Two peers building the same board from the same seed.
  const peerA = new Board();
  const peerB = new Board();
  genLattice(peerA, SEED);
  genLattice(peerB, SEED);

  const chainA = new FrameChain();
  const chainB = new FrameChain();
  for (let tick = 0; tick < 24; tick += 1) {
    chainA.push(stampFrame(peerA, tick));
    chainB.push(stampFrame(peerB, tick));
  }

  ok(chainA.firstDivergence(chainB) === null,
    'F1x: two peers seeded identically disagreed — the stamp is not deterministic');
  ok(chainA.lastAgreedTick(chainB) === 23,
    `F1x: identical peers last agreed at tick ${chainA.lastAgreedTick(chainB)}, expected 23`);

  // NEGATIVE CONTROL, and the point of the whole decomposition: perturb exactly
  // ONE subsystem on one peer and require the report to NAME it. A stamp that
  // only says "desync" would pass a weaker test than this and be worth far less.
  const drifted = new Board();
  genLattice(drifted, SEED);
  drifted.set(17, OFFSET_FACE, (drifted.get(17, OFFSET_FACE) + 1) % 7);
  const faceDrift = compareFrames(stampFrame(peerA, 0), stampFrame(drifted, 0));
  ok(!faceDrift.agree, 'F1x NEGATIVE CONTROL FAILED: a changed face did not register as a divergence');
  ok(faceDrift.firstDivergence === 'faces',
    `F1x: a face change was reported as "${faceDrift.firstDivergence}" — the breakdown names the wrong subsystem`);
  ok(faceDrift.diverged.length === 1,
    `F1x: a single face change reported ${faceDrift.diverged.length} diverged subsystems — the columns are not independent`);

  // The HIDDEN column must be covered too. Two clients disagreeing about the
  // lattice are not playing the same game, and discovering that at reveal time
  // would be a whole round too late.
  const hiddenDrift = new Board();
  genLattice(hiddenDrift, SEED);
  hiddenDrift.set(9, OFFSET_LINK, (hiddenDrift.get(9, OFFSET_LINK) + 1) % CELL_COUNT);
  const linkDrift = compareFrames(stampFrame(peerA, 0), stampFrame(hiddenDrift, 0));
  ok(linkDrift.firstDivergence === 'links',
    `F1x: a hidden-lattice change was reported as "${linkDrift.firstDivergence}" — the hidden half is not covered`);

  // Comparing different ticks is a caller error, not a desync, and must throw
  // rather than quietly report disagreement.
  let threw = false;
  try { compareFrames(stampFrame(peerA, 3), stampFrame(peerB, 4)); } catch { threw = true; }
  ok(threw, 'F1x: comparing two different ticks reported a result instead of refusing');

  console.log(
    `  F1x frame sync: 24 ticks agree across two peers; a single ${SUBSYSTEMS.length}-way perturbation is ` +
      'isolated to the exact subsystem, hidden column included',
  );
}

// ── Integration: the seam Slice 0 exists to prove ──────────────────────────
{
  const serverSeed = 'integration-server';
  const clientSeed = 'integration-client';
  const c = await commit(serverSeed, clientSeed, RULES);
  ok(await checkReveal(c, { serverSeed, clientSeed, rulesHash: RULES }, RULES), 'integration: reveal failed');
  const seed = await seedFromReveal({ serverSeed, clientSeed, rulesHash: RULES });

  const actions: number[] = [];
  const played = playRound(seed, DEFAULT_ROUND, (observable, turn) => {
    const a = greedy(observable, turn);
    actions.push(a);
    return a;
  });

  ok(played.score > 0, 'integration: a full round scored nothing, so nothing downstream is being exercised');
  ok(played.turnsPlayed === DEFAULT_ROUND.turns,
    `integration: round stopped at ${played.turnsPlayed} of ${DEFAULT_ROUND.turns} turns`);

  const verdict = verifyRound(seed, DEFAULT_ROUND, actions, played.score, played.digest);
  ok(verdict.ok, `integration: a freshly played round failed its own replay — ${verdict.score} vs ${played.score}`);

  // Negative control: an inflated score must be rejected by recomputation. This
  // is the layer commit-reveal cannot provide.
  const forged = verifyRound(seed, DEFAULT_ROUND, actions, played.score + 1, played.digest);
  ok(!forged.ok, 'integration NEGATIVE CONTROL FAILED: a round claiming one more point than it scored verified as genuine');

  // And a changed action list must produce a different outcome, or the actions
  // are not actually driving the round.
  const altered = [...actions];
  altered[0] = (altered[0]! + 5) % CELL_COUNT;
  const different = verifyRound(seed, DEFAULT_ROUND, altered, played.score, played.digest);
  ok(!different.ok, 'integration NEGATIVE CONTROL FAILED: changing the first action left the outcome identical');

  const linked = played.finalLinks.reduce((n, l) => n + (l === NO_LINK ? 0 : 1), 0);
  console.log(
    `  integration: commit -> reveal -> seed ${seed} -> ${played.turnsPlayed} turns, ` +
      `score ${played.score}, ${linked}/${CELL_COUNT} cells linked, ${played.reshuffles} reshuffles, ` +
      `digest 0x${(played.digest >>> 0).toString(16).padStart(8, '0')} — replays exactly, forgery rejected`,
  );
}

if (failures.length > 0) {
  console.error(`verify-lattice: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-lattice: PASS — Slice 0 holds: real hidden structure, bound commitment, cell-locked dice, immutable L1, principal-return bond');
