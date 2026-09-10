// engine/verify/verify-heat.ts — the shared board is fair, or the build fails.
//
// H1  the server seed is COMMITTED before anyone enters
// H2  a substituted server seed is REJECTED at reveal
// H3  reveal CANNOT precede close          (the anti-grinding ordering)
// H4  entry after close is REJECTED                    (the anti-snipe)
// H12 the board does NOT depend on who is in the cohort   (the admission attack)
// H13 the beacon, and an honest account of fairness
// H7  abandonment is a losing bet, never a refund
// H8  stake bounds are enforced at BOTH ends
// H9  the live projection cannot see the live field   (leaderboard oracle)
// H10 the heat digest binds cohort and commitments
// H11 no entrant may DOMINATE the pool                 (the anti-collusion limit)
//
// Every one of these came from an independent audit of the DESIGN, before the
// code existed. H9 is the one worth reading twice: the audit named the
// leaderboard oracle attack as "the most likely silent unfairness", and its
// proposed fix was ZK-proofs over leaderboard state. That was rejected in favour
// of not publishing the signal at all — see `heat.ts` `liveProjection`.

import {
  type Beacon,
  MAX_POOL_SHARE_BPS,
  MAX_STAKE,
  MIN_STAKE,
  abandon,
  boardSeed,
  close,
  drawBeacon,
  fairnessLevel,
  enter,
  heatDigest,
  hashText,
  liveProjection,
  openHeat,
  reveal,
} from '../../game/economy/heat.js';
import { type Entry, settle } from '../../game/economy/pari-mutuel.js';

const failures: string[] = [];
const fail = (d: string): void => void failures.push(d);
const ok = (c: boolean, d: string): void => { if (!c) fail(d); };
const mark = (): number => failures.length;
const summarise = (at: number, line: string): void => {
  if (failures.length === at) console.log(line);
  else console.log(`  [suppressed: ${failures.length - at} failure(s) in this block]`);
};
const threw = (f: () => unknown): boolean => { try { f(); return false; } catch { return true; } };

const SERVER_SEED = 918273;
function populated(n: number, capacity = 64) {
  let h = openHeat('H-001', SERVER_SEED, capacity);
  for (let i = 0; i < n; i += 1) {
    h = enter(h, {
      playerId: `p${String(i).padStart(2, '0')}`,
      clientSeedHash: hashText(`client:${i}:${i * 7919}`),
      stake: 100n + BigInt(i * 3),
    });
  }
  return h;
}

// ── H1 / H2: the seed is committed, and substitution is caught ─────────────
{
  const _m = mark();
  const h = openHeat('H-001', SERVER_SEED);
  ok(h.serverSeed === null,
    'H1: the server seed is exposed on an OPEN heat. It must be secret until the cohort is locked, ' +
      'or entrants can choose client seeds that steer the shared board.');
  ok(h.serverSeedHash === hashText(`server:${SERVER_SEED}`),
    'H1: the published commitment does not match the seed it commits to');

  const closed = close(populated(6));
  ok(threw(() => reveal(closed, SERVER_SEED + 1)),
    'H2: a server seed that does NOT match the published commitment was accepted. An operator who ' +
      'can substitute the seed after entries are in chooses the board, which is the entire thing ' +
      'commit-reveal exists to prevent.');
  ok(!threw(() => reveal(closed, SERVER_SEED)), 'H2: the correct server seed was rejected');
  summarise(_m, '  H1/H2 commitment: the seed is hidden while OPEN, and a substituted seed is ' +
    'rejected at reveal while the true one is accepted');
}

// ── H3: reveal cannot precede close ────────────────────────────────────────
// THE ANTI-GRINDING ORDERING. If the server seed were public while entry was
// still open, the last entrant could search for a client seed producing a board
// they like — the exact attack the design audit worked through.
{
  const _m = mark();
  const open = populated(6);
  ok(threw(() => reveal(open, SERVER_SEED)),
    'H3: the server seed was revealed while the heat was still OPEN. The last entrant can then ' +
      'grind a client seed against a known server seed and steer the shared board.');
  ok(threw(() => boardSeed(close(populated(6)))),
    'H3: the board seed was derivable before the reveal — the board is knowable in advance');
  summarise(_m, '  H3 anti-grinding: reveal is impossible before close, and the board seed is ' +
    'underivable before reveal — both are state-machine facts, not conventions');
}

// ── H4: entry after close is rejected ──────────────────────────────────────
{
  const _m = mark();
  const closed = close(populated(6));
  ok(threw(() => enter(closed, { playerId: 'sniper', clientSeedHash: 1, stake: 100n })),
    'H4: an entrant joined a CLOSED heat. A cohort that can be joined after it closes is one a ' +
      'sniper joins once the field is known.');
  ok(threw(() => enter(reveal(closed, SERVER_SEED), { playerId: 'sniper', clientSeedHash: 1, stake: 100n })),
    'H4: an entrant joined a REVEALED heat — the board is public at that point');
  const full = populated(4, 4);
  ok(threw(() => enter(full, { playerId: 'overflow', clientSeedHash: 2, stake: 100n })),
    'H4: capacity was exceeded');
  summarise(_m, '  H4 strict close: entry is refused once CLOSED or REVEALED, and at capacity');
}

// ── H12: THE BOARD DOES NOT DEPEND ON WHO IS IN THE COHORT ─────────────────
//
// THIS CHECK REPLACES TWO THAT WERE PASSING WHILE THE DESIGN WAS BROKEN.
//
// H5 asserted that every entrant moves the board seed, and H6 that arrival order
// does not. Both passed. Both were properties of a design in which the board
// depended on the cohort — and that dependence was the vulnerability: because the
// operator knows the server seed from the moment the heat opens, they could
// compute the board each possible admission would produce and choose one.
// Measured across twelve candidate admissions, a target player's achievable
// score ranged 48 to 123, a 75-point spread against a skill ladder spanning ~40.
//
// So H5 is not merely obsolete, it was asserting the hole. The property that
// matters is the opposite one.
{
  const _m = mark();
  const board = (extra: string | null): number => {
    let h = openHeat('H-ADMIT', SERVER_SEED);
    for (let i = 0; i < 8; i += 1) {
      h = enter(h, { playerId: `p${i}`, clientSeedHash: hashText(`c:${i}`), stake: 100n });
    }
    if (extra !== null) {
      h = enter(h, { playerId: extra, clientSeedHash: hashText(`c:${extra}`), stake: 100n });
    }
    return boardSeed(reveal(close(h), SERVER_SEED));
  };
  const base = board(null);
  const seen = new Set<number>([base]);
  for (let k = 0; k < 12; k += 1) seen.add(board(`cand${k}`));
  ok(seen.size === 1,
    `H12: admitting different entrants produced ${seen.size} different boards. The operator knows ` +
      'the server seed from heat open, so a cohort-dependent board lets them audition admissions ' +
      'and hand a chosen player the board they want — measured at a 75-point swing, against a ' +
      'skill ladder worth about 40.');
  summarise(_m, `  H12 admission cannot steer: all 13 cohort variations produce the SAME board ` +
    `(${base}) — the board is fixed before anyone enters`);
}

// ── H13: THE BEACON, AND AN HONEST ACCOUNT OF FAIRNESS ─────────────────────
// The audit required: "Prohibit 'Provably Fair' claims for any deployment where
// the external beacon is not integrated." Enforced by derivation rather than by
// documentation — `fairnessLevel` has no branch that could overclaim.
{
  const _m = mark();
  const closed = close(populated(8));

  // No beacon: honest about being operator-trusted.
  ok(fairnessLevel(reveal(closed, SERVER_SEED)) === 'OPERATOR_TRUSTED',
    'H13: a heat with no beacon did not report OPERATOR_TRUSTED. Without a beacon the operator ' +
      'knows the board before any player does, and the build must say so.');

  // A beacon with no checkable source is not proof of anything.
  const vague: Beacon = { value: 12345, source: '' };
  ok(fairnessLevel(reveal(drawBeacon(closed, vague), SERVER_SEED)) === 'BEACON_UNVERIFIED',
    'H13: a beacon with no source reference was treated as verifiable. An operator can invent a ' +
      'number; the point of the beacon is that a third party can fetch it independently.');

  // A sourced beacon is the real thing.
  const real: Beacon = { value: 987654, source: 'drand:mainnet:4210987' };
  const done = reveal(drawBeacon(closed, real), SERVER_SEED);
  ok(fairnessLevel(done) === 'PROVABLY_FAIR',
    'H13: a beacon with a checkable public source was not accepted as provably fair');

  // The beacon must actually change the board, or it is decoration.
  ok(boardSeed(done) !== boardSeed(reveal(closed, SERVER_SEED)),
    'H13: drawing a beacon left the board unchanged — it is not an input, it is an ornament');

  // ORDERING: the audit's sequence is enforced by the state machine.
  ok(threw(() => drawBeacon(populated(8), real)),
    'H13: a beacon was drawn while the heat was still OPEN. Drawing before the cohort locks lets ' +
      'the operator admit entrants against a known beacon.');
  summarise(_m, '  H13 beacon: no beacon reports OPERATOR_TRUSTED, an unsourced one ' +
    'BEACON_UNVERIFIED, a drand-sourced one PROVABLY_FAIR; the beacon moves the board, and it ' +
    'cannot be drawn before the cohort locks');
}

// ── H7: abandonment is a losing bet, not a refund ──────────────────────────
{
  const _m = mark();
  const h = abandon(populated(6), 'p03');
  ok(h.abandoned.includes('p03'), 'H7: the abandonment was not recorded');
  ok(h.commitments.some((x) => x.playerId === 'p03'),
    'H7: an abandoning entrant was REMOVED from the cohort. Their stake must stay in the pool — ' +
      'refunding it makes entry a free option on the board: enter, look, withdraw if the seed is bad.');
  ok(threw(() => abandon(h, 'nobody')), 'H7: a non-entrant was marked abandoned');

  // Settled as score 0, still contributing stake.
  const entries: Entry[] = h.commitments.map((c) => ({
    id: c.playerId,
    score: h.abandoned.includes(c.playerId) ? 0 : 50 + Number(c.stake % 90n),
    stake: c.stake,
  }));
  const r = settle(entries, undefined, false);
  const gone = r.payouts.find((p) => p.id === 'p03')!;
  const staked = entries.find((e) => e.id === 'p03')!.stake;
  ok(r.handle >= staked, 'H7: the abandoning entrant\'s stake left the handle');
  ok(gone.payout < staked,
    `H7: the abandoning entrant received ${gone.payout} against a stake of ${staked} — abandoning ` +
      'must be a losing position, or it is a free look at the board.');
  summarise(_m, `  H7 abandonment: a no-show stays in the cohort, scores 0, keeps their stake in ` +
    `the pool and receives ${gone.payout} of ${staked} back — a losing bet, not a refund`);
}

// ── H8: stake bounds at BOTH ends ──────────────────────────────────────────
{
  const _m = mark();
  const h = openHeat('H-001', SERVER_SEED);
  ok(threw(() => enter(h, { playerId: 'dust', clientSeedHash: 1, stake: MIN_STAKE - 1n })),
    `H8: a stake below the ${MIN_STAKE} floor was accepted. Dust entries occupy a rank and dilute ` +
      'the cohort while risking nothing.');
  ok(threw(() => enter(h, { playerId: 'whale', clientSeedHash: 2, stake: MAX_STAKE + 1n })),
    `H8: a stake above the ${MAX_STAKE} ceiling was accepted. One entrant owning the pool makes ` +
      'every other stake decorative.');
  ok(!threw(() => enter(h, { playerId: 'ok-lo', clientSeedHash: 3, stake: MIN_STAKE })),
    'H8: the minimum legal stake was rejected');
  ok(!threw(() => enter(h, { playerId: 'ok-hi', clientSeedHash: 4, stake: MAX_STAKE })),
    'H8: the maximum legal stake was rejected');
  summarise(_m, `  H8 stake bounds: [${MIN_STAKE}, ${MAX_STAKE}] enforced at both ends — dust and ` +
    'whale entries both refused, the endpoints themselves accepted');
}

// ── H9: the live projection cannot see the live field ──────────────────────
// THE LEADERBOARD ORACLE ATTACK, which the design audit called the most likely
// silent unfairness. The guarantee here is structural rather than cryptographic:
// the function has no parameter through which the live field could arrive.
{
  const _m = mark();
  const par = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const early = liveProjection(55, par);
  const late = liveProjection(55, par);
  ok(early.p10 === late.p10 && early.p90 === late.p90,
    'H9: two identical queries to the live projection disagreed — something outside the committed ' +
      'curve is reaching it');
  ok(liveProjection(95, par).p10 > liveProjection(15, par).p10,
    'H9: the projection does not rise with score — it is not reading the committed curve at all');
  ok(early.p90 > early.p10,
    'H9: the projection is a POINT, not a band. A point value reads as owed money; a band reads ' +
      'as a projection.');
  // The structural claim: arity. A second argument that could carry live field
  // state would show up here.
  ok(liveProjection.length === 2,
    `H9: liveProjection takes ${liveProjection.length} parameters, not 2. The whole guarantee is ` +
      'that the live field has no route into this function — an extra parameter is how it would ' +
      'get one.');
  summarise(_m, '  H9 no leaderboard oracle: the projection reads only the committed par curve and ' +
    'the player\'s own score, returns a band not a point, and has no parameter the live field ' +
    'could arrive through');
}

// ── H11: NO ENTRANT MAY DOMINATE THE POOL ──────────────────────────────────
// The anti-collusion limit. Measured: the sybil attack is unprofitable at a 40%
// share (-1.64pp) and PROFITABLE at 62% (+1.38pp), so concentration is the lever
// and it is a property of the closed cohort rather than of any single entry.
{
  const _m = mark();
  // One entrant at the ceiling among a small cohort dominates it.
  let dom = openHeat('H-DOM', SERVER_SEED);
  dom = enter(dom, { playerId: 'whale', clientSeedHash: 1, stake: MAX_STAKE });
  dom = enter(dom, { playerId: 'small', clientSeedHash: 2, stake: MIN_STAKE });
  ok(threw(() => close(dom)),
    `H11: a heat closed with one entrant holding almost the entire handle. Above roughly a 50% ` +
      'share the sybil attack becomes profitable, because throwaway entries lift the dominant ' +
      "entrant's rank while diluting a pool they already own.");

  // A balanced cohort must still close.
  let fair = openHeat('H-FAIR', SERVER_SEED);
  for (let i = 0; i < 8; i += 1) {
    fair = enter(fair, { playerId: `q${i}`, clientSeedHash: i + 10, stake: 100n });
  }
  ok(!threw(() => close(fair)),
    'H11: a balanced cohort of eight equal stakes was refused — the limit is rejecting legitimate ' +
      'heats, which is how a safety check gets switched off');

  // And the boundary itself: exactly at the limit must pass.
  let edge = openHeat('H-EDGE', SERVER_SEED);
  edge = enter(edge, { playerId: 'big', clientSeedHash: 20, stake: 250n });
  for (let i = 0; i < 3; i += 1) {
    edge = enter(edge, { playerId: `r${i}`, clientSeedHash: 30 + i, stake: 250n });
  }
  ok(!threw(() => close(edge)),
    'H11: four equal stakes (25% each, exactly the limit) were refused');
  summarise(_m, `  H11 concentration: one entrant above ${MAX_POOL_SHARE_BPS} bps of the handle ` +
    'blocks the close; balanced cohorts and the boundary case still close');
}

// ── H10: the digest binds the cohort ───────────────────────────────────────
{
  const _m = mark();
  const base = heatDigest(populated(6));
  ok(heatDigest(populated(7)) !== base, 'H10: adding an entrant did not move the heat digest');
  let alt = openHeat('H-001', SERVER_SEED);
  for (let i = 0; i < 6; i += 1) {
    alt = enter(alt, {
      playerId: `p${String(i).padStart(2, '0')}`,
      clientSeedHash: hashText(`client:${i}:${i * 7919}`),
      stake: i === 2 ? 999n : 100n + BigInt(i * 3),
    });
  }
  ok(heatDigest(alt) !== base, 'H10: changing a STAKE did not move the heat digest');
  ok(heatDigest(openHeat('H-002', SERVER_SEED)) !== heatDigest(openHeat('H-001', SERVER_SEED)),
    'H10: two different heats share a digest');
  summarise(_m, '  H10 digest binds: cohort size, any stake and the heat id each move the digest — ' +
    'what was agreed before play is bound to what is settled after it');
}

if (failures.length > 0) {
  console.error(`verify-heat: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('verify-heat: H1-H13 pass. The board is committed before entry, cannot be ground by an ' +
  'entrant, cannot be joined by a sniper, and no live field reaches the player.');
