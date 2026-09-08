// lattice/board.ts — the UNIFIED LATTICE, Slice 0.
//
// A 6x6 board of tiles. Everything a player acts on is here and is flat: the
// game is a 2D grid and nothing about play is continuous. The fourth dimension
// lives in the LINK and W columns, is never rendered as a value, and is what the
// player must infer.
//
// LAYER DISCIPLINE (CLAUDE.md L1-L5). This file is L1. Nothing above it may
// mutate what is written here mid-round — that is the invariant `verify-lattice`
// asserts as L1x, and it is the finding that removed the per-turn face bias.
//
// Integer only, same as the rest of the engine: a board that cannot be
// reproduced bit-for-bit cannot be replayed, and a round that cannot be replayed
// cannot be verified by anyone but the machine that ran it.

export const BOARD_W = 6;
export const BOARD_H = 6;
export const CELL_COUNT = BOARD_W * BOARD_H;

/** i32 words per cell. */
export const CELL_STRIDE = 6;

export const OFFSET_FACE = 0;   // 0 = empty, else 1..6
export const OFFSET_STATE = 1;  // see STATE_*
export const OFFSET_CHARGE = 2; // 0..CHARGE_MAX, integer
export const OFFSET_LINK = 3;   // HIDDEN: cell index this cell feeds, or -1
export const OFFSET_W = 4;      // HIDDEN: Q16.16 position on the fourth axis
export const OFFSET_AGE = 5;

export const STATE_IDLE = 0;
export const STATE_CHARGED = 1;
export const STATE_SPENT = 2;

/** Charge needed before a cell discharges along its link. */
export const CHARGE_MAX = 3;

export const EMPTY = 0;
export const NO_LINK = -1;

/**
 * The board.
 *
 * One flat Int32Array so the whole thing hashes in one pass and ports to a
 * storage buffer unchanged, exactly like `WorldState`.
 */
export class Board {
  readonly cells: Int32Array<ArrayBuffer>;

  constructor() {
    this.cells = new Int32Array(CELL_COUNT * CELL_STRIDE);
    for (let i = 0; i < CELL_COUNT; i += 1) {
      this.cells[i * CELL_STRIDE + OFFSET_LINK] = NO_LINK;
    }
  }

  static indexOf(column: number, row: number): number {
    return row * BOARD_W + column;
  }

  static columnOf(index: number): number {
    return index % BOARD_W;
  }

  static rowOf(index: number): number {
    return (index / BOARD_W) | 0;
  }

  get(index: number, offset: number): number {
    return this.cells[index * CELL_STRIDE + offset]!;
  }

  set(index: number, offset: number, value: number): void {
    this.cells[index * CELL_STRIDE + offset] = value | 0;
  }

  /**
   * The board as a player can legitimately see it: faces, states and charges,
   * with the hidden columns zeroed.
   *
   * This exists so the mutual-information oracle (P1) can be computed over
   * exactly what is observable, rather than over what the engine happens to
   * hold. If the two were allowed to drift, P1 would be measuring the wrong
   * thing and would report a reassuring number about a lie.
   */
  observable(): Int32Array {
    const view = new Int32Array(CELL_COUNT * 3);
    for (let i = 0; i < CELL_COUNT; i += 1) {
      view[i * 3] = this.get(i, OFFSET_FACE);
      view[i * 3 + 1] = this.get(i, OFFSET_STATE);
      view[i * 3 + 2] = this.get(i, OFFSET_CHARGE);
    }
    return view;
  }

  /** The hidden link column, for oracles and for the post-round reveal only. */
  hiddenLinks(): Int32Array {
    const links = new Int32Array(CELL_COUNT);
    for (let i = 0; i < CELL_COUNT; i += 1) links[i] = this.get(i, OFFSET_LINK);
    return links;
  }
}
