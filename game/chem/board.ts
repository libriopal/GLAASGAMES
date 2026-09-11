// game/chem/board.ts — a board with nothing to build on it is a broken board.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE AUDIT WAS RIGHT ABOUT THIS AND IT IS NOT A TUNING QUESTION.
//
// Measured over 60 boards under the shipped face weights, FOUR contained no
// playable molecule at all. Asked whether 6.6% was tolerable, the independent
// auditor said:
//
//   "No. A 6.6% dead-board rate is unacceptable for a polished product. In a
//    procedural generation system, a board that contains no playable objective
//    is a failure of the generator. The generator must include a validation pass
//    to ensure every board meets a minimum playable threshold before being
//    presented to the player."
//
// That is correct, and the important half is the framing: a dead board is a
// GENERATOR DEFECT, not bad luck to be smoothed over with a reshuffle button.
// The fix belongs before the player sees anything.
//
// So generation here is draw-and-validate: propose a board, ask whether it has
// at least one playable molecule, and draw again if it does not. The seed
// advances deterministically, so a validated board is still a pure function of
// its seed and the replay oracle is undisturbed — which matters, because
// `lattice/round.ts` and `net/heat-server.ts` both depend on a seed reproducing
// a board exactly.

import { ELEMENTS, BY_SYMBOL, faceOf, valenceOf } from './elements.js';
import { MOLECULES } from './library.js';
import { type Atom, type Edge, formula, solve } from './lewis.js';
import { formationEnergy } from './bonds.js';

export const BOARD_W = 6;
export const BOARD_H = 6;
export const CELL_COUNT = BOARD_W * BOARD_H;

/** The largest region a player can select. Bounds the search, and the puzzle. */
export const MAX_REGION = 5;

const NEIGHBOURS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const c = i % BOARD_W;
    const r = (i / BOARD_W) | 0;
    const a: number[] = [];
    if (r > 0) a.push(i - BOARD_W);
    if (r < BOARD_H - 1) a.push(i + BOARD_W);
    if (c > 0) a.push(i - 1);
    if (c < BOARD_W - 1) a.push(i + 1);
    out.push(a);
  }
  return out;
})();

/**
 * Every connected region of 2..MAX_REGION cells, computed once.
 *
 * 1613 of them on a 6x6 board at MAX_REGION 5. Enumerating them per board would
 * be wasteful and enumerating them per QUERY would be absurd, so this is built
 * at module load and shared.
 */
const REGIONS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  const seen = new Set<string>();
  const grow = (cur: number[]): void => {
    if (cur.length >= 2) {
      const k = cur.join(',');
      if (!seen.has(k)) { seen.add(k); out.push([...cur]); }
    }
    if (cur.length === MAX_REGION) return;
    const cand = new Set<number>();
    for (const c of cur) for (const n of NEIGHBOURS[c]!) if (!cur.includes(n) && n > cur[0]!) cand.add(n);
    for (const n of cand) {
      cur.push(n);
      cur.sort((a, b) => a - b);
      grow(cur);
      cur.splice(cur.indexOf(n), 1);
    }
  };
  for (let s = 0; s < CELL_COUNT; s += 1) grow([s]);
  return out;
})();

export const REGION_COUNT = REGIONS.length;

const LIBRARY_FORMULAE = new Set(MOLECULES.map((m) => m.formula));

/** Elements available on each die face, grouped once. */
const BY_FACE: ReadonlyMap<number, readonly string[]> = (() => {
  const m = new Map<number, string[]>();
  for (const e of ELEMENTS) {
    const f = faceOf(e);
    m.set(f, [...(m.get(f) ?? []), e.symbol]);
  }
  return m;
})();

export interface Move {
  readonly cells: readonly number[];
  readonly formula: string;
  /** Energy released by assembling it from free atoms, kJ/mol. */
  readonly energy: number;
}

/**
 * Every molecule buildable on this board right now.
 *
 * A region qualifies only if all three hold: no inert atom is in it, the bond
 * orders solve so every valence is exact, and the resulting formula is a real
 * molecule. The third is the scarcity mechanism and it is a fact rather than a
 * tuned constant — three quarters of the arithmetically valid shapes are not
 * molecules and are refused on that ground alone.
 */
export function playableMoves(symbols: readonly string[]): Move[] {
  const out: Move[] = [];
  for (const region of REGIONS) {
    const atoms: Atom[] = [];
    let inert = false;
    for (const c of region) {
      const el = BY_SYMBOL.get(symbols[c]!);
      if (el === undefined) { inert = true; break; }
      const v = valenceOf(el.group);
      if (v === 0) { inert = true; break; }
      atoms.push({ symbol: el.symbol, valence: v });
    }
    if (inert) continue;

    const index = new Map(region.map((c, i) => [c, i]));
    const edges: Edge[] = [];
    for (const c of region) {
      for (const n of NEIGHBOURS[c]!) {
        const j = index.get(n);
        if (j !== undefined && index.get(c)! < j) edges.push([index.get(c)!, j]);
      }
    }

    const structure = solve(atoms, edges);
    if (structure === null) continue;
    const f = formula(atoms);
    if (!LIBRARY_FORMULAE.has(f)) continue;
    out.push({ cells: region, formula: f, energy: formationEnergy(structure.bonds) });
  }
  return out;
}

/** Is there anything at all to do here? */
export const isPlayable = (symbols: readonly string[]): boolean =>
  playableMoves(symbols).length > 0;

/**
 * Draws a board that is guaranteed to have at least one move.
 *
 * ── THE REDRAW IS BOUNDED, AND EXHAUSTING IT THROWS ─────────────────────────
 *
 * An unbounded "keep trying until it works" is a hang waiting for a weight
 * distribution that makes success impossible — set every face to the inert ones
 * and no board will ever be playable. So the attempts are capped and exhaustion
 * is an error, because a face distribution that cannot produce a playable board
 * is a configuration defect and should say so rather than spin.
 */
export function drawPlayableBoard(
  rng: () => number,
  faceWeights: readonly number[],
  attempts = 64,
): { symbols: string[]; draws: number } {
  const draw = (): string[] => {
    const symbols: string[] = [];
    for (let i = 0; i < CELL_COUNT; i += 1) {
      let total = 0;
      for (let f = 1; f <= 6; f += 1) total += faceWeights[f] ?? 0;
      let pick = Math.abs(rng()) % Math.max(1, total);
      let face = 6;
      for (let f = 1; f <= 6; f += 1) {
        pick -= faceWeights[f] ?? 0;
        if (pick < 0) { face = f; break; }
      }
      const pool = BY_FACE.get(face) ?? BY_FACE.get(5)!;
      symbols.push(pool[Math.abs(rng()) % pool.length]!);
    }
    return symbols;
  };

  for (let n = 1; n <= attempts; n += 1) {
    const symbols = draw();
    if (isPlayable(symbols)) return { symbols, draws: n };
  }
  throw new RangeError(
    `drawPlayableBoard: ${attempts} draws produced no playable board. That is a face-weight ` +
      'defect, not bad luck — some distributions cannot produce one at all, and spinning on ' +
      'them would hang rather than report.',
  );
}
