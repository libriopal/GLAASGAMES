// foundry/montecarlo/siblings.ts — the suite searches for a stronger trivial
// policy so the author does not have to think of one.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS: THE SAME MISTAKE, THREE TIMES.
//
// The Monte Carlo ladder has been published wrong three times, and the mechanism
// was identical on every occasion — a trivial policy nobody thought to try,
// found only when an adversarial arm went looking:
//
//   round 1  missed CHARGE-CHASING.  Published "the game is exploitable."
//   round 2  missed NEIGHBOUR-MEAN.  Published "the lattice is worth 20.2."
//   round 3  missed NEIGHBOUR-SUM.   That headline was vetoed too.
//
// Round 3's rung is the embarrassing one: `neighbourSum` is `neighbourMean` with
// a division removed. Dividing by the count of live neighbours discards the most
// important trivial fact on the board — HOW MANY DIRECTIONS CAN PAY AT ALL, which
// is the probability of getting the multiplier rather than the consolation
// payout of the cell's own face. Measured, shipped config, 400 paired seeds:
// 79.87 against 70.90, a gap of +8.97 ±2.37.
//
// The independent auditor's own conclusion was that a better rung is not the
// fix: "no ladder rung may be published without a search for a stronger sibling
// THAT THE SUITE ITSELF RUNS." This file is that search.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IT DOES NOT DO, STATED FIRST BECAUSE THE AUDIT INSISTED.
//
// Asked whether this closes the failure mode, the auditor said no:
//
//   "It is a relabelling of the failure mode. While it improves the
//    DETECTABILITY of algebraic omissions (the specific error that has occurred
//    three times), it does not close the class of errors. It cannot catch errors
//    in functional form (e.g. non-linearities like sqrt or log), temporal
//    dependencies (memory/history), or complex conditional logic. You have moved
//    from 'missing a rung' to 'MISSING A LADDER TYPE'."
//
// That is accurate and is not papered over. This grammar is linear in a handful
// of board scalars. A trivial policy built on a non-linearity, on a conditional,
// or on any use of history is OUTSIDE the space and would not be found. The
// claim this file supports is therefore narrow and exact: **no policy in the
// declared grammar beats the declared best trivial rung.** Anything wider would
// be the vocabulary proxy `EINCOL.md` names.
//
// ─────────────────────────────────────────────────────────────────────────────
// TRIVIAL INFLATION, AND WHY THE POLICIES CANNOT SEE MEMORY.
//
// The auditor's second finding: the assertion is a "Claim Integrity Check, not a
// Benchmark Quality Check... trivially satisfied by an author who includes an
// absurdly strong but still technically one-sentence policy in the generative
// space and declares that as the bestTrivial."
//
// Two structural guards, neither of which relies on anybody's restraint:
//
//   1. `TrivialPolicy` takes `(observable, cell)` and NOTHING ELSE. There is no
//      memory parameter to smuggle state through, so every member of this space
//      is memoryless BY TYPE. A policy that needs history cannot be written here
//      at all — the compiler refuses it.
//   2. The grammar is a CROSS PRODUCT of declared term lists, enumerated
//      mechanically. Policies are not hand-added; adding one means adding a term
//      to a list that `verify-montecarlo` M10 counts and pins.

import { BOARD_H, BOARD_W, CELL_COUNT, EMPTY } from '../../lattice/board.js';

/**
 * A trivial policy scores a cell from the OBSERVABLE BOARD ALONE.
 *
 * The absent `memory` parameter is the guard, not an oversight. See the header.
 */
export type TrivialScore = (o: Int32Array, c: number) => number;

const faceAt = (o: Int32Array, i: number): number => o[i * 3] ?? EMPTY;
const chargeAt = (o: Int32Array, i: number): number => o[i * 3 + 2] ?? 0;

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

function step(i: number, d: number): number {
  const c = (i % BOARD_W) + DX[d]!;
  const r = ((i / BOARD_W) | 0) + DY[d]!;
  if (c < 0 || c >= BOARD_W || r < 0 || r >= BOARD_H) return -1;
  return r * BOARD_W + c;
}

/** The live orthogonal neighbours of a cell, as faces. */
function neighbours(o: Int32Array, c: number): number[] {
  const out: number[] = [];
  for (let d = 0; d < 4; d += 1) {
    const t = step(c, d);
    if (t >= 0 && faceAt(o, t) !== EMPTY) out.push(faceAt(o, t));
  }
  return out;
}

/**
 * The BASE TERMS. Each is one scalar a player can read off the board without
 * remembering anything.
 *
 * `liveCount` and `expectedPayout` are here because of the round-3 failure:
 * the number of directions that can actually pay is the fact `neighbourMean`
 * divides away, and it is what made `neighbourSum` win.
 */
export const BASE_TERMS: readonly { readonly name: string; readonly f: TrivialScore }[] = [
  { name: 'ownFace', f: (o, c) => faceAt(o, c) },
  { name: 'nbrSum', f: (o, c) => neighbours(o, c).reduce((a, b) => a + b, 0) },
  { name: 'nbrMean', f: (o, c) => { const n = neighbours(o, c); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 3.5; } },
  { name: 'nbrMax', f: (o, c) => { const n = neighbours(o, c); return n.length ? Math.max(...n) : 3.5; } },
  { name: 'liveCount', f: (o, c) => neighbours(o, c).length },
  // The real payout rule, averaged over the four directions under a uniform
  // prior on which one is the link. A dead direction pays the cell's own face.
  {
    name: 'expPayout',
    f: (o, c) => {
      let acc = 0;
      for (let d = 0; d < 4; d += 1) {
        const t = step(c, d);
        acc += t >= 0 && faceAt(o, t) !== EMPTY
          ? faceAt(o, t) * (1 + chargeAt(o, c))
          : faceAt(o, c);
      }
      return acc / 4;
    },
  },
  { name: 'const', f: () => 1 },
];

/** The MULTIPLIER TERMS. Charge is the payout multiplier, so it belongs here. */
export const MULTIPLIER_TERMS: readonly { readonly name: string; readonly f: TrivialScore }[] = [
  { name: 'x1', f: () => 1 },
  { name: 'x(1+charge)', f: (o, c) => 1 + chargeAt(o, c) },
  { name: 'xcharge', f: (o, c) => chargeAt(o, c) },
];

export interface Sibling {
  readonly id: string;
  readonly score: TrivialScore;
}

/**
 * The generated space: every base term times every multiplier term.
 *
 * Enumerated mechanically from the two lists above. `verify-montecarlo` M10 pins
 * the resulting count, so widening the grammar is a number somebody has to
 * defend rather than a quiet addition.
 */
export function siblings(): readonly Sibling[] {
  const out: Sibling[] = [];
  for (const b of BASE_TERMS) {
    for (const m of MULTIPLIER_TERMS) {
      out.push({ id: `${b.name}${m.name === 'x1' ? '' : ' ' + m.name}`, score: (o, c) => b.f(o, c) * m.f(o, c) });
    }
  }
  return out;
}

/** Turns a cell-scorer into the argmax policy the harness plays. */
export function asPolicy(s: TrivialScore): (o: Int32Array) => number {
  return (o: Int32Array): number => {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < CELL_COUNT; i += 1) {
      if (faceAt(o, i) === EMPTY) continue;
      const v = s(o, i);
      if (best < 0 || v > bestScore) { bestScore = v; best = i; }
    }
    return best < 0 ? 0 : best;
  };
}
