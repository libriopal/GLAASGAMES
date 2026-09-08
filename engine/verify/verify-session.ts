// engine/verify/verify-session.ts
// The interactive surface plays the same game the verifier checks.
//
// N1  a session driven turn-by-turn equals playRound on the same actions  (PARITY)
// N2  the bundle a player is handed actually verifies
// N3  hidden state is unreachable before the reveal, and reachable after   (PHASE)
// N4  the actions recorded are the actions the player gave
// N5  a tampered bundle is REJECTED                                (NEGATIVE CONTROL)
//
// N1 IS THE ONE THAT MATTERS. An interactive host cannot use playRound — a
// player answers over minutes and a synchronous callback loop cannot wait — so
// the tempting move is to let the UI run its own turn loop. That would be a
// second implementation of the rules with nothing holding the two in agreement,
// which is the exact defect kernel.ts/sim.wgsl parity exists to prevent, one
// level up and with no oracle watching. The turn was extracted instead, so
// there is only one executor; N1 is the check that keeps it that way, and it
// would fail immediately if anyone re-implemented a turn in the host.

import { DEFAULT_ROUND, playRound, type Action } from '../../lattice/round.js';
import { computeRules } from '../../lattice/ruleset.js';
import { Session } from '../../lattice/session.js';
import { verifyRound } from '../../lattice/round.js';
import { checkReveal } from '../../lattice/commit.js';

const failures: string[] = [];
const fail = (detail: string): void => void failures.push(detail);
const ok = (condition: boolean, detail: string): void => {
  if (!condition) fail(detail);
};

const RULES = computeRules().hash;

/** A deterministic policy over the observable board — the same shape a UI has. */
function pickCell(observable: Int32Array, turn: number): number {
  let best = 0;
  let bestValue = -1;
  for (let i = 0; i < observable.length / 3; i += 1) {
    const face = observable[i * 3]!;
    const charge = observable[i * 3 + 2]!;
    const value = face === 0 ? -1 : face * (1 + charge);
    if (value > bestValue || (value === bestValue && (i + turn) % 7 === 0)) {
      bestValue = value;
      best = i;
    }
  }
  return best;
}

/** Plays a whole session the way a host would: view, choose, bank, repeat. */
async function playSession(serverSeed: string, clientSeed: string): Promise<Session> {
  const session = await Session.open(serverSeed, clientSeed, RULES, DEFAULT_ROUND);
  let view = session.start();
  while (session.phase === 'playing') {
    view = session.bank(pickCell(view.observable, view.turn));
  }
  return session;
}

// ── N1: the session and playRound are the same executor ────────────────────
{
  const session = await playSession('session-server-a1', 'session-client-b2');
  const bundle = session.bundle();

  // Replay the SAME actions through playRound and require identical results.
  const replayed = playRound(bundle.seed, bundle.config, (_o, turn) => bundle.actions[turn] ?? 0);

  ok(replayed.score === bundle.score,
    `N1 PARITY: the session scored ${bundle.score} and playRound scored ${replayed.score} on the same ` +
      'actions — the interactive host and the verifier are playing different games');
  ok(replayed.digest === bundle.digest,
    `N1 PARITY: digests differ — session 0x${(bundle.digest >>> 0).toString(16)}, ` +
      `playRound 0x${(replayed.digest >>> 0).toString(16)}`);
  ok(session.result!.turnsPlayed === replayed.turnsPlayed,
    `N1: turn counts differ — ${session.result!.turnsPlayed} vs ${replayed.turnsPlayed}`);

  console.log(
    `  N1 parity: ${bundle.actions.length} interactive turns, score ${bundle.score}, ` +
      `digest 0x${(bundle.digest >>> 0).toString(16)} — identical to playRound on the same actions`,
  );
}

// ── N2: the bundle the player is handed actually verifies ──────────────────
{
  const session = await playSession('session-server-c3', 'session-client-d4');
  const b = session.bundle();

  ok(await checkReveal(b.commitment, b.reveal, RULES),
    'N2: the commitment published before the round did not verify against the reveal handed to the player');

  const check = verifyRound(b.seed, b.config, b.actions, b.score, b.digest);
  ok(check.ok,
    `N2: the bundle failed its own verification — claimed ${b.score}/0x${(b.digest >>> 0).toString(16)}, ` +
      `recomputed ${check.score}/0x${(check.digest >>> 0).toString(16)}`);

  console.log(`  N2 bundle: commitment holds and verifyRound reproduces score ${b.score} from the seed and ${b.actions.length} actions`);
}

// ── N3: PHASE — hidden state is gated, both directions ─────────────────────
// The claim is not "the UI never sees the lattice"; the reveal must show it.
// The claim is that it cannot see it EARLY. Both halves are checked, because a
// gate that never opens is as broken as one that never closes.
{
  const session = await Session.open('session-server-e5', 'session-client-f6', RULES, DEFAULT_ROUND);

  let threwBeforeStart = false;
  try { session.links(); } catch { threwBeforeStart = true; }
  ok(threwBeforeStart, 'N3: links() returned the hidden lattice before the round even started');

  let view = session.start();
  let threwDuringPlay = false;
  try { session.links(); } catch { threwDuringPlay = true; }
  ok(threwDuringPlay, 'N3: links() returned the hidden lattice mid-round — the inference game is over');

  // The observable view must not carry the hidden columns at all. Three ints
  // per cell, not six: there is no stride arithmetic that reaches a link.
  ok(view.observable.length === (view.observable.length / 3) * 3 && view.observable.length === 36 * 3,
    `N3: the observable view is ${view.observable.length} ints, expected ${36 * 3} — it may carry hidden columns`);

  let threwBundle = false;
  try { session.bundle(); } catch { threwBundle = true; }
  ok(threwBundle, 'N3: a verification bundle — which contains the server seed — was issued mid-round');

  while (session.phase === 'playing') view = session.bank(pickCell(view.observable, view.turn));

  const revealed = await session.reveal();
  ok(revealed.holds, 'N3: the reveal did not satisfy its own commitment');
  const links = session.links();
  ok(links.length === 36, `N3: the revealed lattice has ${links.length} entries, expected 36`);
  ok(links.some((l) => l >= 0), 'N3: the revealed lattice is entirely empty, so the gate opened onto nothing');

  console.log('  N3 phase gate: links() throws before start, throws mid-round, and returns 36 entries after the reveal');
}

// ── N4: the recorded actions are the player's, not the engine's ────────────
{
  const session = await Session.open('session-server-g7', 'session-client-h8', RULES, DEFAULT_ROUND);
  let view = session.start();
  const given: Action[] = [];
  while (session.phase === 'playing') {
    const choice = pickCell(view.observable, view.turn);
    given.push(choice);
    view = session.bank(choice);
  }
  const recorded = session.bundle().actions;
  ok(recorded.length === given.length && recorded.every((a, i) => a === given[i]),
    `N4: the session recorded ${JSON.stringify(recorded)} but the player gave ${JSON.stringify(given)}`);
  console.log(`  N4 recording: ${given.length} actions recorded exactly as given`);
}

// ── N5: NEGATIVE CONTROLS — a tampered bundle must be rejected ─────────────
// Every check above could be satisfied by a verifier that returns true.
{
  const session = await playSession('session-server-i9', 'session-client-j0');
  const b = session.bundle();

  ok(!verifyRound(b.seed, b.config, b.actions, b.score + 1, b.digest).ok,
    'N5 NEGATIVE CONTROL FAILED: a score inflated by one was accepted');
  ok(!verifyRound(b.seed, b.config, b.actions, b.score, (b.digest ^ 1) >>> 0).ok,
    'N5 NEGATIVE CONTROL FAILED: a digest with one bit flipped was accepted');

  const swapped = [...b.actions];
  if (swapped.length >= 2 && swapped[0] !== swapped[1]) {
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    ok(!verifyRound(b.seed, b.config, swapped, b.score, b.digest).ok,
      'N5 NEGATIVE CONTROL FAILED: reordering the first two actions still reproduced the claimed result');
  }

  ok(!(await checkReveal(b.commitment, { ...b.reveal, serverSeed: 'not-the-committed-seed' }, RULES)),
    'N5 NEGATIVE CONTROL FAILED: a substituted server seed satisfied the commitment');
  ok(!(await checkReveal(b.commitment, b.reveal, 'f'.repeat(64))),
    'N5 NEGATIVE CONTROL FAILED: a verifier running different rules accepted the round');

  console.log('  N5 negative controls: inflated score, flipped digest, reordered actions, false seed and foreign rules all rejected');
}

if (failures.length > 0) {
  console.error(`verify-session: FAIL — ${failures.length} violations`);
  for (const detail of failures) console.error(`  ${detail}`);
  process.exit(1);
}

console.log('verify-session: PASS — the playable surface runs the verifier’s own executor, and the lattice stays hidden until reveal');
