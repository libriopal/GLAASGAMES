// game/economy/heat.ts — the shared-board multiplayer heat, and its fairness.
//
// A HEAT is one seed plus the cohort that plays it inside a short window. Scores
// are compared only within a heat, exactly as duplicate bridge compares only
// pairs who held the same cards, so board difficulty cancels completely and a
// leaked seed is worthless once its heat closes.
//
// This file is the LIFECYCLE and the SEED DERIVATION. The settlement arithmetic
// lives in `pari-mutuel.ts`; the two are kept apart so that the question "is the
// board fair?" and the question "is the payout fair?" have separate answers and
// separate oracles.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ORDER OF THE PHASES IS THE WHOLE SECURITY ARGUMENT.
//
//   OPEN      the operator publishes H(serverSeed). The seed itself is secret.
//   COMMITTED each entrant submits H(clientSeed) and a stake. Nobody has seen
//             the server seed, so nobody can choose a client seed that steers
//             the board — they are committing blind.
//   CLOSED    the cohort is locked. No entry, no withdrawal, no stake change.
//   REVEALED  the operator publishes serverSeed. Anyone can check it against the
//             hash published at OPEN, then recompute the board for themselves.
//
// The independent audit reasoned through the grinding attack on a SHARED seed
// and landed exactly here:
//
//   "The player commits to H(S_n). They want H(Server || S_1...S_n) to be 'good'.
//    Since they don't know 'Server' yet, they can't grind... Commit-reveal is
//    sound IF the Server Seed is only revealed AFTER all Client Seed commitments
//    are locked."
//
// So the rule this file enforces is not "hash things together" — it is that
// `reveal` is IMPOSSIBLE to call before `close`, and `enter` is impossible to
// call after it. Both are state-machine facts, not conventions.

import { hashState } from '../../engine/sim/hash.js';

/** Hashes a string deterministically, reusing the audited state hash. */
export function hashText(s: string): number {
  const codes = new Int32Array(s.length);
  for (let i = 0; i < s.length; i += 1) codes[i] = s.charCodeAt(i);
  return hashState(codes) >>> 0;
}

export type HeatPhase = 'OPEN' | 'CLOSED' | 'REVEALED';

/**
 * Stake bounds.
 *
 * BOTH ENDS ARE REQUIRED, and the audit named both. A floor stops dust entries —
 * an entry so small it costs nothing to place but still occupies a rank and
 * dilutes the cohort. A ceiling stops a single whale from owning the pool
 * outright, which would make every other entrant's stake decorative.
 */
export const MIN_STAKE = 10n;
export const MAX_STAKE = 10000n;

/**
 * The largest share of the handle any ONE entrant may hold, in basis points.
 *
 * ── THIS IS THE ANTI-COLLUSION LIMIT, AND IT IS MEASURED, NOT CHOSEN ────────
 *
 * The design audit was asked whether stake-weighted settlement revives the sybil
 * attack and answered: "No, sybils are neutralized by the requirement of minimum
 * stake per account." That is a claim, and measuring it showed it is FALSE.
 *
 * A colluder entering 8 throwaway entries at MIN_STAKE alongside one real entry,
 * against a field of 15, ROI on total stake over 150 heats:
 *
 *     attacker share of pool     honest ROI     with 8 sybils     edge
 *              6%                  +2.2%           -29.8%      -32.02pp
 *             25%                  -5.5%           -12.6%       -7.09pp
 *             40%                  -9.3%           -11.0%       -1.64pp
 *             62%                 -12.1%           -10.7%      *** +1.38pp
 *             86%                 -11.2%            -9.9%      *** +1.28pp
 *
 * The attack turns profitable somewhere between a 40% and a 62% share, because a
 * MIN_STAKE sybil lifts the attacker's rank by a full place while diluting a
 * pool the attacker already dominates by almost nothing. The lever is therefore
 * CONCENTRATION, not the absolute stake — and MAX_STAKE alone cannot express it,
 * because whether 10000 is dominant depends entirely on who else turned up.
 *
 * 2500 bps (25%) sits well below the measured crossover with room for the
 * estimate to be wrong. The exact figure belongs to election E32 (collusion
 * policy), which is a Tier 1 decision; what is settled here is the MECHANISM and
 * the measurement, not the number.
 */
export const MAX_POOL_SHARE_BPS = 2500n;

export interface Commitment {
  readonly playerId: string;
  /** H(clientSeed). The seed itself is not disclosed until the player reveals. */
  readonly clientSeedHash: number;
  readonly stake: bigint;
}

export interface HeatState {
  readonly id: string;
  readonly phase: HeatPhase;
  /** H(serverSeed), published before anyone may enter. */
  readonly serverSeedHash: number;
  /** The server seed, present only once REVEALED. */
  readonly serverSeed: number | null;
  readonly commitments: readonly Commitment[];
  /** Entrants who never submitted a score. Treated as zero, never refunded. */
  readonly abandoned: readonly string[];
  readonly capacity: number;
}

export function openHeat(id: string, serverSeed: number, capacity = 64): HeatState {
  return {
    id,
    phase: 'OPEN',
    serverSeedHash: hashText(`server:${serverSeed}`),
    serverSeed: null,
    commitments: [],
    abandoned: [],
    capacity,
  };
}

/**
 * Adds an entrant. Only legal while OPEN.
 *
 * THE STRICT CLOSE IS THE ANTI-SNIPE. If entry were permitted after close, a
 * player could watch the heat resolve and then enter against a known field —
 * which is the front-running the closed-cohort design exists to prevent.
 */
export function enter(heat: HeatState, c: Commitment): HeatState {
  if (heat.phase !== 'OPEN') {
    throw new RangeError(
      `enter: heat ${heat.id} is ${heat.phase}, not OPEN. A cohort that can still be joined after ` +
        'it closes is a cohort a sniper can join once the field is known.',
    );
  }
  if (heat.commitments.length >= heat.capacity) {
    throw new RangeError(`enter: heat ${heat.id} is full at ${heat.capacity}`);
  }
  if (c.stake < MIN_STAKE || c.stake > MAX_STAKE) {
    throw new RangeError(
      `enter: stake ${c.stake} is outside [${MIN_STAKE}, ${MAX_STAKE}]. A floor stops dust entries ` +
        'that occupy a rank for nothing; a ceiling stops one entrant owning the pool.',
    );
  }
  if (heat.commitments.some((x) => x.playerId === c.playerId)) {
    throw new RangeError(`enter: ${c.playerId} has already entered heat ${heat.id}`);
  }
  return { ...heat, commitments: [...heat.commitments, c] };
}

/**
 * Locks the cohort. Nothing may enter or leave afterwards.
 *
 * THE CONCENTRATION LIMIT IS CHECKED HERE, NOT AT ENTRY, and it has to be.
 * Whether an entrant holds too much of the pool is a fact about the WHOLE
 * cohort: a stake of 1000 is 91% of a two-person heat and 6% of a large one. It
 * is unknowable when that entrant enters and known exactly when the heat closes.
 */
export function close(heat: HeatState): HeatState {
  if (heat.phase !== 'OPEN') throw new RangeError(`close: heat ${heat.id} is already ${heat.phase}`);
  const handle = heat.commitments.reduce((a, c) => a + c.stake, 0n);
  for (const c of heat.commitments) {
    if (c.stake * 10000n > handle * MAX_POOL_SHARE_BPS) {
      const share = handle === 0n ? 0n : (c.stake * 10000n) / handle;
      throw new RangeError(
        `close: ${c.playerId} holds ${share} bps of the handle, above the ${MAX_POOL_SHARE_BPS} bps ` +
          'limit. Measured, the sybil attack turns profitable once one entrant dominates the pool ' +
          '(+1.38pp edge at a 62% share), because throwaway entries then lift their rank while ' +
          'diluting a pool they already own. The heat must gain entrants or shed the oversized ' +
          'stake before it can close.',
      );
    }
  }
  return { ...heat, phase: 'CLOSED' };
}

/**
 * Publishes the server seed and derives the board.
 *
 * REVEAL CANNOT PRECEDE CLOSE, and that ordering is the entire anti-grinding
 * argument. An entrant choosing a client seed has not seen the server seed, so
 * they cannot search for a contribution that produces a board they like. Once
 * the cohort is locked the server seed is disclosed and every entrant can
 * recompute the board and check the hash published at OPEN.
 */
export function reveal(heat: HeatState, serverSeed: number): HeatState {
  if (heat.phase !== 'CLOSED') {
    throw new RangeError(
      `reveal: heat ${heat.id} is ${heat.phase}, not CLOSED. Revealing the server seed while entry ` +
        'is still open would let the last entrant grind a client seed against a known server seed.',
    );
  }
  if (hashText(`server:${serverSeed}`) !== heat.serverSeedHash) {
    throw new RangeError(
      `reveal: the server seed does not match the commitment published when heat ${heat.id} opened. ` +
        'An operator that can substitute a seed after the fact can choose the board.',
    );
  }
  return { ...heat, phase: 'REVEALED', serverSeed };
}

/**
 * The board seed, from the server seed and every client commitment.
 *
 * The client hashes are sorted, so the derivation does not depend on the order
 * entrants happened to arrive — the same property `settle` needs, for the same
 * reason. Every entrant contributes entropy, so no single party (the operator
 * included) chooses the board alone.
 */
export function boardSeed(heat: HeatState): number {
  if (heat.phase !== 'REVEALED' || heat.serverSeed === null) {
    throw new RangeError(`boardSeed: heat ${heat.id} is ${heat.phase} — the seed is not yet public`);
  }
  const parts = [...heat.commitments.map((c) => c.clientSeedHash)].sort((a, b) => a - b);
  return hashText(`board:${heat.serverSeed}:${parts.join('.')}`) >>> 0;
}

/**
 * Marks an entrant as having never submitted a score.
 *
 * ABANDONMENT IS A LOSING BET, NOT A REFUND. The audit was explicit: treating a
 * no-show as score 0 with the stake remaining in the pool is safe; refunding the
 * stake is not, because it would make entering and abandoning a free option on
 * the board — enter, look, and withdraw if the seed is bad.
 */
export function abandon(heat: HeatState, playerId: string): HeatState {
  if (!heat.commitments.some((c) => c.playerId === playerId)) {
    throw new RangeError(`abandon: ${playerId} is not in heat ${heat.id}`);
  }
  if (heat.abandoned.includes(playerId)) return heat;
  return { ...heat, abandoned: [...heat.abandoned, playerId] };
}

/**
 * The heat's public digest: seed commitment, cohort and capacity.
 *
 * Binds what was agreed before play to what is settled after it. Changing any
 * commitment, or the cohort, moves the digest.
 */
export function heatDigest(heat: HeatState): number {
  const parts = [...heat.commitments]
    .sort((a, b) => (a.playerId < b.playerId ? -1 : 1))
    .map((c) => `${c.playerId}:${c.clientSeedHash}:${c.stake}`);
  return hashText(`heat:${heat.id}:${heat.serverSeedHash}:${heat.capacity}:${parts.join('|')}`) >>> 0;
}

/**
 * The live projection a player sees while the heat is still open.
 *
 * ── IT READS A COMMITTED CURVE, NEVER THE LIVE FIELD ────────────────────────
 *
 * The independent audit named the LEADERBOARD ORACLE ATTACK as the most likely
 * way this becomes unfair without anyone noticing: on a shared board, a visible
 * leaderboard tells a late player exactly what score to target.
 *
 * Its proposed remedy was ZK-proofs over leaderboard state. That is rejected,
 * and the rejection is recorded rather than made quietly: proving the integrity
 * of a signal that should not be published at all is the wrong repair. Spec 36
 * already solves it — the live readout uses a PAR CURVE committed at heat open,
 * "so there is no informational asymmetry from playing early or late, and the
 * live actual field aggregate is never exposed."
 *
 * So this function takes the committed curve and the player's own score. It has
 * no parameter through which the live field could reach it, which is a stronger
 * guarantee than a proof about the field: the information is not present.
 */
export function liveProjection(
  ownScore: number,
  parCurve: readonly number[],
): { readonly p10: number; readonly p90: number } {
  // The curve is a committed, sorted score distribution. A player's projected
  // percentile is their position in it — a fact about the PUBLISHED curve, never
  // about who is currently playing.
  let below = 0;
  for (const s of parCurve) if (s < ownScore) below += 1;
  const p = parCurve.length === 0 ? 0 : below / parCurve.length;
  // Reported as a BAND, never a point. A point value reads as owed money.
  const halfWidth = 0.12;
  return {
    p10: Math.max(0, p - halfWidth),
    p90: Math.min(1, p + halfWidth),
  };
}
