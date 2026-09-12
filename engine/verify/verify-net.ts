// engine/verify/verify-net.ts — the server cannot be lied to, and does not
// implement the rules itself.
//
// T1  the server SCORES BY REPLAY, never from the claimed score
// T2  a forged score is REJECTED
// T3  a submission for the WRONG BOARD is rejected
// T4  a non-entrant cannot submit
// T5  ONE submission each — no re-rolling a staked attempt
// T6  submissions before the reveal are refused
// T7  a no-show scores zero and keeps their stake in the pool
// T8  the receipt lets a third party re-derive the outcome, fairness included
// T9  THE SERVER CONTAINS NO SECOND COPY OF THE RULES        (textual, like L1x)
// T10 a SECOND RULESET is served by the same code, and forged the same way

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type Beacon, close, drawBeacon, enter, hashText, openHeat, reveal, boardSeed } from '../../game/economy/heat.js';
import { type Submission, receipt, settleHeat, submit } from '../../net/heat-server.js';
import {
  type ChemAction, CHEM_RULESET, DEFAULT_CHEM_ROUND, greedyChoice, playChemRound,
} from '../../game/chem/round.js';
import { DEFAULT_ROUND, playRound } from '../../lattice/round.js';
import { CELL_COUNT, EMPTY } from '../../lattice/board.js';

const failures: string[] = [];
const ok = (c: boolean, d: string): void => { if (!c) failures.push(d); };

const SERVER_SEED = 5150;
const BEACON: Beacon = { value: 77123, source: 'drand:mainnet:4210987' };

function heatOf(n: number) {
  let h = openHeat('H-NET', SERVER_SEED);
  for (let i = 0; i < n; i += 1) {
    h = enter(h, { playerId: `p${i}`, clientSeedHash: hashText(`c${i}`), stake: 100n });
  }
  return reveal(drawBeacon(close(h), BEACON), SERVER_SEED);
}

/** Plays the heat's real board with a simple policy and returns a submission. */
function honestPlay(heat: ReturnType<typeof heatOf>, playerId: string): Submission {
  const seed = boardSeed(heat);
  const actions: number[] = [];
  const r = playRound(seed, DEFAULT_ROUND, (o) => {
    let best = 0;
    let bf = -1;
    for (let i = 0; i < CELL_COUNT; i += 1) {
      const f = o[i * 3] ?? EMPTY;
      if (f !== EMPTY && f > bf) { bf = f; best = i; }
    }
    actions.push(best);
    return best;
  });
  return {
    playerId, heatId: heat.id, seed, config: DEFAULT_ROUND,
    actions, claimedScore: r.score, claimedDigest: r.digest,
  };
}

const heat = heatOf(8);
const good = honestPlay(heat, 'p0');

// ── T1 / T2: the server replays, and a lie cannot survive it ───────────────
{
  const r = submit(heat, new Map(), good);
  ok(r.ok, `T1: an honest submission was rejected — ${r.ok ? '' : r.reason + ': ' + r.detail}`);
  ok(r.ok && r.score === good.claimedScore,
    'T1: the server did not reproduce the honest score by replay');

  // The forgery: same actions, inflated score.
  const forged: Submission = { ...good, claimedScore: good.claimedScore + 500 };
  const f = submit(heat, new Map(), forged);
  ok(!f.ok && f.reason === 'REPLAY_MISMATCH',
    `T2: a submission claiming ${forged.claimedScore} instead of ${good.claimedScore} was ACCEPTED. ` +
      'The server must score by replaying the actions, never by reading the number sent to it.');

  // And reordered actions must not reproduce the digest.
  const shuffled: Submission = { ...good, actions: [...good.actions].reverse() };
  const sres = submit(heat, new Map(), shuffled);
  ok(!sres.ok, 'T2: reversing the action list still verified — the digest is not binding the order');
  console.log(`  T1/T2 replay is authoritative: honest run scores ${r.ok ? r.score : '?'} by replay; ` +
    `a +500 forgery and a reversed action list are both rejected`);
}

// ── T3 / T4 / T5 / T6: admissibility ───────────────────────────────────────
{
  const wrongBoard: Submission = { ...good, seed: good.seed + 1 };
  const a = submit(heat, new Map(), wrongBoard);
  ok(!a.ok && a.reason === 'WRONG_BOARD', 'T3: a submission for a different seed was accepted');

  const stranger: Submission = { ...good, playerId: 'nobody' };
  const b = submit(heat, new Map(), stranger);
  ok(!b.ok && b.reason === 'NOT_AN_ENTRANT', 'T4: someone who never entered the heat could submit');

  const already = new Map([['p0', good.claimedScore]]);
  const c = submit(heat, already, good);
  ok(!c.ok && c.reason === 'ALREADY_SUBMITTED',
    'T5: a player submitted twice. Without this, a staked single attempt becomes unlimited ' +
      'attempts — play until a run comes out well, then send that one.');

  let openHeatState = openHeat('H-NET', SERVER_SEED);
  openHeatState = enter(openHeatState, { playerId: 'p0', clientSeedHash: 1, stake: 100n });
  const d = submit(openHeatState, new Map(), good);
  ok(!d.ok && d.reason === 'WRONG_PHASE',
    'T6: a submission was accepted against a heat whose board is not yet public');

  const tooMany: Submission = { ...good, actions: new Array(DEFAULT_ROUND.turns + 5).fill(0) };
  const e = submit(heat, new Map(), tooMany);
  ok(!e.ok, 'T6: an over-long action list was accepted — unbounded work for whoever asks');
  console.log('  T3-T6 admissibility: wrong board, non-entrant, second submission, pre-reveal ' +
    'submission and over-long action list are each refused with a distinct reason');
}

// ── T7: a no-show scores zero and their stake stays in ─────────────────────
{
  const ledger = new Map([['p0', good.claimedScore], ['p1', 40]]);
  const s = settleHeat(heat, ledger);
  const noShow = s.payouts.find((p) => p.id === 'p7')!;
  ok(s.handle === 800n, `T7: the handle is ${s.handle}, expected 800 — a no-show's stake left the pool`);
  ok(noShow.payout < 100n,
    `T7: an entrant who never submitted received ${noShow.payout} against a stake of 100. ` +
      'Abandoning must be a losing position or entry is a free look at the board.');
  ok(s.distributed === s.netPool, 'T7: the pool did not close after settling with no-shows');
  console.log(`  T7 no-shows: 6 of 8 entrants never submitted; handle still ${s.handle}, each ` +
    `no-show receives ${noShow.payout} of 100, pool closes exactly`);
}

// ── T8: the receipt is enough to re-derive the outcome ─────────────────────
{
  const ledger = new Map([['p0', good.claimedScore]]);
  const rec = receipt(heat, ledger);
  ok(rec.serverSeedHash === hashText(`server:${rec.serverSeed}`),
    'T8: the receipt\'s revealed seed does not match the hash published at heat open');
  ok(rec.boardSeed === boardSeed(heat), 'T8: the receipt publishes a different board than was played');
  ok(rec.fairness === 'PROVABLY_FAIR',
    `T8: a heat with a drand-sourced beacon published fairness "${rec.fairness}"`);
  // And an operator-trusted heat must SAY SO on its receipt.
  let plain = openHeat('H-PLAIN', SERVER_SEED);
  plain = enter(plain, { playerId: 'x', clientSeedHash: 1, stake: 100n });
  plain = enter(plain, { playerId: 'y', clientSeedHash: 2, stake: 100n });
  plain = enter(plain, { playerId: 'z', clientSeedHash: 3, stake: 100n });
  plain = enter(plain, { playerId: 'w', clientSeedHash: 4, stake: 100n });
  const plainRec = receipt(reveal(close(plain), SERVER_SEED), new Map());
  ok(plainRec.fairness === 'OPERATOR_TRUSTED',
    'T8: a heat run WITHOUT a public beacon published a fairness level better than ' +
      'OPERATOR_TRUSTED. The operator knows that board before any player does, and the receipt ' +
      'must not hide it.');
  console.log(`  T8 receipt: seed matches its opening commitment, board matches what was played, ` +
    `beaconed heat reports ${rec.fairness} and an unbeaconed one reports ${plainRec.fairness}`);
}

// ── T9: the server contains NO second copy of the rules ────────────────────
// The architectural invariant. `round.ts` forbids a second implementation of the
// turn; a server that scored submissions itself would be exactly that.
{
  const src = readFileSync(fileURLToPath(new URL('../../net/heat-server.ts', import.meta.url)), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const banned: readonly (readonly [RegExp, string])[] = [
    [/OFFSET_FACE|OFFSET_CHARGE|OFFSET_LINK/, 'the server reads board columns directly'],
    [/advanceTurn/, 'the server drives turns itself'],
    [/drawFace/, 'the server draws dice'],
    [/generateLattice/, 'the server generates lattices'],
  ];
  for (const [re, what] of banned) {
    ok(!re.test(code),
      `T9: ${what}. The rules have exactly one implementation and the server is not allowed to be ` +
        'a second one — it replays through verifyRound, which IS the shipped game.');
  }
  ok(/verifyRound/.test(code),
    'T9: the server does not call verifyRound at all. If it is not replaying through the shipped ' +
      'executor, it is scoring by some other means.');
  ok(/advanceTurn/.test('function advanceTurn(){}'),
    'T9 NEGATIVE CONTROL FAILED: the scan cannot detect a planted rules implementation');
  console.log(`  T9 one executor: the server calls verifyRound and contains none of the ` +
    `${banned.length} rule-implementing patterns; the scan fires on a planted one`);
}

// ── T10: a second ruleset, served by the same server ───────────────────────
//
// ── THE POINT IS THAT NOTHING IN heat-server.ts KNOWS WHAT A MOLECULE IS ────
//
// The chemistry mode is a different game: a board of molecules, a move that
// selects a region and rearranges it, and a score in kilojoules per mole. The
// tempting way to serve it is a branch in `submit`, and that branch would be the
// first line of the server learning to score — the exact drift T9 exists to
// prevent.
//
// Instead a ruleset is a VERIFIER supplied by the caller. `submit` hands the
// actions to it and believes what comes back, and the dependency points from the
// game to the server so a mode cannot pull the server into itself. T10 is the
// evidence that this works: the same `submit`, the same heat lifecycle, the same
// forgery rejections, on a game the server has never heard of.
{
  const heat = heatOf(8);
  const seed = boardSeed(heat);

  const actions: ChemAction[] = [];
  const honest = playChemRound(seed, DEFAULT_CHEM_ROUND, (tiles) => {
    const a = greedyChoice(tiles);
    actions.push(a);
    return a;
  });

  const chemSub: Submission<typeof DEFAULT_CHEM_ROUND, ChemAction> = {
    playerId: 'p0',
    heatId: heat.id,
    seed,
    config: DEFAULT_CHEM_ROUND,
    actions,
    claimedScore: honest.score,
    claimedDigest: honest.digest,
  };

  const accepted = submit(heat, new Map(), chemSub, CHEM_RULESET);
  ok(accepted.ok && accepted.score === honest.score,
    `T10: the server rejected an honest chemistry submission (${JSON.stringify(accepted)}). If a ` +
      'second ruleset cannot be served without changing heat-server.ts, the generalisation bought ' +
      'nothing.');

  // The score that enters the ledger is the SERVER's, never the claimed one.
  const forged = submit(
    heat, new Map(), { ...chemSub, claimedScore: honest.score * 3 }, CHEM_RULESET,
  );
  ok(!forged.ok && forged.reason === 'REPLAY_MISMATCH',
    `T10: a tripled chemistry score was accepted (${JSON.stringify(forged)}). The rejections T1-T9 ` +
      'prove for the dice game must hold for every mode, or the server is only trustworthy for one.');

  const wrongSeed = submit(heat, new Map(), { ...chemSub, seed: seed + 1 }, CHEM_RULESET);
  ok(!wrongSeed.ok && wrongSeed.reason === 'WRONG_BOARD',
    'T10: a chemistry submission naming a different board was accepted.');

  const tooMany = submit(
    heat, new Map(),
    { ...chemSub, actions: [...actions, ...actions] },
    CHEM_RULESET,
  );
  ok(!tooMany.ok && tooMany.reason === 'TOO_MANY_ACTIONS',
    'T10: an over-long chemistry action list was not bounded before replay. The turn budget comes ' +
      'from the RULESET now, and if it is not consulted an unbounded list is unbounded work.');

  // ── AND THE SERVER'S CODE STILL CONTAINS NO CHEMISTRY ───────────────────
  //
  // Comments are stripped first, for the same reason T9 strips them: a comment
  // EXPLAINING that the server must not know what a molecule is would otherwise
  // fail a check whose whole point is that it does not. This check caught
  // exactly that on its first run, on a comment written two minutes earlier.
  //
  // The opposite convention is right in `verify-chem` C9, which scans comments
  // too — but the terms there are CLAIMS about what something is, and a comment
  // asserting a falsehood becomes the next author's understanding. Vocabulary in
  // a rationale is not a claim, so here the code alone is what matters.
  const serverCode = readFileSync(
    fileURLToPath(new URL('../../net/heat-server.ts', import.meta.url)), 'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const term of ['molecule', 'valence', 'bondEnergy', 'kJ', 'formula']) {
    ok(!new RegExp(term, 'i').test(serverCode),
      `T10: heat-server.ts CODE uses "${term}". The server must not know what the game it settles ` +
        'actually is; that knowledge belongs in the ruleset, on the other side of the dependency.');
  }
  ok(/molecule/i.test('const m = molecules[0];'),
    'T10 NEGATIVE CONTROL FAILED: the scan cannot detect planted chemistry in code.');
  console.log(`  T10 second ruleset: a ${honest.turnsPlayed}-turn chemistry round banking ` +
    `${honest.score} is accepted, its forgeries refused, and heat-server.ts still contains no ` +
    `chemistry vocabulary at all`);
}

if (failures.length > 0) {
  console.error(`verify-net: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('verify-net: T1-T10 pass. The server scores by replaying the shipped game, refuses every ' +
  'forgery tried against it, and publishes a receipt that admits when it was merely operator-trusted.');
