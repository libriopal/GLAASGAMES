// lattice/telemetry.ts — a playtest log the tester chooses to send.
//
// The app has no INTERNET permission and must keep none: that is what makes the
// Play Data Safety declaration "no data collected" true rather than promised,
// and the platform enforces it rather than this file promising it. So there is
// no client, no endpoint, and no background upload anywhere in here. A session
// is recorded on the device, and the tester exports it deliberately if they
// want to.
//
// WHAT IT IS FOR. Closed testing puts twelve people in front of this game — the
// first humans ever to play it. verify-learnable measures a regional model
// against machine policies; what it cannot measure is whether a PERSON finds
// the structure. Recording each turn's board and choice lets that same learner
// be replayed against a human's decisions afterwards, which is the first real
// answer to whether the inference is felt rather than merely present.
//
// WHAT IS NOT RECORDED: no identifiers, no timestamps beyond elapsed
// milliseconds within the round, no device information. A round is its seed and
// its choices; anything else would be collection the app has told the store it
// does not do.

/** One decision, as a player made it. */
export interface TurnRecord {
  readonly turn: number;
  /** Which cell was taken. */
  readonly banked: number;
  /** Cells whose charge rose in response — the evidence the player saw. */
  readonly charged: readonly number[];
  /** Milliseconds since the round began. Elapsed only; never a wall clock. */
  readonly atMs: number;
  /** Faces on the board when the choice was made, so the choice can be judged. */
  readonly faces: readonly number[];
  /** Charges on the board when the choice was made. */
  readonly charges: readonly number[];
}

export interface SessionRecord {
  readonly version: 1;
  readonly seed: number;
  readonly turns: readonly TurnRecord[];
  readonly score: number;
  readonly conceded: boolean;
}

/**
 * Accumulates a session in memory.
 *
 * Deliberately not a class with a `send`. There is nothing to send to.
 *
 * IT MUST SURVIVE A CRASH, and that is not the same as surviving a close.
 * Android kills a backgrounded WebView with no warning and no `pagehide`, so a
 * log that is only written on the way out is a log that is lost exactly when
 * the tester hit the bug worth reporting. The host therefore persists `turns`
 * after EVERY turn and hands them back through `adopt`. The alternative —
 * re-deriving the log from the saved seed and actions — recovers the board and
 * the choice but not `atMs`, and how long a person took to decide is the one
 * column here that cannot be recomputed.
 */
export class Telemetry {
  readonly #turns: TurnRecord[] = [];
  #startedAt = 0;

  begin(nowMs: number): void {
    this.#turns.length = 0;
    this.#startedAt = nowMs;
  }

  /**
   * Continues a log recovered from storage.
   *
   * The clock is rebased so the next record continues from the last one rather
   * than restarting at zero: `atMs` is elapsed PLAY time, and a resumed round
   * whose second half timed itself from zero would read as two rounds.
   */
  adopt(turns: readonly TurnRecord[], nowMs: number): void {
    this.#turns.length = 0;
    this.#turns.push(...turns);
    const last = turns.length > 0 ? turns[turns.length - 1]!.atMs : 0;
    this.#startedAt = nowMs - last;
  }

  /** The log so far, for storage. */
  get turns(): readonly TurnRecord[] {
    return this.#turns;
  }

  record(turn: number, banked: number, charged: readonly number[], observable: Int32Array, nowMs: number): void {
    const cells = observable.length / 3;
    const faces: number[] = [];
    const charges: number[] = [];
    for (let i = 0; i < cells; i += 1) {
      faces.push(observable[i * 3]!);
      charges.push(observable[i * 3 + 2]!);
    }
    this.#turns.push({
      turn,
      banked,
      charged: [...charged],
      atMs: Math.max(0, Math.round(nowMs - this.#startedAt)),
      faces,
      charges,
    });
  }

  get length(): number {
    return this.#turns.length;
  }

  build(seed: number, score: number, conceded: boolean): SessionRecord {
    return { version: 1, seed, turns: [...this.#turns], score, conceded };
  }
}
