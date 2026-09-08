// lattice/session.ts — the only thing a user interface is allowed to talk to.
//
// WHAT THIS IS FOR, AND THE CLAIM IT WAS BUILT TO ENFORCE.
//
// A host that draws the board needs the board. The board contains the hidden
// lattice. If a renderer reads `board.cells` directly it can paint the links —
// and the moment the links are visible, the inference game is over and the
// mutual-information argument in P1 is measuring something the player can
// simply see. That failure would not be caught by any oracle in the repo,
// because every oracle tests the LIBRARY and the leak would be in the HOST.
//
// The first version of that claim was "the UI must never see hidden state", and
// it is FALSE. The reveal screen must show the links; showing them is the whole
// point of P2, and a player who cannot check the lattice afterwards cannot
// verify anything. So the true claim is narrower and is a PHASE property:
//
//   The UI may not obtain hidden state BEFORE the reveal, and must be able to
//   obtain it after.
//
// That is enforced structurally rather than by discipline. `view()` returns the
// observable projection and nothing else; `links()` throws unless the round has
// been revealed. A host cannot leak what it was never handed, and
// `verify-session` plants a host that tries.
//
// ONE EXECUTOR. This does not implement the rules. It drives `advanceTurn`,
// which `playRound` also drives, so there is no second copy of the turn logic
// to fall out of agreement — see the note on `RoundState` in round.ts.

import { CELL_COUNT } from './board.js';
import { type Commitment, type Reveal, checkReveal, commit, seedFromReveal } from './commit.js';
import { reconstructLattice } from './reveal.js';
import {
  type Action,
  type RoundConfig,
  type RoundResult,
  type RoundState,
  advanceTurn,
  beginRound,
  finishRound,
} from './round.js';

export type Phase = 'committed' | 'playing' | 'ended' | 'revealed';

export interface SessionView {
  readonly phase: Phase;
  readonly turn: number;
  readonly turnsTotal: number;
  readonly score: number;
  readonly reshuffles: number;
  /** Faces, states and charges only — three columns per cell, hidden ones absent. */
  readonly observable: Int32Array;
}

/** Everything a player needs to check the round independently, after it ends. */
export interface VerificationBundle {
  readonly commitment: Commitment;
  readonly reveal: Reveal;
  readonly seed: number;
  readonly config: RoundConfig;
  readonly actions: readonly Action[];
  readonly score: number;
  readonly digest: number;
}

export class Session {
  #phase: Phase = 'committed';
  #state: RoundState | null = null;
  #result: RoundResult | null = null;
  readonly #actions: Action[] = [];

  private constructor(
    readonly commitment: Commitment,
    private readonly serverSeed: string,
    readonly seed: number,
    readonly config: RoundConfig,
    private readonly localRulesHash: string,
  ) {}

  /**
   * Opens a session.
   *
   * The commitment is made BEFORE the first turn and the server seed is held
   * privately until the reveal — that ordering is the entire value of
   * commit-reveal, so it is the constructor's job rather than the caller's.
   */
  static async open(
    serverSeed: string,
    clientSeed: string,
    rulesHash: string,
    config: RoundConfig,
  ): Promise<Session> {
    const commitment = await commit(serverSeed, clientSeed, rulesHash);
    const seed = await seedFromReveal({ serverSeed, clientSeed, rulesHash });
    return new Session(commitment, serverSeed, seed, config, rulesHash);
  }

  get phase(): Phase {
    return this.#phase;
  }

  /** Deals the opening board. */
  start(): SessionView {
    if (this.#phase !== 'committed') throw new Error(`Session.start: cannot start from phase "${this.#phase}"`);
    this.#state = beginRound(this.seed);
    this.#phase = 'playing';
    return this.view();
  }

  /**
   * What the host may draw.
   *
   * Returns a COPY of the observable projection. Handing out a live view into
   * the board would let a host hold a reference and read the hidden columns by
   * arithmetic on the stride, which is the leak this class exists to prevent.
   */
  view(): SessionView {
    const state = this.#state;
    return {
      phase: this.#phase,
      turn: state?.turn ?? 0,
      turnsTotal: this.config.turns,
      score: state?.score ?? 0,
      reshuffles: state?.reshuffles ?? 0,
      observable: state ? state.board.observable() : new Int32Array(CELL_COUNT * 3),
    };
  }

  /** Banks one cell. Returns the view after the turn resolves. */
  bank(cell: Action): SessionView {
    if (this.#phase !== 'playing') throw new Error(`Session.bank: cannot bank in phase "${this.#phase}"`);
    const state = this.#state!;

    // The action is recorded BEFORE it is applied, and recorded as the player
    // gave it. `verifyRound` replays this list; if it were recorded after
    // clamping, the recording would be of what the engine did rather than what
    // the player chose, and a replay would agree with itself about a different
    // game.
    this.#actions.push(cell);

    const advanced = advanceTurn(state, this.config, () => cell);
    if (!advanced || state.turn >= this.config.turns || state.conceded) {
      this.#result = finishRound(state);
      this.#phase = 'ended';
    }
    return this.view();
  }

  /** The hidden lattice. Available only once the round is over and revealed. */
  async reveal(): Promise<{ readonly links: Int32Array; readonly holds: boolean }> {
    if (this.#phase !== 'ended') throw new Error(`Session.reveal: cannot reveal in phase "${this.#phase}"`);
    const reveal: Reveal = {
      serverSeed: this.serverSeed,
      clientSeed: this.commitment.clientSeed,
      rulesHash: this.commitment.rulesHash,
    };
    const holds = await checkReveal(this.commitment, reveal, this.localRulesHash);
    this.#phase = 'revealed';
    return { links: reconstructLattice(this.seed), holds };
  }

  /**
   * The hidden links, for a host that wants to draw them.
   *
   * THROWS BEFORE THE REVEAL. This is the enforcement point for the phase claim
   * at the top of this file, and `verify-session` plants a host that calls it
   * early to prove the throw actually happens.
   */
  links(): Int32Array {
    if (this.#phase !== 'revealed') {
      throw new Error(
        `Session.links: the hidden lattice is not available in phase "${this.#phase}" — ` +
          'a host that could read it before the reveal would end the inference game',
      );
    }
    return reconstructLattice(this.seed);
  }

  /** The finished round. */
  get result(): RoundResult | null {
    return this.#result;
  }

  /**
   * Everything needed to check this round without trusting the app.
   *
   * Note the server seed appears here and only here — after the round. A bundle
   * that could be requested mid-round would hand the player the lattice.
   */
  bundle(): VerificationBundle {
    if (this.#phase !== 'ended' && this.#phase !== 'revealed') {
      throw new Error(`Session.bundle: no bundle before the round ends (phase "${this.#phase}")`);
    }
    const result = this.#result!;
    return {
      commitment: this.commitment,
      reveal: {
        serverSeed: this.serverSeed,
        clientSeed: this.commitment.clientSeed,
        rulesHash: this.commitment.rulesHash,
      },
      seed: this.seed,
      config: this.config,
      actions: [...this.#actions],
      score: result.score,
      digest: result.digest,
    };
  }
}
