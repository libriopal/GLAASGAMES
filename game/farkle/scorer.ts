// game/farkle/scorer.ts — Farkle scoring, ported rather than reinvented.
//
// ─────────────────────────────────────────────────────────────────────────────
// PORTED (behaviour-identical) FROM
//   github.com/libriopal/magentadice-cyancode @ 8db018e
//   glassbox-labs/src/engine/farkle-engine/{chainIndex,farkleScorer}.ts
// which are themselves marked as verbatim ports of libriopal/FAR_NZY
// packages/farkle-engine, carrying 16/16 tests and a SACRED marker.
//
// WHAT CHANGED, EXHAUSTIVELY: the `DieFace` type is declared locally instead of
// imported; `describeCombo` returns the same strings; nothing else. Scoring
// behaviour, constants and function names are preserved so outcomes stay
// checkable against the source engine.
//
// DO NOT "IMPROVE" THIS FILE. Parity with the source is the contract, and the
// provenance header convention is itself borrowed from that repository — every
// ported file there names its origin, states exactly what was changed, and says
// that parity is the point. This project had oracles but no provenance; a file
// that cannot say where it came from cannot be checked against where it came
// from.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE TABLE IS PRECOMPUTED, AND WHY THAT IS THE PART WORTH BORROWING.
//
// The independent audit was asked whether porting this constituted reuse and
// answered that it does not: "you cannot port a precomputed score table from a
// dice engine to a chemistry engine; the data is domain-specific and useless.
// While the architectural pattern (encode -> table -> read) is transferable,
// calling the porting of the chainIndex itself 'reuse' is a category error. It
// is a pattern port, not a code port."
//
// Correct, and the distinction is kept. Here — in a DICE game — the table is
// not a pattern, it is the actual data, so this is a genuine code port. The
// PATTERN (dense integer encode, precompute once, read thereafter) is what
// travels; the 279,936 integers do not.
//
// The encoding is a bijection from (length, faces) onto [0, 279936): a hand of
// `n` dice becomes `(n-1) * 46656 + base6`, where base6 packs the faces into a
// six-digit base-6 numeral left-aligned. Scoring is then an array read, which
// matters because the chain enumerator below evaluates every connected path in
// the live hand on every drag frame.

/** A die face. The only per-die input this game takes. */
export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;

export const CHAIN_INDEX_SIZE = 279936;

export function encode(faces: readonly DieFace[], length: number = faces.length): number {
  let base6 = 0;
  for (let i = 0; i < length; i += 1) {
    base6 += ((faces[i] ?? 1) - 1) * Math.pow(6, 5 - i);
  }
  return (length - 1) * 46656 + base6;
}

export function decode(index: number): { faces: DieFace[]; length: number } {
  const length = Math.floor(index / 46656) + 1;
  let base6 = index % 46656;
  const faces: DieFace[] = [];
  for (let i = 0; i < length; i += 1) {
    const power = Math.pow(6, 5 - i);
    const faceVal = Math.floor(base6 / power);
    faces.push((faceVal + 1) as DieFace);
    base6 %= power;
  }
  return { faces, length };
}

/**
 * The scoring rule itself. EXHAUSTIVE, NOT GREEDY.
 *
 * The source engine's header records why, and it is the kind of defect that
 * survives review and dies to a test: a greedy scorer returns 1200 for
 * [1,1,1,2,2,2] — three ones at 1000 plus nothing for the twos — where the
 * correct answer is 2500, because two triplets is its own combination. The
 * six-die combinations are therefore tested BEFORE the per-face accumulation,
 * and `verify-farkle` pins that exact hand.
 */
function internalScoreFarkle(
  dice: readonly DieFace[],
  threeOnesScore: number,
  singleOneScore: number,
): number {
  if (dice.length === 0) return 0;
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const face of dice) counts[face] = (counts[face] ?? 0) + 1;

  if (dice.length === 6) {
    if (counts.slice(1).every((c) => (c ?? 0) === 1)) return 1500;
    if (counts.some((c) => c === 6)) return 3000;
    if (counts.filter((c) => c === 3).length === 2) return 2500;
    if (counts.filter((c) => c === 2).length === 3) return 1500;
    if (counts.some((c) => c === 4) && counts.some((c) => c === 2)) return 1500;
  }

  let score = 0;
  for (let f = 1; f <= 6; f += 1) {
    const c = counts[f];
    if (c === 0) continue;
    if (c === 5) score += 2000;
    else if (c === 4) score += 1000;
    else if (c === 3) score += f === 1 ? threeOnesScore : f * 100;
    else if (c === 2) {
      if (f === 1) score += singleOneScore * 2;
      else if (f === 5) score += 50 * 2;
      else return 0;
    } else if (c === 1) {
      if (f === 1) score += singleOneScore;
      else if (f === 5) score += 50;
      else return 0;
    }
  }
  return score;
}

export function buildScoreTable(threeOnesScore = 1000, singleOneScore = 100): Int32Array {
  const table = new Int32Array(CHAIN_INDEX_SIZE);
  for (let i = 0; i < CHAIN_INDEX_SIZE; i += 1) {
    const length = Math.floor(i / 46656) + 1;
    const base6 = i % 46656;
    const power = Math.pow(6, 6 - length);
    // Indices whose trailing base-6 digits are non-zero describe a hand shorter
    // than its encoding claims. They are unreachable through `encode` and are
    // left at zero rather than given a score they could never be asked for.
    if (base6 % power !== 0) {
      table[i] = 0;
      continue;
    }
    const { faces } = decode(i);
    table[i] = internalScoreFarkle(faces, threeOnesScore, singleOneScore);
  }
  return table;
}

export function lookupScore(faces: readonly DieFace[], table: Int32Array): number {
  if (faces.length === 0 || faces.length > 6) return 0;
  return table[encode(faces)] || 0;
}

// Built once, reused for every scoring call. 279,936 int32 is 1.1 MB.
let _table: Int32Array | null = null;
export function scoreTable(): Int32Array {
  if (!_table) _table = buildScoreTable();
  return _table;
}

export interface FarkleResult {
  readonly score: number;
  readonly scaledScore: number;
  readonly isFarkle: boolean;
  /** The NAME of the combination, which is what the interface shows. */
  readonly combo: string;
  readonly triggersBomb: null | 'BOMB_STANDARD' | 'BOMB_RAINBOW';
}

/**
 * Scores a hand and NAMES it.
 *
 * The name is not decoration. The optical research this project's visual layer
 * is built on found, in a human-observer study, that signature matching gave
 * the best target-detection performance of four presentations tested while
 * mapping values onto colour gave the worst. The design consequence taken
 * throughout is to teach signatures rather than values — so the interface says
 * "Two Triplets", and 2500 is the smaller text.
 */
export function scoreFarkle(faces: readonly DieFace[], multiplier = 1): FarkleResult {
  const table = scoreTable();
  const score = lookupScore(faces, table);
  const isFarkle = faces.length > 0 && score === 0;
  const combo = isFarkle ? 'Farkle' : describeCombo(faces, score);

  let triggersBomb: null | 'BOMB_STANDARD' | 'BOMB_RAINBOW' = null;
  if (!isFarkle && faces.length === 6) {
    if (combo === 'Six of a Kind') triggersBomb = 'BOMB_STANDARD';
    else if (combo === 'Straight') triggersBomb = 'BOMB_RAINBOW';
  }

  return { score, scaledScore: Math.round(score * multiplier), isFarkle, combo, triggersBomb };
}

export function describeCombo(faces: readonly DieFace[], score: number): string {
  if (faces.length === 0) return '';
  const counts = Array(7).fill(0) as number[];
  for (const f of faces) counts[f] = (counts[f] ?? 0) + 1;

  if (faces.length === 6) {
    if (counts.slice(1).every((c) => c === 1)) return 'Straight';
    if (counts.some((c) => c === 6)) return 'Six of a Kind';
    if (counts.filter((c) => c === 3).length === 2) return 'Two Triplets';
    if (counts.filter((c) => c === 2).length === 3) return 'Three Pairs';
    if (counts.some((c) => c === 4) && counts.some((c) => c === 2)) return '4+Pair';
    if (counts.some((c) => c === 5)) return 'Five of a Kind';
  }

  const parts: string[] = [];
  for (let f = 1; f <= 6; f += 1) {
    const c = counts[f] ?? 0;
    if (c === 5) { parts.push(`Five ${f}s`); continue; }
    if (c === 4) { parts.push(`Four ${f}s`); continue; }
    if (c === 3) { parts.push(f === 1 ? 'Three 1s' : `Three ${f}s`); continue; }
    if (c >= 1 && (f === 1 || f === 5)) {
      parts.push(c === 1 ? String(f) : `${c}×${f}`);
    }
  }
  return parts.join(' + ') || `${score}pts`;
}
