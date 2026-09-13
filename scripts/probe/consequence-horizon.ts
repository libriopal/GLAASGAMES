// CONSEQUENCE HORIZON — how many turns a decision stays distinguishable.
//
// The run established that agency and solver margin trade one for one, so depth
// cannot come from showing the player more. It has to come from a move's
// consequence SURVIVING. That is measurable and this measures it.
//
// The fork: at turn 0, branch. One branch takes the readable rule's best move,
// the other takes a random legal move. From turn 1 onward BOTH branches play the
// identical policy on the identical seed. Any final-score gap is attributable to
// that one move and nothing else.
//
//   gap ~= 1      the move paid once, at the moment it was made, and then the
//                 board forgot. A sequence of puzzles.
//   gap >> 1      the move changed what was possible afterwards. Strategy.
//
// This is the number every one of the 50 deep-strategy candidates should be
// judged on, and it is why #9 (no refill) is ranked first: it is the only one
// whose config flag already exists, so it can be tested before it is built.
import {
  ORDER_1,
  legalMoves,
  transposeMoves,
} from '../../foundry/montecarlo/synth-harness.js';
import {
  type SynthAction,
  type SynthConfig,
  DEFAULT_SYNTH,
  PASS,
  beginSynth,
  playSynth,
} from '../../game/chem/synth.js';

const SEEDS = Number(process.env.SEEDS ?? 80);

/** Plays a seed, forcing `forced` at turn `at`, then the readable rule after. */
function playWith(seed: number, config: SynthConfig, at: number, forced: SynthAction): number {
  return playSynth(seed, config, (tiles, book, queue, bank, turn) =>
    turn === at ? forced : ORDER_1.choose(tiles, book, queue, bank, turn, config),
  ).score;
}

function horizon(label: string, config: SynthConfig): void {
  let gap = 0;
  let baseline = 0;
  let counted = 0;
  // A deterministic stand-in for "a different legal move", so the comparison is
  // reproducible rather than resampled on every run.
  let h = 0x243f6a88;
  const pick = (n: number): number => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    return ((h ^ (h >>> 16)) >>> 0) % n;
  };

  for (let s = 1; s <= SEEDS; s += 1) {
    const seed = s * 7919;
    const st = beginSynth(seed, config);
    const moves = [
      ...legalMoves(st.tiles, config),
      ...transposeMoves(st.tiles, st.bank, config, st.swapsLeft),
    ];
    if (moves.length < 2) continue;

    const best = ORDER_1.choose(st.tiles, st.book, [], st.bank, 0, config);
    // An ALTERNATIVE move, not merely a different one: if the random draw lands
    // on the same action the fork measures nothing.
    let other = moves[pick(moves.length)]!.action;
    for (let tries = 0; tries < 8; tries += 1) {
      if (other.cells.join() !== best.cells.join() || other.option !== best.option) break;
      other = moves[pick(moves.length)]!.action;
    }
    if (other.cells.join() === best.cells.join() && other.option === best.option) continue;

    const withBest = playWith(seed, config, 0, best);
    const withOther = playWith(seed, config, 0, other);
    gap += withBest - withOther;
    baseline += withBest;
    counted += 1;
  }

  const meanGap = counted > 0 ? gap / counted : 0;
  const meanScore = counted > 0 ? baseline / counted : 0;
  console.log(
    `${label.padEnd(34)} one move is worth ${meanGap.toFixed(2).padStart(5)} of a ` +
      `${meanScore.toFixed(2)} final score  (${((meanGap / Math.max(1e-9, meanScore)) * 100).toFixed(1)}%)`,
  );
}

console.log(`consequence horizon — one forced move at turn 0, identical play after\n`);

const base: SynthConfig = { ...DEFAULT_SYNTH, preview: 0, swap: 'NONE', options: 3, turns: 12 };

horizon('refill POOL (every measurement)', { ...base, refill: 'POOL' });
horizon('refill VOID (idea #9)', { ...base, refill: 'VOID' });
horizon('POOL, 30 turns', { ...base, refill: 'POOL', turns: 30 });
horizon('VOID, 30 turns', { ...base, refill: 'VOID', turns: 30 });
horizon('VOID + dock (idea #9 + #31)', { ...base, refill: 'VOID', deliver: 'DOCK' });

console.log(
  `\nA gap near 1 means the move paid once and the board forgot — a sequence of`,
  `\npuzzles. A gap well above 1 means the move changed what was possible later.`,
);
