// lattice/tile-transform.ts — how a 4D engine draws a 3D die on a flat board.
//
// A token's grid position is quantised to its cell and CLAMPED. Only its
// rotation in R^4 is free. That single constraint is the whole technique, and it
// is why this is not a gimmick:
//
//   A 4D rotation of a cube produces a sequence of 3D shadows that no 3D
//   rotation can — faces arriving from nowhere and folding away, the tesseract's
//   cross-section behaviour. Applied to a die sitting still in its square, that
//   reads as a specimen turning in a case: volumetric, alive, and impossible to
//   mistake for a sprite.
//
// The xw and yw planes are the two with no 3D analogue, and they are what makes
// the facet sigils in the concept art possible. The zw plane is deliberately
// left at rest in Slice 0: three simultaneous rotations is already more motion
// than a 40mm tile can carry legibly.
//
// The die NEVER leaves its cell. `verify-lattice` V1 asserts that by driving
// this function over every cell and every phase and checking the returned
// centre against the lattice geometry — because "the token stays put" is exactly
// the kind of claim that quietly stops being true.

import { orientationToMatrix, type Orientation4 } from '../engine/math/rotor4.js';
import { degreesToFixed } from '../engine/math/trig.js';
import { Board } from './board.js';

/** Screen geometry of the board, in CSS pixels. */
export interface BoardLayout {
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
}

export interface TileTransform {
  /** Cell centre in screen space. Fixed for the life of the tile. */
  readonly centreX: number;
  readonly centreY: number;
  /** Row-major 4x4, Q16.16 — the token's orientation in R^4. */
  readonly rotation: readonly number[];
}

/** The cell centre. Depends only on the index and the layout — never on phase. */
export function cellCentre(index: number, layout: BoardLayout): { x: number; y: number } {
  return {
    x: layout.originX + (Board.columnOf(index) + 0.5) * layout.cellSize,
    y: layout.originY + (Board.rowOf(index) + 0.5) * layout.cellSize,
  };
}

/**
 * The transform for one tile at one moment.
 *
 * `phase` is an integer tick count, so the animation is reproducible: the same
 * replay draws the same frames, which is what lets a recorded round be shown
 * back identically rather than approximately.
 *
 * `wSeed` offsets each tile's phase so a board of 36 dice does not turn in
 * lockstep — that would read as a screensaver rather than as 36 objects.
 */
export function tileTransform(
  index: number,
  phase: number,
  wSeed: number,
  layout: BoardLayout,
): TileTransform {
  const centre = cellCentre(index, layout);
  const offset = (Math.imul(index + 1, 2654435761) ^ wSeed) >>> 0;
  const bias = offset % 360;

  // Six plane angles: xy, xz, xw, yz, yw, zw. Integer degrees throughout —
  // `degreesToFixed` rejects a fractional argument, and it is right to: a
  // fractional angle here would be a float entering the one part of the render
  // path that has to reproduce exactly for a recorded round to play back
  // identically. `(phase / 3) | 0` truncates rather than dividing.
  const orientation: Orientation4 = [
    degreesToFixed(((phase / 3) | 0) % 360),
    0,
    degreesToFixed((phase + bias) % 360),
    0,
    degreesToFixed((phase * 2 + bias) % 360),
    0,
  ] as unknown as Orientation4;

  return {
    centreX: centre.x,
    centreY: centre.y,
    rotation: [...orientationToMatrix(orientation)],
  };
}
