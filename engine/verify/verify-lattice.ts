// engine/verify/verify-lattice.ts — Slice 0's oracles.
//
// One check from each family the blueprint names, each paired with a negative
// control, because an oracle that has only ever been seen to pass is decoration:
//
//   P1  the hidden lattice carries real information  (the safety instrument)
//   H1  commit-reveal binds the seed                 (the operator cannot steer)
//   V1  tokens never leave their cell                (4D rotation, 2D board)
//   L1x no per-turn face bias                        (the OWC finding, permanent)
//   S1  payout === principal, prizes not bond-funded (the economy)
//
// Slice 0 exists to prove these five seams hold TOGETHER. Every subsystem is at
// minimum fidelity on purpose: the auditor's answer to "why does a project like
// this never ship" was combinatorial explosion at integration, so the integration
// is what gets built first.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Board, CELL_COUNT, NO_LINK } from '../../lattice/board.js';
import { checkReveal, commit, seedFromReveal } from '../../lattice/commit.js';
import { generateLattice } from '../../lattice/lattice-gen.js';
import { DEFAULT_ROUND, playRound, verifyRound } from '../../lattice/round.js';
import { linkObservationJoint, mutualInformation } from '../../lattice/information.js';
import { cellCentre, tileTransform, type BoardLayout } from '../../lattice/tile-transform.js';
import { fundingIsClean, payoutEqualsPrincipal, postBond, releaseBond } from '../../lattice/bond.js';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

/** Direction from one cell to another: 0 up, 1 right, 2 down, 3 left, 4 none. */
function directionOf(from: number, to: number): number {
  if (to < 0) return 4;
  const dx = Board.columnOf(to) - Board.columnOf(from);
  const dy = Board.rowOf(to) - Board.rowOf(from);
  if (dx === 0 && dy === -1) return 0;
  if (dx === 1 && dy === 0) return 1;
  if (dx === 0 && dy === 1) return 2;
  if (dx === -1 && dy === 0) return 3;
  return 4;
}

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

// ── H1: commit-reveal binds the seed ───────────────────────────────────────
{
  const serverSeed = 'slice0-server-seed-8f1e';
  const clientSeed = 'player-chosen-4d2a';
  const c = await commit(serverSeed, clientSeed);

  ok(await checkReveal(c, { serverSeed, clientSeed }), 'H1: an honest reveal failed its own commitment');

  // Negative controls: a changed server seed, and a changed client seed.
  ok(!(await checkReveal(c, { serverSeed: `${serverSeed}x`, clientSeed })),
    'H1 NEGATIVE CONTROL FAILED: a different server seed satisfied the commitment');
  ok(!(await checkReveal(c, { serverSeed, clientSeed: 'someone-elses' })),
    'H1 NEGATIVE CONTROL FAILED: a different client seed satisfied the commitment');

  const seedA = await seedFromReveal({ serverSeed, clientSeed });
  const seedB = await seedFromReveal({ serverSeed, clientSeed });
  ok(seedA === seedB, 'H1: the same reveal produced two different seeds');
  ok(Number.isInteger(seedA), `H1: the folded seed is not an integer: ${seedA}`);
  ok(seedA !== await seedFromReveal({ serverSeed: `${serverSeed}x`, clientSeed }),
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

  const loopStart = code.indexOf('for (; turn < config.turns');
  ok(loopStart > 0, 'L1x: could not locate the turn loop in round.ts, so the scan cannot be trusted');
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

// ── Integration: the seam Slice 0 exists to prove ──────────────────────────
{
  const serverSeed = 'integration-server';
  const clientSeed = 'integration-client';
  const c = await commit(serverSeed, clientSeed);
  ok(await checkReveal(c, { serverSeed, clientSeed }), 'integration: reveal failed');
  const seed = await seedFromReveal({ serverSeed, clientSeed });

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
