// foundry/montecarlo/assert-instrument.ts — Stage 0. The instrument, before any
// design question.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS THROWS. IT DOES NOT MARK A CELL VOID, AND THAT WAS THE AUDIT'S CALL.
//
// The plan originally said a failed cell would be "marked VOID and reported".
// The audit rejected that and named why:
//
//   "Under time pressure, the human instinct is to treat 'weird' data as an
//    outlier to be ignored rather than a symptom of a broken instrument... Do
//    not rely on a human to 'mark a cell VOID'; make the instrument incapable
//    of lying."
//
// Upheld, and this project's own history is the evidence rather than a guess.
// Three broken evaluators so far, each caught only because a number looked
// wrong to me at the moment I happened to read it:
//
//   · a rollout scoring every ply against the ORIGINAL book, counting one order
//     once per ply — solver margin -2.2%;
//   · the same rollout saturating at book size, so candidates tied and the
//     energy tie-break dragged it to greedy — solver margin -40.1%;
//   · a two-ply agent whose follow-up list was `slice(0, 120)` of moves in
//     region order, i.e. the board's top-left corner — two-ply worth 0.0%.
//
// And a fourth that a VOID rule would have swallowed whole: the positional
// delivery test reported a ceiling BELOW its own best player, because the beam
// enumerated reactions and could not use the transposition verb the rule
// existed to make valuable. I caught it by reading. A 64-cell sweep is not
// something I read cell by cell.
//
// So a broken instrument halts the run. A halted run is a result about the
// instrument and gets reported as one.

import {
  type Agent,
  type Move,
  ORDER_1,
  ORDER_2,
  GREEDY,
  bookDelta,
  dockSet,
  legalMoves,
  planAgent,
  randomAgent,
  runAgent,
  runCeiling,
  transposeMoves,
} from './synth-harness.js';
import {
  type SynthConfig,
  DEFAULT_SYNTH,
  PASS,
  beginSynth,
  cellsOf,
  judgeSynth,
  optionsFor,
  orderAt,
  playSynth,
} from '../../game/chem/synth.js';
import { MAX_SELECT } from '../../game/chem/board-react.js';
import { regions as topoRegions } from '../../game/chem/topology.js';

export class InstrumentError extends Error {
  constructor(check: string, detail: string) {
    super(`INSTRUMENT FAILED [${check}]: ${detail}`);
    this.name = 'InstrumentError';
  }
}

export interface ControlResult {
  readonly name: string;
  readonly expected: 'MUST FAIL' | 'MUST HOLD';
  readonly passed: boolean;
  readonly detail: string;
}

/**
 * The negative controls, run once and WATCHED FAILING.
 *
 * A check only ever seen to pass is decoration. Each of these asserts that a
 * deliberately broken setup produces the broken answer, so a later green result
 * means the check can distinguish.
 */
export function negativeControls(): ControlResult[] {
  const out: ControlResult[] = [];

  // C1 — a board of one molecule type must offer nothing. If the move
  // enumerator finds reactions in a uniform board it is inventing chemistry.
  {
    const cfg: SynthConfig = { ...DEFAULT_SYNTH };
    const flat = Array.from({ length: cellsOf(cfg) }, () => 'N2');
    const moves = legalMoves(flat, cfg);
    out.push({
      name: 'C1 uniform N2 board is inert',
      expected: 'MUST FAIL',
      passed: moves.length === 0,
      detail: `${moves.length} legal moves on a board of pure nitrogen`,
    });
  }

  // C2 — an agent handed a scrambled option index must score strictly below the
  // same agent handed the true one. If it does not, the option index is not
  // load-bearing and the product-choice mechanic is decoration.
  {
    const cfg: SynthConfig = { ...DEFAULT_SYNTH, options: 3 };
    const honest = runAgent(ORDER_1, 40, cfg).score;
    const scrambled: Agent = {
      name: 'SCRAMBLED',
      choose: (tiles, book, queue, bank, turn, config) => {
        const a = ORDER_1.choose(tiles, book, queue, bank, turn, config);
        if (a.cells.length < 2) return a;
        // Same selection, a different option. The ONLY difference is which
        // product set is taken.
        return { ...a, option: (a.option + 1) % 3 };
      },
    };
    const lied = runAgent(scrambled, 40, cfg).score;
    out.push({
      name: 'C2 scrambling the option index costs score',
      expected: 'MUST FAIL',
      passed: lied < honest,
      detail: `honest ${honest.toFixed(2)} vs scrambled ${lied.toFixed(2)}`,
    });
  }

  // C3 — a ceiling restricted to the bounded agent's verbs must not beat it by
  // much. This is the control that would have caught the invalid dock ceiling.
  {
    const cfg: SynthConfig = { ...DEFAULT_SYNTH, options: 1, preview: 0 };
    const bounded = runAgent(ORDER_1, 30, cfg).score;
    const ceiling = runCeiling(30, cfg);
    out.push({
      name: 'C3 ceiling exceeds a same-verb bounded agent',
      expected: 'MUST HOLD',
      passed: ceiling >= bounded - 1e-9,
      detail: `ceiling ${ceiling.toFixed(2)} vs ORDER-1 ${bounded.toFixed(2)}`,
    });
  }

  // C4 — a malformed action must be REJECTED rather than rounded off. An
  // out-of-range option index that scores is a client that can lie.
  {
    const cfg: SynthConfig = { ...DEFAULT_SYNTH };
    const st = beginSynth(12345, cfg);
    const region = topoRegions(cfg.topology ?? 'SQUARE36', MAX_SELECT).find(
      (r) => optionsFor(st.tiles, r, 3).length > 0,
    );
    const bad = judgeSynth(st.tiles, { cells: region ?? [0, 1], option: 99 }, 1e6, cfg);
    out.push({
      name: 'C4 out-of-range option index is rejected, not clamped',
      expected: 'MUST FAIL',
      passed: bad.reaction === null && bad.rejected === 'NO_SUCH_OPTION',
      detail: `rejected=${String(bad.rejected)}`,
    });
  }

  // C5 — the order stream must be PURE IN ITS INDEX. The audit's standing
  // suspicion after round two: is it decoupled from board state, or is there a
  // hidden feedback loop? If the k-th order differed between agents, no two
  // agents could be compared on the same run at all.
  {
    const pool = ['F2', 'Cl2', 'CH3Cl'];
    const a = Array.from({ length: 20 }, (_, i) => orderAt(777, i, pool));
    const b = Array.from({ length: 20 }, (_, i) => orderAt(777, i, pool));
    const c = Array.from({ length: 20 }, (_, i) => orderAt(778, i, pool));
    out.push({
      name: 'C5 order stream is pure in (seed, index)',
      expected: 'MUST HOLD',
      passed: a.join() === b.join() && a.join() !== c.join(),
      detail: `same seed identical=${a.join() === b.join()}, different seed differs=${a.join() !== c.join()}`,
    });
  }

  // C6 — replay determinism. The same seed and the same action list must
  // reproduce the same score and the same digest, or nothing downstream can be
  // verified by the server.
  {
    // A seed that actually SHIPS. The first version used seed 999, which scored
    // zero, so the check compared 0 to 0 and held trivially — a control that
    // cannot distinguish is the vacuous measurement this whole stage exists to
    // catch, and it very nearly shipped inside the catcher.
    const cfg: SynthConfig = { ...DEFAULT_SYNTH };
    let liveSeed = 0;
    for (let s2 = 1; s2 <= 200 && liveSeed === 0; s2 += 1) {
      const probe = playSynth(s2 * 7919, cfg, (t, b, q, bank, turn) =>
        ORDER_1.choose(t, b, q, bank, turn, cfg),
      );
      if (probe.score > 0) liveSeed = s2 * 7919;
    }
    const actions: { cells: readonly number[]; option: number }[] = [];
    const first = playSynth(liveSeed, cfg, (tiles, book, queue, bank, turn) => {
      const a = ORDER_1.choose(tiles, book, queue, bank, turn, cfg);
      actions.push(a);
      return a;
    });
    let i = 0;
    const second = playSynth(liveSeed, cfg, () => actions[i++] ?? PASS);
    out.push({
      name: 'C6 replay reproduces a NON-ZERO score and digest',
      expected: 'MUST HOLD',
      passed:
        first.score > 0 && first.score === second.score && first.digest === second.digest,
      detail: `seed ${liveSeed}, score ${first.score}/${second.score}, digest ${first.digest}/${second.digest}`,
    });
  }

  return out;
}

export interface CellCheck {
  readonly ceiling: number;
  readonly bestBounded: number;
  readonly responses: readonly (readonly number[])[];
}

/**
 * Runs at EVERY cell of every stage and throws on a lying instrument.
 *
 * `tolerance` is sampling error, not slack: a ceiling may fall a hair below a
 * bounded agent by chance on a finite sample. It may not fall below it
 * systematically, because an unbounded search can always play the bounded
 * agent's move.
 */
export function assertInstrument(label: string, check: CellCheck, tolerance = 0.05): void {
  if (check.ceiling < check.bestBounded - tolerance) {
    throw new InstrumentError(
      label,
      `ceiling ${check.ceiling.toFixed(3)} is below best bounded agent ` +
        `${check.bestBounded.toFixed(3)}. An unbounded search can always play a bounded ` +
        'agent\'s move, so this is arithmetic reporting a broken evaluator, never a ' +
        'finding about the game. Most likely cause: the ceiling and the agents do not ' +
        'share a verb set.',
    );
  }
  for (const series of check.responses) {
    if (series.length > 1 && series.every((v) => v === series[0])) {
      throw new InstrumentError(
        label,
        `a response is constant across the levels under test (${series.join(', ')}). ` +
          'That is the signature of a vacuous measurement — a statistic that cannot vary ' +
          'with the thing it tests — which this project has already hit twice.',
      );
    }
  }
}

/**
 * Verifies that the ceiling and the bounded agents were built from the SAME
 * verb set, which is the specific defect that produced an invalid dock ceiling.
 *
 * Structural rather than statistical: it asks both sides to enumerate and
 * compares what they can see, instead of waiting for a bad number.
 */
export function assertSameVerbs(config: SynthConfig): void {
  const st = beginSynth(4242, config);
  const reactions = legalMoves(st.tiles, config).length;
  const swaps = transposeMoves(st.tiles, 1e6, config, 99).length;
  const swapRule = config.swap ?? 'NONE';
  if (swapRule !== 'NONE' && swaps === 0) {
    throw new InstrumentError(
      'verb-parity',
      `swap rule is ${swapRule} but the move enumerator produced 0 transpositions. ` +
        'Any agent or ceiling built on this enumerator is playing a different game ' +
        'from the executor.',
    );
  }
  if (reactions === 0) {
    throw new InstrumentError('verb-parity', 'no reactions on a freshly drawn board');
  }

  // The structural check above is necessary and was NOT sufficient: it asks
  // whether the enumerator can produce transpositions, not whether the CEILING
  // uses them. A timing run found plan 5.83 against ceiling 5.27 on the
  // all-factors-high cell while this check was green. So the ceiling is
  // compared against the strongest bounded agent on a short sample, which is
  // the property that actually matters.
  if (swapRule !== 'NONE') {
    const bounded = Math.max(runAgent(ORDER_1, 12, config).score, runAgent(planAgent(3, 8, 20), 12, config).score);
    const ceiling = runCeiling(12, config);
    if (ceiling < bounded - 0.35) {
      throw new InstrumentError(
        'verb-parity',
        `with swap rule ${swapRule}, ceiling ${ceiling.toFixed(2)} is below the best bounded ` +
          `agent ${bounded.toFixed(2)}. The ceiling is not using the same verb set.`,
      );
    }
  }
}
