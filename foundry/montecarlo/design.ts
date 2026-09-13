// foundry/montecarlo/design.ts — the experimental design, as code.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A FRACTIONAL FACTORIAL AND NOT ANOTHER PROBE.
//
// Four candidate fixes for the failing AGENCY FLOOR gate were each tested ALONE
// and each was insufficient: order preview (-26.2% at 0, +15.8% at 5), the
// transposition verb (COSTS the readable rule 18%), positional delivery (2.4%,
// throughput halved), and a longer horizon (identical at 12, 24 and 40 turns).
//
// Testing one factor at a time is the thing that has failed four times, and it
// fails for a structural reason rather than by bad luck: these factors interact
// by construction. A swap verb is unaffordable at a 12-turn horizon and may be
// decisive at 30. Preview is worthless with nothing to plan toward. A one-at-a-
// time sweep cannot see either.
//
// ─────────────────────────────────────────────────────────────────────────────
// RESOLUTION AND THE FOLD-OVER, WHICH THE AUDIT CALLED THE PIVOT.
//
// The plan's round-one audit named the one failure mode that would invalidate
// everything downstream rather than merely weaken it:
//
//   "a significant interaction could be misidentified as a strong main effect...
//    you will be optimizing for a ghost."
//
// A resolution-IV fraction keeps main effects clean of two-factor interactions
// but aliases those interactions WITH EACH OTHER — and interactions are the
// entire reason for running this.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FOLD-OVER I PROMISED THE AUDITOR DOES NOT WORK, AND THE DESIGN'S OWN
// SELF-CHECK IS WHAT CAUGHT IT.
//
// The approved plan said stage 1 would be a resolution-IV fraction plus its
// fold-over, "combined, resolution V". `designResolution` recomputed the alias
// structure from the actual sign matrix and returned 4 for both blocks.
//
// The plan was wrong and the reason is elementary. A fold-over reverses every
// sign, so a defining word of EVEN length is unchanged by it: (-1)^4 = 1. Folding
// over promotes resolution III to IV precisely because III's words are odd. It
// does nothing whatever to a resolution-IV design's length-four words, which are
// exactly the ones aliasing two-factor interactions with each other.
//
// So the fold-over is replaced by the thing that actually separates them: a
// 2^(8-2) RESOLUTION-V design, 64 runs. Its defining words are ABCDG and ABEFH,
// both length five, whose product CDEFGH is length six — shortest word five,
// which is resolution V, which means no two-factor interaction is aliased with
// another two-factor interaction or with any main effect.
//
// 64 cells rather than 32. That is the honest price of the property the audit
// called the pivot on which stage 2's validity rests, and it is affordable
// inside the declared budget. The alternative — shipping the fold-over and
// citing the plan — would have been optimising for a ghost with an approval
// stapled to it.

import { type SynthConfig, DEFAULT_SYNTH } from '../../game/chem/synth.js';

/** A factor is a named dial with a low and a high level for screening. */
export interface Factor {
  readonly key: string;
  readonly low: Partial<SynthConfig>;
  readonly high: Partial<SynthConfig>;
  /** How many distinct rules this factor's HIGH level makes active. Parsimony. */
  readonly ruleCostHigh: number;
  readonly note: string;
}

/**
 * The SIX factors screened, cut from eight by the budget rule I pre-registered.
 *
 * ── THIS IS THE DEGRADATION PATH BEING FOLLOWED, NOT A CONVENIENCE ──────────
 *
 * Timing three cells of the eight-factor design measured 4.3 minutes per cell,
 * so 64 cells was 4.6 hours against a declared 4-hour cap across ALL stages.
 * The pre-registered order of sacrifice is: replicates first, then factor
 * levels, then factors, NEVER seeds per cell -- because seeds are power, and an
 * underpowered sweep already produced one inverted result in this project (the
 * Farkle staking gate at 120 heats, which vanished at 480).
 *
 * There is one replicate and two levels per factor, so nothing above factors was
 * left to give. Six factors also buys a BETTER design rather than a merely
 * smaller one: 2^(6-1) is 32 runs at RESOLUTION VI, where eight factors needed
 * 64 runs to reach V.
 *
 * The two cut, and why these two rather than the cheapest ones:
 *
 *   BENCH    fixed at 0. SWAP=FREE already carries a construction verb into the
 *            screen, and the parsimony rule would penalise a configuration
 *            holding two of them, so testing both here spends cells on a
 *            comparison the selection rule then discards.
 *   DELIVER  fixed at ANYWHERE. Measured to roughly halve throughput (2.08
 *            against 3.23), which would push its cells outside the
 *            pre-registered throughput band of 2 to 8 on that ground alone,
 *            whatever it did to the agency floor.
 *
 * Both are RE-TESTED in stage 2 against the winning configuration as a focused
 * two-factor comparison, so neither is dropped -- only deferred to where it
 * costs four cells instead of thirty-two.
 *
 * FIELD (local temperature, pressure) and CONTRACT (deadlines, tiers) from the
 * 115-idea set remain deferred for a different reason: the mechanics do not
 * exist yet, and screening a dial that was never turned would report a result
 * for a factor with no implementation behind it.
 */
export const FACTORS: readonly Factor[] = [
  {
    key: 'TOPOLOGY',
    low: { topology: 'SQUARE36' },
    high: { topology: 'HEX37' },
    ruleCostHigh: 0,
    note: 'six neighbours instead of four; routing becomes two-axis',
  },
  {
    key: 'PREVIEW',
    low: { preview: 0 },
    high: { preview: 5 },
    ruleCostHigh: 1,
    note: 'orders visible ahead of the book; measured -26.2% at 0, +15.8% at 5',
  },
  {
    key: 'SWAP',
    low: { swap: 'NONE' },
    high: { swap: 'FREE', swapBudget: 3 },
    ruleCostHigh: 1,
    note: 'FREE rather than TURN: TURN\'s failure was a price failure, not a verb failure',
  },
  {
    key: 'POOL',
    low: { poolMode: 'RARE5' },
    high: { poolMode: 'MULTISTEP' },
    ruleCostHigh: 0,
    note: 'orders that cannot be filled in one move, so a plan has to route',
  },
  {
    key: 'OPTIONS',
    low: { options: 1 },
    high: { options: 3 },
    ruleCostHigh: 1,
    note: 'the product choice itself. OPTIONS=1 winning would falsify the design',
  },
  {
    key: 'TURNS',
    low: { turns: 12 },
    high: { turns: 30 },
    ruleCostHigh: 0,
    note: 'horizon. Alone it changed nothing; it is here for its INTERACTION with SWAP',
  },
];

/**
 * A 2^(6-1) resolution-VI fraction: 32 runs, six factors.
 *
 * Generated from the defining relations rather than transcribed from a table,
 * and then CHECKED — `designResolution` recomputes the alias structure from the
 * sign matrix that will actually be run. That check is not ceremony: it is what
 * caught the approved plan's fold-over being worthless, and a typed-in table
 * would have failed silently as a design that merely looks like a screen.
 */
const BASIC = 5;

const GENERATORS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4], // F = ABCDE -> defining word ABCDEF, length 6 -> resolution VI
];

export type SignRow = readonly number[];

export function fraction(): SignRow[] {
  const rows: SignRow[] = [];
  for (let i = 0; i < (1 << BASIC); i += 1) {
    const basic = Array.from({ length: BASIC }, (_, b) => (((i >> b) & 1) === 1 ? 1 : -1));
    const derived = GENERATORS.map((g) => g.reduce((acc, b) => acc * basic[b]!, 1));
    rows.push([...basic, ...derived]);
  }
  return rows;
}

/**
 * The fold-over, kept so the plan's claim stays re-testable rather than merely
 * asserted to have been wrong.
 *
 * Applied to a resolution-IV design it returns 4, which is the defect. Applied
 * to the resolution-V design now in use it returns 6 at double the cells, which
 * buys nothing that resolution V does not already give: two-factor interactions
 * are separated at 5. `design-check` prints both so the claim is checkable
 * rather than a story in a comment.
 */
export function foldOver(rows: readonly SignRow[]): SignRow[] {
  return rows.map((r) => r.map((v) => -v));
}

export function screeningDesign(): SignRow[] {
  return fraction();
}

/**
 * The measured resolution of a sign matrix, recomputed rather than asserted.
 *
 * Returns the length of the shortest word in the defining relation: 3 means a
 * main effect is aliased with a two-factor interaction (bad), 4 means main
 * effects are clean but two-factor interactions alias each other, 5 or more
 * means two-factor interactions separate.
 *
 * This exists because a transcription error in the generators would produce a
 * design that LOOKS like a screen and silently confounds the one comparison
 * everything downstream depends on.
 */
export function designResolution(rows: readonly SignRow[]): number {
  const k = rows[0]!.length;
  let shortest = Infinity;
  const column = (mask: number): number[] =>
    rows.map((r) => {
      let v = 1;
      for (let f = 0; f < k; f += 1) if ((mask >> f) & 1) v *= r[f]!;
      return v;
    });
  const ones = column(0);
  for (let mask = 1; mask < (1 << k); mask += 1) {
    const bits = mask.toString(2).split('').filter((c) => c === '1').length;
    if (bits >= shortest) continue;
    const col = column(mask);
    if (col.every((v, i) => v === ones[i])) shortest = bits;
  }
  return shortest === Infinity ? k + 1 : shortest;
}

export function configFor(row: SignRow, base: SynthConfig = DEFAULT_SYNTH): SynthConfig {
  let cfg: SynthConfig = { ...base };
  FACTORS.forEach((f, i) => {
    cfg = { ...cfg, ...(row[i] === 1 ? f.high : f.low) };
  });
  return cfg;
}

/** Distinct rules a configuration makes active. The parsimony response. */
export function ruleCount(row: SignRow): number {
  return FACTORS.reduce((n, f, i) => n + (row[i] === 1 ? f.ruleCostHigh : 0), 0);
}

/** One unambiguous character per factor — the keys share initials. */
const GLYPH: readonly string[] = ['X', 'P', 'S', 'M', 'O', 'N'];

export function labelFor(row: SignRow): string {
  return FACTORS.map((_, i) => (row[i] === 1 ? GLYPH[i]! : '.')).join('');
}

export const GLYPH_LEGEND = FACTORS.map((f, i) => `${GLYPH[i]}=${f.key}`).join(' ');

/**
 * Main effect of each factor: the mean response at HIGH minus the mean at LOW.
 *
 * Valid because the design is orthogonal — every factor is at high in exactly
 * half the runs, balanced against every other factor — which is what a
 * fractional factorial buys over changing one dial at a time.
 */
export function mainEffects(rows: readonly SignRow[], response: readonly number[]): number[] {
  return FACTORS.map((_, i) => {
    let hi = 0;
    let nHi = 0;
    let lo = 0;
    let nLo = 0;
    rows.forEach((r, j) => {
      if (r[i] === 1) { hi += response[j]!; nHi += 1; } else { lo += response[j]!; nLo += 1; }
    });
    return (nHi > 0 ? hi / nHi : 0) - (nLo > 0 ? lo / nLo : 0);
  });
}

/** Two-factor interaction effects, which the fold-over is what makes readable. */
export function interactionEffects(
  rows: readonly SignRow[],
  response: readonly number[],
): { a: string; b: string; effect: number }[] {
  const out: { a: string; b: string; effect: number }[] = [];
  for (let i = 0; i < FACTORS.length; i += 1) {
    for (let j = i + 1; j < FACTORS.length; j += 1) {
      let plus = 0;
      let nPlus = 0;
      let minus = 0;
      let nMinus = 0;
      rows.forEach((r, k) => {
        const s = r[i]! * r[j]!;
        if (s === 1) { plus += response[k]!; nPlus += 1; } else { minus += response[k]!; nMinus += 1; }
      });
      out.push({
        a: FACTORS[i]!.key,
        b: FACTORS[j]!.key,
        effect: (nPlus > 0 ? plus / nPlus : 0) - (nMinus > 0 ? minus / nMinus : 0),
      });
    }
  }
  return out;
}
