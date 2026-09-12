// net/heat-server.ts — the authoritative side of a shared-board heat.
//
// ─────────────────────────────────────────────────────────────────────────────
// IT DOES NOT IMPLEMENT THE RULES, AND THAT IS THE POINT.
//
// This repository already has exactly one executor: `playRound` and
// `lattice/session.ts` both call `advanceTurn`, and `round.ts` explains at
// length why a second copy of the turn is forbidden — it is the kernel/shader
// parity defect one level up, with no oracle to catch the drift.
//
// A server that scored submissions itself would be that second copy. So it does
// not score anything. A client submits the ACTIONS IT TOOK, and the server
// re-executes them through `verifyRound`, which is the same function the
// single-player build already uses and which `verify-session` N5 already proves
// rejects "inflated score, flipped digest, reordered actions, false seed and
// foreign rules".
//
// This is the server-authoritative pattern the literature describes — "the
// server performs all crucial checks and simulations, refusing to blindly trust
// client input" (arXiv 2512.21377, systematic review of anti-cheat defences).
// The difference here is that the simulation the server runs is not a
// re-implementation: it is the shipped game.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE IS NOT.
//
// There is no socket, no HTTP handler and no persistence here. Those are
// deployment concerns and they change with the host. What is here is the part
// that has to be RIGHT — which submissions are admissible, in what order, and
// what a server is allowed to believe — expressed as pure functions so an oracle
// can drive them without a network.

import {
  type HeatState,
  boardSeed,
  fairnessLevel,
} from '../game/economy/heat.js';
import { type Entry, settle } from '../game/economy/pari-mutuel.js';
import { type Action, type RoundConfig, verifyRound } from '../lattice/round.js';

/**
 * A ruleset the server can verify a submission against.
 *
 * ── WHY THIS IS AN INTERFACE AND NOT A SECOND `if` ──────────────────────────
 *
 * The chemistry mode is a different game — different board, different move,
 * different score — and the tempting shape is a discriminated union with a
 * branch in `submit`. That branch would be the beginning of the server knowing
 * what a molecule is, and the whole reason this file exists is that it knows
 * nothing about how anything scores.
 *
 * So a ruleset is a VERIFIER, supplied by the caller. The server receives
 * actions, hands them to the ruleset's own executor, and believes the number
 * that comes back. Adding a third mode adds no code here at all, and nothing in
 * this file ever imports a ruleset — the dependency points the other way, so a
 * game cannot pull the server into itself.
 */
export interface Ruleset<C, A> {
  /** Recorded on the receipt, so a third party knows which rules were run. */
  readonly id: string;
  /** The shipped executor for this mode. Never a re-implementation. */
  readonly verify: (
    seed: number,
    config: C,
    actions: readonly A[],
    claimedScore: number,
    claimedDigest: number,
  ) => { readonly ok: boolean; readonly score: number; readonly digest: number };
  /** Turn budget, so an unbounded action list is refused before any replay. */
  readonly turnsOf: (config: C) => number;
}

/** The original dice ruleset. Its executor is `lattice/round.ts`, unchanged. */
export const LATTICE_RULESET: Ruleset<RoundConfig, Action> = {
  id: 'lattice',
  verify: verifyRound,
  turnsOf: (config) => config.turns,
};

/** What a client sends when it has finished playing. */
export interface Submission<C = RoundConfig, A = Action> {
  readonly playerId: string;
  readonly heatId: string;
  /** The seed the client believes it played. Checked against the heat's board. */
  readonly seed: number;
  readonly config: C;
  /** THE ACTIONS, not the score. The server replays these. */
  readonly actions: readonly A[];
  readonly claimedScore: number;
  readonly claimedDigest: number;
}

export type RejectReason =
  | 'WRONG_PHASE'
  | 'NOT_AN_ENTRANT'
  | 'ALREADY_SUBMITTED'
  | 'WRONG_BOARD'
  | 'REPLAY_MISMATCH'
  | 'TOO_MANY_ACTIONS';

export interface Accepted {
  readonly ok: true;
  readonly playerId: string;
  /** The score the SERVER computed by replaying. Never the claimed one. */
  readonly score: number;
}

export interface Rejected {
  readonly ok: false;
  readonly playerId: string;
  readonly reason: RejectReason;
  readonly detail: string;
}

export type SubmissionResult = Accepted | Rejected;

/** Submissions accepted so far, keyed by player. */
export type Ledger = ReadonlyMap<string, number>;

/**
 * Admits one submission, or explains why not.
 *
 * ── THE SCORE IN THE SUBMISSION IS NEVER USED AS THE SCORE ──────────────────
 *
 * `claimedScore` exists only so the server can tell the client that its own
 * arithmetic disagreed — a useful diagnostic and a cheating signal. The score
 * that enters the ledger is the one `verifyRound` computed by replaying the
 * actions. A client that lies about its score is not merely rejected; the lie
 * cannot propagate, because the number it sent is never read as truth.
 */
export function submit<C, A>(
  heat: HeatState,
  ledger: Ledger,
  s: Submission<C, A>,
  ruleset: Ruleset<C, A> = LATTICE_RULESET as unknown as Ruleset<C, A>,
): SubmissionResult {
  const no = (reason: RejectReason, detail: string): Rejected =>
    ({ ok: false, playerId: s.playerId, reason, detail });

  // Only a REVEALED heat has a public board, and only then can a submission be
  // checked against it. Earlier, the server would be asserting a board nobody
  // can yet verify; the phase machine in `heat.ts` is what makes that impossible.
  if (heat.phase !== 'REVEALED') {
    return no('WRONG_PHASE', `heat ${heat.id} is ${heat.phase}; submissions are checked against a revealed board`);
  }
  if (s.heatId !== heat.id) {
    return no('WRONG_BOARD', `submission names heat ${s.heatId}, server is settling ${heat.id}`);
  }
  if (!heat.commitments.some((c) => c.playerId === s.playerId)) {
    return no('NOT_AN_ENTRANT', `${s.playerId} never entered heat ${heat.id}`);
  }
  // ONE SUBMISSION EACH. Without this a player replays until a run comes out
  // well, which turns a single staked attempt into unlimited attempts.
  if (ledger.has(s.playerId)) {
    return no('ALREADY_SUBMITTED', `${s.playerId} has already submitted to heat ${heat.id}`);
  }
  const expected = boardSeed(heat);
  if (s.seed !== expected) {
    return no('WRONG_BOARD', `submission played seed ${s.seed}, this heat's board is ${expected}`);
  }
  // A submission cannot contain more actions than the round has turns. Bounded
  // before replay, because an unbounded array is an unbounded amount of work for
  // whoever asks the server to check it.
  const turns = ruleset.turnsOf(s.config);
  if (s.actions.length > turns) {
    return no('TOO_MANY_ACTIONS', `${s.actions.length} actions for a ${turns}-turn round`);
  }

  const replay = ruleset.verify(s.seed, s.config, s.actions, s.claimedScore, s.claimedDigest);
  if (!replay.ok) {
    return no(
      'REPLAY_MISMATCH',
      `claimed ${s.claimedScore}/${s.claimedDigest >>> 0}, replay produced ` +
        `${replay.score}/${replay.digest >>> 0}`,
    );
  }
  return { ok: true, playerId: s.playerId, score: replay.score };
}

/**
 * Settles a revealed heat from the accepted ledger.
 *
 * ENTRANTS WHO NEVER SUBMITTED SCORE ZERO AND KEEP THEIR STAKE IN THE POOL. That
 * is the abandonment rule from `heat.ts`, applied here rather than reinvented:
 * refunding a no-show would make entry a free option on the board.
 */
export function settleHeat(heat: HeatState, ledger: Ledger): ReturnType<typeof settle> {
  if (heat.phase !== 'REVEALED') {
    throw new RangeError(`settleHeat: heat ${heat.id} is ${heat.phase}, not REVEALED`);
  }
  const entries: Entry[] = heat.commitments.map((c) => ({
    id: c.playerId,
    score: ledger.get(c.playerId) ?? 0,
    stake: c.stake,
  }));
  return settle(entries);
}

/**
 * Everything a third party needs to re-derive this heat's outcome themselves.
 *
 * `fairness` is included and is DERIVED, so a heat run without a public beacon
 * publishes the fact that its operator knew the board first. A receipt that only
 * ever says "fair" is a receipt nobody should read.
 */
export interface HeatReceipt {
  readonly heatId: string;
  readonly serverSeedHash: number;
  readonly serverSeed: number;
  readonly beacon: { readonly value: number; readonly source: string } | null;
  readonly boardSeed: number;
  readonly fairness: ReturnType<typeof fairnessLevel>;
  readonly scores: readonly { readonly playerId: string; readonly score: number }[];
}

export function receipt(heat: HeatState, ledger: Ledger): HeatReceipt {
  if (heat.phase !== 'REVEALED' || heat.serverSeed === null) {
    throw new RangeError(`receipt: heat ${heat.id} is ${heat.phase}, nothing to publish yet`);
  }
  return {
    heatId: heat.id,
    serverSeedHash: heat.serverSeedHash,
    serverSeed: heat.serverSeed,
    beacon: heat.beacon === null ? null : { value: heat.beacon.value, source: heat.beacon.source },
    boardSeed: boardSeed(heat),
    fairness: fairnessLevel(heat),
    scores: heat.commitments
      .map((c) => ({ playerId: c.playerId, score: ledger.get(c.playerId) ?? 0 }))
      .sort((a, b) => (a.playerId < b.playerId ? -1 : 1)),
  };
}
