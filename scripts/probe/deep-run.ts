// THE DEEP-STRATEGY RUN. Two regimes, because versus has no solitaire ceiling.
//
// Run A screens the declared route in solitaire, where consequence horizon,
// branching and the never-declare gate live. Run B measures the shared board,
// where the instrument is a head-to-head ladder and a denial control instead.
//
// Mixing them into one factorial would have produced cells whose primary
// response is undefined, which is the methodological problem the plan raised
// before the auditor could.
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  type SynthAction,
  type SynthConfig,
  DEFAULT_SYNTH,
  beginSynth,
  playSynth,
} from '../../game/chem/synth.js';
import {
  NEVER_DECLARE,
  allMoves,
  rivalBook,
  branchingProfile,
  declaringAgent,
  denyingAgent,
  headToHead,
} from '../../foundry/montecarlo/deep-harness.js';
import {
  type Agent,
  GREEDY,
  ORDER_1,
  ORDER_2,
  planAgent,
  runAgent,
  runCeiling,
} from '../../foundry/montecarlo/synth-harness.js';

const SEEDS = Number(process.env.SEEDS ?? 50);
mkdirSync('design/mc/deep', { recursive: true });

/** Consequence horizon under an arbitrary policy, so the route can be measured. */
function horizon(config: SynthConfig, agent: Agent, seeds: number): number {
  let gap = 0;
  let counted = 0;
  let h = 0x243f6a88;
  const pick = (n: number): number => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    return ((h ^ (h >>> 16)) >>> 0) % n;
  };
  for (let s = 1; s <= seeds; s += 1) {
    const seed = s * 7919;
    const st = beginSynth(seed, config);
    const moves = allMoves(st.tiles, st.book, st.bank, st.swapsLeft, config);
    if (moves.length < 2) continue;
    const best = agent.choose(st.tiles, st.book, [], st.bank, 0, config);
    let other: SynthAction = moves[pick(moves.length)]!.action;
    for (let i = 0; i < 8 && other.cells.join() === best.cells.join() && other.option === best.option; i += 1) {
      other = moves[pick(moves.length)]!.action;
    }
    if (other.cells.join() === best.cells.join() && other.option === best.option) continue;
    const run = (forced: SynthAction): number =>
      playSynth(seed, config, (t, b, q, bank, turn) =>
        turn === 0 ? forced : agent.choose(t, b, q, bank, turn, config),
      ).score;
    gap += run(best) - run(other);
    counted += 1;
  }
  return counted > 0 ? gap / counted : 0;
}

console.log('══ RUN A · the declared route, in solitaire ══════════════════');
console.log('route stake window opt |  best  never  ceil | horizon  branch  entropy  decl');

interface CellA extends Record<string, unknown> {}
const cellsA: CellA[] = [];

for (const route of [false, true]) {
  for (const routeStake of route ? [75, 300] : [150]) {
    for (const routeWindow of route ? [2, 6] : [4]) {
      for (const options of [1, 3]) {
        const config: SynthConfig = {
          ...DEFAULT_SYNTH,
          route,
          routeStake,
          routeWindow,
          options,
          preview: 0,
          swap: 'NONE',
          turns: 12,
        };
        // The best declaring agent across nerve levels, so the mechanic is
        // judged at its best rather than at one arbitrary confidence.
        const declarers = [declaringAgent(1), declaringAgent(3), declaringAgent(8)];
        let bestAgent: Agent = declarers[0]!;
        let bestScore = -Infinity;
        for (const d of declarers) {
          const sc = runAgent(d, SEEDS, config).score;
          if (sc > bestScore) { bestScore = sc; bestAgent = d; }
        }
        const never = runAgent(NEVER_DECLARE, SEEDS, config).score;
        const ceil = runCeiling(SEEDS, config);
        const hz = horizon(config, bestAgent, SEEDS);
        const br = branchingProfile(Math.min(SEEDS, 20), config);
        const declStats = playSynth(15838, config, (t, b, q, bank, turn) =>
          bestAgent.choose(t, b, q, bank, turn, config),
        );
        const cell = {
          route, routeStake, routeWindow, options,
          best: bestScore, never, ceiling: ceil,
          horizon: hz, branching: br.branching, entropy: br.entropy,
          neverPctOfBest: bestScore > 0 ? (never / bestScore) * 100 : 0,
          declaresMade: declStats.declaresMade,
        };
        cellsA.push(cell);
        console.log(
          `${String(route).padStart(5)} ${String(routeStake).padStart(5)} ${String(routeWindow).padStart(6)} ${String(options).padStart(3)} | ` +
            `${bestScore.toFixed(2).padStart(5)}  ${never.toFixed(2).padStart(5)}  ${ceil.toFixed(2).padStart(5)} | ` +
            `${hz.toFixed(2).padStart(7)}  ${br.branching.toFixed(1).padStart(6)}  ${br.entropy.toFixed(2).padStart(7)}  ${String(cell.declaresMade).padStart(4)}`,
        );
      }
    }
  }
}
writeFileSync('design/mc/deep/runA.json', JSON.stringify(cellsA, null, 2));

console.log('');
console.log('══ RUN B · the shared board ══════════════════════════════════');
const vsCfg: SynthConfig = { ...DEFAULT_SYNTH, mode: 'VS', options: 3, preview: 0, swap: 'NONE', turns: 12 };

// HEAD-TO-HEAD: does depth win? Sides swapped on every seed.
// GREEDY is the genuinely weak opponent: it ignores the book entirely and was
// measured at 14-18% of thoughtful play in solitaire. The first version used
// NEVER_DECLARE as the floor, which IS ORDER_1 -- so that row was self-play
// wearing a different name, and it read 48% exactly as self-play should.
const ladder: [string, Agent, Agent][] = [
  ['ORDER-1 vs GREEDY', ORDER_1, GREEDY],
  ['ORDER-2 vs ORDER-1', ORDER_2, ORDER_1],
  ['PLAN-3  vs ORDER-1', planAgent(3, 8, 20), ORDER_1],
];
console.log('matchup                 | win rate | draws | mean scores');
for (const [name, a, b] of ladder) {
  const h = headToHead(Math.max(20, Math.floor(SEEDS / 2)), vsCfg, a, b);
  console.log(
    `${name.padEnd(23)} | ${h.winRateA.toFixed(1).padStart(7)}% | ${h.draws.toFixed(0).padStart(4)}% | ${h.meanA.toFixed(2)} / ${h.meanB.toFixed(2)}`,
  );
}

// DENIAL VALUE: the same agent with and without an interest in the rival's book.
const denier = denyingAgent(1, rivalBook);
const hDeny = headToHead(Math.max(20, Math.floor(SEEDS / 2)), vsCfg, denier, ORDER_1);
console.log('');
console.log(`DENIAL VALUE   denier vs ORDER-1: ${hDeny.winRateA.toFixed(1)}% win rate, means ${hDeny.meanA.toFixed(2)} / ${hDeny.meanB.toFixed(2)}`);
console.log(`  denial value: ${(hDeny.winRateA - 50).toFixed(1)} points of win rate over even`);

// ── pre-registered acceptance ─────────────────────────────────────────────
const routed = cellsA.filter((c) => c.route === true);
const bestHz = Math.max(...cellsA.map((c) => c.horizon as number));
const bestBr = Math.max(...cellsA.map((c) => c.branching as number));
const formality = routed.every((c) => (c.neverPctOfBest as number) >= 90);
console.log('');
console.log('══ pre-registered acceptance ═════════════════════════════════');
console.log(`  CONSEQUENCE HORIZON  best ${bestHz.toFixed(2)}   bar >= 1.0   ${bestHz >= 1 ? 'PASS' : 'FAIL'}`);
console.log(`  EFFECTIVE BRANCHING  best ${bestBr.toFixed(1)}   bar >= 4     ${bestBr >= 4 ? 'PASS' : 'FAIL'}`);
console.log(`  NEVER-DECLARE        ${routed.map((c) => (c.neverPctOfBest as number).toFixed(0) + '%').join(' ')}   bar < 90%   ${formality ? 'FAIL — the route is a formality' : 'PASS'}`);
