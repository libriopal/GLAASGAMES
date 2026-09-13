// STAGE 2 — the full factorial, pointed at what stage 1 said was blocking.
//
// Stage 1's verdict: AGENCY FLOOR is solvable (25.5% reached, clearing the 25%
// bar) and SEED SHARE is not (52% at best, against a required 35%). Zero of 32
// cells cleared everything, and every failure was seed share.
//
// So this is not a generic "full factorial on the survivors". The survivors for
// AGENCY are PREVIEW (+31.6, dominant), OPTIONS (+4.6) and POOL (+4.2), and
// those are settled. The open question is the blocker, and there is a specific
// reason not to declare it unreachable yet:
//
//   THE ONE FACTOR LEVEL BUILT TO ATTACK SEED SHARE WAS NEVER SCREENED.
//
// POOL went in at RARE5 against BULK. ADAPTIVE — orders drawn against the
// board's OWN atom inventory, so every deal carries comparable reachable orders
// — is implemented and was left out when the factor's high level was replaced.
// The pre-registered abandonment criterion names it explicitly: "SEED SHARE
// cannot be brought under 45% by any pool or board-generation factor". Declaring
// that without testing the pool factor designed for it would be abandoning on an
// untested premise.
//
// Fixed here on stage 1's evidence rather than swept again: PREVIEW at 5 (the
// dominant agency lever), SWAP at NONE (agency effect -0.1, inside the noise
// floor, and the parsimony rule discards a rule that buys nothing), TURNS at 12
// (main effect +1.0, not significant, and the cheaper level).
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  GREEDY,
  ORDER_1,
  decisionDensity,
  planAgent,
  randomAgent,
  runAgent,
  runCeiling,
  seedDominance,
} from '../../foundry/montecarlo/synth-harness.js';
import { assertInstrument } from '../../foundry/montecarlo/assert-instrument.js';
import { type PoolMode, type SynthConfig, DEFAULT_SYNTH } from '../../game/chem/synth.js';
import type { Topology } from '../../game/chem/topology.js';

const SEEDS = Number(process.env.SEEDS ?? 60);
const OUT = 'design/mc/stage2';
mkdirSync(OUT, { recursive: true });

const POOLS: PoolMode[] = ['RARE5', 'BULK', 'ADAPTIVE'];
const TOPOS: Topology[] = ['SQUARE36', 'HEX37'];
const OPTS = [1, 3];

console.log(`stage 2 — ${POOLS.length * TOPOS.length * OPTS.length} cells, ${SEEDS} seeds/cell`);
console.log('PREVIEW=5 SWAP=NONE TURNS=12, fixed on stage 1 evidence');
console.log('');
console.log('pool      topo      opt |  read  plan  ceil | agency   SEED%  thru  decis');

const cells: Record<string, unknown>[] = [];
for (const poolMode of POOLS) {
  for (const topology of TOPOS) {
    for (const options of OPTS) {
      const config: SynthConfig = {
        ...DEFAULT_SYNTH,
        preview: 5,
        swap: 'NONE',
        turns: 12,
        poolMode,
        topology,
        options,
      };
      const readableRes = runAgent(ORDER_1, SEEDS, config);
      const readable = readableRes.score;
      const plan = runAgent(planAgent(3, 8, 20), SEEDS, config).score;
      const ceiling = runCeiling(SEEDS, config);
      const greedy = runAgent(GREEDY, SEEDS, config).score;

      assertInstrument(`${poolMode}/${topology}/opt${options}`, {
        ceiling,
        bestBounded: Math.max(readable, plan, greedy),
        responses: [],
      });

      const agency = readable > 0 ? ((plan - readable) / readable) * 100 : 0;
      const seed = seedDominance(Math.min(SEEDS, 50), config).seedSharePct;
      const decis = decisionDensity(20, config);
      const cell = {
        poolMode,
        topology,
        options,
        readable,
        plan,
        ceiling,
        greedy,
        agencyFloorPct: agency,
        seedSharePct: seed,
        throughput: readableRes.shipped,
        decisionDensityPct: decis,
        signalUtilityPct: greedy > 0 ? ((readable - greedy) / greedy) * 100 : Infinity,
      };
      cells.push(cell);
      writeFileSync(`${OUT}/cells.json`, JSON.stringify(cells, null, 2));
      console.log(
        `${poolMode.padEnd(9)} ${topology.padEnd(9)} ${String(options).padStart(3)} | ` +
          `${readable.toFixed(2).padStart(5)} ${plan.toFixed(2).padStart(5)} ${ceiling.toFixed(2).padStart(5)} | ` +
          `${agency.toFixed(1).padStart(6)}%  ${seed.toFixed(1).padStart(5)}%  ${cell.throughput.toFixed(2)}  ${decis.toFixed(0)}%`,
      );
    }
  }
}

// ── the pre-registered acceptance, applied without moving ──────────────────
const pass = cells.filter(
  (c) =>
    (c.agencyFloorPct as number) >= 25 &&
    (c.signalUtilityPct as number) >= 50 &&
    (c.seedSharePct as number) <= 35 &&
    (c.throughput as number) >= 2 &&
    (c.throughput as number) <= 8,
);
console.log('');
console.log(`cells clearing every pre-registered threshold: ${pass.length} of ${cells.length}`);
const bestSeed = Math.min(...cells.map((c) => c.seedSharePct as number));
const bestAgency = Math.max(...cells.map((c) => c.agencyFloorPct as number));
console.log(`best seed share reached: ${bestSeed.toFixed(1)}% (bar is <=35%, abandonment criterion is 45%)`);
console.log(`best agency floor reached: ${bestAgency.toFixed(1)}% (bar is >=25%)`);
