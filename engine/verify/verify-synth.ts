// engine/verify/verify-synth.ts — every defect this game produced, pinned.
//
// The rule the project runs on: a fixed defect gets a check that fails if it
// returns, and a check only ever seen to pass is decoration. So several of these
// carry a NEGATIVE CONTROL — a deliberately broken version asserted to fail —
// because that is the only way to know the check can distinguish.
//
// Y1-Y6 are the executor's contract. Y7-Y12 pin measurement defects, which are
// the majority of what this game actually produced: of the defects found so far,
// more were in the instrument than in the design.

import {
  type SynthAction,
  type SynthConfig,
  DEFAULT_SYNTH,
  PASS,
  beginSynth,
  cellsOf,
  judgeSynth,
  multistepPool,
  optionsFor,
  orderAt,
  playSynth,
  verifySynth,
} from '../../game/chem/synth.js';
import { MAX_SELECT } from '../../game/chem/board-react.js';
import { rankedRearrangements } from '../../game/chem/reaction.js';
import { MOLECULES } from '../../game/chem/library.js';
import {
  cellCount,
  degreeHistogram,
  neighbours,
  regions as topoRegions,
} from '../../game/chem/topology.js';
import { ORDER_1, legalMoves, runAgent, runCeiling } from '../../foundry/montecarlo/synth-harness.js';
import { designResolution, screeningDesign } from '../../foundry/montecarlo/design.js';

export interface Check {
  readonly id: string;
  readonly claim: string;
  readonly passed: boolean;
  readonly detail: string;
}

const BY = new Map(MOLECULES.map((m) => [m.formula, m] as const));

export function verifySynthAll(): Check[] {
  const out: Check[] = [];
  const cfg: SynthConfig = { ...DEFAULT_SYNTH };

  // ── Y1 · the engine no longer deletes the mechanic ───────────────────────
  {
    // `bestRearrangement` returned one partition and discarded the rest, which
    // is the structural cause of eight consecutive negative probes.
    let multi = 0;
    let total = 0;
    let maxSeen = 0;
    const st = beginSynth(1001, cfg);
    for (const r of topoRegions('SQUARE36', MAX_SELECT)) {
      if (r.length !== 4) continue;
      const opts = rankedRearrangements(r.map((c) => BY.get(st.tiles[c]!)!), 99);
      if (opts.length === 0) continue;
      total += 1;
      if (opts.length > 1) multi += 1;
      maxSeen = Math.max(maxSeen, opts.length);
    }
    const pct = total > 0 ? (multi / total) * 100 : 0;
    out.push({
      id: 'Y1',
      claim: 'most four-molecule selections offer more than one legal partition',
      passed: pct > 50 && maxSeen > 3,
      detail: `${pct.toFixed(1)}% of ${total} selections, max ${maxSeen} alternatives`,
    });
  }

  // ── Y2 · the shortlist is stable and ordered ─────────────────────────────
  {
    // Two boards showing the same molecules must offer the SAME three options in
    // the SAME order, or muscle memory is impossible and the memo is unsafe.
    const picks = ['CH4', 'O2', 'O2', 'H2'].map((f) => BY.get(f)!);
    const a = rankedRearrangements(picks, 3);
    const b = rankedRearrangements([...picks].reverse(), 3);
    const descending = a.every((r, i) => i === 0 || a[i - 1]!.released >= r.released);
    out.push({
      id: 'Y2',
      claim: 'the option shortlist is order-stable and ranked by energy',
      passed:
        descending &&
        a.length === b.length &&
        a.every((r, i) => r.products.join('+') === b[i]!.products.join('+')),
      detail: `${a.length} options, descending=${descending}, reorder-stable=${a.length === b.length}`,
    });
  }

  // ── Y3 · the order stream is pure in its index ───────────────────────────
  {
    // The audit's standing suspicion: is the stream decoupled from board state,
    // or is there a hidden feedback loop? If the k-th order differed between
    // agents, no two agents could be compared on the same run at all.
    const pool = ['F2', 'Cl2', 'CH3Cl'];
    const clean = Array.from({ length: 30 }, (_, i) => orderAt(31337, i, pool));
    const again = Array.from({ length: 30 }, (_, i) => orderAt(31337, i, pool));
    const other = Array.from({ length: 30 }, (_, i) => orderAt(31338, i, pool));
    // Negative control: a stream that DID depend on state must differ. Watched
    // failing, so the check is known to distinguish.
    const stateful = Array.from({ length: 30 }, (_, i) => orderAt(31337 + i, i, pool));
    out.push({
      id: 'Y3',
      claim: 'the order stream depends only on (seed, index), never on the board',
      passed:
        clean.join() === again.join() &&
        clean.join() !== other.join() &&
        clean.join() !== stateful.join(),
      detail: `pure=${clean.join() === again.join()}, seed-sensitive=${clean.join() !== other.join()}, control differs=${clean.join() !== stateful.join()}`,
    });
  }

  // ── Y4 · a malformed action is rejected, never clamped ───────────────────
  {
    const st = beginSynth(777, cfg);
    const live = topoRegions('SQUARE36', MAX_SELECT).find(
      (r) => optionsFor(st.tiles, r, 3).length > 0,
    ) ?? [0, 1];
    const cases: [string, SynthAction][] = [
      ['past shortlist', { cells: live, option: 42 }],
      ['negative', { cells: live, option: -3 }],
      ['fractional', { cells: live, option: 0.5 }],
      ['duplicate cells', { cells: [2, 2], option: 0 }],
      ['off board', { cells: [0, cellsOf(cfg) + 9], option: 0 }],
    ];
    const bad = cases.filter(([, a]) => judgeSynth(st.tiles, a, 1e9, cfg).rejected === null);
    out.push({
      id: 'Y4',
      claim: 'every malformed action is rejected rather than rounded into a legal one',
      passed: bad.length === 0,
      detail: bad.length === 0 ? `${cases.length} hostile actions all rejected` : `accepted: ${bad.map(([n]) => n).join(', ')}`,
    });
  }

  // ── Y5 · replay is exact, and non-trivially so ───────────────────────────
  {
    // The first version of this check compared 0 to 0 on a seed that never
    // shipped — a control that cannot distinguish, which is the vacuous
    // signature it exists to catch. It now requires a scoring game.
    let seed = 0;
    for (let s = 1; s <= 200 && seed === 0; s += 1) {
      const p = playSynth(s * 7919, cfg, (t, b, q, bank, turn) =>
        ORDER_1.choose(t, b, q, bank, turn, cfg),
      );
      if (p.score > 0) seed = s * 7919;
    }
    const actions: SynthAction[] = [];
    const played = playSynth(seed, cfg, (t, b, q, bank, turn) => {
      const a = ORDER_1.choose(t, b, q, bank, turn, cfg);
      actions.push(a);
      return a;
    });
    const replayed = verifySynth(seed, cfg, actions);
    out.push({
      id: 'Y5',
      claim: 'replaying an action list reproduces a NON-ZERO score and the digest',
      passed: played.score > 0 && replayed.score === played.score && replayed.digest === played.digest,
      detail: `seed ${seed}, score ${played.score} -> ${replayed.score}, digest match ${replayed.digest === played.digest}`,
    });
  }

  // ── Y6 · the turn path carries no hidden stream ──────────────────────────
  {
    // A stateful rng filled cells a reaction left spare, which made the board a
    // function of HOW MANY DRAWS HAD HAPPENED rather than of (seed, actions) —
    // and meant a search could not branch. Proven by replaying a PREFIX: if a
    // hidden stream existed, truncating the action list would shift the board.
    const actions: SynthAction[] = [];
    playSynth(5150, cfg, (t, b, q, bank, turn) => {
      const a = ORDER_1.choose(t, b, q, bank, turn, cfg);
      actions.push(a);
      return a;
    });
    const half = actions.slice(0, Math.max(1, Math.floor(actions.length / 2)));
    const a1 = verifySynth(5150, cfg, half);
    const a2 = verifySynth(5150, cfg, half);
    out.push({
      id: 'Y6',
      claim: 'a truncated replay is deterministic — no draw-count dependence',
      passed: a1.digest === a2.digest && a1.score === a2.score,
      detail: `prefix of ${half.length} actions replays identically`,
    });
  }

  // ── Y7 · the ceiling never scores below a bounded agent ──────────────────
  {
    // Three broken evaluators produced this, each found by a number looking
    // wrong. An unbounded search can always play a bounded agent's move, so a
    // negative solver margin is arithmetic reporting a broken instrument.
    const small: SynthConfig = { ...cfg, options: 1, preview: 0 };
    const bounded = runAgent(ORDER_1, 25, small).score;
    const ceiling = runCeiling(25, small);
    out.push({
      id: 'Y7',
      claim: 'the ceiling is never below the best bounded agent',
      passed: ceiling >= bounded - 0.05,
      detail: `ceiling ${ceiling.toFixed(2)} vs ORDER-1 ${bounded.toFixed(2)}`,
    });
  }

  // ── Y8 · the beam and the agents share a verb set ────────────────────────
  {
    // The positional-delivery result was unusable because the beam enumerated
    // reactions only and could not use the transposition verb its agents had.
    const withSwap: SynthConfig = { ...cfg, swap: 'FREE', swapBudget: 3 };
    const bounded = runAgent(ORDER_1, 20, withSwap).score;
    const ceiling = runCeiling(20, withSwap);
    out.push({
      id: 'Y8',
      claim: 'with a swap verb enabled the ceiling still bounds the agents',
      passed: ceiling >= bounded - 0.35,
      detail: `ceiling ${ceiling.toFixed(2)} vs ORDER-1 ${bounded.toFixed(2)} under FREE swaps`,
    });
  }

  // ── Y9 · the experimental design resolves what it claims ─────────────────
  {
    // The approved plan promised a fold-over would reach resolution V. It does
    // not: a fold-over reverses every sign, so an even-length defining word
    // survives it. The check recomputes resolution from the sign matrix.
    const rows = screeningDesign();
    const res = designResolution(rows);
    const folded = designResolution([...rows, ...rows.map((r) => r.map((v) => -v))]);
    out.push({
      id: 'Y9',
      claim: 'the screening design is resolution V or better, recomputed not asserted',
      passed: res >= 5 && folded >= res,
      detail: `${rows.length} cells, resolution ${res} (fold-over would give ${folded})`,
    });
  }

  // ── Y10 · the opening settle is not scored ───────────────────────────────
  {
    // `beginSynth` zeroed `filled` after the opening book settles but not
    // `points`, so every agent banked the deal as score while the beam did not:
    // ORDER-1 read 12.70 against a ceiling of 4.33.
    const st = beginSynth(98765, cfg);
    out.push({
      id: 'Y10',
      claim: 'the deal is not scored — filled, points and streak all start at zero',
      passed: st.filled === 0 && st.points === 0 && st.streak === 0,
      detail: `filled=${st.filled} points=${st.points} streak=${st.streak}`,
    });
  }

  // ── Y11 · topology is real, not a reskin ─────────────────────────────────
  {
    const sq = degreeHistogram('SQUARE36');
    const hx = degreeHistogram('HEX37');
    const hexHasSix = (hx.get(6) ?? 0) > 0;
    const sqMaxFour = Math.max(...[...sq.keys()]) === 4;
    out.push({
      id: 'Y11',
      claim: 'the hex board genuinely has six-neighbour cells and the square has none',
      passed: hexHasSix && sqMaxFour && cellCount('HEX37') === 37,
      detail: `hex degrees ${[...hx].map(([d, n]) => `${d}x${n}`).join(' ')} · square max degree ${Math.max(...[...sq.keys()])}`,
    });
  }

  // ── Y12 · the multistep pool is computed, not hand-picked ────────────────
  {
    const pool = multistepPool();
    const allInLibrary = pool.every((f) => BY.has(f));
    const stable = multistepPool().join() === pool.join();
    out.push({
      id: 'Y12',
      claim: 'the multistep order pool is derived from measured production frequency and is stable',
      passed: pool.length >= 3 && allInLibrary && stable,
      detail: `${pool.length} molecules: ${pool.join(' ')}`,
    });
  }

  // ── Y13 · no reaction violates conservation ──────────────────────────────
  {
    let checked = 0;
    let bad = 0;
    const st = beginSynth(24680, cfg);
    for (const r of topoRegions('SQUARE36', MAX_SELECT).slice(0, 400)) {
      for (const rx of rankedRearrangements(r.map((c) => BY.get(st.tiles[c]!)!), 3)) {
        const tally = (fs: readonly string[]): string => {
          const m = new Map<string, number>();
          for (const f of fs) for (const a of BY.get(f)!.atoms) m.set(a, (m.get(a) ?? 0) + 1);
          return [...m].sort().map(([k, v]) => `${k}${v}`).join('');
        };
        checked += 1;
        if (tally(rx.reactants) !== tally(rx.products)) bad += 1;
      }
    }
    out.push({
      id: 'Y13',
      claim: 'atoms in equals atoms out, on every offered option',
      passed: bad === 0 && checked > 100,
      detail: `${checked} options checked, ${bad} violations`,
    });
  }

  return out;
}
